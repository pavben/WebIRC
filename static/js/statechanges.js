var assert = function() {
	// server-side assert only; do nothing on the client
};

// if Node.js
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	assert = require('assert');
}

var sc = {
	func: {
		'AddChannel': function(serverIdx, channel, utils) {
			var server = this.servers[serverIdx];

			server.channels.push(channel);

			utils.addActivity(channel, 'Info', {
				text: 'Joined channel ' + channel.name
			});
		},
		'AddQuery': function(serverIdx, query) {
			var server = this.servers[serverIdx];

			server.queries.push(query);
		},
		'Connect': function(serverIdx) {
			var server = this.servers[serverIdx];

			server.connected = true;
		},
		'Disconnect': function(serverIdx, utils) {
			var server = this.servers[serverIdx];

			// if we disconnect before getting a 001 (such as due to a throttle), we avoid spamming "Disconnected"
			if (server.connected) {
				function addDisconnectActivity(target) {
					utils.addActivity(target, 'Info', {
						text: 'Disconnected'
					});
				}

				// server
				server.connected = false;

				addDisconnectActivity(server);

				// channels
				server.channels.forEach(function(channel) {
					utils.setNotInChannel(channel);

					addDisconnectActivity(channel);
				});

				// queries
				server.queries.forEach(addDisconnectActivity);
			}
		},
		'Error': function(windowPath, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'Error', { text: text });
		},
		'Info': function(windowPath, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'Info', { text: text });
		},
		'Join': function(windowPath, newUserlistEntry, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var channel = targetWindow.object;

			utils.userlist.addUser(channel.userlist, newUserlistEntry);

			utils.addActivity(channel, 'Join', { who: newUserlistEntry });
		},
		'Kick': function(windowPath, originName, targetNick, kickMessage, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var server = targetWindow.server;
			var channel = targetWindow.object;

			if (targetNick === server.nickname) {
				// we are being kicked
				utils.addActivity(channel, 'KickMe', {
					originName: originName,
					kickMessage: kickMessage
				});

				sc.utils.setNotInChannel(channel);
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
		'Part': function(windowPath, who, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var channel = targetWindow.object;

			utils.userlist.removeUser(channel.userlist, who.nick);

			utils.addActivity(channel, 'Part', { who: who });
		},
		'RejoinChannel': function(windowPath, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var channel = targetWindow.object;

			channel.inChannel = true;

			utils.addActivity(channel, 'Info', {
				text: 'Rejoined channel ' + channel.name
			});
		},
		'RemoveChannel': function(windowPath, utils) {
			utils.onCloseWindow(this, windowPath);

			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			// remove the channel
			targetWindow.server.channels.splice(windowPath.channelIdx, 1);
		},
		'Text': function(windowPath, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(targetWindow.object, 'Text', { text: text });
		},
		// SORTED ABOVE THIS LINE
		'NamesUpdateAdd': function(windowPath, userlistEntries, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var channel = targetWindow.object;

			channel.tempUserlist = channel.tempUserlist.concat(userlistEntries);
		},
		'NamesUpdate': function(windowPath, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var channel = targetWindow.object;

			channel.userlist = utils.userlist.sortUsers(channel.tempUserlist);
			channel.tempUserlist = [];
		},
		'AddServer': function(server) {
			this.servers.push(server);
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
		'ChatMessage': function(windowPath, nick, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);
			var server = targetWindow.server;

			utils.addActivity(targetWindow.object, 'ChatMessage', {
				nick: nick,
				text: text
			});

			if (!utils.isActiveAndVisibleWindow(this, windowPath) && nick !== server.nickname && utils.isNickInText(server.nickname, text)) {
				if (targetWindow.type === 'channel') {
					var channel = targetWindow.object;

					utils.notify('img/notif-generic.png', nick + ' @ ' + channel.name, '<' + nick + '> ' + text);
				} else if (targetWindow.type === 'query') {
					var query = targetWindow.object;

					utils.notify('img/notif-generic.png', nick + ' @ private message', '<' + nick + '> ' + text);
				}
			}
		},
		'ActionMessage': function(windowPath, nick, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);
			var server = targetWindow.server;

			utils.addActivity(targetWindow.object, 'Action', { nick: nick, text: text });

			if (targetWindow.type === 'channel' && nick !== server.nickname && utils.isNickInText(server.nickname, text)) {
				var channel = targetWindow.object;

				utils.notify('img/notif-generic.png', nick + ' @ ' + channel.name, '* ' + nick + ' ' + text);
			}

			if (!utils.isActiveAndVisibleWindow(this, windowPath) && nick !== server.nickname && utils.isNickInText(server.nickname, text)) {
				if (targetWindow.type === 'channel') {
					var channel = targetWindow.object;

					utils.notify('img/notif-generic.png', nick + ' @ ' + channel.name, '* ' + nick + ' ' + text);
				} else if (targetWindow.type === 'query') {
					var query = targetWindow.object;

					utils.notify('img/notif-generic.png', nick + ' @ private message', '* ' + nick + ' ' + text);
				}
			}
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
			data.time = sc.utils.currentTime();

			assert(Array.isArray(object.activityLog), "addActivity called on an object without a valid activityLog");

			object.activityLog.push(data);

			if (object.activityLog.length > 400) {
				object.activityLog.splice(0, 100);
			}
		},
		currentTime: function() {
			return Math.floor(new Date().getTime() / 1000);
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
		isPageVisible: function() {
			var documentKey;

			if (typeof document === 'object') {
				if (typeof document.documentKey !== 'undefined') {
					documentKey = 'hidden';
				} else if (typeof document.webkitHidden !== 'undefined') {
					documentKey = 'webkitHidden';
				} else if (typeof document.mozHidden !== 'undefined') {
					documentKey = 'mozHidden';
				} else if (typeof document.msHidden !== 'undefined') {
					documentKey = 'msHidden';
				}
			}

			if (documentKey) {
				return !document[documentKey];
			} else {
				return null;
			}
		},
		isActiveWindow: function(state, path) {
			var current = state.currentActiveWindow;

			return (current.serverIdx === path.serverIdx
				&& current.channelIdx === path.channelIdx
				&& current.queryIdx === path.queryIdx);
		},
		isActiveAndVisibleWindow: function(state, path) {
			return sc.utils.isPageVisible() && sc.utils.isActiveWindow(state, path);
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
		setNotInChannel: function(channel) {
			channel.userlist = [];
			channel.inChannel = false;
		},
		isNickInText: function(nick, text) {
			return ~text.toLowerCase().split(/[^\w\d]+/).indexOf(nick.toLowerCase());
		},
		notify: function(icon, title, text) {
			if (typeof window === 'object' && window.webkitNotifications) {
				if (window.webkitNotifications.checkPermission() === 0) {
					var notification = window.webkitNotifications.createNotification(icon, title, text);

					notification.onclick = function() {
						window.focus();
					}

					notification.show();

					setTimeout(function() {
						notification.cancel();
					}, 6000);
				} else {
					window.webkitNotifications.requestPermission();
				}
			}
		},
		// returns the index of the element if found, or null otherwise
		binarySearch: function(element, sortedList, sortFunction) {
			var lo = 0;
			var hi = sortedList.length - 1;
			var mid, result;

			while (lo <= hi) {
				mid = lo + Math.floor((hi - lo) / 2);

				result = sortFunction(element, sortedList[mid]);

				if (result < 0) {
					// mid is too high
					hi = mid - 1;
				} else if (result > 0) {
					// mid is too low
					lo = mid + 1;
				} else {
					// mid is the exact index of element
					return mid;
				}
			}

			return null;
		},
		// returns the index at which the element should be inserted
		binarySearchInsert: function(element, sortedList, sortFunction) {
			// p(index) = val at index is same or larger than element
			function p(index) {
				return (sortFunction(element, sortedList[index]) <= 0);
			}

			var lo = 0;
			var hi = sortedList.length - 1;
			var mid, result;

			while (lo < hi) {
				mid = lo + Math.floor((hi - lo) / 2);

				result = p(mid);

				if (result) {
					// mid is too high or just right
					hi = mid;
				} else {
					// mid is too low
					lo = mid + 1;
				}
			}

			if (lo < sortedList.length && p(lo)) {
				return lo;
			} else {
				// the element was not found and belongs at the end of the list (possibly 0 if the list is empty)
				return sortedList.length;
			}
		},
		userlist: {
			addUser: function(userlist, userlistEntry) {
				var insertIdx = sc.utils.binarySearchInsert(userlistEntry, userlist, this.sortFunction);

				userlist.splice(insertIdx, 0, userlistEntry);
			},
			removeUser: function(userlist, nick) {
				var userlistEntryIndex = this.findUserlistEntryByNick(nick, userlist);

				if (userlistEntryIndex !== null) {
					var userlistEntry = userlist[userlistEntryIndex];

					userlist.splice(userlistEntryIndex, 1);

					return userlistEntry;
				} else {
					return null;
				}
			},
			sortUsers: function(userlist) {
				userlist.sort(this.sortFunction);

				return userlist;
			},
			findUserlistEntryByNick: function(nick, userlist) {
				var self = this;

				var matchIndex = null;

				this.userlistModes.some(function(userlistMode) {
					// create a dummy userlist entry that will be used in the binary search
					var dummyUserlistEntry = {
						nick: nick
					};

					// since the userlist is sorted by names as well as highest modes, and we aren't told which highest mode our target has, search for the target using each mode until found
					if (userlistMode !== null) {
						dummyUserlistEntry[userlistMode] = true;
					}

					var maybeIndex = sc.utils.binarySearch(dummyUserlistEntry, userlist, self.sortFunction);

					if (maybeIndex !== null) {
						matchIndex = maybeIndex;
						return true; // terminate the search
					}
				});

				return matchIndex;
			},
			sortFunction: function(a, b) {
				function getModeScore(u) {
					if ('owner' in u) {
						return 0;
					} else if ('admin' in u) {
						return 1;
					} else if ('op' in u) {
						return 2;
					} else if ('halfop' in u) {
						return 3;
					} else if ('voice' in u) {
						return 4;
					} else {
						return 5;
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
			},
			userlistModes: [
				'owner',
				'admin',
				'op',
				'halfop',
				'voice',
				null
			].reverse() // the reverse is an optimization since the user is most likely to be found without a mode
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
