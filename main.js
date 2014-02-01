"use strict";

require('./data.js').install();
require('./utils.js').installGlobals();

var assert = require('assert');
var connect = require('connect');
var cookie = require('cookie');
var express = require('express');
var fs = require('fs-extra');
var http = require('http');
var https = require('https');
var logger = require('./logger.js');
var socketio = require('socket.io');
var async = require('./async.js')
var irc = require('./irc.js');
var users = require('./users.js');
var utils = require('./utils.js');

var sessionKey = 'sid';

async()
	.add('config', function(cb) {
		utils.readJsonFile('config.json', cb);
	})
	.add('initLogger', function(config) {
		logger.init(config.logLevels.console, config.logLevels.file);
	})
	.add('usersInitialized', function(initLogger, cb) {
		users.initialize(cb);
	})
	.add('sessionStore', function() {
		return new express.session.MemoryStore();
	})
	.add('expressApp', function(config, sessionStore) {
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

		return app;
	})
	.add('startWebListeners', function(config, initLogger, usersInitialized, expressApp, sessionStore, cb) {
		var a = async();

		if (config.http && config.http.port) {
			a.add(function(cb) {
				createWebServer(config.http, expressApp, config, sessionStore, cb);
			});
		}

		if (config.https && config.https.port) {
			a.add(function(cb) {
				createWebServer(config.https, expressApp, config, sessionStore, cb);
			});
		}

		a.run(cb);
	})
	.add(function(usersInitialized) {
		process.once('SIGINT', function() {
			logger.info('Received SIGINT -- saving users and exiting');

			users.saveAndShutdown();
		});
	})
	.run(check(
		function(err) {
			logger.error('Failed to start WebIRC', err);
			process.exit(1);
		},
		function() {
			logger.info('WebIRC started');
		}
	));

function createWebServer(spec, expressApp, config, sessionStore, cb) {
	var server;
	if (spec.keyFile && spec.certFile) {
		server = https.createServer({
			key: fs.readFileSync(spec.keyFile),
			cert: fs.readFileSync(spec.certFile),
			rejectUnauthorized: false
		}, expressApp);
	} else {
		server = http.createServer(expressApp);
	}

	server.listen(spec.port, function() {
		var sio = socketio.listen(server);

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

				var user = users.getUserBySessionId(sessionId);

				// see if this socket belongs to a user who is already logged in
				if (user !== null) {
					handleSuccessfulLogin(user, socket, sessionId);
				} else {
					socket.emit('NeedLogin', {});
				}

				socket.on('Login', function(data) {
					// only process Login if the user for this socket is null
					if (user === null) {
						user = users.getUserByCredentials(data.username, data.password);

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
	});

	server.on('error', function(err) {
		cb(err);
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
