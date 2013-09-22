var assert = function() {
	// server-side assert only; do nothing on the client
};

// if Node.js
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	assert = require('assert');
}

var ActivityType = {
	None: 0,
	Event: 1,
	Alert: 2
};

var sc = {
	func: {
		'AddChannel': function(serverIdx, channel, utils) {
			var server = this.servers[serverIdx];

			server.channels.push(channel);

			utils.addActivity(this, channel, 'Info', {
				text: 'Joined channel ' + channel.name
			}, ActivityType.None);
		},
		'AddQuery': function(serverIdx, query) {
			var server = this.servers[serverIdx];

			server.queries.push(query);
		},
		'Connect': function(serverIdx, myNickname) {
			var server = this.servers[serverIdx];

			server.connected = true;

			server.nickname = myNickname;
		},
		'Disconnect': function(serverIdx, utils) {
			var user = this;
			var server = this.servers[serverIdx];

			// if we disconnect before getting a 001 (such as due to a throttle), we avoid spamming "Disconnected"
			if (server.connected) {
				function addDisconnectActivity(target) {
					utils.addActivity(user, target, 'Info', {
						text: 'Disconnected'
					}, ActivityType.None);
				}

				// server
				server.connected = false;

				server.nickname = null;

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

			utils.addActivity(this, targetWindow.object, 'Error', { text: text }, ActivityType.None);
		},
		'Info': function(windowPath, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(this, targetWindow.object, 'Info', { text: text }, ActivityType.None);
		},
		'Join': function(windowPath, newUserlistEntry, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var channel = targetWindow.object;

			utils.userlist.addUser(channel.userlist, newUserlistEntry);

			utils.addActivity(this, channel, 'Join', { who: newUserlistEntry }, ActivityType.Event);
		},
		'Kick': function(windowPath, origin, targetNick, kickMessage, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var server = targetWindow.server;
			var channel = targetWindow.object;

			if (targetNick === server.nickname) {
				// we are being kicked
				utils.addActivity(this, channel, 'KickMe', {
					origin: origin,
					kickMessage: kickMessage
				}, ActivityType.Event);

				sc.utils.setNotInChannel(channel);
			} else {
				utils.userlist.removeUser(channel.userlist, targetNick);

				// someone else being kicked
				utils.addActivity(this, channel, 'Kick', {
					origin: origin,
					targetNick: targetNick,
					kickMessage: kickMessage
				}, ActivityType.Event);
			}
		},
		'MyActionMessage': function(windowPath, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);
			var server = targetWindow.server;

			utils.addActivity(this, targetWindow.object, 'MyActionMessage', {
				nick: server.nickname,
				text: text
			}, ActivityType.None);
		},
		'MyChatMessage': function(windowPath, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);
			var server = targetWindow.server;

			utils.addActivity(this, targetWindow.object, 'MyChatMessage', {
				nick: server.nickname,
				text: text
			}, ActivityType.None);
		},
		'Part': function(windowPath, who, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var channel = targetWindow.object;

			utils.userlist.removeUser(channel.userlist, who.nick);

			utils.addActivity(this, channel, 'Part', { who: who }, ActivityType.None);
		},
		'RejoinChannel': function(windowPath, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			assert(targetWindow.type === 'channel');

			var channel = targetWindow.object;

			channel.inChannel = true;

			utils.addActivity(this, channel, 'Info', {
				text: 'Rejoined channel ' + channel.name
			}, ActivityType.None);
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

			utils.addActivity(this, targetWindow.object, 'Text', { text: text }, ActivityType.None);
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

			// reset the events and alerts
			newActiveWindow.object.numEvents = 0;
			newActiveWindow.object.numAlerts = 0;

			this.currentActiveWindow = newActiveWindowPath;
		},
		'ChatMessage': function(windowPath, origin, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);
			var server = targetWindow.server;

			var originMe = (origin.type === 'client' && origin.nick === server.nickname);
			var originNickOrName = utils.originNickOrName(origin);

			var activityType = ActivityType.Event;

			// if the activity is in a query, this always counts as an alert
			if (targetWindow.type === 'query') {
				activityType = ActivityType.Alert;
			}

			if (!originMe && utils.isNickInText(server.nickname, text)) {
				activityType = ActivityType.Alert;

				if (!utils.isActiveAndVisibleWindow(this, windowPath)) {
					if (targetWindow.type === 'channel') {
						var channel = targetWindow.object;

						utils.notify('img/notif-generic.png', originNickOrName + ' @ ' + channel.name, '<' + originNickOrName + '> ' + text);
					} else if (targetWindow.type === 'query') {
						var query = targetWindow.object;

						utils.notify('img/notif-generic.png', originNickOrName + ' @ private message', '<' + originNickOrName + '> ' + text);
					}
				}
			}

			utils.addActivity(this, targetWindow.object, 'ChatMessage', {
				origin: origin,
				text: text
			}, activityType);
		},
		'ActionMessage': function(windowPath, origin, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);
			var server = targetWindow.server;

			var originMe = (origin.type === 'client' && origin.nick === server.nickname);
			var originNickOrName = utils.originNickOrName(origin);

			var activityType = ActivityType.Event;

			// if the activity is in a query, this always counts as an alert
			if (targetWindow.type === 'query') {
				activityType = ActivityType.Alert;
			}

			if (!originMe && utils.isNickInText(server.nickname, text)) {
				activityType = ActivityType.Alert;

				if (!utils.isActiveAndVisibleWindow(this, windowPath)) {
					if (targetWindow.type === 'channel') {
						var channel = targetWindow.object;

						utils.notify('img/notif-generic.png', originNickOrName + ' @ ' + channel.name, '* ' + originNickOrName + ' ' + text);
					} else if (targetWindow.type === 'query') {
						var query = targetWindow.object;

						utils.notify('img/notif-generic.png', originNickOrName + ' @ private message', '* ' + originNickOrName + ' ' + text);
					}
				}
			}

			utils.addActivity(this, targetWindow.object, 'ActionMessage', {
				origin: origin,
				text: text
			}, activityType);
		},
		'NickChange': function(serverIdx, oldNickname, newNickname, utils) {
			var user = this;
			var server = this.servers[serverIdx];

			// if the nickname change origin matches ours
			if (server.nickname === oldNickname) {
				server.nickname = newNickname;
			}

			utils.forEveryChannelWithNick(server, oldNickname,
				function(channel) {
					var userlistEntry = utils.userlist.removeUser(channel.userlist, oldNickname);

					if (userlistEntry) {
						userlistEntry.nick = newNickname;

						utils.userlist.addUser(channel.userlist, userlistEntry);
					}

					utils.addActivity(user, channel, 'NickChange', {
						oldNickname: oldNickname,
						newNickname: newNickname
					}, ActivityType.None);
				}
			);
		},
		'Notice': function(windowPath, origin, text, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(this, targetWindow.object, 'Notice', { origin: origin, text: text }, ActivityType.Event);
		},
		'Quit': function(serverIdx, who, quitMessage, utils) {
			var user = this;
			var server = this.servers[serverIdx];

			utils.forEveryChannelWithNick(server, who.nick,
				function(channel) {
					utils.userlist.removeUser(channel.userlist, who.nick);

					utils.addActivity(user, channel, 'Quit', {
						who: who,
						quitMessage: quitMessage
					}, ActivityType.None);
				}
			);
		},
		'ModeChange': function(windowPath, origin, modes, modeArgs, utils) {
			var targetWindow = utils.getWindowByPath(this, windowPath);

			utils.addActivity(this, targetWindow.object, 'ModeChange', {
				origin: origin,
				modes: modes,
				modeArgs: modeArgs
			}, ActivityType.None);
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
		addActivity: function(user, object, type, data, activityType) {
			data.type = type;
			data.time = sc.utils.currentTime();

			assert(Array.isArray(object.activityLog), "addActivity called on an object without a valid activityLog");

			object.activityLog.push(data);

			if (object.activityLog.length > 400) {
				object.activityLog.splice(0, 100);
			}

			if (activityType !== ActivityType.None && !sc.utils.isActiveWindowObject(user, object)) {
				if (activityType === ActivityType.Event) {
					object.numEvents++;
				} else if (activityType === ActivityType.Alert) {
					object.numAlerts++;
				}
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
		isActiveWindowObject: function(state, object) {
			var activeWindow = sc.utils.getWindowByPath(state, state.currentActiveWindow);

			return (activeWindow !== null && activeWindow.object === object);
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
		originNickOrName: function(origin) {
			switch (origin.type) {
				case 'client':
					return origin.nick;
				case 'server':
					return origin.name;
				default:
					return '*Unknown*';
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
