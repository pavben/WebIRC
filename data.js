function User(username, password, servers) {
	this.username = username;
	this.password = password;
	this.servers = servers;
	this.activeWebSockets = [];
	this.loggedInSessions = [];
}

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
}

function Channel(name) {
	this.name = name;
	this.tempUserlist = []; // built while NAMES entries are coming in (353) and copied to userlist on 366
	this.userlist = [];
	this.eventHistory = [];
}

function UserlistEntry() {
	this.nick = null;
}

function EventHistoryJoin(who) {
	this.who = who;
}

var users = [];

exports.User = User;
exports.Server = Server;
exports.Channel = Channel;
exports.UserlistEntry = UserlistEntry;
exports.users = users;

