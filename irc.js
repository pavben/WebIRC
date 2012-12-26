var clientcommands = require('./clientcommands.js');
var data = require('./data.js');
var mode = require('./mode.js');
var utils = require('./utils.js');

var serverCommandHandlers = {
	'001': handleCommandRequireArgs(0, handle001),
	'353': handleCommandRequireArgs(4, handle353), // RPL_NAMREPLY
	'366': handleCommandRequireArgs(2, handle366), // RPL_ENDOFNAMES
	'JOIN': handleCommandRequireArgs(1, handleJoin),
	'MODE': handleCommandRequireArgs(2, handleMode),
	'NICK': handleCommandRequireArgs(1, handleNick),
	'PART': handleCommandRequireArgs(1, handlePart),
	'PING': handleCommandRequireArgs(1, handlePing),
	'PRIVMSG': handleCommandRequireArgs(2, handlePrivmsg),
	'QUIT': handleCommandRequireArgs(1, handleQuit),
};

function handleCommandRequireArgs(requiredNumArgs, handler) {
	// note: allArgs includes user, server, and origin -- these are not counted in numArgs as numArgs represends the number of args after the command
	return function(numArgs, allArgs) {
		if (numArgs >= requiredNumArgs) {
			return handler.apply(null, allArgs);
		} else {
			// invalid number of arguments
			console.log('Error: Invalid number of arguments in command handler: ' + handler.toString());
			return false;
		}
	};
}

function handle001(user, server, origin) {
	server.desiredChannels.forEach(function(channel) {
		server.send('JOIN ' + channel);
	});
}

function handle353(user, server, origin, myNickname, channelType, channelName, namesList) {
	withChannel(server, channelName,
		function(channel) {
			// build a list of UserlistEntry
			var userlistEntries = [];
			
			namesList.trim().split(' ').forEach(function(nickWithFlags) {
				var userlistEntryMaybe = parseUserlistEntry(nickWithFlags);

				if (userlistEntryMaybe !== null) {
					userlistEntries.push(userlistEntryMaybe);
				}
			});

			channel.tempUserlist = channel.tempUserlist.concat(userlistEntries);
		},
		silentFailCallback
	);
}

// &owner, @op, %halfop, +voice, regular
// combinations possible, e.g. &@name
function parseUserlistEntry(nickWithFlags) {
	var userlistEntry = new data.UserlistEntry();

	for (var i = 0; i < nickWithFlags.length; i++) {
		switch (nickWithFlags.charAt(i)) {
			case '&':
				userlistEntry.owner = true;
				break;
			case '@':
				userlistEntry.op = true;
				break;
			case '%':
				userlistEntry.halfop = true;
				break;
			case '+':
				userlistEntry.voice = true;
				break;
			default:
				userlistEntry.nick = nickWithFlags.substring(i);
				return userlistEntry;
		}
	}

	// if here, we got an empty name
	return null;
}

function handle366(user, server, origin, myNickname, channelName) {
	withChannel(server, channelName,
		function(channel) {
			// swap tempUserlist for userlist and clear it
			channel.userlist = channel.tempUserlist;
			channel.tempUserlist = [];

			channel.enterActivity('NamesUpdate', {userlist: channel.userlist}, false);
		},
		silentFailCallback
	);
}

function handlePing(user, server, origin, arg) {
	server.send('PONG :' + arg);
}

function handleJoin(user, server, origin, channelName) {
	if (origin !== null && origin.type === 'client') {
		// if the nickname of the joiner matches ours
		if (server.nickname !== null && server.nickname === origin.nick) {
			// if the channel window isn't already open, create it
			if (!server.channels.some(function(channel) { return (channel.name === channelName); })) {
				// the server is confirming that we've joined some channel
				var channel = new data.Channel(channelName);

				server.addChannel(channel);
			}
		} else {
			// someone joined one of the channels we should be in
			withChannel(server, channelName,
				function(channel) {
					var newUserlistEntry = new data.UserlistEntry();

					newUserlistEntry.nick = origin.nick;
					newUserlistEntry.user = origin.user;
					newUserlistEntry.host = origin.host;

					channel.userlist.push(newUserlistEntry);

					channel.enterActivity('Join', {
						who: newUserlistEntry
					}, true);
				},
				silentFailCallback
			);
		}
	}
}

