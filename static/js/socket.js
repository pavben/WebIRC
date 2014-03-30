"use strict";

webircApp.factory('socketFactory', function ($rootScope) {
	return {
		newSocket: function() {
			var socket = io.connect('', {
				reconnect: false,
				'force new connection': true
			});

			return {
				on: function (eventName, callback) {
					socket.on(eventName, function () {
						var args = arguments;
						$rootScope.$apply(function () {
							callback.apply(socket, args);
						});
					});
				},
				emit: function (eventName, data, callback) {
					socket.emit(eventName, data, function () {
						var args = arguments;
						$rootScope.$apply(function () {
							if (callback) {
								callback.apply(socket, args);
							}
						});
					})
				},
				disconnect: function() {
					socket.disconnect();
				}
			};
		}
	};
});

var g_requestSetActiveEntity;
var g_requestJoinChannelOnServer;

function initializeSocketConnection($rootScope, socketFactory) {
	var socket = socketFactory.newSocket();
	var connected = false;

	socket.on('connect', function() {
		console.log('Connected')

		connected = true;
	});

	// TODO: connect_failed isn't emitted
	socket.on('connect_failed', function() {
		console.log('Connection failed');

		scheduleReconnect();
	});

	socket.on('error', function(err) {
		console.log('Connection error:', err);

		if (err === 'handshake error') {
			// most likely a reconnection attempt with an old session ID after a server restart
			location.reload(); // reload to get a new session ID
		} else {
			scheduleReconnect();
		}
	});

	socket.on('NeedLogin', function(data) {
		delete $rootScope.state;
		$rootScope.screen = 'login';

		$rootScope.$broadcast('FocusKey', 'LoginUsername');
	});

	socket.on('LoginFailed', function(data) {
		alert('Login failed');

		$rootScope.$broadcast('FocusKey', 'LoginUsername');
	});

	socket.on('CurrentState', function(currentState) {
		console.log(currentState);

		function rebuildParentReferences(state) {
			state.servers.forEach(function(server) {
				// server -> user
				server.user = state;
				// server -> server
				server.server = server;

				server.channels.forEach(function(channel) {
					// channel -> server
					channel.server = server;
				});

				server.queries.forEach(function(query) {
					// query -> server
					query.server = server;
				});
			});
		}

		function rebuildEntities(state) {
			state.entities = {};

			state.servers.forEach(function(server) {
				state.entities[server.entityId] = server;

				server.channels.forEach(function(channel) {
					state.entities[channel.entityId] = channel;
				});

				server.queries.forEach(function(query) {
					state.entities[query.entityId] = query;
				});
			});
		}

		rebuildParentReferences(currentState);
		rebuildEntities(currentState);

		$rootScope.state = currentState;
		$rootScope.screen = 'main';
	});

	socket.on('ApplyStateChange', function(data) {
		console.log(data);

		callStateChangeFunction($rootScope.state, data.funcId, data.args);
	});

	socket.on('disconnect', function() {
		console.log('Disconnected from WebIRC');

		scheduleReconnect();
	});

	function scheduleReconnect() {
		socket.disconnect();

		connected = false;

		delete $rootScope.state;
		$rootScope.screen = 'disconnected';

		setTimeout(function() {
			console.log('Reconnecting...');
			initializeSocketConnection($rootScope, socketFactory);
		}, 5000);
	}

	$rootScope.sendToGateway = function(msgId, data) {
		if (connected) {
			socket.emit(msgId, data);
		} else {
			console.log('Not connected to WebIRC');
		}
	}

	$rootScope.requestAddServer = function() {
		$rootScope.sendToGateway('AddServer', {});
	}

	$rootScope.requestCloseWindow = function(targetEntityId) {
		$rootScope.sendToGateway('CloseWindow', { targetEntityId: targetEntityId });
	}

	g_requestJoinChannelOnServer = $rootScope.requestJoinChannelOnServer = function(serverEntityId, channelName) {
		$rootScope.sendToGateway('JoinChannelOnServer', {
			serverEntityId: serverEntityId,
			channelName: channelName
		});
	}

	$rootScope.requestOpenServerOptions = function(serverEntityId) {
		$rootScope.sendToGateway('OpenServerOptions', {
			serverEntityId: serverEntityId
		});
	}

	g_requestSetActiveEntity = $rootScope.requestSetActiveEntity = function(targetEntityId) {
		$rootScope.sendToGateway('SetActiveEntity', { targetEntityId: targetEntityId });
	}

	$rootScope.isActiveEntity = function(entityId) {
		return ($rootScope.state.activeEntityId === entityId);
	}
}
