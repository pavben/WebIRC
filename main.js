"use strict";

require('./data.js').install();
require('./utils.js').installGlobals();

var assert = require('assert');
var connect = require('connect');
var cookie = require('cookie');
var express = require('express');
var http = require('http');
var https = require('https');
var io = require('socket.io');
var irc = require('./irc.js');
var logger = require('./logger.js');
var users = require('./users.js');
var utils = require('./utils.js');

var sessionKey = 'sid';

readConfig('config.json', check(
	function(err) {
		console.log('Error reading config.json:', err);
	},
	function(config) {
		console.log('Read config', config);

		logger.init(config.logLevels.console, config.logLevels.file);

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
					logger.info('A socket with sessionId %s connected.', socket.handshake.sessionId);

					var sessionId = socket.handshake.sessionId;

					var user = null;

					allUsers.some(function(currentUser) {
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
							allUsers.some(function(currentUser) {
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
						logger.info('WebSocket disconnected');

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

			var userCopy = users.copyStateForClient(user);

			socket.emit('CurrentState', userCopy);

			socket.on('ChatboxSend', function(data) {
				logger.info('Chatbox send', data);

				// TODO: validate the presence of expected input

				data.lines.forEach(function(line) {
					irc.processChatboxLine(user, data.entityId, line, data.exec, sessionId);
				});
			});

			socket.on('SetActiveEntity', function(data) {
				if ('targetEntityId' in data) {
					var targetEntity = user.getEntityById(data.targetEntityId);

					if (targetEntity !== null) {
						user.setActiveEntity(targetEntity.entityId);
					} else {
						logger.error('Invalid targetEntityId in SetActiveEntity from client', data);
					}
				}
			});

			socket.on('CloseWindow', function(data) {
				if ('targetEntityId' in data) {
					var targetEntity = user.getEntityById(data.targetEntityId);

					if (targetEntity !== null) {
						targetEntity.removeEntity();
					} else {
						logger.error('Invalid targetEntityId in CloseWindow from client', data);
					}
				}
			});
		}

		users.readAllUsers(check(
			function(err) {
				logger.error('Error reading user data:', err);
			},
			function(users) {
				logger.data(users);

				allUsers = users;

				irc.run();
			}
		));
	}
));

function readConfig(configFilePath, cb) {
	utils.readJsonFile(configFilePath, cb);
}
