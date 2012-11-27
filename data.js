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

var users = [];

exports.User = User;
exports.Server = Server;
exports.users = users;

