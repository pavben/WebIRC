var clientcommands = require('./clientcommands.js');
var logger = require('./logger.js');
var mode = require('./mode.js');
var moment = require('moment');
var net = require('net');
var tls = require('tls');
var utils = require('./utils.js');

var serverCommandHandlers = {
	'001': handleCommandRequireArgs(1, handle001),
	'002': handleCommandRequireArgs(2, showInfoLast),
	'003': handleCommandRequireArgs(2, showInfoLast),
	'004': handleCommandRequireArgs(5, handle004),
	'005': handleCommandRequireArgs(2, handle005),
	'250': handleCommandRequireArgs(2, showInfoLast),
	'251': handleCommandRequireArgs(2, showInfoLast),
	'252': handleCommandRequireArgs(3, showInfoLast2),
	'253': handleCommandRequireArgs(3, showInfoLast2),
	'254': handleCommandRequireArgs(3, showInfoLast2),
	'255': handleCommandRequireArgs(2, showInfoLast),
	'265': handleCommandRequireArgs(2, showInfoLast),
	'266': handleCommandRequireArgs(2, showInfoLast),
	'311': handleCommandRequireArgs(6, handle311), // RPL_WHOISUSER
	'312': handleCommandRequireArgs(4, handle312), // RPL_WHOISSERVER
	'317': handleCommandRequireArgs(4, handle317), // RPL_WHOISIDLE
	'318': emptyHandler, // RPL_ENDOFWHOIS
	'319': handleCommandRequireArgs(3, handle319), // RPL_WHOISCHANNELS
	'328': handleCommandRequireArgs(3, handle328), // RPL_CHANNEL_URL
	'330': handleCommandRequireArgs(4, handle330), // RPL_WHOISACCOUNT
	'332': handleCommandRequireArgs(3, handle332), // RPL_TOPIC
	'333': handleCommandRequireArgs(4, handle333), // RPL_TOPICWHOTIME
	'353': handleCommandRequireArgs(4, handle353), // RPL_NAMREPLY
	'366': handleCommandRequireArgs(2, handle366), // RPL_ENDOFNAMES
	'372': handleCommandRequireArgs(2, showInfoLast), // RPL_MOTD
	'375': handleCommandRequireArgs(2, showInfoLast), // RPL_MOTDSTART
	'376': handleCommandRequireArgs(2, showInfoLast), // RPL_ENDOFMOTD
	'378': handleCommandRequireArgs(3, handle378), // RPL_MOTD
	'401': handleCommandRequireArgs(2, handle401), // ERR_NOSUCHNICK
	'422': handleCommandRequireArgs(2, showInfoLast),
	'671': handleCommandRequireArgs(3, handle671), // RPL_WHOISSECURE
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
	'TOPIC': handleCommandRequireArgs(2, handleTopic),
};

// commands allowed to be processed before registration (001)
var preregAllowedCommands = [
	'001',
	'PING',
	'NOTICE'
];

function handleCommandRequireArgs(requiredNumArgs, handler) {
	// note: allArgs includes user, serverIdx, server, and origin -- these are not counted in numArgs as numArgs represends the number of args after the command
	return function(numArgs, allArgs) {
		if (numArgs >= requiredNumArgs) {
			return handler.apply(null, allArgs);
		} else {
			// invalid number of arguments
			logger.error('Error: Invalid number of arguments in command handler: %s (got %d)', handler.toString(), numArgs);
			return false;
		}
	};
}

function showInfoLast(user, serverIdx, server, origin) {
	if (arguments.length >= 6) {
		var text = arguments[arguments.length - 1];

		server.showInfo(text);
	} else {
		logger.error('showInfoLast called with arguments.length = ' + arguments.length);
	}
}

function showInfoLast2(user, serverIdx, server, origin) {
	if (arguments.length >= 7) {
		server.showInfo(Array.prototype.slice.call(arguments, -2).join(' '));
	} else {
		logger.error('showInfoLast2 called with arguments.length = ' + arguments.length);
	}
}

function emptyHandler() {
}

function handle001(user, serverIdx, server, origin, myNickname, text) {
	user.applyStateChange('Connect', server.getIndex(), myNickname);

	server.channels.forEach(function(channel) {
		channel.rejoin();
	});

	server.desiredChannels.forEach(function(channel) {
		server.send('JOIN ' + channel);
	});

	server.startPings();

	server.showInfo(text);
}

function handle004(user, serverIdx, server, origin, myNickname, serverName, serverVersion, userModes, channelModes) {
	server.showInfo('Server ' + serverName + ' running ' + serverVersion);
	server.showInfo('Supported user modes: ' + userModes);
	server.showInfo('Supported channel modes: ' + channelModes);
}

