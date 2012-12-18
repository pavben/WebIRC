function withServerByWindowId(windowId, successCallback, failureCallback) {
	var ret = getObjectsByWindowId(windowId);

	if (ret !== null && typeof ret.server !== 'undefined') {
		successCallback(ret.server);
	} else {
		failureCallback();
	}
}

function withChannelByWindowId(windowId, successCallback, failureCallback) {
	var ret = getObjectsByWindowId(windowId);

	if (ret !== null && typeof ret.channel !== 'undefined') {
		successCallback(ret.channel);
	} else {
		failureCallback();
	}
}

function getObjectsByWindowId(windowId) {
	if (state === null) {
		return null;
	}

	for (serverIdx in state.servers) {
		var server = state.servers[serverIdx];

		if (server.windowId === windowId) {
			return {type: 'server', server: server};
		}
		
		for (channelIdx in server.channels) {
			var channel = server.channels[channelIdx];

			if (channel.windowId === windowId) {
				return {type: 'channel', server: server, channel: channel};
			}
		}
	}

	// windowId not found
	return null;
}

function partition(boolFunc, list) {
	var trueList = [];
	var falseList = [];

	for (var i in list) {
		if (boolFunc(list[i])) {
			trueList.push(list[i]);
		} else {
			falseList.push(list[i]);
		}
	}

	return {trueList: trueList, falseList: falseList};
}

function log(msg) {
	window.console.log(msg);
}

