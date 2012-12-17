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
		this.sendToWeb('Activity', {windowId: windowId, activity: activity });
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

		this.user.setActiveWindow(channel.windowId);
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

