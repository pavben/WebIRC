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
	this.eventHistory = [];
	this.windowId = windowId;
}

function UserlistEntry() {
	this.nick = null;
	//this.user = null;
	//this.host = null;
}

function EventHistoryJoin(who) {
	this.eventId = 1;
	this.who = who;
}

var users = [];

exports.User = User;
exports.Server = Server;
exports.Channel = Channel;
exports.UserlistEntry = UserlistEntry;
exports.users = users;

