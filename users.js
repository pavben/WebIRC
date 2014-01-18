"use strict";

var async = require('./async');
var fs = require('fs-extra');
var path = require('path');
var utils = require('./utils.js');

var USERS_PATH = path.join(__dirname, 'users');
var USERS_TEMP_PATH = path.join(__dirname, 'users.tmp');

// TODO: change all of the Sync function calls in this file to async

function writeAllUsers(users, cb) {
	function getTempFilePathForUser(user) {
		return path.resolve(USERS_TEMP_PATH, user.username + '.json');
	}

	fs.removeSync(USERS_TEMP_PATH);

	fs.mkdirSync(USERS_TEMP_PATH);

	// TODO: change map to forEach
	async.map(users.map(copyStateForSave), function(userCopy, cb) {
		fs.writeFile(getTempFilePathForUser(userCopy), JSON.stringify(userCopy, null, 4), cb);
	}, check(cb, function() {
		// all users successfully written

		fs.removeSync(USERS_PATH);

		fs.renameSync(USERS_TEMP_PATH, USERS_PATH);

		cb();
	}));
}

function readAllUsers(cb) {
	fs.readdir(USERS_PATH, check(cb, function(list) {
		async.map(list, function(filename, cb) {
			utils.readJsonFile(path.join(USERS_PATH, filename), check(cb, function(userSpec) {
				var user = parseUserSpec(userSpec);

				cb(null, user);
			}));
		}, cb);
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
		delete server.connected;
		delete server.nickname;

		server.channels.forEach(function(channel) {
			delete channel.userlist;
			delete channel.tempUserlist;
			delete channel.inChannel;
			delete channel.rejoining;
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

			// TODO: let's see if we can handle a null active window properly
			//newUser.setActiveEntity(newServer.entityId);

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

module.exports.writeAllUsers = writeAllUsers;
module.exports.readAllUsers = readAllUsers;
module.exports.copyWithoutPointers = copyWithoutPointers;
module.exports.copyStateForClient = copyStateForClient;
module.exports.copyStateForSave = copyStateForSave;
