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

		state = {}; // reset the state to empty

		state.username = currentState.username;

		state.servers = [];

		currentState.servers.forEach(processNewServerFromGateway);

		state.activeWindowId = null; // initially, no active window

		// CONSIDER: this sends a window change to the server, which isn't necessary
		setActiveWindowId(currentState.activeWindowId);
	});

	socket.on('WindowActivity', function(data) {
		console.log(data);

		var windowId = data.windowId;
		var activity = data.activity;

		handleActivity(windowId, activity, true);
	});

	socket.on('SetActiveWindow', function(data) {
		setActiveWindowId(data.windowId);
	});

	socket.on('JoinChannel', function(data) {
		console.log('JoinChannel');
		console.log(data);

		withServerByWindowId(data.serverWindowId, function(server) {
			processNewChannelFromGateway(server, data.channel);
		},
		silentFailCallback);
	});

	socket.on('RemoveChannel', function(data) {
		console.log('RemoveChannel');
		console.log(data);

		withServerByWindowId(data.channelWindowId, function(server) {
			removeWindow(data.channelWindowId);

			server.channels = server.channels.filter(function(channel) {
				return (channel.windowId !== data.channelWindowId);
			});
		},
		silentFailCallback);
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
			appendToChatlog(windowId,
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
			appendToChatlog(windowId,
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
			appendToChatlog(windowId,
				$('<div/>').text('<' + activity.nick + '> ' + activity.text)
			);
		},
		silentFailCallback);
	},
	'NamesUpdate': function(windowId, activity, isNew) {
		withChannelByWindowId(windowId, function(channel) {
			channel.userlist = new Userlist(channel.windowId, activity.userlist);
		},
		silentFailCallback);
	},
	'ModeChange': function(windowId, activity, isNew) {
		withChannelByWindowId(windowId, function(channel) {
			appendToChatlog(windowId,
				$('<div/>').text(activity.origin + ' sets mode: ' + activity.modes + ((activity.args.length > 0) ? ' ' : '') + activity.args.join(' '))
			);
		},
		silentFailCallback);
	},
	'UserlistModeUpdate': function(windowId, activity, isNew) {
		withChannelByWindowId(windowId, function(channel) {
			channel.userlist.removeUser(activity.userlistEntry.nick);
			channel.userlist.addUser(activity.userlistEntry);
		},
		silentFailCallback);
	},
	'NickChange': function(windowId, activity, isNew) {
		withChannelByWindowId(windowId, function(channel) {
			appendToChatlog(windowId,
				$('<div/>').text(activity.oldNickname + ' is now known as ' + activity.newNickname)
			);

			if (isNew) {
				var userlistEntry = channel.userlist.removeUser(activity.oldNickname);

				userlistEntry.nick = activity.newNickname;

				channel.userlist.addUser(userlistEntry);
			}
		},
		silentFailCallback);
	}
};

function silentFailCallback() {
	console.log('silentFailCallback');
}

function processNewServerFromGateway(server) {
	state.servers.push(server);

	addWindow(server.windowId, 'server');

	var channels = server.channels;

	server.channels = [];

	channels.forEach(function(channel) {
		processNewChannelFromGateway(server, channel);
	});
}

function processNewChannelFromGateway(server, channel) {
	server.channels.push(channel);

	addWindow(channel.windowId, 'channel');

	channel.activityLog.forEach(function(activity) {
		handleActivity(channel.windowId, activity, false);
	});

	// we no longer need the activity log, since they have all been displayed
	delete channel.activityLog;

	channel.userlist = new Userlist(channel.windowId, channel.userlist);
}

