function User(username, password, servers) {
	this.username = username;
	this.password = password;

	this.servers = servers;

	this.activeWebSockets = [];
	this.loggedInSessions = [];

	this.nextWindowId = 0;
}

User.prototype = {
	getNextWindowId: function() {
		return (this.nextWindowId++);
	}
};

function Server(host, port, desiredNickname, username, realName, desiredChannels, windowId) {
	this.host = host;
	this.port = port;
	this.nickname = null;
	this.desiredNickname = desiredNickname;
	this.username = username;
	this.realName = realName;
	this.channels = [];
	this.desiredChannels = desiredChannels;
	this.socket = null;
	this.windowId = windowId;
}

function Channel(name, windowId) {
	this.name = name;
	this.tempUserlist = []; // built while NAMES entries are coming in (353) and copied to userlist on 366
	this.userlist = [];
	this.activityLog = [];
	this.windowId = windowId;
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

