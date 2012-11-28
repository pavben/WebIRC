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

app.get('/test', function(req, res) {
	console.log("Sessions: %j", sessionStore);
	res.end("hey");
});

var server = http.createServer(app);
server.listen(28081);
var sio = io.listen(server);

sio.configure(function() {
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

		data.users.forEach(function(user) {
			// if socket.handshake.sessionId is in user.loggedInSessions
			// if (user.loggedInSessions.indexOf(socket.handshake.sessionId) !== -1) {
			if (true) {
				user.activeWebSockets.push(socket);

				// then they're already authenticated
				socket.emit('CurrentState', {
					username: user.username,
					servers: user.servers.map(function(server) {
						// copy the server object
						var serverCopy = cloneextend.clone(server);

						// and remove the fields that should not be sent
						delete serverCopy.socket;

						return serverCopy;
					})
				});
			} else {
				socket.emit('NeedLogin', {});
			}
		});

		socket.on('disconnect', function() {
			console.log('WebSocket disconnected');

			// remove the socket from activeWebSockets of the user
			var socketRemoved = false;
			data.users.forEach(function(user) {
				var socketIndex = user.activeWebSockets.indexOf(socket);
				if (socketIndex !== -1) {
					user.activeWebSockets.splice(socketIndex, 1);
					socketRemoved = true;
				}
			});

			assert(socketRemoved, 'Disconnected WebSocket not found for removal');
		});
	});
});

data.users.push(
	new data.User(
		'u',
		'p',
		[
			new data.Server(
				'test.server',
				6667,
				'webirc',
				'webirc',
				'webirc',
				['#test']
			)
		]
	)
);

irc.run();

