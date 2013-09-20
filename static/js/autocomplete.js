function initAutoComplete() {
	var activeAutoComplete = null;

	return {
		next: function(chatboxValue, cursorPos, activeWindow) {
			if (activeAutoComplete === null) {
				// if no active autocomplete, let's create one

				// extract the prefix and its starting index
				var prefixResult = getAutoCompletePrefix(chatboxValue, cursorPos);

				if (prefixResult !== null) {
					var server = activeWindow.server;
					var autoCompleteSuggestions = null;

					if (activeWindow.type === 'channel') {
						var channel = activeWindow.object;

						autoCompleteSuggestions = getAutoCompleteSuggestionsForChannel(server, channel);
					} else if (activeWindow.type === 'server' || activeWindow.type === 'query') {
						autoCompleteSuggestions = getGeneralAutoCompleteSuggestions(server, activeWindow.object.activityLog);
					}

					if (autoCompleteSuggestions && autoCompleteSuggestions.length > 0) {
						activeAutoComplete = {
							originalChatboxValue: chatboxValue,
							prefix: prefixResult.prefix,
							prefixStartIndex: prefixResult.prefixStartIndex,
							suggestions: autoCompleteSuggestions,
							index: 0
						};
					}
				}
			}

			if (activeAutoComplete) {
				var startIndex = activeAutoComplete.index;

				var matchedNick = null;

				var rolledOver = false;

				while (true) {
					if (rolledOver && activeAutoComplete.index >= startIndex) {
						// gone through the entire list and found no matches
						break;
					} else {
						var nick = activeAutoComplete.suggestions[activeAutoComplete.index];
						if (nick.indexOf(activeAutoComplete.prefix) === 0) {
							matchedNick = nick;
						}
					}

					// increment in a circular fashion
					activeAutoComplete.index = (activeAutoComplete.index + 1) % activeAutoComplete.suggestions.length;

					// if it's 0 after incrementing, we rolled over
					if (activeAutoComplete.index == 0) {
						rolledOver = true;
					}

					// on match, we break out after the increment so that the index is that of the next element
					if (matchedNick) {
						break;
					}
				}

				if (matchedNick) {
					return applySuggestionToChatbox(matchedNick, activeAutoComplete);
				} else {
					return null;
				}
			} else {
				return null;
			}
		},
		reset: function() {
			activeAutoComplete = null;
		}
	};

	function getAutoCompletePrefix(s, pos) {
		var ret = null;

		// if we're at the end of a word
		if (pos == s.length || (pos < s.length && s[pos].match(/[\W]/))) {
			var strBeforePos = s.substring(0, pos);
			var lastWordStartIndex = strBeforePos.lastIndexOf(' ') + 1;
			var possiblePrefix = strBeforePos.substring(lastWordStartIndex);

			if (possiblePrefix.length > 0) {
				ret = {
					prefix: possiblePrefix,
					prefixStartIndex: lastWordStartIndex
				};
			}
		}

		return ret;
	}

	function getAutoCompleteSuggestionsForChannel(server, channel) {
		// current channel
		var suggestions = [channel.name];

		// concat the rest of the channels
		suggestions = suggestions.concat(getNamesOfMyChannels(server));

		// append the nicks from activities and then the userlist
		suggestions = suggestions.concat(getNicknamesFromActivities(channel.activityLog), channel.userlist.map(function(userlistEntry) {
			return userlistEntry.nick;
		}));

		if (server.nickname !== null) {
			// remove my name
			suggestions = suggestions.filter(function(nick) {
				return (nick !== server.nickname);
			});

			// and add our name at the end
			suggestions.push(server.nickname);
		}

		// now we have the suggestions in the order we want

		// remove duplicates, preserving the order
		suggestions = arrayRemoveDuplicates(suggestions);

		return suggestions;
	}

	function getGeneralAutoCompleteSuggestions(server, activityLog) {
		var suggestions = [].concat(
			getNicknamesFromActivities(activityLog),
			getNamesOfMyChannels(server),
			getNamesOfMyQueries(server)
		);

		return suggestions;
	}

	function getNamesOfMyChannels(server) {
		return server.channels.map(function(c) {
			return c.name;
		});
	}

	function getNamesOfMyQueries(server) {
		return server.queries.map(function(q) {
			return q.name;
		});
	}

	function getNicknamesFromActivities(activityLog) {
		// use the last 100 activities
		var recentActivities = activityLog.slice(-100);

		var recentNames = [];
		var ignoreNames = {};

		// most recent first
		recentActivities.reverse().forEach(function(activity) {
			switch (activity.type) {
				case 'ActionMessage':
					addNicksCheckIgnore(listOriginNickOrEmpty(activity.origin));
					break;
				case 'ChatMessage':
					addNicksCheckIgnore(listOriginNickOrEmpty(activity.origin));
					break;
				case 'Join':
					addNicksCheckIgnore([activity.who.nick]);
					break;
				case 'Kick':
					addNicksCheckIgnore(listOriginNickOrEmpty(activity.origin).concat([activity.targetNick]));
					break;
				case 'KickMe':
					addNicksCheckIgnore(listOriginNickOrEmpty(activity.origin));
					break;
				case 'ModeChange':
					// this could contain mode args that aren't nicks, but whatever for now
					addNicksCheckIgnore(listOriginNickOrEmpty(activity.origin).concat(activity.modeArgs));
					break;
				case 'NickChange':
					// set the old nickname as ignored for the events before this one
					ignoreNames[activity.oldNickname] = true;

					addNicksCheckIgnore([activity.newNickname]);
					break;
				case 'Notice':
					addNicksCheckIgnore(listOriginNickOrEmpty(activity.origin));
					break;
				case 'Part':
					addNicksCheckIgnore([activity.who.nick]);
					break;
				case 'Quit':
					addNicksCheckIgnore([activity.who.nick]);
					break;
				default:
					// ignore
			}

			function listOriginNickOrEmpty(origin) {
				if (origin.type === 'client') {
					return [origin.nick];
				} else {
					return [];
				}
			}

			function addNicksCheckIgnore(nicks) {
				nicks.forEach(function(nick) {
					if (!(nick in ignoreNames)) {
						recentNames.push(nick);
					}
				});
			}
		});

		return recentNames;
	}

	function applySuggestionToChatbox(suggestion, activeAutoComplete) {
		var beforePrefix = activeAutoComplete.originalChatboxValue.slice(0, activeAutoComplete.prefixStartIndex);
		var afterPrefix = activeAutoComplete.originalChatboxValue.slice(activeAutoComplete.prefixStartIndex + activeAutoComplete.prefix.length);

		return {
			chatboxValue: beforePrefix + suggestion + afterPrefix,
			cursorPos: activeAutoComplete.prefixStartIndex + suggestion.length
		};
	}
}
