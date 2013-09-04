var g_socket = null;

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

function initializeWebSocketConnection($scope, $rootScope, socket) {
	g_socket = socket;

	// TODO: connect_failed isn't emitted
	socket.on('connect_failed', function() {
		console.log('Connection failed');
	});

	socket.on('NeedLogin', function(data) {
		delete $scope.state;
		$scope.screen = 'login';

		$rootScope.$broadcast('FocusKey', 'LoginUsername');
	});

	socket.on('LoginFailed', function(data) {
		alert('Login failed');

		$rootScope.$broadcast('FocusKey', 'LoginUsername');
	});

	socket.on('CurrentState', function(currentState) {
		console.log(currentState);

		$scope.state = currentState;
		$scope.screen = 'main';
	});

	socket.on('ApplyStateChange', function(data) {
		console.log(data);

		callStateChangeFunction($scope.state, data.funcId, data.args);
	});

	socket.on('disconnect', function() {
		g_socket = null;

		console.log('Socket closed');
	});

	$scope.requestSetActiveWindow = function(windowPath) {
		sendToGateway('SetActiveWindow', { windowPath: windowPath });
	}
}

function sendToGateway(msgId, data) {
	if (g_socket !== null) {
		g_socket.emit(msgId, data);
	} else {
		console.log('sendToGateway called on a null socket');
	}
}

