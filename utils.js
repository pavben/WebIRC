function getObjectsByWindowId(user, windowId) {
	for (serverIdx in user.servers) {
		var server = user.servers[serverIdx];

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

function isNickname(name) {
	if (name.match(/^[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]*$/i)) {
		return true;
	} else {
		return false; 
	}
}

exports.getObjectsByWindowId = getObjectsByWindowId;
exports.isNickname = isNickname;