function handle005(user, serverIdx, server, origin) {
	var keyValueStrings = Array.prototype.slice.call(arguments, 5, arguments.length - 1);

	keyValueStrings.forEach(function(keyValueStr) {
		var kv = utils.parseKeyEqValue(keyValueStr);

		if (kv.key === 'NETWORK') {
			if (kv.val) {
				user.applyStateChange('EditServer', server.toWindowPath(), {
					label: kv.val
				});
			}
		}
	});

	server.showInfo('Server settings: ' + keyValueStrings.join(' '));
}

function handle311(user, serverIdx, server, origin, myNickname, nick, user, host, star, realName) {
	server.showWhois(nick + ' is ' + user + '@' + host + ' (' + realName + ')');
}

function handle312(user, serverIdx, server, origin, myNickname, nick, serverName, serverDesc) {
	server.showWhois(nick + ' is connected to ' + serverName + ' (' + serverDesc + ')');
}

function handle317(user, serverIdx, server, origin, myNickname, nick, secondsIdle, signonTime) {
	var signonDate = new Date(signonTime * 1000);

	server.showWhois(nick + ' has been idle for ' + moment().add('seconds', secondsIdle).fromNow(true) + ' (signed on ' + moment(signonDate).fromNow() + ')');
}

function handle319(user, serverIdx, server, origin, myNickname, nick, channels) {
	server.showWhois(nick + ' is on ' + channels);
}

function handle328(user, serverIdx, server, origin, myNickname, channelName, channelUrl) {
	server.withChannel(channelName, silentFail(function(channel) {
		user.applyStateChange('Info', channel.toWindowPath(), 'URL: ' + channelUrl);
	}));
}

function handle330(user, serverIdx, server, origin, myNickname, nick, authName, text) {
	server.showWhois(nick + ' ' + text + ' ' + authName);
}

function handle332(user, serverIdx, server, origin, myNickname, channelName, topicText) {
	server.withChannel(channelName, silentFail(function(channel) {
		user.applyStateChange('Info', channel.toWindowPath(), 'Topic is: ' + topicText);
	}));
}

function handle333(user, serverIdx, server, origin, myNickname, channelName, setByNick, topicTime) {
	server.withChannel(channelName, silentFail(function(channel) {
		var topicDate = new Date(topicTime * 1000);

		user.applyStateChange('Info', channel.toWindowPath(), 'Set by ' + setByNick + ' (' + moment(topicDate).fromNow() + ')');
	}));
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

function handle378(user, serverIdx, server, origin, myNickname, nick, text) {
	server.showWhois(nick + ' ' + text);
}

// ~owner, &admin, @op, %halfop, +voice, regular
// combinations possible, e.g. &@name
function parseUserlistEntry(nickWithFlags) {
	var userlistEntry = new UserlistEntry();

	for (var i = 0; i < nickWithFlags.length; i++) {
		switch (nickWithFlags.charAt(i)) {
			case '~':
				userlistEntry.owner = true;
				break;
			case '&':
				userlistEntry.admin = true;
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

function handle401(user, serverIdx, server, origin, myNickname, targetName) {
	user.showError('No such nick/channel: ' + targetName);
}

function handle671(user, serverIdx, server, origin, myNickname, nick, text) {
	server.showWhois(nick + ' ' + text);
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
		if (server.nickname === origin.nick) {
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
					user.applyStateChange('Kick', channel.toWindowPath(), origin, target.nick, kickMessage);
				}));
			}
		}));
	}
}

function handleMode(user, serverIdx, server, origin, targetName, modes) {
	var handleModeArguments = arguments;

	utils.withParsedTarget(targetName, silentFail(function(target) {
		if (target instanceof ClientTarget) {
			// it's a user mode
			if (target.nick.toLowerCase() === server.nickname.toLowerCase()) {
				logger.debug('User mode change', modes);
			}
		} else if (target instanceof ChannelTarget) {
			// it's a channel mode
			server.withChannel(target.name, silentFail(function(channel) {
				var modeArgs = Array.prototype.slice.call(handleModeArguments, 6);

				var parsedModes = mode.parseChannelModes(modes, modeArgs);

				user.applyStateChange('ModeChange', channel.toWindowPath(), origin, modes, modeArgs);

				if (parsedModes !== null) {
					parsedModes.forEach(function(parsedMode) {
						// a, h, o, q, v
						var userlistEntryAttribute = mode.getUserlistEntryAttributeByMode(parsedMode.mode);

						if (userlistEntryAttribute !== null) {
							user.applyStateChange('UserlistModeUpdate', channel.toWindowPath(), parsedMode.arg, parsedMode.plus, userlistEntryAttribute);
						}

						// for now, we ignore all other modes
					});
				} else {
					logger.error('Unable to parse channel mode change!');
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
		if (server.nickname !== null) {
			utils.withParsedTarget(targetName, silentFail(function(target) {
				// here we have a valid target

				var ctcpMessage = utils.parseCtcpMessage(text);

				if (ctcpMessage !== null) {
					//handleCtcp(serverIdx, server, origin, target, ctcpMessage);
					logger.warn('CTCP reply handling not implemented');
				} else {
					// not CTCP reply, but a regular notice
					if (target instanceof ChannelTarget) {
						server.withChannel(target.name, silentFail(function(channel) {
							user.applyStateChange('ChannelNotice', channel.toWindowPath(), origin, channel.name, text);
						}));
					} else if (target instanceof ClientTarget) {
						if (server.nickname === target.nick) {
							// we are the recipient
							user.applyStateChange('Notice', server.getActiveOrServerWindow(), origin, text);
						}
					}
				}
			}));
		} else {
			// a notice before the 001, so we ignore the target and assume it's for us
			user.applyStateChange('Notice', server.toWindowPath(), origin, text);
		}
	}
}

function handlePart(user, serverIdx, server, origin, channelName) {
	if (origin !== null && origin instanceof ClientOrigin) {
		// if the nickname of the leaver matches ours
		if (server.nickname === origin.nick) {
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
						user.applyStateChange('ChatMessage', channel.toWindowPath(), origin, text);
					}));
				} else if (target instanceof ClientTarget) {
					if (server.nickname === target.nick) {
						// we are the recipient
						var query = server.ensureQuery(origin.getNickOrName());

						user.applyStateChange('ChatMessage', query.toWindowPath(), origin, text);
					}
				}
			}
		}));
	}
}

