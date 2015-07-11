"use strict";

const async = require('./async');
const fs = require('fs-extra');
const logger = require('./logger.js');
const path = require('path');
const ReadWriteLock = require('rwlock');
const utils = require('./utils.js');

const USERS_PATH = path.join(__dirname, 'users');
const USERS_TEMP_PATH = path.join(__dirname, 'users.tmp');

let users = [];

let nextSaveTimeout = null;
const saveInterval = 5 * 60 * 1000; // save users to disk every 5 minutes

const usersFolderLock = new ReadWriteLock();

function writeAllUsers(cb) {
	function getTempFilePathForUser(user) {
		return path.resolve(USERS_TEMP_PATH, user.username + '.json');
	}

	usersFolderLock.writeLock(function(releaseLock) {
		async()
			.add('removeTemp', function(cb) {
				fs.remove(USERS_TEMP_PATH, cb);
			})
			.add('makeTemp', ['@removeTemp'], function(cb) {
				fs.mkdir(USERS_TEMP_PATH, cb);
			})
			.add('writeUsers', ['@makeTemp'], function(cb) {
				// TODO: change map to forEach (or promises?)
				async.map(users.map(copyStateForSave), function(userCopy, cb) {
					fs.writeFile(getTempFilePathForUser(userCopy), JSON.stringify(userCopy, null, 4), cb);
				}, cb);
			})
			.add('removeOldUsersFolder', ['@writeUsers'], function(cb) {
				fs.remove(USERS_PATH, cb);
			})
			.add(['@removeOldUsersFolder'], function(cb) {
				fs.rename(USERS_TEMP_PATH, USERS_PATH, cb);
			})
			.run(function(err) {
				releaseLock();
				cb(err);
			});
	});
}

function refreshSaveTimeout() {
	if (nextSaveTimeout) {
		clearTimeout(nextSaveTimeout);
	}
	nextSaveTimeout = setTimeout(function() {
		writeAllUsers(function(err) {
			if (err) {
				logger.error('Error saving users', err);
			} else {
				logger.info('User data saved');
			}
			refreshSaveTimeout();
		});
	}, saveInterval);
}

function readAllUsers(cb) {
	// we use a write lock here too because this function sets the 'users' value
	usersFolderLock.writeLock(function(releaseLock) {
		async()
			.add('userFiles', function(cb) {
				fs.readdir(USERS_PATH, cb);
			})
			.add('rawUserData', ['userFiles'], function(userFiles, cb) {
				async.map(userFiles, function(filename, cb) {
					utils.readJsonFile(path.join(USERS_PATH, filename), cb);
				}, cb);
			})
			.add('userData', ['rawUserData'], function(rawUserData) {
				return rawUserData.map(function(userSpec) {
					return parseUserSpec(userSpec);
				});
			})
			.add(['userData'], function(userData) {
				users = userData;
			})
			.run(function(err) {
				releaseLock();
				cb(err);
			});
	});
}

function initialize(cb) {
	async()
		.add('readAllUsers', function(cb) {
			readAllUsers(cb);
		})
		.add(['@readAllUsers'], function() {
			users.forEach(function(user) {
				// TODO: if !user.defaultIdentity, show the welcome/settings screen
				user.servers.forEach(function(server) {
					// TODO: connect only to the servers that weren't disconnected by the user
					if (server.host !== null) {
						server.reconnect();
					}
				});
			});
		})
		.add(function() {
			// begin saving user data every 'saveInterval' time
			refreshSaveTimeout();
		})
		.run(cb);
}

function copyWithoutPointers(user) {
	function cloneExceptFields(src, exceptFields) {
		const exceptFieldsSet = new Set(exceptFields);
		const ret = {};
		Object.keys(src).filter(function(k) {
			return !exceptFieldsSet.has(k);
		}).forEach(function(k) {
			ret[k] = src[k];
		});
		return ret;
	}
	const userCopy = cloneExceptFields(user, [
		'activeWebSockets',
		'servers',
		'entities'
	]);
	userCopy.servers = user.servers.map(function(server) {
		const serverCopy = cloneExceptFields(server, [
			'socket',
			'user',
			'server',
			'channels',
			'queries',
			'pingInterval'
		]);
		serverCopy.channels = server.channels.map(function(channel) {
			return cloneExceptFields(channel, [
				'server'
			]);
		});
		serverCopy.queries = server.queries.map(function(query) {
			return cloneExceptFields(query, [
				'server'
			]);
		});
		return serverCopy;
	});
	return userCopy;
}

function copyStateForClient(user) {
	const userCopy = copyWithoutPointers(user);
	delete userCopy.loggedInSessions;
	delete userCopy.password;
	return userCopy;
}

function copyStateForSave(user) {
	const userCopy = copyWithoutPointers(user);
	delete userCopy.loggedInSessions;
	userCopy.servers.forEach(function(server) {
		delete server.type;
		delete server.connected;
		delete server.currentNickname;
		server.channels.forEach(function(channel) {
			delete channel.type;
			delete channel.userlist;
			delete channel.tempUserlist;
			delete channel.inChannel;
			delete channel.rejoining;
		});
		server.queries.forEach(function(query) {
			delete query.type;
		});
	});
	return userCopy;
}

function parseUserSpec(spec) {
	const newUser = new User(spec);
	if (Array.isArray(spec.servers)) {
		spec.servers.forEach(function(serverSpec) {
			const newServer = new Server(serverSpec, newUser.getNextEntityId.bind(newUser));
			newUser.addServer(newServer);
			if (Array.isArray(serverSpec.channels)) {
				serverSpec.channels.forEach(function(channelSpec) {
					const newChannel = new Channel(channelSpec, newUser.getNextEntityId);
					newServer.addChannel(newChannel);
				});
			}
			if (Array.isArray(serverSpec.queries)) {
				serverSpec.queries.forEach(function(querySpec) {
					const newQuery = new Query(querySpec, newUser.getNextEntityId);
					newServer.addQuery(newQuery);
				});
			}
		});
	}
	return newUser;
}

function saveAndShutdown() {
	writeAllUsers(function(err) {
		if (err) {
			logger.error('Unable to save user data', err);
			process.exit(1);
		} else {
			logger.info('User data save completed');
			process.exit(0);
		}
	});
}

function getUserBySessionId(sessionId) {
	return utils.findFirst(users, function(user) {
		return user.loggedInSessions.indexOf(sessionId) !== -1;
	});
}

function getUserByCredentials(username, password) {
	return utils.findFirst(users, function(user) {
		return user.username === username && user.password === password;
	});
}

module.exports.initialize = initialize;
module.exports.copyWithoutPointers = copyWithoutPointers;
module.exports.copyStateForClient = copyStateForClient;
module.exports.copyStateForSave = copyStateForSave;
module.exports.saveAndShutdown = saveAndShutdown;
module.exports.getUserBySessionId = getUserBySessionId;
module.exports.getUserByCredentials = getUserByCredentials;
