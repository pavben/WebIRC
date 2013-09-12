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
	'KICK': handleCommandRequireArgs(2, handleKick),
	'MODE': handleCommandRequireArgs(2, handleMode),
	'NICK': handleCommandRequireArgs(1, handleNick),
	'NOTICE': handleCommandRequireArgs(2, handleNotice),
	'PART': handleCommandRequireArgs(1, handlePart),
	'PING': handleCommandRequireArgs(1, handlePing),
	'PONG': handleCommandRequireArgs(2, handlePong),
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

	user.applyStateChange('Connect', server.getIndex());

	server.channels.forEach(function(channel) {
		channel.rejoin();
	});

	server.desiredChannels.forEach(function(channel) {
		server.send('JOIN ' + channel);
	});

	server.startPings();

	user.applyStateChange('Text', server.toWindowPath(), text);
}

function handle353(user, serverIdx, server, origin, myNickname, channelType, channelName, namesList) {
	server.withChannel(channelName, silentFail(function(channel) {
		// build a list of UserlistEntry
		var userlistEntries = [];

		namesList.trim().split(' ').forEach(function(nickWithFlags) {
			var userlistEntryMaybe = parseUserlistEntry(nickWithFlags);

			if (userlistEntryMaybe !== null) {
				userlistEntries.push(userlistEntryMaybe);
			}
		});

		user.applyStateChange('NamesUpdateAdd', channel.toWindowPath(), userlistEntries);
	}));
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
	server.withChannel(channelName, silentFail(function(channel) {
		user.applyStateChange('NamesUpdate', channel.toWindowPath());
	}));
}

function handlePing(user, serverIdx, server, origin, arg) {
	server.send('PONG :' + arg);
}

function handlePong(user, serverIdx, server, origin, arg) {
	// ignore for now
}

function handleJoin(user, serverIdx, server, origin, channelName) {
	if (origin !== null && origin instanceof ClientOrigin) {
		// if the nickname of the joiner matches ours
		if (server.nickname !== null && server.nickname === origin.nick) {
			// the server is confirming that we've joined the channel
			server.joinedChannel(channelName);
		} else {
			// someone joined one of the channels we should be in
			server.withChannel(channelName, silentFail(function(channel) {
				var newUserlistEntry = new UserlistEntry();

				newUserlistEntry.nick = origin.nick;
				newUserlistEntry.user = origin.user;
				newUserlistEntry.host = origin.host;

				user.applyStateChange('Join', channel.toWindowPath(), newUserlistEntry);
			}));
		}
	}
}

function handleKick(user, serverIdx, server, origin, channelName, targetName, kickMessage) {
	if (origin !== null) {
		utils.withParsedTarget(targetName, silentFail(function(target) {
			if (target instanceof ClientTarget) {
				server.withChannel(channelName, silentFail(function(channel) {
					user.applyStateChange('Kick', channel.toWindowPath(), origin.getNickOrName(), target.nick, kickMessage);
				}));
			}
		}));
	}
}

function handleMode(user, serverIdx, server, origin, targetName, modes) {
	utils.withParsedTarget(targetName, silentFail(function(target) {
		if (target instanceof ClientTarget) {
			// it's a user mode
			if (target.nick.toLowerCase() === server.nickname.toLowerCase()) {
				console.log('User mode change: ' + modes);
			}
		} else if (target instanceof ChannelTarget) {
			// it's a channel mode
			var handleModeArguments = arguments;

			server.withChannel(target.name, silentFail(function(channel) {
				var modeArgs = Array.prototype.slice.call(handleModeArguments, 6);

				var parsedModes = mode.parseChannelModes(modes, modeArgs);

				user.applyStateChange('ModeChange', channel.toWindowPath(), origin.getNickOrName(), modes, modeArgs);

				if (parsedModes !== null) {
					parsedModes.forEach(function(parsedMode) {
						// a, h, o, q, v
						var userlistEntryAttribute = mode.getUserlistEntryAttributeByMode(parsedMode.mode);

						if (userlistEntryAttribute !== null) {
							channel.withUserlistEntry(parsedMode.arg, silentFail(function(userlistEntry) {
								if (parsedMode.plus) {
									userlistEntry[userlistEntryAttribute] = true;
								} else {
									delete userlistEntry[userlistEntryAttribute];
								}

								user.applyStateChange('UserlistModeUpdate', channel.toWindowPath(), userlistEntry);
							}));
						}

						// for now, we ignore all other modes
					});
				} else {
					console.log('Unable to parse channel mode change!');
				}
			}));
		}
	}));
}

