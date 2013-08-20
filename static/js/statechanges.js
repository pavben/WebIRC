var assert = function() {
	// server-side assert only; do nothing on the client
};

// if Node.js
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	assert = require('assert');
}

var sc = {
	func: {
		'Disconnect': function(serverIdx, utils) {
			var server = this.servers[serverIdx];

			function addDisconnectActivity(target) {
				utils.addActivity(target, 'Info', {
					text: 'Disconnected'
				});
			}

			// server
			addDisconnectActivity(server);

			// channels
			server.channels.forEach(function(channel) {
				channel.inChannel = false;

				addDisconnectActivity(channel);
			});

			// queries
			server.queries.forEach(addDisconnectActivity);
		},
		'NamesUpdateAdd': function(serverIdx, channelIdx, userlistEntries) {
			var channel = this.servers[serverIdx].channels[channelIdx];

			channel.tempUserlist = channel.tempUserlist.concat(userlistEntries);
		},
		'NamesUpdate': function(serverIdx, channelIdx, utils) {
			var channel = this.servers[serverIdx].channels[channelIdx];

			channel.userlist = [];
			channel.tempUserlist.forEach(function(userlistEntry) {
				utils.userlist.addUser(channel.userlist, userlistEntry);
			});
			channel.tempUserlist = [];
		},
		'AddServer': function(server) {
			this.servers.push(server);
		},
		'AddChannel': function(serverIdx, channel) {
			var server = this.servers[serverIdx];

			return server.channels.push(channel) - 1; // returns the index of the pushed element
		},
		'RemoveChannel': function(windowPath, utils) {
			utils.onCloseWindow(this, windowPath);

			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			// remove the channel
			targetWindow.server.channels.splice(windowPath.channelIdx, 1);
		},
		'AddQuery': function(serverIdx, query) {
			var server = this.servers[serverIdx];

			return server.queries.push(query) - 1; // returns the index of the pushed element
		},
		'RemoveQuery': function(windowPath, utils) {
			utils.onCloseWindow(this, windowPath);

			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'query');

			// remove the channel
			targetWindow.server.queries.splice(windowPath.queryIdx, 1);
		},
		'SetActiveWindow': function(newActiveWindowPath, utils) {
			// if there is already an active window, remove the 'activeWindow' flag from it
			if (this.currentActiveWindow !== null) {
				var currentActiveWindow = utils.getWindowByPath(this, this.currentActiveWindow);

				delete currentActiveWindow.object.activeWindow;
			}

			var newActiveWindow = utils.getWindowByPath(this, newActiveWindowPath);

			newActiveWindow.object.activeWindow = true;
			this.currentActiveWindow = newActiveWindowPath;
		},
		'Join': function(serverIdx, channelIdx, newUserlistEntry, utils) {
			var channel = this.servers[serverIdx].channels[channelIdx];

			utils.userlist.addUser(channel.userlist, newUserlistEntry);

			utils.addActivity(channel, 'Join', { who: newUserlistEntry });
		},
		'Kick': function(serverIdx, channelIdx, originName, targetNick, kickMessage, utils) {
			var server = this.servers[serverIdx];
			var channel = server.channels[channelIdx];

			if (targetNick === server.nickname) {
				// we are being kicked
				utils.addActivity(channel, 'KickMe', {
					originName: originName,
					kickMessage: kickMessage
				});

				// and clear the userlist since it's now out of date
				channel.userlist = [];
				channel.inChannel = false;
			} else {
				utils.userlist.removeUser(channel.userlist, targetNick);

				// someone else being kicked
				utils.addActivity(channel, 'Kick', {
					originName: originName,
					targetNick: targetNick,
					kickMessage: kickMessage
				});
			}
		},
		'Part': function(serverIdx, channelIdx, who, utils) {
			var channel = this.servers[serverIdx].channels[channelIdx];

			utils.userlist.removeUser(channel.userlist, who.nick);

			utils.addActivity(channel, 'Part', { who: who });
		},
		'ChatMessage': function(windowPath, nick, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'ChatMessage', {
				nick: nick,
				text: text
			});
		},
		'ActionMessage': function(windowPath, nick, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'Action', { nick: nick, text: text });
		},
		'NickChange': function(serverIdx, oldNickname, newNickname, utils) {
			var server = this.servers[serverIdx];

			// if the nickname change origin matches ours
			if (server.nickname !== null && server.nickname === oldNickname) {
				server.nickname = newNickname;
			}

			utils.forEveryChannelWithNick(server, oldNickname,
				function(channel) {
					var userlistEntry = utils.userlist.removeUser(channel.userlist, oldNickname);

					if (userlistEntry) {
						userlistEntry.nick = newNickname;

						utils.userlist.addUser(channel.userlist, userlistEntry);
					}

					utils.addActivity(channel, 'NickChange', {
						oldNickname: oldNickname,
						newNickname: newNickname
					});
				}
			);
		},
		'Notice': function(windowPath, nick, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'Notice', { nick: nick, text: text });
		},
		'Quit': function(serverIdx, who, quitMessage, utils) {
			var server = this.servers[serverIdx];

			utils.forEveryChannelWithNick(server, who.nick,
				function(channel) {
					utils.userlist.removeUser(channel.userlist, who.nick);

					utils.addActivity(channel, 'Quit', {
						who: who,
						quitMessage: quitMessage
					});
				}
			);
		},
		'Text': function(windowPath, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'Text', { text: text });
		},
		'Error': function(windowPath, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'Error', { text: text });
		},
		'ModeChange': function(windowPath, origin, modes, modeArgs, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'ModeChange', {
				origin: origin,
				modes: modes,
				modeArgs: modeArgs
			});
		},
		'UserlistModeUpdate': function(windowPath, userlistEntry, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			if (targetWindow.type === 'channel') {
				var channel = targetWindow.object;

				if (utils.userlist.removeUser(channel.userlist, userlistEntry.nick)) {
					utils.userlist.addUser(channel.userlist, userlistEntry);
				}
			}
		},
	},
	utils: {
		addActivity: function(object, type, data) {
			data.type = type;

			assert(Array.isArray(object.activityLog), "addActivity called on an object without a valid activityLog");

			object.activityLog.push(data);

			if (object.activityLog.length > 40) {
				object.activityLog.splice(0, 4);
			}
		},
		forEveryChannelWithNick: function(server, nickname, successCallback) {
			server.channels.forEach(function(channel, channelIdx) {
				var channel = server.channels[channelIdx];

				if (sc.utils.isNicknameInUserlist(nickname, channel.userlist)) {
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
				var serverIdx = path.serverIdx;
				var server = state.servers[serverIdx];

				if ('channelIdx' in path) {
					var channelIdx = path.channelIdx;
					var channel = server.channels[channelIdx];

					if (channel.activeWindow) {
						if (channelIdx > 0) {
							sc.utils.setActiveWindow(state, {
								serverIdx: serverIdx,
								channelIdx: channelIdx - 1
							});
						} else {
							sc.utils.setActiveWindow(state, {
								serverIdx: serverIdx
							});
						}
					}
				} else if ('queryIdx' in path) {
					var queryIdx = path.queryIdx;
					var query = server.queries[queryIdx];

					if (query.activeWindow) {
						if (queryIdx > 0) {
							sc.utils.setActiveWindow(state, {
								serverIdx: serverIdx,
								queryIdx: queryIdx - 1
							});
						} else {
							if (server.channels.length > 0) {
								sc.utils.setActiveWindow(state, {
									serverIdx: serverIdx, channelIdx: server.channels.length - 1
								});
							} else {
								sc.utils.setActiveWindow(state, {
									serverIdx: serverIdx
								});
							}
						}
					}
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
				if (path.serverIdx < 0 || path.serverIdx >= state.servers.length)
					return null;

				var server = state.servers[path.serverIdx];

				if ('channelIdx' in path) {
					if (path.channelIdx < 0 || path.channelIdx >= server.channels.length)
						return null;

					var channel = server.channels[path.channelIdx];

					return {object: channel, server: server, type: 'channel', windowPath: path};
				} else if ('queryIdx' in path) {
					if (path.queryIdx < 0 || path.queryIdx >= server.queries.length)
						return null;

					var query = server.queries[path.queryIdx];

					return {object: query, server: server, type: 'query', windowPath: path};
				} else {
					// just the server
					return {object: server, server: server, type: 'server', windowPath: path};
				}
			} else {
				console.log('serverIdx required in getWindowByPath');
				return null;
			}
		},
		userlist: {
			addUser: function(userlist, userlistEntry) {
				// TODO: make this logarithmic
				var insertIdx = 0;
				for (var i = 0; i < userlist.length; i++) {
					if (this.sortFunction(userlistEntry, userlist[i]) >= 0) {
						insertIdx = i + 1;
					} else {
						break;
					}
				}

				userlist.splice(insertIdx, 0, userlistEntry);
			},
			removeUser: function(userlist, nick) {
				var matchedUserlistEntry = null;

				userlist.some(function(userlistEntry, i) {
					if (userlistEntry.nick === nick) {
						matchedUserlistEntry = userlistEntry;

						userlist.splice(i, 1);
						return true;
					} else {
						return false;
					}
				});

				return matchedUserlistEntry;
			},
			sortFunction: function(a, b) {
				function getModeScore(u) {
					if ('owner' in u) {
						return 0;
					} else if ('op' in u) {
						return 1;
					} else if ('halfop' in u) {
						return 2;
					} else if ('voice' in u) {
						return 3;
					} else {
						return 4;
					}
				}

				var modeScoreA = getModeScore(a);
				var modeScoreB = getModeScore(b);

				if (modeScoreA < modeScoreB) {
					return -1;
				} else if (modeScoreA > modeScoreB) {
					return 1;
				} else {
					var nickA = a.nick.toLowerCase();
					var nickB = b.nick.toLowerCase();

					if (nickA < nickB) {
						return -1;
					} else if (nickA > nickB) {
						return 1;
					} else {
						return 0;
					}
				}
			}
		}
	}
};

function callStateChangeFunction(stateObject, funcId, args) {
	var newArgs = args.concat([sc.utils]);

	if (funcId in sc.func) {
		return sc.func[funcId].apply(stateObject, newArgs);
	} else {
		assert(false, 'Received invalid state change function: ' + funcId);
	}
}

// if being loaded into Node.js, export
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports.callStateChangeFunction = callStateChangeFunction;
	module.exports.utils = sc.utils;
}
