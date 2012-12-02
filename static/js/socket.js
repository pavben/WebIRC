var socket = null;

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

				// build the userlist divs
				channel.userlist.forEach(function(user) {
					Userlist.addUser(channel, user, false);
				});
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
		withChannelByWindowId(windowId, function(channel) {
			// TODO: abstract appending to the chatlog
			var chatlogDiv = windowIdToObject('#chatlog_', windowId);

			chatlogDiv.append(
				$('<div/>').text('Join: ' + activity.who.nick)
			);

			if (isNew) {
				Userlist.addUser(channel, activity.who, true);
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
				Userlist.removeUser(channel, activity.who, true);
			}
		},
		silentFailCallback);
	}
};

function silentFailCallback() {
	console.log('silentFailCallback');
}

function withChannelByWindowId(windowId, successCallback, failureCallback) {
	var ret = getObjectByWindowId(windowId);

	if (ret.type === 'channel') {
		successCallback(ret.object);
	} else {
		failureCallback();
	}
}

function getObjectByWindowId(windowId) {
	if (state === null) {
		return null;
	}

	for (serverIdx in state.servers) {
		var server = state.servers[serverIdx];

		if (server.windowId === windowId) {
			return {type: 'server', object: server};
		}
		
		for (channelIdx in server.channels) {
			var channel = server.channels[channelIdx];

			if (channel.windowId === windowId) {
				return {type: 'channel', object: channel};
			}
		}
	}

	// windowId not found
	return null;
}

var Userlist = {
	addUser: function(channel, userlistEntry, isNew) {
		if (isNew) {
			channel.userlist.push(userlistEntry);
		}

		var userlistDiv = windowIdToObject('#userlist_', channel.windowId);

		userlistDiv.append(
			$('<div/>').attr('id', 'userlist_' + channel.windowId + '_' + userlistEntry.nick).text(userlistEntry.nick)
		);
	},
	removeUser: function(channel, userlistEntry, isNew) {
		if (isNew) {
			// filter the userlist leaving only the elements without matching nicknames
			channel.userlist = channel.userlist.filter(function(currentUserlistEntry) {
				return (currentUserlistEntry.nick !== userlistEntry.nick);
			});
		}

		var userlistEntryDiv = $('#userlist_' + channel.windowId + '_' + userlistEntry.nick);

		userlistEntryDiv.remove();
	}
}

