var statechanges = {
	stateChangeFunctions: {
		'NamesUpdateAdd': function(serverIdx, channelIdx, userlistEntries) {
			var channel = this.servers[serverIdx].channels[channelIdx];

			channel.tempUserlist = channel.tempUserlist.concat(userlistEntries);
		},
		'NamesUpdate': function(serverIdx, channelIdx) {
			var channel = this.servers[serverIdx].channels[channelIdx];

			// swap tempUserlist for userlist and clear it
			channel.userlist = channel.tempUserlist;
			channel.tempUserlist = [];

			// TODO: sort tempUserlist and apply it
		},
		'AddServer': function(server) {
			this.servers.push(server);
		},
		'AddChannel': function(serverIdx, channel) {
			var server = this.servers[serverIdx];

			server.channels.push(channel);
		},
		'RemoveChannel': function(serverIdx, channelIdx, utils) {
			utils.onCloseWindow(this, {serverIdx: serverIdx, channelIdx: channelIdx});

			// remove the channel
			this.channels.splice(channelIdx, 1);
		},
		'SetActiveWindow': function(newActiveWindowPath, utils) {
			console.log('active window being set to %j', newActiveWindowPath);

			// if there is already an active window, remove the 'activeWindow' flag from it
			if (this.currentActiveWindow !== null) {
				var currentActiveWindow = utils.getWindowByPath(this, this.currentActiveWindow);

				delete currentActiveWindow.object.activeWindow;
			}

			var newActiveWindow = utils.getWindowByPath(this, newActiveWindowPath);

			newActiveWindow.object.activeWindow = true;
			this.currentActiveWindow = newActiveWindowPath;
		},
		'Join': function(serverIdx, channelIdx, newUserlistEntry) {
			var channel = this.servers[serverIdx].channels[channelIdx];

			channel.userlist.push(newUserlistEntry);

			channel.activityLog.push({type: 'Join', who: newUserlistEntry});
		},
		'Part': function(serverIdx, channelIdx, who) {
			var channel = this.servers[serverIdx].channels[channelIdx];

			channel.userlist = channel.userlist.filter(function(currentUserlistEntry) {
				return (currentUserlistEntry.nick !== who.nick);
			});

			channel.activityLog.push({type: 'Part', who: newUserlistEntry});
		},
		'ChatMessage': function(windowPath, nick, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			targetWindow.object.activityLog.push({type: 'ChatMessage', nick: nick, text: text});
		},
		'ActionMessage': function(windowPath, nick, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			targetWindow.object.activityLog.push({type: 'Action', nick: nick, text: text});
		},
		'NickChange': function(serverIdx, oldNickname, newNickname, utils) {
			var server = this.servers[serverIdx];

			// if the nickname change origin matches ours
			if (server.nickname !== null && server.nickname === oldNickname) {
				server.nickname = newNickname;
			}

			utils.forEveryChannelWithNick(server, oldNickname,
				function(channel) {
					channel.activityLog.push({type: 'NickChange', oldNickname: oldNickname, newNickname: newNickname});

					// TODO: apply the change to the userlist
				}
			);
		},
	},
	utilityFunctions: {
		forEveryChannelWithNick: function(server, nickname, successCallback) {
			server.channels.forEach(function(channel, channelIdx) {
				var channel = server.channels[channelIdx];

				if (this.isNicknameInUserlist(nickname, channel.userlist)) {
					successCallback(channel);
				}
			});
		},
		isNicknameInUserlist: function(nickname, userlist) {
			return userlist.some(function(userlistEntry) {
				return (nickname === userlistEntry.nick);
			});
		},
		onCloseWindow: function(state, path) {
			if ('serverIdx' in path) {
				var server = this.servers[path.serverIdx];

				if ('channelIdx' in path) {
					var channel = server.channels[path.channelIdx];

					if (channel.activeWindow) {
						if (channelIdx > 0) {
							this.setActiveWindow({serverIdx: serverIdx, channelIdx: channelIdx - 1});
						} else {
							this.setActiveWindow({serverIdx: serverIdx});
						}
					}
				} else if ('queryIdx' in path) {
					console.log('NOT IMPL');
				} else {
					// just the server
					console.log('NOT IMPL');
				}
			} else {
				console.log('serverIdx required in onCloseWindow');
			}
		},
		setActiveWindow: function(state, path) {
			callStateChangeFunction(state, 'SetActiveWindow', [path]);
		},
		getWindowByPath: function(state, path) {
			if ('serverIdx' in path) {
				var server = state.servers[path.serverIdx];

				if ('channelIdx' in path) {
					var channel = server.channels[path.channelIdx];

					return {object: channel, type: 'channel'};
				} else if ('queryIdx' in path) {
					console.log('NOT IMPL');
				} else {
					// just the server
					return {object: server, type: 'server'};
				}
			} else {
				console.log('serverIdx required in getWindowByPath');
			}
		}
	}
};

function callStateChangeFunction(stateObject, funcId, args) {
	var newArgs = args.concat([statechanges.utilityFunctions]);

	if (funcId in statechanges.stateChangeFunctions) {
		statechanges.stateChangeFunctions[funcId].apply(stateObject, newArgs);
	} else {
		console.log('Received invalid state change function');
	}
}

// if being loaded into Node.js, export
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports.callStateChangeFunction = callStateChangeFunction;
}
