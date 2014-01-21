"use strict";

var assert = require('assert');
// irc.js include moved to the bottom due to circular dependency
var logger = require('./logger.js');
var statechanges = require('./static/js/statechanges.js');
var utils = require('./utils.js');

function User(spec) {
	utils.ensureRequiredFields(spec, [
		'username',
		'password'
	]);

	this.username = spec.username;
	this.password = spec.password;

	if (spec.defaultIdentity) {
		this.defaultIdentity = new ServerIdentity(spec.defaultIdentity);
	}

	this.servers = [];

	this.activeWebSockets = [];
	this.loggedInSessions = [];

	this.entities = {};
	this.activeEntityId = spec.activeEntityId || null;
	this.nextEntityId = spec.nextEntityId || 0;
}

User.prototype = {
	addServer: function(server) {
		this.applyStateChange('AddServer', server);
	},
	setActiveEntity: function(targetEntityId) {
		this.applyStateChange('SetActiveEntity', targetEntityId);
	},
	sendToWeb: function(msgId, data) {
		this.activeWebSockets.forEach(function(socket) {
			socket.emit(msgId, data);
		});
	},
	applyStateChange: function() {
		var funcId = arguments[0];

		var args = Array.prototype.slice.call(arguments, 1);

		logger.debug('%s state change args', funcId, args);

		// first, send it to the clients
		this.sendToWeb('ApplyStateChange', {
			funcId: funcId,
			args: args
		});

		// then apply the change on the server
		var stateChangeFunctionReturn = statechanges.callStateChangeFunction(this, funcId, args);

		return stateChangeFunctionReturn;
	},
	getEntityById: function(targetEntityId) {
		return statechanges.utils.getEntityById(this, targetEntityId);
	},
	getNextEntityId: function() {
		return this.nextEntityId++;
	},
	removeActiveWebSocket: function(socket) {
		var idx = this.activeWebSockets.indexOf(socket);
		if (idx !== -1) {
			this.activeWebSockets.splice(idx, 1);

			return true;
		} else {
			return false;
		}
	},
	removeLoggedInSession: function(sessionId) {
		var idx = this.loggedInSessions.indexOf(sessionId);
		if (idx !== -1) {
			this.loggedInSessions.splice(idx, 1);

			return true;
		} else {
			return false;
		}
	},
	showError: function(text) {
		if (this.activeEntityId) {
			this.applyStateChange('Error', this.activeEntityId, text);
		}
	},
	showInfo: function(text) {
		if (this.activeEntityId) {
			this.applyStateChange('Info', this.activeEntityId, text);
		}
	}
};

function Server(spec, getNextEntityId) {
	utils.ensureRequiredFields(spec, [
		'host',
		'port',
		'desiredChannels' // TODO: remove
	]);

	this.entityId = spec.entityId || getNextEntityId();
	this.type = 'server';

	this.label = spec.label || spec.host;
	this.host = spec.host;
	this.port = spec.port;
	this.ssl = spec.ssl || false;
	this.password = spec.password || null;
	this.currentNickname = null;
	this.identity = (spec.identity ? new ServerIdentity(spec.identity) : null);
	this.channels = [];
	this.desiredChannels = spec.desiredChannels;
	this.queries = [];
	this.socket = null;
	this.activityLog = spec.activityLog || [];
	this.numEvents = spec.numEvents || 0;
	this.numAlerts = spec.numAlerts || 0;
	this.connected = false;

	// these are set automatically by the 'add' functions
	this.user = null; // the user this server belongs to
	this.server = null; // will reference self
}

