var assert = require('assert');
// irc.js include moved to the bottom due to circular dependency
var statechanges = require('./static/js/statechanges.js');

function User(username, password) {
	this.username = username;
	this.password = password;

	this.servers = [];

	this.activeWebSockets = [];
	this.loggedInSessions = [];

	this.currentActiveWindow = null;
}

User.prototype = {
	addServer: function(server) {
		this.applyStateChange('AddServer', server);

		// now apply the parameters that should not be sent
		server.user = this;

		var serverIdx = this.servers.length - 1; // will be the last

		this.setActiveWindow({ serverIdx: serverIdx });
	},
	setActiveWindow: function(newActiveWindowParams) {
		this.applyStateChange('SetActiveWindow', newActiveWindowParams);
	},
	sendToWeb: function(msgId, data) {
		this.activeWebSockets.forEach(function(socket) {
			socket.emit(msgId, data);
		});
	},
	applyStateChange: function() {
		var funcId = arguments[0];

		var args = Array.prototype.slice.call(arguments, 1);

		console.log('%s state change args: %j', funcId, args);

		// first, send it to the clients
		this.sendToWeb('ApplyStateChange', {
			funcId: funcId,
			args: args
		});

		// then apply the change on the server
		var stateChangeFunctionReturn = statechanges.callStateChangeFunction(this, funcId, args);

		return stateChangeFunctionReturn;
	},
	getWindowByPath: function(path) {
		return statechanges.utils.getWindowByPath(this, path);
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
	}
};

function Server(serverSpec) {
	this.host = serverSpec.host;
	this.port = serverSpec.port;
	this.ssl = serverSpec.ssl || false;
	this.password = serverSpec.password || null;
	this.nickname = null;
	this.desiredNickname = serverSpec.desiredNickname;
	this.username = serverSpec.username;
	this.realName = serverSpec.realName;
	this.channels = [];
	this.desiredChannels = serverSpec.desiredChannels;
	this.queries = [];
	this.socket = null;
	this.activityLog = [];
	this.numEvents = 0;
	this.numAlerts = 0;
	this.connected = false;

	// these are set automatically by the 'add' functions
	this.user = null; // the user this server belongs to
}

Server.prototype = {
	reconnect: function() {
		irc.reconnectServer(this);
	},
	joinedChannel: function(channelName) {
		var server = this;

		server.withChannel(channelName, check(
			function(err) {
				var channel = new Channel(channelName, true);

				server.user.applyStateChange('AddChannel', server.getIndex(), channel);

				// now apply the parameters that should not be sent
				channel.server = server;

				server.user.setActiveWindow(channel.toWindowPath());
			},
			function(channel) {
				channel.rejoining = false;

				server.user.applyStateChange('RejoinChannel', channel.toWindowPath());
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

		server.channels.some(function(channel, channelIdx) {
			if (channel.name.toLowerCase() === channelName.toLowerCase()) {
				server.user.applyStateChange('RemoveChannel', channel.toWindowPath());

				return true;
			}
		});
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
			var query = new Query(queryName);

			this.user.applyStateChange('AddQuery', this.getIndex(), query);

			// now apply the parameters that should not be sent
			query.server = this;

			queryRet = query;
		}

		return queryRet;
	},
	removeQuery: function(targetName) {
		var server = this;

		server.queries.some(function(query, queryIdx) {
			if (query.name.toLowerCase() === targetName.toLowerCase()) {
				server.user.applyStateChange('RemoveQuery', query.toWindowPath());

				return true;
			}
		});
	},
	send: function(data) {
		console.log('SEND: ' + data);
		if (this.socket !== null) {
			this.socket.write(data + '\r\n');
		} else {
			console.log('send called on a server with null socket');
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
	getIndex: function() {
		return this.user.servers.indexOf(this);
	},
	toWindowPath: function() {
		return {
			serverIdx: this.getIndex()
		};
	},
	closeWindow: function() {
		// TODO: implement closing server windows
	}
};

function Channel(name, inChannel) {
	this.name = name;
	this.tempUserlist = []; // built while NAMES entries are coming in (353) and copied to userlist on 366
	this.userlist = [];
	this.activityLog = [];
	this.numEvents = 0;
	this.numAlerts = 0;
	this.inChannel = inChannel;

	// server-only attributes
	this.rejoining = false;

	// these are set automatically by the 'add' functions
	this.server = null;
}

Channel.prototype = {
	rejoin: function() {
		this.server.user.applyStateChange('Info', this.toWindowPath(), 'Attempting to rejoin channel...');

		if (this.inChannel) {
			this.rejoining = true;

			this.server.send('PART ' + this.name);
		}

		this.server.send('JOIN ' + this.name);
	},
	withUserlistEntry: function(nick, cb) {
		var matchedUserlistEntry;

		this.userlist.some(function(userlistEntry) {
			if (userlistEntry.nick.toLowerCase() === nick.toLowerCase()) {
				matchedUserlistEntry = userlistEntry;

				return true;
			}
		});

		if (matchedUserlistEntry) {
			cb(null, matchedUserlistEntry);
		} else {
			var err = new Error('No matching userlist entry');

			err.code = 'ENOENT';

			cb(err);
		}
	},
	getIndex: function() {
		return this.server.channels.indexOf(this);
	},
	toWindowPath: function() {
		return {
			serverIdx: this.server.user.servers.indexOf(this.server),
			channelIdx: this.getIndex()
		};
	},
	closeWindow: function() {
		if (this.inChannel) {
			this.rejoining = false;

			this.server.send('PART ' + this.name);
		} else {
			this.server.removeChannel(this.name);
		}
	}
};

function Query(name) {
	this.name = name;
	this.activityLog = [];
	this.numEvents = 0;
	this.numAlerts = 0;

	// these are set automatically by the 'add' functions
	this.server = null;
}

Query.prototype = {
	getIndex: function() {
		return this.server.queries.indexOf(this);
	},
	toWindowPath: function() {
		return {
			serverIdx: this.server.user.servers.indexOf(this.server),
			queryIdx: this.getIndex()
		};
	},
	closeWindow: function() {
		this.server.removeQuery(this.name);
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

var users = [];

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
	global.users = users;
}

// down here due to circular dependency
var irc = require('./irc.js');
