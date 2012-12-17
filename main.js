var assert = require('assert');
var express = require('express');
var app = express();
var http = require('http');
var connect = require('connect');
var cookie = require('cookie');
var io = require('socket.io');
var cloneextend = require('cloneextend');
var irc = require('./irc.js');
var data = require('./data.js');

var config = {
	sessionSecret: 'notsecret',
	sessionKey: 'sid'
}

var sessionStore = new express.session.MemoryStore();

app.configure(function() {
	app.use(express.cookieParser());
	app.use(express.session({
		store: sessionStore,
		secret: config.sessionSecret,
		maxAge: 24 * 60 * 60,
		key: config.sessionKey
	}));
	app.use(express.static(__dirname + '/static'));
});

var server = http.createServer(app);
server.listen(28081);
var sio = io.listen(server);

sio.configure(function() {
	// TODO LOW: experiment with other socket.io transports and make sure they all pass sid correctly
	sio.set('log level', 2);

	sio.set('authorization', function(data, accept) {
		var cookies = connect.utils.parseSignedCookies(cookie.parse(data.headers.cookie), config.sessionSecret);

		if ('sid' in cookies) {
			sessionStore.get(cookies['sid'], function(err, session) {
				// TODO LOW: if the session cannot be looked up, tell the client to refresh, creating a new session (implicitly, of course)
				if (session && !err) {
					data.sessionId = cookies['sid'];

					accept(null, true);
				} else {
					accept('Session lookup failed -- invalid sid received from client during WebSocket authorization', false);
				}
			});
		} else {
			accept('No sid in cookie', false);
		}
	});

	sio.sockets.on('connection', function(socket) {
		console.log('A socket with sessionId ' + socket.handshake.sessionId + ' connected.');

		var user = null;

		data.users.some(function(currentUser) {
			// if socket.handshake.sessionId is in user.loggedInSessions
			// if (user.loggedInSessions.indexOf(socket.handshake.sessionId) !== -1) {
			if (true) {
				user = currentUser;
				return true;
			} else {
				return false;
			}
		});

		// see if this socket belongs to a user who is already logged in
		if (user !== null) {
			handleSuccessfulLogin(user, socket);
		} else {
			socket.emit('NeedLogin', {});
		}

		socket.on('Login', function(data) {
			// only process Login if the user for this socket is null
			if (user === null) {
				// TODO: verify login

				// TODO: add sessionId to loggedInSessions for user

				handleSuccessfulLogin(user, socket);
			}
		});

		socket.on('disconnect', function() {
			// TODO LOW: support connection timeouts
			console.log('WebSocket disconnected');

			// remove the socket from activeWebSockets of the user
			// nothing to remove if the socket was not yet logged in
			if (user !== null) {
				var socketIndex = user.activeWebSockets.indexOf(socket);
				if (socketIndex !== -1) {
					user.activeWebSockets.splice(socketIndex, 1);
				}
			}
		});
	});
});

function handleSuccessfulLogin(user, socket) {
	user.activeWebSockets.push(socket);

	socket.emit('CurrentState', {
		username: user.username,
		servers: user.servers.map(function(server) {
			// copy the server object
			var serverCopy = cloneextend.clone(server);

			// and remove the fields that should not be sent
			delete serverCopy.socket;
			delete serverCopy.user;

			serverCopy.channels = server.channels.map(function(channel) {
				// copy the channel object
				var channelCopy = cloneextend.clone(channel);

				// and remove the fields that should not be sent
				delete channelCopy.server;

				return channelCopy;
			});

			return serverCopy;
		}),
		activeWindowId: user.activeWindowId
	});

	socket.on('ChatboxSend', function(data) {
		console.log(data);

		data.lines.forEach(function(line) {
			irc.processChatboxLine(line, user, data.exec);
		});
	});

	socket.on('SetActiveWindow', function(data) {
		console.log('active window set to: ' + data.windowId + ' (client request)');

		user.setActiveWindow(data.windowId);
	});
}

var newUser = new data.User(
	'u',
	'p'
);

newUser.addServer(
	new data.Server(
		'test.server',
		6667,
		'webirc',
		'webirc',
		'webirc',
		['#test']
	)
);

data.users.push(newUser);

irc.run();

