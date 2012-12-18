var net = require('net');
var data = require('./data.js');
var utils = require('./utils.js');

var serverCommandHandlers = {
	'001': handleCommandRequireArgs(0, handle001),
	'353': handleCommandRequireArgs(4, handle353), // RPL_NAMREPLY
	'366': handleCommandRequireArgs(2, handle366), // RPL_ENDOFNAMES
	'PING': handleCommandRequireArgs(1, handlePing),
	'JOIN': handleCommandRequireArgs(1, handleJoin),
	'PART': handleCommandRequireArgs(1, handlePart),
	'PRIVMSG': handleCommandRequireArgs(2, handlePrivmsg),
}

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
			// the server is confirming that we've joined some channel
			var channel = new data.Channel(channelName);

			server.addChannel(channel);
		} else {
			// someone joined one of the channels we should be in
			withChannel(server, channelName,
				function(channel) {
					var newUserlistEntry = new data.UserlistEntry();

					newUserlistEntry.nick = origin.nick;
					newUserlistEntry.user = origin.user;
					newUserlistEntry.host = origin.host;

					channel.userlist.push(newUserlistEntry);

					enterActivityForChannel(user, channel, 'Join', {
						who: newUserlistEntry
					}, true);
				},
				silentFailCallback
			);
		}
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

					enterActivityForChannel(user, channel, 'Part', {
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
		if (utils.isNickname(targetName)) {
			console.log('Unhandled target type -- nickname');
		} else {
			withChannel(server, targetName,
				function(channel) {
					enterActivityForChannel(user, channel, 'ChatMessage', {
						nick: (origin.type === 'client' ? origin.nick : origin.name),
						text: text
					}, true);
				},
				silentFailCallback
			);
		}
	}
}

function enterActivityForChannel(user, channel, activityType, activity, affectsHistory) {
	// first, set the type
	activity.type = activityType;

	// if this event is one that should be stored in the activity log (such as a message or a join), push it
	if (affectsHistory) {
		channel.activityLog.push(activity);
	}

	user.sendActivityForWindow(channel.windowId, activity);
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

function silentFailCallback() {
	// silent fail (not so silent just yet)
	console.log('silentFailCallback');
}

exports.run = function() {
	data.users.forEach(function(user) {
		user.servers.forEach(function(server) {
			var serverSocket = net.connect({host: server.host, port: server.port},
				function() {
					console.log('connected');

					server.socket = serverSocket;
					server.nickname = server.desiredNickname;

					server.send('NICK ' + server.nickname);
					server.send('USER ' + server.username + ' ' + server.username + ' ' + server.host + ' :' + server.realName);
				}
			);

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

					processLineFromServer(user, server, line);
				}
			});

			serverSocket.on('end', function() {
				console.log('disconnected');
			});
		});
	});
}

function processLineFromServer(user, server, line) {
	console.log('Line: ' + line);

	parseResult = parseLine(line);

	if (parseResult !== null) {
		if (parseResult.command in serverCommandHandlers) {
			serverCommandHandlers[parseResult.command](
				parseResult.args.length,
				[
					user,
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

function processChatboxLine(line, user, exec) {
	var command = null;
	var rest = line;

	// only parse commands if exec is true
	if (exec) {
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
			//console.log('Commands not implemented');

			server.send(command + ' ' + rest);
		} else {
			if (objs.type === 'channel') {
				var channel = objs.channel;

				enterActivityForChannel(user, channel, 'ChatMessage', { nick: server.nickname, text: rest }, true);

				server.send('PRIVMSG ' + channel.name + ' :' + rest);
			}
		}
	}
}

exports.processChatboxLine = processChatboxLine;

