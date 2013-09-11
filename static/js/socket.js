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
				}
			};
		}
	};
});

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

	$rootScope.requestSetActiveWindow = function(windowPath) {
		$rootScope.sendToGateway('SetActiveWindow', { windowPath: windowPath });
	}
}