Server.prototype = {
	reconnect: function() {
		irc.reconnectServer(this);
	},
	disconnect: function(isDeadSocket) {
		if (this.socket !== null) {
			if (!isDeadSocket) {
				this.send('QUIT :');
			}

			this.socket.destroy();

			this.socket = null;

			this.endPings();

			this.user.applyStateChange('Disconnect', this.entityId);

			logger.info('Disconnected from server: %s:%d', this.host, this.port);
		}
	},
	getActiveIdentity: function() {
		return this.identity || this.user.defaultIdentity;
	},
	addChannel: function(channel) {
		this.user.applyStateChange('AddChannel', this.entityId, channel);
	},
	joinedChannel: function(channelName) {
		var server = this;

		server.withChannel(channelName, check(
			function(err) {
				var channel = new Channel({
					name: channelName,
					inChannel: true
				}, server.user.getNextEntityId.bind(server.user));

				server.addChannel(channel);

				server.user.applyStateChange('Info', channel.entityId, {
					text: 'Joined channel ' + channel.name
				});

				server.user.setActiveEntity(channel.entityId);
			},
			function(channel) {
				channel.rejoining = false;

				server.user.applyStateChange('RejoinChannel', channel.entityId);
			}
		));
	},
	withChannel: function(channelName, cb) {
		var matchedChannel;

		this.channels.some(function(channel) {
			if (channel.name.toLowerCase() === channelName.toLowerCase()) {
				matchedChannel = channel;

				return true;
			}
		});

		if (matchedChannel) {
			cb(null, matchedChannel);
		} else {
			var err = new Error('No matching channel');

			err.code = 'ENOENT';

			cb(err);
		}
	},
	removeChannel: function(channelName) {
		var server = this;

		server.channels.some(function(channel) {
			if (channel.name.toLowerCase() === channelName.toLowerCase()) {
				server.user.applyStateChange('RemoveEntity', channel.entityId);

				return true;
			}
		});
	},
	addQuery: function(query) {
		this.user.applyStateChange('AddQuery', this.entityId, query);
	},
	ensureQuery: function(queryName) {
		var queryRet;

		var exists = this.queries.some(function(query) {
			if (query.name.toLowerCase() === queryName.toLowerCase()) {
				queryRet = query;
				return true;
			}
		});

		if (!exists) {
			var query = new Query({
				name: queryName
			}, this.user.getNextEntityId.bind(this.user));

			this.addQuery(query);

			queryRet = query;
		}

		return queryRet;
	},
	removeQuery: function(targetName) {
		var server = this;

		server.queries.some(function(query, queryIdx) {
			if (query.name.toLowerCase() === targetName.toLowerCase()) {
				server.user.applyStateChange('RemoveEntity', query.entityId);

				return true;
			}
		});
	},
	send: function(data) {
		logger.data('SEND: %s', data);
		if (this.socket !== null) {
			this.socket.write(data + '\r\n');
		} else {
			logger.error('send called on a server with null socket');
		}
	},
	startPings: function() {
		assert(typeof this.timeoutPings === 'undefined'); // must end any existing ones before starting

		var self = this;

		var pingInterval = 60000;

		function sendPing() {
			// TODO LOW: do we care if we receive the correct token back? not checking for now
			var randomToken = Math.floor(Math.random()*99999);

			self.send('PING :' + randomToken);

			self.timeoutPings = setTimeout(sendPing, pingInterval);
		}

		self.timeoutPings = setTimeout(sendPing, pingInterval);
	},
	endPings: function() {
		if (this.timeoutPings) {
			clearTimeout(this.timeoutPings);

			delete this.timeoutPings;
		}
	},
	showError: function(text, preferActive) {
		var targetEntity = preferActive ? this.getActiveOrServerEntity() : this.entityId;

		this.user.applyStateChange('Error', targetEntity, text);
	},
	showInfo: function(text, preferActive) {
		var targetEntity = preferActive ? this.getActiveOrServerEntity() : this.entityId;

		this.user.applyStateChange('Info', targetEntity, text);
	},
	showWhois: function(text) {
		this.user.applyStateChange('Whois', this.getActiveOrServerEntity(), text);
	},
	getActiveOrServerEntity: function() {
		if (this.user.activeEntityId !== null && this.user.getEntityById(this.user.activeEntityId).server === this) {
			return this.user.activeEntityId;
		} else {
			return this.entityId;
		}

		return this.entityId;
	},
	ifConnected: function(successCallback) {
		if (this.connected) {
			successCallback();
		} else {
			this.showError('Not connected', true);
		}
	},
	removeEntity: function() {
		// only allow closing the server window if it's not the only one
		if (this.user.servers.length > 1) {
			// close all the queries
			for (var i = this.queries.length - 1; i >= 0; i--) {
				this.queries[i].removeEntity();
			}

			// close all the channels
			for (var i = this.channels.length - 1; i >= 0; i--) {
				this.channels[i].removeEntity();
			}

			// disconnect if connected
			if (this.connected) {
				this.disconnect();
			}

			// and finally remove the server itself
			this.user.applyStateChange('RemoveEntity', this.entityId);
		} else {
			logger.error('Cannot close the only server window.');
		}
	}
};

