var cloneextend = require('cloneextend');

function User(username, password) {
	this.username = username;
	this.password = password;

	this.servers = [];

	this.activeWebSockets = [];
	this.loggedInSessions = [];

	this.nextWindowId = 0;
	this.activeWindowId = null;
}

User.prototype = {
	addServer: function(server) {
		server.user = this;
		server.windowId = this.getNextWindowId();

		this.servers.push(server);

		this.setActiveWindow(server.windowId);
	},
	setActiveWindow: function(windowId) {
		console.log('active window set to: ' + windowId + ' (on server)');

		this.activeWindowId = windowId;

		// sync the change to the gateway
		this.sendToWeb('SetActiveWindow', {windowId: windowId});
	},
	sendToWeb: function(msgId, data) {
		this.activeWebSockets.forEach(function(socket) {
			socket.emit(msgId, data);
		});
	},
	sendActivityForWindow: function(windowId, activity) {
		this.sendToWeb('WindowActivity', {windowId: windowId, activity: activity });
	},
	getNextWindowId: function() {
		return (this.nextWindowId++);
	},
	getObjectsByWindowId: function(windowId) {
		for (serverIdx in this.servers) {
			var server = this.servers[serverIdx];

			if (server.windowId === windowId) {
				return {type: 'server', server: server};
			}
			
			for (channelIdx in server.channels) {
				var channel = server.channels[channelIdx];

				if (channel.windowId === windowId) {
					return {type: 'channel', server: server, channel: channel};
				}
			}
		}

		// windowId not found
		return null;
	},
	onWindowClosing: function(windowIdBeingClosed) {
		// if the window being closed is active, set a new active
		if (windowIdBeingClosed === this.activeWindowId) {
			// get the window before channel.windowId and set it as active
			var nextWindowId = getNextActiveWindowId(this);

			this.setActiveWindow(nextWindowId);
		}

		function getNextActiveWindowId(user) {
			var lastWindowId = null;

			(function() {
				for (serverIdx in user.servers) {
					var server = user.servers[serverIdx];

					if (server.windowId === windowIdBeingClosed) {
						return;
					} else {
						lastWindowId = server.windowId;
					
						for (channelIdx in server.channels) {
							var channel = server.channels[channelIdx];

							if (channel.windowId === windowIdBeingClosed) {
								return;
							} else {
								lastWindowId = channel.windowId;
							}
						}
					}
				}
			})();

			return lastWindowId;
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

	// these are set automatically by the 'add' functions
	this.user = null; // the user this server belongs to
	this.windowId = null;
}

Server.prototype = {
	addChannel: function(channel) {
		channel.server = this;
		channel.windowId = this.user.getNextWindowId();

		this.channels.push(channel);

		// and send the update to the web clients
		
		// copy the channel object
		var channelCopy = cloneextend.clone(channel);

		// and remove the fields that should not be sent
		delete channelCopy.server;

		this.user.sendToWeb('JoinChannel', {serverWindowId: this.windowId, channel: channelCopy});

		console.log('Successfully joined ' + channel.name);

		this.user.setActiveWindow(channel.windowId);
	},
	removeChannel: function(channelName) {
		var numMatched = 0;

		this.channels = this.channels.filter(function(channel) {
			if (channel.name.toLowerCase() === channelName.toLowerCase()) {
				this.user.onWindowClosing(channel.windowId);

				this.user.sendToWeb('RemoveChannel', {channelWindowId: channel.windowId});

				numMatched++;

				return false; // this entry is removed
			} else {
				return true; // this entry stays
			}
		}, this);

		if (numMatched === 1) {
			console.log('Parted ' + channelName);
		} else {
			console.log('Unexpected number of channels matched on removeChannel(' + channelName + '): ' + numMatched);
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
	this.windowId = null;
}

/*
 * join - log and userlist add
 * part - log and userlist remove
 * mode - log and a bunch of userlist changes possibly
 * quit - log in every applicable channel and remove from userlist in all
 * kick - same as part
 * topic - log and update topic, if we care
 * invite - log in active window
 * list - create a special list window, keep the list in server.channelList, send them to the browser at some interval
 */

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

