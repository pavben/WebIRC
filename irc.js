var clientcommands = require('./clientcommands.js');
var mode = require('./mode.js');
var net = require('net');
var tls = require('tls');
var utils = require('./utils.js');

var serverCommandHandlers = {
	'001': handleCommandRequireArgs(1, handle001),
	'353': handleCommandRequireArgs(4, handle353), // RPL_NAMREPLY
	'366': handleCommandRequireArgs(2, handle366), // RPL_ENDOFNAMES
	'JOIN': handleCommandRequireArgs(1, handleJoin),
	'MODE': handleCommandRequireArgs(2, handleMode),
	'NICK': handleCommandRequireArgs(1, handleNick),
	'NOTICE': handleCommandRequireArgs(2, handleNotice),
	'PART': handleCommandRequireArgs(1, handlePart),
	'PING': handleCommandRequireArgs(1, handlePing),
	'PRIVMSG': handleCommandRequireArgs(2, handlePrivmsg),
	'QUIT': handleCommandRequireArgs(1, handleQuit),
};

function handleCommandRequireArgs(requiredNumArgs, handler) {
	// note: allArgs includes user, serverIdx, server, and origin -- these are not counted in numArgs as numArgs represends the number of args after the command
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

function handle001(user, serverIdx, server, origin, myNickname, text) {
	server.nickname = myNickname;

	server.desiredChannels.forEach(function(channel) {
		server.send('JOIN ' + channel);
	});

	user.applyStateChange('Text', server.toWindowPath(), text);
}

function handle353(user, serverIdx, server, origin, myNickname, channelType, channelName, namesList) {
	withChannel(server, channelName,
		function(channelIdx, channel) {
			// build a list of UserlistEntry
			var userlistEntries = [];

			namesList.trim().split(' ').forEach(function(nickWithFlags) {
				var userlistEntryMaybe = parseUserlistEntry(nickWithFlags);

				if (userlistEntryMaybe !== null) {
					userlistEntries.push(userlistEntryMaybe);
				}
			});

			user.applyStateChange('NamesUpdateAdd', serverIdx, channelIdx, userlistEntries);
		},
		silentFailCallback
	);
}

// &owner, @op, %halfop, +voice, regular
// combinations possible, e.g. &@name
function parseUserlistEntry(nickWithFlags) {
	var userlistEntry = new UserlistEntry();

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

function handle366(user, serverIdx, server, origin, myNickname, channelName) {
	withChannel(server, channelName,
		function(channelIdx, channel) {
			user.applyStateChange('NamesUpdate', serverIdx, channelIdx);
		},
		silentFailCallback
	);
}

function handlePing(user, serverIdx, server, origin, arg) {
	server.send('PONG :' + arg);
}

function handleJoin(user, serverIdx, server, origin, channelName) {
	if (origin !== null && origin instanceof ClientOrigin) {
		// if the nickname of the joiner matches ours
		if (server.nickname !== null && server.nickname === origin.nick) {
			// if the channel window isn't already open, create it
			if (!server.channels.some(function(channel) { return (channel.name === channelName); })) {
				// the server is confirming that we've joined some channel
				var channel = new Channel(channelName);

				server.addChannel(channel);
			}
		} else {
			// someone joined one of the channels we should be in
			withChannel(server, channelName,
				function(channelIdx, channel) {
					var newUserlistEntry = new UserlistEntry();

					newUserlistEntry.nick = origin.nick;
					newUserlistEntry.user = origin.user;
					newUserlistEntry.host = origin.host;

					user.applyStateChange('Join', serverIdx, channelIdx, newUserlistEntry);
				},
				silentFailCallback
			);
		}
	}
}

function handleMode(user, serverIdx, server, origin, target, modes) {
	// is it a user mode or a channel mode?
	if (utils.isNickname(target)) {
		if (target === server.nickname) {
			console.log('User mode change: ' + modes);
		}
	} else {
		var handleModeArguments = arguments;

		withChannel(server, target,
			function(channelIdx, channel) {
				var modeArgs = Array.prototype.slice.call(handleModeArguments, 6);

				var parsedModes = mode.parseChannelModes(modes, modeArgs);

				var originStr = 'Unknown';
				if (origin !== null) {
					originStr = (origin instanceof ClientOrigin) ? origin.nick : origin.name;
				}

				user.applyStateChange('ModeChange', channel.toWindowPath(), originStr, modes, modeArgs);

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

								user.applyStateChange('UserlistModeUpdate', channel.toWindowPath(), userlistEntry);
							}, silentFailCallback);
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

function handleNick(user, serverIdx, server, origin, newNickname) {
	if (origin !== null && origin instanceof ClientOrigin) {
		user.applyStateChange('NickChange', serverIdx, origin.nick, newNickname);
	}
}

function handleNotice(user, serverIdx, server, origin, targetName, text) {
	if (origin !== null) {
		withParsedTarget(targetName, function(target) {
			// here we have a valid target

			var ctcpMessage = utils.parseCtcpMessage(text);

			if (ctcpMessage !== null) {
				//handleCtcp(serverIdx, server, origin, target, ctcpMessage);
				console.log('CTCP reply handling not implemented');
			} else {
				// not CTCP reply, but a regular notice
				if (target instanceof ChannelTarget) {
					withChannel(server, target.name,
						function(channelIdx, channel) {
							user.applyStateChange('Notice', channel.toWindowPath(), origin.getNickOrName(), text);
						},
						silentFailCallback
					);
				} else if (target instanceof ClientTarget) {
					if (server.nickname !== null) {
						if (server.nickname === target.nick) {
							// we are the recipient
							var activeWindow = user.getWindowByPath(user.currentActiveWindow);

							if (activeWindow !== null) {
								if (activeWindow.type === 'server' || activeWindow.type === 'channel' || activeWindow.type === 'query') {
									user.applyStateChange('Notice', activeWindow.object.toWindowPath(), origin.getNickOrName(), text);
								} else {
									// if the active is not a supported window type, show the notice in the server window
									user.applyStateChange('Notice', activeWindow.server.toWindowPath(), origin.getNickOrName(), text);
								}
							}
						}
					} else {
						// no nickname yet, so this is most likely an AUTH notice
						user.applyStateChange('Notice', server.toWindowPath(), origin.getNickOrName(), text);
					}
				}
			}
		}, silentFailCallback);
	}
}

function handleQuit(user, serverIdx, server, origin, quitMessage) {
	if (origin !== null && origin instanceof ClientOrigin) {
		// if we are the quitter
		if (server.nickname !== null && server.nickname === origin.nick) {
			// do we need to do anything special?
		}

		user.applyStateChange('Quit', serverIdx, origin, quitMessage);
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

function handlePart(user, serverIdx, server, origin, channelName) {
	if (origin !== null && origin instanceof ClientOrigin) {
		// if the nickname of the leaver matches ours
		if (server.nickname !== null && server.nickname === origin.nick) {
			// the server is confirming that we've left some channel

			server.removeChannel(channelName);
		} else {
			// someone left one of the channels we should be in
			withChannel(server, channelName,
				function(channelIdx, channel) {
					var who = new UserlistEntry();

					who.nick = origin.nick;
					who.user = origin.user;
					who.host = origin.host;

					user.applyStateChange('Part', serverIdx, channelIdx, who);
				},
				silentFailCallback
			);
		}
	}
}

function handlePrivmsg(user, serverIdx, server, origin, targetName, text) {
	if (origin !== null) {
		withParsedTarget(targetName, function(target) {
			// here we have a valid target

			var ctcpMessage = utils.parseCtcpMessage(text);

			if (ctcpMessage !== null) {
				handleCtcp(serverIdx, server, origin, target, ctcpMessage);
			} else {
				// not CTCP, but a regular message
				if (target instanceof ChannelTarget) {
					withChannel(server, target.name,
						function(channelIdx, channel) {
							user.applyStateChange('ChatMessage', channel.toWindowPath(), origin.getNickOrName(), text);
						},
						silentFailCallback
					);
				} else if (target instanceof ClientTarget) {
					if (server.nickname !== null && server.nickname === target.nick) {
						// we are the recipient
						withQuery(server, origin.getNickOrName(),
							function(queryIdx, query) {
								user.applyStateChange('ChatMessage', query.toWindowPath(), origin.getNickOrName(), text);
							},
							silentFailCallback
						);
					}
				}
			}
		}, silentFailCallback);
	}
}

function handleCtcp(serverIdx, server, origin, target, ctcpMessage) {
	if (origin !== null && origin instanceof ClientOrigin) {
		if (ctcpMessage.command === 'ACTION' && ctcpMessage.args !== null) {
			if (target instanceof ChannelTarget) {
				withChannel(server, target.name,
					function(channelIdx, channel) {
						server.user.applyStateChange('ActionMessage', channel.toWindowPath(), origin.getNickOrName(), ctcpMessage.args);
					},
					silentFailCallback
				);
			} else if (target instanceof ClientTarget) {
				if (server.nickname !== null && server.nickname === target.nick) {
					// we are the recipient
					withQuery(server, origin.getNickOrName(),
						function(queryIdx, query) {
							server.user.applyStateChange('ActionMessage', query.toWindowPath(), origin.getNickOrName(), ctcpMessage.args);
						},
						silentFailCallback
					);
				}
			}
		} else {
			console.log('Received CTCP ' + ctcpMessage.command + ' from ' + origin.getNickOrName());
		}
	}
}

function withChannel(server, channelName, successCallback, failureCallback) {
	var success = server.channels.some(function(channel, channelIdx) {
		if (channel.name === channelName) {
			successCallback(channelIdx, channel);

			return true;
		} else {
			return false;
		}
	});

	if (!success) {
		failureCallback();
	}
}

function withQuery(server, theirName, successCallback, failureCallback) {
	var success = server.queries.some(function(query, queryIdx) {
		if (query.name === theirName) {
			successCallback(queryIdx, query);

			return true;
		} else {
			return false;
		}
	});

	if (!success) {
		// if we need to create the query window
		var query = new Query(theirName);
		var queryIdx = server.addQuery(query);

		if (queryIdx !== null) {
			successCallback(queryIdx, query);
		} else {
			failureCallback();
		}
	}
}

function silentFailCallback() {
	// silent fail (not so silent just yet)
	console.log('silentFailCallback');
}

exports.run = function() {
	users.forEach(function(user) {
		user.servers.forEach(function(server) {
			server.reconnect();
		});
	});
}

function reconnectServer(server) {
	if (server.socket !== null) {
		server.send('QUIT :');

		server.socket.destroy();

		server.socket = null;
	}

	var connectOptions = {
		host: server.host,
		port: server.port
	};

	if (server.ssl) {
		connectOptions.rejectUnauthorized = false; // no certificate validation yet
	}

	var netOrTls = server.ssl ? tls : net;

	var serverSocket = netOrTls.connect(connectOptions, function() {
		console.log('Connected to server');

		server.socket = serverSocket;

		server.send('NICK ' + server.desiredNickname);
		server.send('USER ' + server.username + ' ' + server.username + ' ' + server.host + ' :' + server.realName);
	});

	serverSocket.on('error', function(err) {
		console.log('Server socket error: ' + err);
		try {
			if (server.socket !== null) {
				server.socket.destroy();
			}
		} finally {
			server.socket = null;
			console.log('Connection to server closed due to error.');
		}
	});

	var readBuffer = '';
	serverSocket.on('data', function(data) {
		readBuffer += data;

		while(true) {
			var lineEndIndex = readBuffer.indexOf('\r\n');
			if (lineEndIndex === -1) {
				break;
			}

			var line = readBuffer.substring(0, lineEndIndex);

			readBuffer = readBuffer.substring(lineEndIndex + 2);

			processLineFromServer(line, server);
		}
	});

	serverSocket.on('end', function() {
		server.socket = null;

		console.log('Disconnected from server');
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
					server.user.servers.indexOf(server), // serverIdx
					server,
					(parseResult.origin !== null ? parseOrigin(parseResult.origin) : null)
				].concat(parseResult.args)
			);
		} else {
			server.user.applyStateChange('Text', server.toWindowPath(), parseResult.command + ' ' + parseResult.args.join(' '));
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
		return new ClientOrigin(match[1], match[2], match[3]);
	} else {
		return new ServerOrigin(str);
	}
}

// Possible channel types: & # + ! . ~
function parseTarget(str) {
	if (str.match(/^[#&+.~][^\s]{1,99}|![A-Z0-5]{5}[^\s]{1,94}$/)) {
		return new ChannelTarget(str);
	} else if (str.match(/^[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]*$/i)) { // http://stackoverflow.com/questions/5163255/regular-expression-to-match-irc-nickname
		return new ClientTarget(str);
	} else {
		return null;
	}
}

function withParsedTarget(targetName, successCallback, failureCallback) {
	var maybeTarget = parseTarget(targetName);

	if (maybeTarget instanceof ChannelTarget ||
		maybeTarget instanceof ClientTarget ||
		maybeTarget instanceof ServerTarget) {
		successCallback(maybeTarget);
	} else {
		failureCallback();
	}
}

function processChatboxLine(line, user, parseCommands) {
	if (user.currentActiveWindow !== null) {
		var command = null;
		var rest = line;

		if (parseCommands) {
			var match;

			if (match = line.match(/^\/([a-z0-9]*)\s*(.*?)$/i)) {
				command = match[1].toUpperCase();
				rest = match[2];
			}
		}

		var activeWindow = user.getWindowByPath(user.currentActiveWindow);

		if (activeWindow !== null) {
			if (command !== null) {
				clientcommands.handleClientCommand(activeWindow, command, rest);
			} else {
				if (activeWindow.type === 'channel') {
					var server = activeWindow.server;
					var channel = activeWindow.object;

					user.applyStateChange('ChatMessage', channel.toWindowPath(), server.nickname, rest);

					server.send('PRIVMSG ' + channel.name + ' :' + rest);
				} else if (activeWindow.type === 'query') {
					var server = activeWindow.server;
					var query = activeWindow.object;

					user.applyStateChange('ChatMessage', query.toWindowPath(), server.nickname, rest);

					server.send('PRIVMSG ' + query.name + ' :' + rest);
				} else {
					console.log('Non-command in a non-channel/non-query window');
				}
			}
		}
	} else {
		console.log('No active window in processChatboxLine');
	}
}

exports.reconnectServer = reconnectServer;
exports.processChatboxLine = processChatboxLine;
