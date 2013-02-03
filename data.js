var cloneextend = require('cloneextend');
var net = require('net');
var callStateChangeFunction = require('./static/js/statechanges.js').callStateChangeFunction;

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
		callStateChangeFunction(this, funcId, args);

		// then send it to the clients
		this.sendToWeb('ApplyStateChange', {
			funcId: funcId,
			args: args
		});
	},
	getWindowByPath: function(path) {
		if ('serverIdx' in path) {
			var server = this.servers[path.serverIdx];

			if ('channelIdx' in path) {
				var channel = server.channels[path.channelIdx];

				return {object: channel, server: server, type: 'channel', windowPath: path};
			} else if ('queryIdx' in path) {
				console.log('NOT IMPL');
			} else {
				// just the server
				return {object: server, server: server, type: 'server', windowPath: path};
			}
		} else {
			console.log('serverIdx required in getWindowByPath');
		}
	}
};

function Server(host, port, desiredNickname, username, realName, desiredChannels) {
	this.host = host;
	this.port = port;
	this.nickname = null;
	this.desiredNickname = desiredNickname;
	this.username = username;
	this.realName = realName;
	this.channels = [];
	this.desiredChannels = desiredChannels;
	this.socket = null;
	this.activityLog = [];

	// these are set automatically by the 'add' functions
	this.user = null; // the user this server belongs to
}

Server.prototype = {
	reconnect: function(processLineFromServer) {
		if (this.socket !== null) {
			this.send('QUIT :');

			this.socket.destroy();

			this.socket = null;
		}

		var theServer = this;

		var serverSocket = net.connect({host: theServer.host, port: theServer.port},
			function() {
				console.log('Connected to server');

				theServer.socket = serverSocket;
				theServer.nickname = theServer.desiredNickname;

				theServer.send('NICK ' + theServer.nickname);
				theServer.send('USER ' + theServer.username + ' ' + theServer.username + ' ' + theServer.host + ' :' + theServer.realName);
			}
		);

		serverSocket.on('error', function(err) {
			console.log('Server socket error: ' + err);
			try {
				if (theServer.socket !== null) {
					theServer.socket.destroy();
				}
			} finally {
				theServer.socket = null;
				console.log('Connection to server closed due to error.');
			}
		});

		var readBuffer = '';
		serverSocket.on('data', function(data) {
			readBuffer += data;

			while(true) {
				var lineEndIndex = readBuffer.indexOf('\r\n');
				if (lineEndIndex === -1) {
					break;
				}

				var line = readBuffer.substring(0, lineEndIndex);

				readBuffer = readBuffer.substring(lineEndIndex + 2);

				processLineFromServer(line, theServer);
			}
		});

		serverSocket.on('end', function() {
			theServer.socket = null;

			console.log('Disconnected from server');
		});
	},
	addChannel: function(channel) {
		var serverIdx = this.user.servers.indexOf(this);

		this.user.applyStateChange('AddChannel', serverIdx, channel);

		// now apply the parameters that should not be sent
		channel.server = this;

		console.log('Successfully joined ' + channel.name);

		var channelIdx = this.user.servers[serverIdx].channels.length - 1; // will be the last

		this.user.setActiveWindow({serverIdx: serverIdx, channelIdx: channelIdx});
	},
	removeChannel: function(channelName) {
		var success = this.channels.some(function(channel, channelIdx) {
			if (channel.name.toLowerCase() === channelName.toLowerCase()) {
				var serverIdx = this.user.servers.indexOf(this);

				this.user.applyStateChange('RemoveChannel', serverIdx, channelIdx);

				return true; // we've found the entry
			} else {
				return false; // continue
			}
		});

		if (success) {
			console.log('Parted ' + channelName);
		}
	},
	send: function(data) {
		console.log('SEND: ' + data);
		if (this.socket !== null) {
			this.socket.write(data + '\r\n');
		} else {
			console.log('send called on a server with null socket');
		}
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

function UserlistEntry() {
	this.nick = null;
	
	// optional: user, host, owner, op, halfop, voice
}

var users = [];

exports.User = User;
exports.Server = Server;
exports.Channel = Channel;
exports.UserlistEntry = UserlistEntry;
exports.users = users;

