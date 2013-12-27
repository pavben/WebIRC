"use strict";

var assert = function() {
	// server-side assert only; do nothing on the client
};

// no logging on the client yet
var logger = {
	data: function() {},
	debug: function() {},
	info: function() {},
	warn: function() {},
	error: function() {}
};

// if Node.js (server side)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	assert = require('assert');
	logger = require('./../../logger.js');
}

var ActivityType = {
	None: 0,
	Event: 1,
	Alert: 2
};

var sc = {
	func: {
		'ActionMessage': function(targetEntityId, origin, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);
			var server = targetEntity.server;

			var originNickOrName = utils.originNickOrName(origin);

			var activityType = ActivityType.Event;

			var mentionMe = false;

			if (utils.isNickInText(server.nickname, text)) {
				activityType = ActivityType.Alert;

				mentionMe = true;
			} else if (targetEntity.type === 'query') {
				activityType = ActivityType.Alert;
			}

			if (activityType === ActivityType.Alert && !utils.isActiveAndFocusedEntity(this, targetEntity.entityId)) {
				if (targetEntity.type === 'channel') {
					var channel = targetEntity;

					utils.notify('img/notif-generic.png', originNickOrName + ' @ ' + channel.name, '* ' + originNickOrName + ' ' + text, targetEntity.entityId);
				} else if (targetEntity.type === 'query') {
					var query = targetEntity;

					utils.notify('img/notif-generic.png', originNickOrName + ' @ private message', '* ' + originNickOrName + ' ' + text, targetEntity.entityId);
				}
			}

			utils.addActivity(this, targetEntity, 'ActionMessage', {
				origin: origin,
				text: text,
				mentionMe: mentionMe
			}, activityType);
		},
		'AddChannel': function(serverEntityId, channel, utils) {
			var server = utils.getEntityById(this, serverEntityId);
			assert(server.type === 'server');

			// set parent
			channel.server = server;

			channel.serverEntityId = server.entityId;

			server.channels.push(channel);

			utils.addEntity(this, channel);

			utils.addActivity(this, channel, 'Info', {
				text: 'Joined channel ' + channel.name
			}, ActivityType.None);
		},
		'AddQuery': function(serverEntityId, query, utils) {
			var server = utils.getEntityById(this, serverEntityId);
			assert(server.type === 'server');

			// set parent
			query.server = server;

			query.serverEntityId = server.entityId; // TODO: needed?

			server.queries.push(query);

			utils.addEntity(this, query);
		},
		'AddServer': function(server, utils) {
			// set parent
			server.user = this;
			server.server = server;

			this.servers.push(server);

			utils.addEntity(this, server);
		},
		'ChannelNotice': function(channelEntityId, origin, channelName, text, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			utils.addActivity(this, channel, 'ChannelNotice', { origin: origin, channelName: channelName, text: text }, ActivityType.Event);
		},
		'ChatMessage': function(targetEntityId, origin, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);
			var server = targetEntity.server;

			var originNickOrName = utils.originNickOrName(origin);

			var activityType = ActivityType.Event;

			var mentionMe = false;

			if (utils.isNickInText(server.nickname, text)) {
				activityType = ActivityType.Alert;

				mentionMe = true;
			} else if (targetEntity.type === 'query') {
				activityType = ActivityType.Alert;
			}

			if (activityType === ActivityType.Alert && !utils.isActiveAndFocusedEntity(this, targetEntity.entityId)) {
				if (targetEntity.type === 'channel') {
					var channel = targetEntity;

					utils.notify('img/notif-generic.png', originNickOrName + ' @ ' + channel.name, '<' + originNickOrName + '> ' + text, targetEntity.entityId);
				} else if (targetEntity.type === 'query') {
					var query = targetEntity;

					utils.notify('img/notif-generic.png', originNickOrName + ' @ private message', '<' + originNickOrName + '> ' + text, targetEntity.entityId);
				}
			}

			utils.addActivity(this, targetEntity, 'ChatMessage', {
				origin: origin,
				text: text,
				mentionMe: mentionMe
			}, activityType);
		},
		'Connect': function(serverEntityId, myNickname, utils) {
			var server = utils.getEntityById(this, serverEntityId);
			assert(server.type === 'server');

			server.connected = true;

			server.nickname = myNickname;
		},
		'Disconnect': function(serverEntityId, utils) {
			function addDisconnectActivity(target) {
				utils.addActivity(user, target, 'Info', {
					text: 'Disconnected'
				}, ActivityType.None);
			}

			var user = this;
			var server = utils.getEntityById(this, serverEntityId);
			assert(server.type === 'server');

			// if we disconnect before getting a 001 (such as due to a throttle), we avoid spamming "Disconnected"
			if (server.connected) {
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
		'EditServer': function(serverEntityId, changes, utils) {
			var server = utils.getEntityById(this, serverEntityId);
			assert(server.type === 'server');

			for (var key in changes) {
				assert(key in server);

				server[key] = changes[key];
			}
		},
		'Error': function(targetEntityId, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);

			utils.addActivity(this, targetEntity, 'Error', { text: text }, ActivityType.None);
		},
		'Info': function(targetEntityId, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);

			utils.addActivity(this, targetEntity, 'Info', { text: text }, ActivityType.None);
		},
		'Join': function(channelEntityId, newUserlistEntry, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			utils.userlist.addUser(channel.userlist, newUserlistEntry);

			utils.addActivity(this, channel, 'Join', { who: newUserlistEntry }, ActivityType.None);
		},
		'Kick': function(channelEntityId, origin, targetNick, kickMessage, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			var server = channel.server;

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
		'ModeChange': function(targetEntityId, origin, modes, modeArgs, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);

			utils.addActivity(this, targetEntity, 'ModeChange', {
				origin: origin,
				modes: modes,
				modeArgs: modeArgs
			}, ActivityType.None);
		},
		'MyActionMessage': function(targetEntityId, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);
			var server = targetEntity.server;

			utils.addActivity(this, targetEntity, 'MyActionMessage', {
				nick: server.nickname,
				text: text
			}, ActivityType.None);
		},
		'MyChatMessage': function(targetEntityId, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);
			var server = targetEntity.server;

			utils.addActivity(this, targetEntity, 'MyChatMessage', {
				nick: server.nickname,
				text: text
			}, ActivityType.None);
		},
		'NamesUpdate': function(channelEntityId, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			channel.userlist = utils.userlist.sortUsers(channel.tempUserlist);
			channel.tempUserlist = [];
		},
		'NamesUpdateAdd': function(channelEntityId, userlistEntries, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			channel.tempUserlist = channel.tempUserlist.concat(userlistEntries);
		},
		'NickChange': function(serverEntityId, oldNickname, newNickname, utils) {
			var server = utils.getEntityById(this, serverEntityId);
			assert(server.type === 'server');

			var user = this;

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
		'Notice': function(targetEntityId, origin, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);

			utils.addActivity(this, targetEntity, 'Notice', { origin: origin, text: text }, ActivityType.Event);
		},
		'Part': function(channelEntityId, who, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			utils.userlist.removeUser(channel.userlist, who.nick);

			utils.addActivity(this, channel, 'Part', { who: who }, ActivityType.None);
		},
		'Quit': function(serverEntityId, who, quitMessage, utils) {
			var server = utils.getEntityById(this, serverEntityId);
			assert(server.type === 'server');

			var user = this;

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
		'RejoinChannel': function(channelEntityId, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			channel.inChannel = true;

			utils.addActivity(this, channel, 'Info', {
				text: 'Rejoined channel ' + channel.name
			}, ActivityType.None);
		},
		'RemoveEntity': function(targetEntityId, utils) {
			utils.removeEntity(this, targetEntityId);
		},
		'SetActiveEntity': function(targetEntityId, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);

			// reset the events and alerts
			targetEntity.numEvents = 0;
			targetEntity.numAlerts = 0;

			this.activeEntityId = targetEntity.entityId;
		},
		'SetTopic': function(channelEntityId, origin, newTopic, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			utils.addActivity(this, channel, 'SetTopic', {
				origin: origin,
				newTopic: newTopic
			}, ActivityType.Event);
		},
		'Text': function(targetEntityId, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);

			utils.addActivity(this, targetEntity, 'Text', { text: text }, ActivityType.None);
		},
		'UserlistModeUpdate': function(channelEntityId, nick, isPlus, modeAttribute, utils) {
			var channel = utils.getEntityById(this, channelEntityId);
			assert(channel.type === 'channel');

			var userlistEntry = utils.userlist.removeUser(channel.userlist, nick);

			if (userlistEntry !== null) {
				if (isPlus) {
					userlistEntry[modeAttribute] = true;
				} else {
					delete userlistEntry[modeAttribute];
				}

				utils.userlist.addUser(channel.userlist, userlistEntry);
			}
		},
		'Whois': function(targetEntityId, text, utils) {
			var targetEntity = utils.getEntityById(this, targetEntityId);

			utils.addActivity(this, targetEntity, 'Whois', { text: text }, ActivityType.None);
		}
	},
	utils: {
		addActivity: function(user, entity, type, data, activityType) {
			data.type = type;
			data.time = sc.utils.currentTime();

			assert(Array.isArray(entity.activityLog), "addActivity called on an entity without a valid activityLog");

			entity.activityLog.push(data);

			if (entity.activityLog.length > 400) {
				entity.activityLog.splice(0, 100);
			}

			if (activityType !== ActivityType.None && !sc.utils.isActiveEntity(user, entity.entityId)) {
				if (activityType === ActivityType.Event) {
					entity.numEvents++;
				} else if (activityType === ActivityType.Alert) {
					entity.numAlerts++;
				}
			}
		},
		currentTime: function() {
			return Math.floor(new Date().getTime() / 1000);
		},
		forEveryChannelWithNick: function(server, nickname, successCallback) {
			server.channels.forEach(function(channel) {
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
		isPageFocused: function() {
			return (typeof document === 'object' && document.hasFocus());
		},
		isActiveEntity: function(state, entityId) {
			return (entityId === state.activeEntityId);
		},
		isActiveAndFocusedEntity: function(state, entityId) {
			return sc.utils.isPageFocused() && sc.utils.isActiveEntity(state, entityId);
		},
		setActiveEntity: function(state, targetEntityId) {
			callStateChangeFunction(state, 'SetActiveEntity', [targetEntityId]);
		},
		addEntity: function(state, entity) {
			assert(!(entity.entityId in state.entities)); // must not already exist

			state.entities[entity.entityId] = entity;
		},
		getEntityById: function(state, entityId) {
			if (entityId in state.entities) {
				return state.entities[entityId];
			} else {
				return null;
			}
		},
		removeEntity: function(state, targetEntityId) {
			var targetEntity = sc.utils.getEntityById(state, targetEntityId);

			var server = targetEntity.server;

			switch (targetEntity.type) {
				case 'server':
					var serverIdx = state.servers.indexOf(targetEntity);

					if (targetEntity.entityId === state.activeEntityId) {
						if (serverIdx > 0) {
							// the server entity being closed is not the first
							var previousServerIdx = serverIdx - 1;
							var previousServer = state.servers[previousServerIdx];

							// if there are queries/channels, set the last one as active
							if (previousServer.queries.length > 0) {
								sc.utils.setActiveEntity(state, previousServer.queries[previousServer.queries.length - 1].entityId);
							} else if (previousServer.channels.length > 0) {
								sc.utils.setActiveEntity(state, previousServer.channels[previousServer.channels.length - 1].entityId);
							} else {
								sc.utils.setActiveEntity(state, previousServer.entityId);
							}
						} else {
							// the server entity being closed is the very first

							// there must be at least one other server entity remaining
							assert(state.servers.length >= 2);

							sc.utils.setActiveEntity(state, state.servers[1].entityId);
						}
					}

					state.servers.splice(serverIdx, 1);
					break;
				case 'channel':
					var channelIdx = server.channels.indexOf(targetEntity);

					if (targetEntity.entityId === state.activeEntityId) {

						if (channelIdx > 0) {
							sc.utils.setActiveEntity(state, server.channels[channelIdx - 1].entityId);
						} else {
							sc.utils.setActiveEntity(state, server.entityId);
						}
					}

					targetEntity.server.channels.splice(channelIdx, 1);
					break;
				case 'query':
					var queryIdx = server.queries.indexOf(targetEntity);

					if (targetEntity.entityId === state.activeEntityId) {

						if (queryIdx > 0) {
							sc.utils.setActiveEntity(state, server.queries[queryIdx - 1].entityId);
						} else {
							if (server.channels.length > 0) {
								sc.utils.setActiveEntity(state, server.channels[server.channels.length - 1].entityId);
							} else {
								sc.utils.setActiveEntity(state, server.entityId);
							}
						}
					}

					targetEntity.server.queries.splice(queryIdx, 1);
					break;
				default:
					assert(false, 'Unknown window type');
			}

			// remove the entity from
			assert(targetEntityId in state.entities);

			delete state.entities[targetEntityId];
		},
		setNotInChannel: function(channel) {
			channel.userlist = [];
			channel.inChannel = false;
		},
		isNickInText: function(nick, text) {
			return ~text.toLowerCase().split(/[^\w\d]+/).indexOf(nick.toLowerCase());
		},
		notify: function(icon, title, text, entityId) {
			if (typeof window === 'object' && window.webkitNotifications) {
				if (window.webkitNotifications.checkPermission() === 0) {
					var notification = window.webkitNotifications.createNotification(icon, title, text);

					notification.onclick = function() {
						if (typeof g_requestSetActiveEntity === 'function') {
							g_requestSetActiveEntity(entityId);
						}

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