function handleMode(user, server, origin, target, modes) {
	// is it a user mode or a channel mode?
	if (utils.isNickname(target)) {
		if (target === server.nickname) {
			console.log('User mode change: ' + modes);
		}
	} else {
		var handleModeArguments = arguments;

		withChannel(server, target,
			function(channel) {
				var modeArgs = Array.prototype.slice.call(handleModeArguments, 5);

				var parsedModes = mode.parseChannelModes(modes, modeArgs);

				var originStr = 'Unknown';
				if (origin !== null) {
					originStr = (origin.type === 'client') ? origin.nick : origin.name;
				}

				channel.enterActivity('ModeChange', {
					origin: originStr,
					modes: modes,
					args: modeArgs
				}, true);

				if (parsedModes !== null) {
					parsedModes.forEach(function(parsedMode) {
						// a, h, o, q, v
						var userlistEntryAttribute = mode.getUserlistEntryAttributeByMode(parsedMode.mode);

						if (userlistEntryAttribute !== null) {
							withUserlistEntry(channel, parsedMode.arg, function(userlistEntry) {
								if (parsedMode.plus) {
									userlistEntry[userlistEntryAttribute] = true;
								} else {
									delete userlistEntry[userlistEntryAttribute];
								}

								channel.enterActivity('UserlistModeUpdate', {
									userlistEntry: userlistEntry
								}, false);
							});
						}

						// for now, we ignore all other modes
					});
				} else {
					console.log('Unable to parse channel mode change!');
				}
			},
			silentFailCallback
		);
	}
}

function handleNick(user, server, origin, newNickname) {
	if (origin !== null && origin.type === 'client') {
		// if the nickname change origin matches ours
		if (server.nickname !== null && server.nickname === origin.nick) {
			server.nickname = newNickname;
		}

		forEveryChannelWithNick(server, origin.nick,
			function(channel) {
				channel.enterActivity('NickChange', {
					oldNickname: origin.nick,
					newNickname: newNickname
				}, true);
			},
			silentFailCallback
		);
	}
}

function handleQuit(user, server, origin, quitMessage) {
	if (origin !== null && origin.type === 'client') {
		// if we are the quitter
		if (server.nickname !== null && server.nickname === origin.nick) {
			// do we need to do anything special?
		}

		forEveryChannelWithNick(server, origin.nick,
			function(channel) {
				channel.enterActivity('Quit', {
					who: origin,
					message: quitMessage
				}, true);
			},
			silentFailCallback
		);
	}
}

function withUserlistEntry(channel, nick, successCallback, failureCallback) {
	var matched = channel.userlist.filter(function(userlistEntry) {
		return (userlistEntry.nick === nick);
	});

	if (matched.length === 1) {
		successCallback(matched.shift());
	} else {
		failureCallback();
	}
}

function handlePart(user, server, origin, channelName) {
	if (origin !== null && origin.type === 'client') {
		// if the nickname of the leaver matches ours
		if (server.nickname !== null && server.nickname === origin.nick) {
			// the server is confirming that we've left some channel

			server.removeChannel(channelName);
		} else {
			// someone left one of the channels we should be in
			withChannel(server, channelName,
				function(channel) {
					var who = new data.UserlistEntry();

					who.nick = origin.nick;
					who.user = origin.user;
					who.host = origin.host;

					channel.userlist = channel.userlist.filter(function(currentUserlistEntry) {
						return (currentUserlistEntry.nick !== who.nick);
					});

					channel.enterActivity('Part', {
						who: who
					}, true);
				},
				silentFailCallback
			);
		}
	}
}

function handlePrivmsg(user, server, origin, targetName, text) {
	if (origin !== null) {
		var ctcpMessage = utils.parseCtcpMessage(text);

		if (ctcpMessage !== null) {
			if (utils.isNickname(targetName)) {
				handleCtcp(server, origin, null, ctcpMessage);
			} else {
				handleCtcp(server, origin, targetName, ctcpMessage);
			}
		} else {
			if (utils.isNickname(targetName)) {
				console.log('Unhandled target type -- nickname');
			} else {
				withChannel(server, targetName,
					function(channel) {
						channel.enterActivity('ChatMessage', {
							nick: (origin.type === 'client' ? origin.nick : origin.name),
							text: text
						}, true);
					},
					silentFailCallback
				);
			}
		}
	}
}

