var socket = null;

function startWebSocketConnection() {
	// connect to the current webserver
	socket = io.connect('', {
		reconnect: false
	});

	// TODO: connect_failed isn't emitted
	socket.on('connect_failed', function() {
		console.log('Connection failed');
	});

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

				channel.userlist = new Userlist(channel.windowId, channel.userlist);
			});
		});
	});

	socket.on('Activity', function(data) {
		console.log(data);

		var windowId = data.windowId;
		var activity = data.activity;

		handleActivity(windowId, activity, true);
	});

	socket.on('disconnect', function() {
		console.log('Socket closed');
	});
}

function sendToGateway(msgId, data) {
	if (socket !== null) {
		socket.emit(msgId, data);
	} else {
		console.log('sendToGateway called on a null socket');
	}
}

function handleActivity(windowId, activity, isNew) {
	if (activity.type in activityHandlers) {
		activityHandlers[activity.type](windowId, activity, isNew);
	}
}

var activityHandlers = {
	'Join': function(windowId, activity, isNew) {
		withChannelByWindowId(windowId, function(channel) {
			// TODO: abstract appending to the chatlog
			var chatlogDiv = windowIdToObject('#chatlog_', windowId);

			chatlogDiv.append(
				$('<div/>').text('Join: ' + activity.who.nick)
			);

			if (isNew) {
				channel.userlist.addUser(activity.who);
			}
		},
		silentFailCallback);
	},
	'Part': function(windowId, activity, isNew) {
		withChannelByWindowId(windowId, function(channel) {
			// TODO: abstract appending to the chatlog
			var chatlogDiv = windowIdToObject('#chatlog_', windowId);

			chatlogDiv.append(
				$('<div/>').text('Part: ' + activity.who.nick)
			);

			if (isNew) {
				channel.userlist.removeUser(activity.who.nick);
			}
		},
		silentFailCallback);
	},
	'ChatMessage': function(windowId, activity, isNew) {
		withChannelByWindowId(windowId, function(channel) {
			// TODO: abstract appending to the chatlog
			var chatlogDiv = windowIdToObject('#chatlog_', windowId);

			chatlogDiv.append(
				$('<div/>').text('<' + activity.nick + '> ' + activity.text)
			);
		},
		silentFailCallback);
	}
};

function silentFailCallback() {
	console.log('silentFailCallback');
}

