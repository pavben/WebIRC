var socket = null;

var state = null;

function startWebSocketConnection() {
	socket = io.connect();

	socket.on('CurrentState', function(currentState) {
		console.log(currentState);

		state = currentState;

		state.servers.forEach(function(server) {
			addWindow(server.windowId, 'server');

			server.channels.forEach(function(channel) {
				addWindow(channel.windowId, 'channel');

				channel.activityLog.forEach(function(activity) {
					handleActivity(channel.windowId, activity, false);
				});

				// we no longer need the activity log, since they have all been displayed
				delete channel.activityLog;
			});
		});
	});

	socket.on('Activity', function(data) {
		console.log(data);

		var windowId = data.windowId;
		var activity = data.activity;

		handleActivity(windowId, activity, true);
	});
}

function handleActivity(windowId, activity, isNew) {
	if (activity.type in activityHandlers) {
		activityHandlers[activity.type](windowId, activity, isNew);
	}
}

var activityHandlers = {
	'Join': function(windowId, activity, isNew) {
		var chatlogDiv = windowIdToObject('#chatlog_', windowId);

		chatlogDiv.append(
			$('<div/>').text(activity.who.nick + ' has joined')
		);
	}
};

