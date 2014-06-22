"use strict";

require('./data.js').install();
require('./utils.js').installGlobals();

var assert = require('assert');
var connect = require('connect');
var cookie = require('cookie');
var cookieParser = require('cookie-parser');
var express = require('express');
var expressSession = require('express-session');
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
	.add('initLogger', ['config'], function(config) {
		logger.init(config.logLevels.console, config.logLevels.file);
	})
	.add(['config', '@initLogger'], function(config, cb) {
		async()
			.add('usersInitialized', function(cb) {
				users.initialize(cb);
			})
			.add('sessionStore', function() {
				return new expressSession.MemoryStore();
			})
			.add('expressApp', ['sessionStore'], function(sessionStore) {
				var app = express();

				app.use(cookieParser());
				app.use(expressSession({
					store: sessionStore,
					secret: config.sessionSecret,
					maxAge: 24 * 60 * 60,
					key: sessionKey
				}));
				app.use(express.static(__dirname + '/static'));

				return app;
			})
			.add('startWebListeners', ['expressApp', 'sessionStore', '@usersInitialized'], function(expressApp, sessionStore, cb) {
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
			.add(['@usersInitialized', '@startWebListeners'], function() {
				function getShutdownSignalHandler(sig) {
					return function() {
						logger.info('Received ' + sig + ' -- saving users and exiting');

						users.saveAndShutdown();
					};
				}
				process.once('SIGINT', getShutdownSignalHandler('SIGINT'));
				process.once('SIGTERM', getShutdownSignalHandler('SIGTERM'));
			})
			.run(check(
				function(err) {
					logger.error('Failed to start WebIRC:', err.toString());
					process.exit(1);
				},
				function() {
					logger.info('WebIRC started');

					cb();
				}
			));
	})
	.run(check(
		function(err) {
			console.error('Failed to start WebIRC', err);
			process.exit(1);
		},
		function() {}
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
					var cookies = cookieParser.signedCookies(cookie.parse(data.headers.cookie), config.sessionSecret);

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

		cb();
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

	socket.on('AddServer', function() {
		var newServer = new Server({}, user.getNextEntityId.bind(user));

		user.addServer(newServer);

		newServer.showInfo('To connect: /server [host] [port] [password]');

		user.setActiveEntity(newServer.entityId);
	});

	socket.on('CloseWindow', function(data) {
		if ('targetEntityId' in data) {
			var targetEntity = user.getEntityById(data.targetEntityId);

			if (targetEntity !== null) {
				targetEntity.removeEntity();
			} else {
				logger.warn('Invalid targetEntityId in CloseWindow from client', data);
			}
		}
	});

	socket.on('JoinChannelOnServer', function(data) {
		if ('serverEntityId' in data && typeof data.serverEntityId === 'number' &&
			'channelName' in data && typeof data.channelName === 'string') {
			var server = user.getEntityById(data.serverEntityId);

			if (server !== null) {
				server.withChannel(data.channelName, check(
					function(err) {
						server.ifRegistered(function() {
							server.send('JOIN ' + data.channelName);
						});
					},
					function(channel) {
						user.setActiveEntity(channel.entityId);
					}
				));
			} else {
				logger.warn('Invalid serverEntityId in JoinChannelOnServer from client', data);
			}
		}
	});

	socket.on('OpenServerOptions', function(data) {
		if ('serverEntityId' in data && typeof data.serverEntityId === 'number') {
			var server = user.getEntityById(data.serverEntityId);

			if (server !== null) {
				server.showInfo('Server options aren\'t quite ready yet :)');
			} else {
				logger.warn('Invalid serverEntityId in OpenServerOptions from client', data);
			}
		}
	});

	socket.on('SetActiveEntity', function(data) {
		if ('targetEntityId' in data) {
			var targetEntity = user.getEntityById(data.targetEntityId);

			if (targetEntity !== null) {
				user.setActiveEntity(targetEntity.entityId);
			} else {
				logger.warn('Invalid targetEntityId in SetActiveEntity from client', data);
			}
		}
	});
}
