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

		// TODO: use withChannel
		var exists = server.channels.some(function(channel) {
			if (channel.name.toLowerCase() === channelName.toLowerCase()) {
				channel.rejoining = false;

				server.user.applyStateChange('RejoinChannel', channel.toWindowPath());

				return true;
			}
		});

		if (!exists) {
			var channel = new Channel(channelName, true);

			this.user.applyStateChange('AddChannel', this.getIndex(), channel);

			// now apply the parameters that should not be sent
			channel.server = this;

			this.user.setActiveWindow(channel.toWindowPath());
		}
	},
	findChannel: function(channelName) {
		var server = this;

		var channelRet = null;

		server.channels.some(function(channel, channelIdx) {
			if (channel.name.toLowerCase() === channelName.toLowerCase()) {
				channelRet = channel;

				return true;
			}
		});

		return channelRet;
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
	getIndex: function() {
		return this.user.servers.indexOf(this);
	},
	toWindowPath: function() {
		return {
			serverIdx: this.getIndex(),
		};
	}
};

function Channel(name, inChannel) {
	this.name = name;
	this.tempUserlist = []; // built while NAMES entries are coming in (353) and copied to userlist on 366
	this.userlist = [];
	this.activityLog = [];
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
	getIndex: function() {
		return this.server.channels.indexOf(this);
	},
	toWindowPath: function() {
		return {
			serverIdx: this.server.user.servers.indexOf(this.server),
			channelIdx: this.getIndex()
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
	getIndex: function() {
		return this.server.queries.indexOf(this);
	},
	toWindowPath: function() {
		return {
			serverIdx: this.server.user.servers.indexOf(this.server),
			queryIdx: this.getIndex()
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
