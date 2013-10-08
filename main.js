require('./data.js').install();
require('./utils.js').installGlobals();

var assert = require('assert');
var express = require('express');
var fs = require('fs');
var http = require('http');
var https = require('https');
var connect = require('connect');
var cookie = require('cookie');
var io = require('socket.io');
var irc = require('./irc.js');

var sessionKey = 'sid';

readConfig('config.json', check(
	function(err) {
		console.log('Error reading config.json:', err);
	},
	function(config) {
		console.log('Read config', config);

		var sessionStore = new express.session.MemoryStore();

		var app = express();

		app.configure(function() {
			app.use(express.cookieParser());
			app.use(express.session({
				store: sessionStore,
				secret: config.sessionSecret,
				maxAge: 24 * 60 * 60,
				key: sessionKey
			}));
			app.use(express.static(__dirname + '/static'));
		});

		if (config.http && config.http.port) {
			createWebServer(config.http);
		}

		if (config.https && config.https.port) {
			createWebServer(config.https);
		}

		function createWebServer(spec) {
			var server;
			if (spec.keyFile && spec.certFile) {
				server = https.createServer({
					key: fs.readFileSync(spec.keyFile),
					cert: fs.readFileSync(spec.certFile),
					rejectUnauthorized: false
				}, app);
			} else {
				server = http.createServer(app);
			}
			server.listen(spec.port);
			var sio = io.listen(server);

			sio.configure(function() {
				// TODO LOW: experiment with other socket.io transports and make sure they all pass sid correctly
				sio.set('log level', 2);

				sio.set('authorization', function(data, accept) {
					if ('cookie' in data.headers) {
						var cookies = connect.utils.parseSignedCookies(cookie.parse(data.headers.cookie), config.sessionSecret);

						if (sessionKey in cookies) {
							sessionStore.get(cookies[sessionKey], function(err, session) {
								// TODO LOW: if the session cannot be looked up, tell the client to refresh, creating a new session
								if (!err && session) {
									data.sessionId = cookies[sessionKey];

									accept(null, true);
								} else {
									accept('Session lookup failed -- invalid session ID received from client during WebSocket authorization', false);
								}
							});
						} else {
							accept('No sid in cookie', false);
						}
					} else {
						accept('No cookie header', false);
					}
				});

				sio.sockets.on('connection', function(socket) {
					console.log('A socket with sessionId ' + socket.handshake.sessionId + ' connected.');

					var sessionId = socket.handshake.sessionId;

					var user = null;

					users.some(function(currentUser) {
						// if sessionId is already in user.loggedInSessions
						if (currentUser.loggedInSessions.indexOf(socket.handshake.sessionId) !== -1) {
							user = currentUser;
							return true;
						}
					});

					// see if this socket belongs to a user who is already logged in
					if (user !== null) {
						handleSuccessfulLogin(user, socket, sessionId);
					} else {
						socket.emit('NeedLogin', {});
					}

					socket.on('Login', function(data) {
						// only process Login if the user for this socket is null
						if (user === null) {
							users.some(function(currentUser) {
								if (currentUser.username === data.username && currentUser.password === data.password) {
									user = currentUser;

									return true;
								}
							});

							if (user !== null) {
								// add sessionId to loggedInSessions for user
								user.loggedInSessions.push(sessionId);

								handleSuccessfulLogin(user, socket, sessionId);
							} else {
								socket.emit('LoginFailed', {});
							}
						}
					});

					socket.on('disconnect', function() {
						// TODO LOW: support connection timeouts
						console.log('WebSocket disconnected');

						// remove the socket from activeWebSockets of the user
						// nothing to remove if the socket was not yet logged in
						if (user !== null) {
							user.removeActiveWebSocket(socket);
						}
					});
				});
			});
		}

		function handleSuccessfulLogin(user, socket, sessionId) {
			// TODO: combine activeWebSockets with loggedInSessions
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
					'queries',
					'timeoutPings'
				]);

				serverCopy.channels = server.channels.map(function(channel) {
					var channelCopy = cloneExceptFields(channel, [
						'server'
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
					irc.processChatboxLine(user, line, data.exec, sessionId);
				});
			});

			socket.on('SetActiveWindow', function(data) {
				var targetWindow = user.getWindowByPath(data.windowPath);

				if (targetWindow !== null) {
					user.setActiveWindow(data.windowPath);
				} else {
					console.log('Invalid windowPath in SetActiveWindow from client');
				}
			});

			socket.on('CloseWindow', function(data) {
				var targetWindow = user.getWindowByPath(data.windowPath);

				if (targetWindow !== null) {
					targetWindow.object.closeWindow();
				} else {
					console.log('Invalid windowPath in CloseWindow from client');
				}
			});
		}

		config.users.forEach(function(user) {
			var newUser = new User(user.username, user.password);

			user.servers.forEach(function(serverSpec) {
				newUser.addServer(new Server(serverSpec));
			});

			users.push(newUser);
		})

		irc.run();
	}
));

function readConfig(configFilePath, cb) {
	fs.readFile(configFilePath, check(cb, function(data) {
		var err = null;
		var config = null;

		try {
			config = JSON.parse(data);
		} catch(e) {
			err = e;
		}

		cb(err, config);
	}));
}