function handleQuit(user, serverIdx, server, origin, quitMessage) {
	if (origin !== null && origin instanceof ClientOrigin) {
		user.applyStateChange('Quit', serverIdx, origin, quitMessage);
	}
}

function handleTopic(user, serverIdx, server, origin, channelName, newTopic) {
	server.withChannel(channelName, silentFail(function(channel) {
		user.applyStateChange('SetTopic', channel.toWindowPath(), origin, newTopic);
	}));
}

function handleCtcp(serverIdx, server, origin, target, ctcpMessage) {
	if (origin !== null && origin instanceof ClientOrigin) {
		if (ctcpMessage.command === 'ACTION' && ctcpMessage.args !== null) {
			if (target instanceof ChannelTarget) {
				server.withChannel(target.name, silentFail(function(channel) {
					server.user.applyStateChange('ActionMessage', channel.toWindowPath(), origin, ctcpMessage.args);
				}));
			} else if (target instanceof ClientTarget) {
				if (server.nickname === target.nick) {
					// we are the recipient
					var query = server.ensureQuery(origin.getNickOrName());

					server.user.applyStateChange('ActionMessage', query.toWindowPath(), origin, ctcpMessage.args);
				}
			}
		} else {
			logger.info('Received CTCP %s from %s', ctcpMessage.command, origin.getNickOrName());
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
		server.disconnect();
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
		logger.info('Connected to server %s:%d', server.host, server.port);

		server.socket = serverSocket;

		if (server.password) {
			server.send('PASS ' + server.password);
		}

		server.send('NICK ' + server.desiredNickname);
		server.send('USER ' + server.username + ' ' + server.username + ' ' + server.host + ' :' + server.realName);
	});

	serverSocket.on('error', function(err) {
		// TODO: show this to the user
		logger.warn('Connection to server closed due to error:', err);

		server.disconnect(true);
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
		server.disconnect(true);
	});
}

function processLineFromServer(line, server) {
	logger.data('Line: ' + line);

	parseResult = parseLine(line);

	if (parseResult !== null) {
		if (parseResult.command in serverCommandHandlers) {
			// either already registered (001) or it's a command that's allowed to be received before registration
			if (server.nickname !== null || ~preregAllowedCommands.indexOf(parseResult.command)) {
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
				server.user.applyStateChange('Error', server.toWindowPath(), 'Server protocol violation: Received ' + parseResult.command + ' before registration.');
			}
		} else {
			server.user.applyStateChange('Text', server.toWindowPath(), parseResult.command + ' ' + parseResult.args.join(' '));
		}
	} else {
		logger.error('Invalid line from server: ' + line);
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

function processChatboxLine(user, activeWindowPath, line, parseCommands, sessionId) {
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

		var activeWindow = user.getWindowByPath(activeWindowPath);

		var server = activeWindow.server;

		if (activeWindow !== null) {
			if (command !== null) {
				clientcommands.handleClientCommand(activeWindow, command, rest, sessionId);
			} else {
				if (activeWindow.type === 'channel') {
					server.ifConnected(function() {
						var channel = activeWindow.object;

						user.applyStateChange('MyChatMessage', channel.toWindowPath(), rest);

						server.send('PRIVMSG ' + channel.name + ' :' + rest);
					});
				} else if (activeWindow.type === 'query') {
					server.ifConnected(function() {
						var query = activeWindow.object;

						user.applyStateChange('MyChatMessage', query.toWindowPath(), rest);

						server.send('PRIVMSG ' + query.name + ' :' + rest);
					});
				} else {
					server.showError('Only commands are processed in this window', true);
				}
			}
		}
	} else {
		assert(false, 'No active window in processChatboxLine');
	}
}

exports.reconnectServer = reconnectServer;
exports.processChatboxLine = processChatboxLine;
