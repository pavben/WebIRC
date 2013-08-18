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

		this.setActiveWindow({serverIdx: serverIdx});
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

		// first, apply the change on the server
		var stateChangeFunctionReturn = statechanges.callStateChangeFunction(this, funcId, args);

		// then send it to the clients
		this.sendToWeb('ApplyStateChange', {
			funcId: funcId,
			args: args
		});

		return stateChangeFunctionReturn;
	},
	getWindowByPath: function(path) {
		return statechanges.utils.getWindowByPath(this, path);
	}
};

function Server(serverSpec) {
	this.host = serverSpec.host;
	this.port = serverSpec.port;
	this.ssl = serverSpec.ssl || false;
	this.nickname = null;
	this.desiredNickname = serverSpec.desiredNickname;
	this.username = serverSpec.username;
	this.realName = serverSpec.realName;
	this.channels = [];
	this.desiredChannels = serverSpec.desiredChannels;
	this.queries = [];
	this.socket = null;
	this.activityLog = [];

	// these are set automatically by the 'add' functions
	this.user = null; // the user this server belongs to
}

Server.prototype = {
	reconnect: function() {
		irc.reconnectServer(this);
	},
	addChannel: function(channel) {
		var serverIdx = this.user.servers.indexOf(this);

		var channelIdx = this.user.applyStateChange('AddChannel', serverIdx, channel);

		// now apply the parameters that should not be sent
		channel.server = this;

		console.log('Successfully joined ' + channel.name);

		this.user.setActiveWindow({serverIdx: serverIdx, channelIdx: channelIdx});

		return channelIdx;
	},
	removeChannel: function(channelName) {
		var server = this;

		var success = this.channels.some(function(channel, channelIdx) {
			if (channel.name.toLowerCase() === channelName.toLowerCase()) {
				server.user.applyStateChange('RemoveChannel', channel.toWindowPath());

				return true; // we've found the entry
			} else {
				return false; // continue
			}
		});

		if (success) {
			console.log('Parted ' + channelName);
		}
	},
	addQuery: function(query) {
		var serverIdx = this.user.servers.indexOf(this);

		var queryIdx = this.user.applyStateChange('AddQuery', serverIdx, query);

		// now apply the parameters that should not be sent
		query.server = this;

		return queryIdx;
	},
	send: function(data) {
		console.log('SEND: ' + data);
		if (this.socket !== null) {
			this.socket.write(data + '\r\n');
		} else {
			console.log('send called on a server with null socket');
		}
	},
	toWindowPath: function() {
		return {
			serverIdx: this.user.servers.indexOf(this),
		};
	}
};

function Channel(name) {
	this.name = name;
	this.tempUserlist = []; // built while NAMES entries are coming in (353) and copied to userlist on 366
	this.userlist = [];
	this.activityLog = [];

	// these are set automatically by the 'add' functions
	this.server = null;
}

Channel.prototype = {
	toWindowPath: function() {
		return {
			serverIdx: this.server.user.servers.indexOf(this.server),
			channelIdx: this.server.channels.indexOf(this)
		};
	}
};

function Query(name) {
	this.name = name;
	this.activityLog = [];

	// these are set automatically by the 'add' functions
	this.server = null;
}

Query.prototype = {
	toWindowPath: function() {
		return {
			serverIdx: this.server.user.servers.indexOf(this.server),
			queryIdx: this.server.queries.indexOf(this)
		};
	}
};

function UserlistEntry() {
	this.nick = null;

	// optional: user, host, owner, op, halfop, voice
}

function ClientOrigin(nick, user, host) {
	this.nick = nick;
	this.user = user;
	this.host = host;
}

ClientOrigin.prototype = {
	getNickOrName: function() {
		return this.nick;
	}
}

function ServerOrigin(name) {
	this.name = name;
}

ServerOrigin.prototype = {
	getNickOrName: function() {
		return this.name;
	}
}

function ChannelTarget(name) {
	this.name = name;
}

function ClientTarget(nick) {
	this.nick = nick;
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