function handleCtcp(server, origin, channelName, ctcpMessage) {
	if (origin !== null && origin.type === 'client') {
		if (ctcpMessage.command === 'ACTION' && ctcpMessage.args !== null) {
			if (channelName !== null) {
				withChannel(server, channelName,
					function(channel) {
						channel.enterActivity('ActionMessage', {
							nick: (origin.type === 'client' ? origin.nick : origin.name),
							text: ctcpMessage.args
						}, true);
					},
					silentFailCallback
				);
			}
		} else {
			console.log('Received CTCP ' + ctcpMessage.command + ' from ' + origin.nick);
		}
	}
}

function withChannel(server, channelName, successCallback, failureCallback) {
	var success = server.channels.some(function(channel) {
		if (channel.name === channelName) {
			successCallback(channel);

			return true; // break out
		} else {
			return false; // continue
		}
	});

	if (!success && typeof failureCallback !== 'undefined') {
		failureCallback();
	}
}

function forEveryChannelWithNick(server, nickname, successCallback) {
	server.channels.forEach(function(channel) {
		if (channel.userlist.some(function(userlistEntry) { return (userlistEntry.nick === nickname); })) {
			successCallback(channel);
		}
	});
}

function silentFailCallback() {
	// silent fail (not so silent just yet)
	console.log('silentFailCallback');
}

exports.run = function() {
	data.users.forEach(function(user) {
		user.servers.forEach(function(server) {
			server.reconnect(processLineFromServer);
		});
	});
}

function processLineFromServer(line, server) {
	console.log('Line: ' + line);

	parseResult = parseLine(line);

	if (parseResult !== null) {
		if (parseResult.command in serverCommandHandlers) {
			serverCommandHandlers[parseResult.command](
				parseResult.args.length,
				[
					server.user,
					server,
					(parseResult.origin !== null ? parseOrigin(parseResult.origin) : null)
				].concat(parseResult.args)
			);
		} else {
			//console.log('No handler for command ' + command);
		}
	} else {
		console.log('Invalid line from server: ' + line);
	}
}

// returns: { origin, command, args[] }
function parseLine(line) {
	var origin = null;
	var command = null;
	var args = [];

	if (line.length === 0) {
		// empty line is not valid
		return null;
	}

	var spaceAt;

	// first, parse the origin (if any)
	if (line.charAt(0) === ':') {
		spaceAt = line.indexOf(' ');
		if (spaceAt !== -1) {
			origin = line.substring(1, spaceAt);
			line = line.substring(spaceAt + 1);
		} else {
			// one word that starts with a : is not valid
			return null;
		}
	}

	if (line.length === 0) {
		// no command? invalid line
		return null;
	}

	// second, parse the command
	spaceAt = line.indexOf(' ');
	if (spaceAt !== -1) {
		command = line.substr(0, spaceAt);
		line = line.substring(spaceAt + 1);
	} else {
		command = line;
		line = null;
	}

	// now parse the args
	while (line !== null && line.length > 0) {
		if (line.charAt(0) === ':') {
			args.push(line.substring(1));
			line = null;
		} else {
			spaceAt = line.indexOf(' ');
			if (spaceAt !== -1) {
				args.push(line.substring(0, spaceAt));
				line = line.substring(spaceAt + 1);
			} else {
				args.push(line);
				line = null;
			}
		}
	}

	return {
		origin: origin,
		command: command,
		args: args
	};
}

// note: we only validate the nick!user@host format and not what characters can or cannot be in each
// on failure to match, we assume str is a server origin
function parseOrigin(str) {
	var match;
	if (match = str.match(/^([^!]+?)!([^@]+?)@(.+?)$/)) {
		return {type: 'client', nick: match[1], user: match[2], host: match[3]};
	} else {
		return {type: 'server', name: str};
	}
}

function processChatboxLine(line, user, parseCommands) {
	var command = null;
	var rest = line;

	if (parseCommands) {
		var match;

		if (match = line.match(/^\/([a-z0-9]*)(?:\s*)(.*?)$/i)) {
			command = match[1].toUpperCase();
			rest = match[2];
		}
	}

	var objs = user.getObjectsByWindowId(user.activeWindowId);

	if (objs !== null) {
		var server = objs.server;

		if (command !== null) {
			clientcommands.handleClientCommand(objs, command, rest);
		} else {
			if (objs.type === 'channel') {
				var channel = objs.channel;

				channel.enterActivity('ChatMessage', { nick: server.nickname, text: rest }, true);

				server.send('PRIVMSG ' + channel.name + ' :' + rest);
			}
		}
	}
}

exports.processChatboxLine = processChatboxLine;

