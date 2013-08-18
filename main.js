require('./data.js').install();

var assert = require('assert');
var express = require('express');
var app = express();
var http = require('http');
var connect = require('connect');
var cookie = require('cookie');
var io = require('socket.io');
var config = require('./config.js')
var irc = require('./irc.js');

var sessionKey = 'sid';

config.load('config.json', check(
	function(err) {
		console.log('Error reading config.json:', err);
	},
	function() {
		var sessionStore = new express.session.MemoryStore();

		app.configure(function() {
			app.use(express.cookieParser());
			app.use(express.session({
				store: sessionStore,
				secret: config.data.sessionSecret,
				maxAge: 24 * 60 * 60,
				key: sessionKey
			}));
			app.use(express.static(__dirname + '/static'));
		});

		var server = http.createServer(app);
		server.listen(config.data.httpListenPort);
		var sio = io.listen(server);

		sio.configure(function() {
			// TODO LOW: experiment with other socket.io transports and make sure they all pass sid correctly
			sio.set('log level', 2);

			sio.set('authorization', function(data, accept) {
				var cookies = connect.utils.parseSignedCookies(cookie.parse(data.headers.cookie), config.data.sessionSecret);

				if (sessionKey in cookies) {
					sessionStore.get(cookies[sessionKey], function(err, session) {
						// TODO LOW: if the session cannot be looked up, tell the client to refresh, creating a new session (implicitly, of course)
						if (session && !err) {
							data.sessionId = cookies[sessionKey];

							accept(null, true);
						} else {
							accept('Session lookup failed -- invalid session ID received from client during WebSocket authorization', false);
						}
					});
				} else {
					accept('No sid in cookie', false);
				}
			});

			sio.sockets.on('connection', function(socket) {
				console.log('A socket with sessionId ' + socket.handshake.sessionId + ' connected.');

				var user = null;

				users.some(function(currentUser) {
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

			function cloneExceptFields(src, exceptFields) {
				var ret = {};

				Object.keys(src).filter(function(k) {
					return !~exceptFields.indexOf(k);
				}).forEach(function(k) {
					ret[k] = src[k];
				});

				return ret;
			}

			var userCopy = cloneExceptFields(user, [
				'activeWebSockets',
				'loggedInSessions',
				'password',
				'servers'
			]);

			userCopy.servers = user.servers.map(function(server) {
				var serverCopy = cloneExceptFields(server, [
					'socket',
					'user',
					'channels',
					'queries'
				]);

				serverCopy.channels = server.channels.map(function(channel) {
					var channelCopy = cloneExceptFields(channel, [
						'server',
						'tempUserlist'
					]);

					return channelCopy;
				});

				serverCopy.queries = server.queries.map(function(query) {
					var queryCopy = cloneExceptFields(query, [
						'server'
					]);

					return queryCopy;
				});

				return serverCopy;
			});

			socket.emit('CurrentState', userCopy);

			socket.on('ChatboxSend', function(data) {
				console.log(data);

				data.lines.forEach(function(line) {
					irc.processChatboxLine(line, user, data.exec);
				});
			});

			socket.on('SetActiveWindow', function(data) {
				console.log('client requesting the active window to be set to %j', data.windowPath);

				var targetWindow = user.getWindowByPath(data.windowPath);

				if (targetWindow !== null) {
					user.setActiveWindow(data.windowPath);
				} else {
					console.log('Invalid windowPath in SetActiveWindow from client');
				}
			});
		}

		config.data.users.forEach(function(user) {
			var newUser = new User(user.username, user.password);

			user.servers.forEach(function(serverSpec) {
				newUser.addServer(new Server(serverSpec));
			});

			users.push(newUser);
		})

		irc.run();
	}
));

