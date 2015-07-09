"use strict";

webircApp.factory('websocketFactory', function ($rootScope) {
	return {
		newSocket: function() {
			var ws = new WebSocket('ws://' + location.host);
			var eventHandlers = {};

			ws.onmessage = function (event) {
				var rawMessage = event.data;
				// If the server thinks it's time for us to refresh our browser, do it. The specific case this is designed for is when the server is restarted, it loses the session data, preventing any WebSocket reconnect attempts from succeeding. In this case, we need to refresh the page which will create a new session.
				if (rawMessage === 'refresh') {
					location.reload();
					return;
				}
				var message;
				try {
					message = JSON.parse(rawMessage);
				} catch (e) {
					console.log('Error parsing JSON raw message from server:', rawMessage);
					return;
				}
				if (typeof message.msgId == 'string' && typeof message.data == 'object') {
					var handler = eventHandlers[message.msgId];
					if (typeof handler == 'function') {
						$rootScope.$apply(function() {
							handler.call(ws, message.data);
						});
					} else {
						console.log('Received a message without a registered handler:', message.msgId);
					}
				}
			};

			var socket = {
				onOpen: function(callback) {
					ws.onopen = function() {
						$rootScope.$apply(function () {
							callback.apply(socket, arguments);
						});
					};
				},
				on: function (eventName, callback) {
					eventHandlers[eventName] = callback;
				},
				send: function (eventName, data, callback) {
					ws.send(JSON.stringify({
						msgId: eventName,
						data: data
					}), function () {
						var args = arguments;
						$rootScope.$apply(function () {
							if (callback) {
								callback.apply(socket, args);
							}
						});
					})
				},
				close: function() {
					ws.close();
				},
				onClose: function(callback) {
					ws.onclose = function() {
						$rootScope.$apply(function () {
							callback.apply(socket, arguments);
						});
					};
				},
			};

			return socket;
		}
	};
});

var g_requestSetActiveEntity;
var g_requestJoinChannelOnServer;

function initializeSocketConnection($rootScope, websocketFactory) {
	var socket = websocketFactory.newSocket();
	var connected = false;

	socket.onOpen(function() {
		console.log('Connected')

		connected = true;
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

	socket.onClose(function() {
		console.log('Disconnected from WebIRC');

		scheduleReconnect();
	});

	function scheduleReconnect() {
		socket.close();

		connected = false;

		delete $rootScope.state;
		$rootScope.screen = 'disconnected';

		setTimeout(function() {
			console.log('Reconnecting...');
			initializeSocketConnection($rootScope, websocketFactory);
		}, 5000);
	}

	$rootScope.sendToGateway = function(msgId, data) {
		if (connected) {
			socket.send(msgId, data);
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
