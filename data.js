"use strict";

const assert = require('assert');
// irc.js include moved to the bottom due to circular dependency
const logger = require('./logger.js');
const statechanges = require('./static/js/statechanges.js');
const utils = require('./utils.js');

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
			socket.sendMessage(msgId, data);
		});
	},
	applyStateChange: function() {
		const funcId = arguments[0];
		const args = Array.prototype.slice.call(arguments, 1);

		// first, send it to the clients
		this.sendToWeb('ApplyStateChange', {
			funcId: funcId,
			args: args
		});

		// then apply the change on the server and return the result
		return statechanges.callStateChangeFunction(this, funcId, args);
	},
	getEntityById: function(targetEntityId) {
		return statechanges.utils.getEntityById(this, targetEntityId);
	},
	getNextEntityId: function() {
		return this.nextEntityId++;
	},
	removeActiveWebSocket: function(socket) {
		const idx = this.activeWebSockets.indexOf(socket);
		if (idx !== -1) {
			this.activeWebSockets.splice(idx, 1);

			return true;
		} else {
			return false;
		}
	},
	removeLoggedInSession: function(sessionId) {
		const idx = this.loggedInSessions.indexOf(sessionId);
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
	this.entityId = spec.entityId || getNextEntityId();
	this.type = 'server';

	this.label = spec.label || spec.host;
	this.host = spec.host || null;
	this.port = spec.port || null;
	this.ssl = spec.ssl || false;
	this.password = spec.password || null;
	this.currentNickname = null;
	this.identity = (spec.identity ? new ServerIdentity(spec.identity) : null);
	this.channels = [];
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
	disconnect: function(skipSendingQuit) {
		if (this.socket !== null) {
			if (!skipSendingQuit && this.isConnected()) {
				this.send('QUIT :');
			}
			this.socket.destroy();
			this.socket = null;
			this.endPings();
			this.user.applyStateChange('Disconnect', this.entityId);
			logger.info(`Disconnected from server: ${this.host}:${this.port}`);
		}
	},
	getActiveIdentity: function() {
		return this.identity || this.user.defaultIdentity;
	},
	addChannel: function(channel) {
		this.user.applyStateChange('AddChannel', this.entityId, channel);
	},
	joinedChannel: function(channelName) {
		const server = this;
		server.withChannel(channelName, check(
			function(err) {
				const channel = new Channel({
					name: channelName,
					inChannel: true
				}, server.user.getNextEntityId.bind(server.user));
				server.addChannel(channel);
				server.user.applyStateChange('Info', channel.entityId, `Joined channel ${channel.name}`);
				server.user.setActiveEntity(channel.entityId);
			},
			function(channel) {
				channel.rejoining = false;
				server.user.applyStateChange('RejoinChannel', channel.entityId);
			}
		));
	},
	withChannel: function(channelName, cb) {
		const matchedChannel = utils.findFirst(this.channels, channel => channel.name.toLowerCase() === channelName.toLowerCase());
		if (matchedChannel) {
			cb(null, matchedChannel);
		} else {
			const err = new Error('No matching channel');
			err.code = 'ENOENT';
			cb(err);
		}
	},
	addQuery: function(query) {
		this.user.applyStateChange('AddQuery', this.entityId, query);
	},
	ensureQuery: function(queryName) {
		const matchedQuery = utils.findFirst(this.queries, query => query.name.toLowerCase() === queryName.toLowerCase());
		if (matchedQuery) {
			return matchedQuery;
		} else {
			let query = new Query({
				name: queryName
			}, this.user.getNextEntityId.bind(this.user));
			this.addQuery(query);
			return query;
		}
	},
	isConnected: function() {
		return this.socket !== null && this.socket.writable;
	},
	send: function(data) {
		logger.data('SEND: %s', data);
		if (this.isConnected()) {
			this.socket.write(data + '\r\n');
		} else {
			logger.error('send called on a server with non-writable/null socket');
			console.trace();
		}
	},
	startPings: function() {
		assert(typeof this.pingInterval === 'undefined'); // must end any existing ones before starting
		const pingFrequency = 60000;
		this.pingInterval = setInterval(() => {
			// TODO LOW: do we care if we receive the correct token back? not checking for now
			const randomToken = Math.floor(Math.random()*99999);
			this.send('PING :' + randomToken);
		}, pingFrequency);
	},
	endPings: function() {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			delete this.pingInterval;
		}
	},
	showError: function(text, preferActive) {
		const targetEntity = preferActive ? this.getActiveOrServerEntity() : this.entityId;
		this.user.applyStateChange('Error', targetEntity, text);
	},
	showInfo: function(text, preferActive) {
		const targetEntity = preferActive ? this.getActiveOrServerEntity() : this.entityId;
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
	isRegistered: function() {
		return statechanges.utils.isRegisteredOnServer(this);
	},
	requireConnected: function(successCallback, options) {
		options = options || {};
		if (this.isRegistered() || (options.allowUnregistered && this.isConnected())) {
			successCallback();
		} else {
			this.user.showError('Not connected');
		}
	},
	sendWrapped: function(prefix, text) {
		// TODO: How does the 512 limit work with unicode characters?
		const textChunkLen = 512 - prefix.length;
		const chunks = [];
		if (textChunkLen >= 1) {
			for (let i = 0; i < text.length; i += textChunkLen) {
				const chunk = text.substr(i, textChunkLen);
				chunks.push(chunk);
				this.send(prefix + chunk);
			}
		} else {
			this.user.showError('Command prefix is too long for message wrapping.');
		}
		return chunks;
	},
	sendWrappedPrivmsg: function(target, text) {
		return this.sendWrapped(`PRIVMSG ${target} :`, text);
	},
	removeEntity: function() {
		// only allow closing the server window if it's not the only one
		if (this.user.servers.length > 1) {
			// disconnect if connected
			this.disconnect();
			// close all the queries
			for (let i of indicesReverse(this.queries.length)) {
				this.queries[i].removeEntity();
			}
			// close all the channels
			for (let i of indicesReverse(this.channels.length)) {
				this.channels[i].removeEntity();
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
		const matchIndex = statechanges.utils.findUserlistEntryByNick(nick, this.userlist);
		if (matchIndex !== null) {
			cb(null, this.userlist[matchIndex]);
		} else {
			const err = new Error('No matching userlist entry');
			err.code = 'ENOENT';
			cb(err);
		}
	},
	removeEntity: function() {
		if (this.inChannel) {
			this.server.send('PART ' + this.name);
		}
		this.server.user.applyStateChange('RemoveEntity', this.entityId);
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
		this.server.user.applyStateChange('RemoveEntity', this.entityId);
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
		const nextIndex = (this.nicknames.indexOf(lastNickname) + 1) % this.nicknames.length;
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
		let ret = this.nick;
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
const irc = require('./irc.js');