function Channel(spec, getNextEntityId) {
	utils.ensureRequiredFields(spec, [
		'name'
	]);

	this.entityId = spec.entityId || getNextEntityId();
	this.type = 'channel';

	this.name = spec.name;
	this.tempUserlist = []; // built while NAMES entries are coming in (353) and copied to userlist on 366
	this.userlist = [];
	this.activityLog = spec.activityLog || [];
	this.numEvents = spec.numEvents || 0;
	this.numAlerts = spec.numAlerts || 0;
	this.inChannel = spec.inChannel || false;

	// server-only attributes
	this.rejoining = false;

	// these are set automatically by the 'add' functions
	this.server = null;
}

Channel.prototype = {
	rejoin: function() {
		this.server.user.applyStateChange('Info', this.entityId, 'Attempting to rejoin channel...');

		if (this.inChannel) {
			this.rejoining = true;

			this.server.send('PART ' + this.name);
		}

		this.server.send('JOIN ' + this.name);
	},
	withUserlistEntry: function(nick, cb) {
		var matchIndex = statechanges.utils.findUserlistEntryByNick(nick, this.userlist);

		if (matchIndex !== null) {
			cb(null, this.userlist[matchIndex]);
		} else {
			var err = new Error('No matching userlist entry');

			err.code = 'ENOENT';

			cb(err);
		}
	},
	removeEntity: function() {
		if (this.inChannel) {
			this.rejoining = false;

			this.server.send('PART ' + this.name);
		} else {
			this.server.removeChannel(this.name);
		}
	}
};

function Query(spec, getNextEntityId) {
	utils.ensureRequiredFields(spec, [
		'name'
	]);

	this.entityId = spec.entityId || getNextEntityId();
	this.type = 'query';

	this.name = spec.name;
	this.activityLog = spec.activityLog || [];
	this.numEvents = spec.numEvents || 0;
	this.numAlerts = spec.numAlerts || 0;

	// these are set automatically by the 'add' functions
	this.server = null;
}

Query.prototype = {
	removeEntity: function() {
		this.server.removeQuery(this.name);
	}
};

function ServerIdentity(spec) {
	utils.ensureRequiredFields(spec, [
		'nicknames',
		'username',
		'realName'
	]);

	assert(Array.isArray(spec.nicknames));
	assert(spec.nicknames.length > 0);

	this.nicknames = spec.nicknames;
	this.username = spec.username;
	this.realName = spec.realName;
}

ServerIdentity.prototype = {
	nextNickname: function(lastNickname) {
		// if lastNickname is undefined or not in the list, indexOf will return -1, then +1 will make nextIndex 0
		var nextIndex = (this.nicknames.indexOf(lastNickname) + 1) % this.nicknames.length;

		if (typeof lastNickname === 'string' && nextIndex === 0) {
			// either the given nickname was not found or it's a rollover
			return null;
		} else {
			return this.nicknames[nextIndex];
		}
	}
};

function UserlistEntry() {
	this.nick = null;

	// optional: user, host, owner, admin, op, halfop, voice
}

function ClientOrigin(nick, user, host) {
	this.nick = nick;
	this.user = user;
	this.host = host;

	this.type = 'client';
}

ClientOrigin.prototype = {
	getNickOrName: function() {
		return this.nick;
	}
}

function ServerOrigin(name) {
	this.name = name;

	this.type = 'server';
}

ServerOrigin.prototype = {
	getNickOrName: function() {
		return this.name;
	}
}

function ChannelTarget(name) {
	this.name = name;
}

ChannelTarget.prototype = {
	toString: function() {
		return this.name;
	}
}

function ClientTarget(nick, server) {
	this.nick = nick;
	this.server = server || null;
}

ClientTarget.prototype = {
	toString: function() {
		var ret = this.nick;

		if (this.server) {
			ret += '@' + this.server;
		}

		return ret;
	}
}

exports.install = function() {
	global.User = User;
	global.Server = Server;
	global.Channel = Channel;
	global.Query = Query;
	global.UserlistEntry = UserlistEntry;
	global.ClientOrigin = ClientOrigin;
	global.ServerOrigin = ServerOrigin;
	global.ChannelTarget = ChannelTarget;
	global.ClientTarget = ClientTarget;
}

// down here due to circular dependency
var irc = require('./irc.js');