function handleNick(user, serverIdx, server, origin, newNickname) {
	if (origin !== null && origin instanceof ClientOrigin) {
		user.applyStateChange('NickChange', serverIdx, origin.nick, newNickname);
	}
}

function handleNotice(user, serverIdx, server, origin, targetName, text) {
	if (origin !== null) {
		utils.withParsedTarget(targetName, silentFail(function(target) {
			// here we have a valid target

			var ctcpMessage = utils.parseCtcpMessage(text);

			if (ctcpMessage !== null) {
				//handleCtcp(serverIdx, server, origin, target, ctcpMessage);
				console.log('CTCP reply handling not implemented');
			} else {
				// not CTCP reply, but a regular notice
				if (target instanceof ChannelTarget) {
					server.withChannel(target.name, silentFail(function(channel) {
						user.applyStateChange('Notice', channel.toWindowPath(), origin.getNickOrName(), text);
					}));
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
		}));
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

function handlePart(user, serverIdx, server, origin, channelName) {
	if (origin !== null && origin instanceof ClientOrigin) {
		// if the nickname of the leaver matches ours
		if (server.nickname !== null && server.nickname === origin.nick) {
			// the server is confirming that we've left the channel
			server.withChannel(channelName, silentFail(function(channel) {
				if (channel.rejoining) {
					channel.rejoining = false;
				} else {
					server.removeChannel(channelName);
				}
			}));
		} else {
			// someone left one of the channels we should be in
			server.withChannel(channelName, silentFail(function(channel) {
				var who = new UserlistEntry();

				who.nick = origin.nick;
				who.user = origin.user;
				who.host = origin.host;

				user.applyStateChange('Part', channel.toWindowPath(), who);
			}));
		}
	}
}

function handlePrivmsg(user, serverIdx, server, origin, targetName, text) {
	if (origin !== null) {
		utils.withParsedTarget(targetName, silentFail(function(target) {
			// here we have a valid target

			var ctcpMessage = utils.parseCtcpMessage(text);

			if (ctcpMessage !== null) {
				handleCtcp(serverIdx, server, origin, target, ctcpMessage);
			} else {
				// not CTCP, but a regular message
				if (target instanceof ChannelTarget) {
					server.withChannel(target.name, silentFail(function(channel) {
						user.applyStateChange('ChatMessage', channel.toWindowPath(), origin.getNickOrName(), text);
					}));
				} else if (target instanceof ClientTarget) {
					if (server.nickname !== null && server.nickname === target.nick) {
						// we are the recipient
						var query = server.ensureQuery(origin.getNickOrName());

						user.applyStateChange('ChatMessage', query.toWindowPath(), origin.getNickOrName(), text);
					}
				}
			}
		}));
	}
}

function handleCtcp(serverIdx, server, origin, target, ctcpMessage) {
	if (origin !== null && origin instanceof ClientOrigin) {
		if (ctcpMessage.command === 'ACTION' && ctcpMessage.args !== null) {
			if (target instanceof ChannelTarget) {
				server.withChannel(target.name, silentFail(function(channel) {
					server.user.applyStateChange('ActionMessage', channel.toWindowPath(), origin.getNickOrName(), ctcpMessage.args);
				}));
			} else if (target instanceof ClientTarget) {
				if (server.nickname !== null && server.nickname === target.nick) {
					// we are the recipient
					var query = server.ensureQuery(origin.getNickOrName());

					server.user.applyStateChange('ActionMessage', query.toWindowPath(), origin.getNickOrName(), ctcpMessage.args);
				}
			}
		} else {
			console.log('Received CTCP ' + ctcpMessage.command + ' from ' + origin.getNickOrName());
		}
	}
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

		onDisconnect(server);
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

		if (server.password) {
			server.send('PASS ' + server.password);
		}

		server.send('NICK ' + server.desiredNickname);
		server.send('USER ' + server.username + ' ' + server.username + ' ' + server.host + ' :' + server.realName);
	});

	serverSocket.on('error', function(err) {
		try {
			if (server.socket !== null) {
				server.socket.destroy();
			}
		} finally {
			console.log('Connection to server closed due to error:', err);

			onDisconnect(server);
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
		onDisconnect(server);
	});

	function onDisconnect(server) {
		server.endPings();

		server.socket = null;

		server.user.applyStateChange('Disconnect', server.toWindowPath().serverIdx);

		console.log('Disconnected from server');
	}
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
					(parseResult.origin !== null ? utils.parseOrigin(parseResult.origin) : null)
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

function processChatboxLine(user, line, parseCommands, sessionId) {
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
				clientcommands.handleClientCommand(activeWindow, command, rest, sessionId);
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
