webircApp.factory('socket', function ($rootScope) {
	// connect to the webserver
	var socket = io.connect('', {
		reconnect: false
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
});

function initializeWebSocketConnection($rootScope, socket) {
	var connectedSocket = socket;

	// TODO: connect_failed isn't emitted
	socket.on('connect_failed', function() {
		console.log('Connection failed');
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
		connectedSocket = null;

		console.log('Socket closed');
	});

	$rootScope.sendToGateway = function(msgId, data) {
		if (connectedSocket !== null) {
			connectedSocket.emit(msgId, data);
		} else {
			console.log('Not connected to WebIRC');
		}
	}

	$rootScope.requestSetActiveWindow = function(windowPath) {
		$rootScope.sendToGateway('SetActiveWindow', { windowPath: windowPath });
	}
}
