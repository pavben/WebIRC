"use strict";

var async = require('./async');
var fs = require('fs-extra');
var logger = require('./logger.js');
var path = require('path');
var ReadWriteLock = require('rwlock');
var utils = require('./utils.js');

var USERS_PATH = path.join(__dirname, 'users');
var USERS_TEMP_PATH = path.join(__dirname, 'users.tmp');

var users = [];

var usersFolderLock = new ReadWriteLock();

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
				// TODO: change map to forEach
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
	readAllUsers(check(cb, function() {
		users.forEach(function(user) {
			if (user.servers.length > 0) {
				user.servers.forEach(function(server) {
					// TODO: connect only to the servers that weren't disconnected by the user
					if (server.host !== null) {
						server.reconnect();
					}
				});
			} else {
				// TODO: decide what to do here
			}
		});

		cb();
	}));
}

function copyWithoutPointers(user) {
	function cloneExceptFields(src, exceptFields) {
		var ret = {};

		Object.keys(src).filter(function(k) {
			return !~exceptFields.indexOf(k);
		}).forEach(function(k) {
			ret[k] = src[k];
		});

		return ret;
	}

	var userCopy = cloneExceptFields(user, [
		'activeWebSockets',
		'servers',
		'entities'
	]);

	userCopy.servers = user.servers.map(function(server) {
		var serverCopy = cloneExceptFields(server, [
			'socket',
			'user',
			'server',
			'channels',
			'queries',
			'timeoutPings'
		]);

		serverCopy.channels = server.channels.map(function(channel) {
			var channelCopy = cloneExceptFields(channel, [
				'server'
			]);

			return channelCopy;
		});

		serverCopy.queries = server.queries.map(function(query) {
			var queryCopy = cloneExceptFields(query, [
				'server'
			]);

			return queryCopy;
		});

		return serverCopy;
	});

	return userCopy;
}

function copyStateForClient(user) {
	var userCopy = copyWithoutPointers(user);

	delete userCopy.loggedInSessions;
	delete userCopy.password;

	return userCopy;
}

function copyStateForSave(user) {
	var userCopy = copyWithoutPointers(user);

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
	var newUser = new User(spec);

	if (Array.isArray(spec.servers)) {
		spec.servers.forEach(function(serverSpec) {
			var newServer = new Server(serverSpec, newUser.getNextEntityId.bind(newUser));

			newUser.addServer(newServer);

			if (Array.isArray(serverSpec.channels)) {
				serverSpec.channels.forEach(function(channelSpec) {
					var newChannel = new Channel(channelSpec, newUser.getNextEntityId);

					newServer.addChannel(newChannel);
				});
			}

			if (Array.isArray(serverSpec.queries)) {
				serverSpec.queries.forEach(function(querySpec) {
					var newQuery = new Query(querySpec, newUser.getNextEntityId);

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
	var user = null;

	users.some(function(currentUser) {
		// if sessionId is already in user.loggedInSessions
		if (currentUser.loggedInSessions.indexOf(sessionId) !== -1) {
			user = currentUser;
			return true;
		}
	});

	return user;
}

function getUserByCredentials(username, password) {
	var user = null;

	users.some(function(currentUser) {
		if (currentUser.username === username && currentUser.password === password) {
			user = currentUser;

			return true;
		}
	});

	return user;
}

module.exports.initialize = initialize;
module.exports.copyWithoutPointers = copyWithoutPointers;
module.exports.copyStateForClient = copyStateForClient;
module.exports.copyStateForSave = copyStateForSave;
module.exports.saveAndShutdown = saveAndShutdown;
module.exports.getUserBySessionId = getUserBySessionId;
module.exports.getUserByCredentials = getUserByCredentials;
