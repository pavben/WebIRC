var net = require('net');
var data = require('./data.js');

var serverCommandHandlers = {
	'001': handleCommandRequireArgs(0, handle001),
	'353': handleCommandRequireArgs(4, handle353), // RPL_NAMREPLY
	'366': handleCommandRequireArgs(2, handle366), // RPL_ENDOFNAMES
	'PING': handleCommandRequireArgs(1, handlePing),
	'JOIN': handleCommandRequireArgs(1, handleJoin),
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
		sendToServer(server, 'JOIN ' + channel);
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

	for(var i = 0; i < nickWithFlags.length; i++) {
		switch(nickWithFlags.charAt(i)) {
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
	sendToServer(server, 'PONG :' + arg);
}

function handleJoin(user, server, origin, channelName) {
	// if the nickname of the joiner matches ours
	if (origin !== null && origin.type === 'client') {
		if (server.nickname !== null && server.nickname === origin.nick) {
			// the server is confirming that we've joined some channel
			server.channels.push(new data.Channel(channelName, user.getNextWindowId()));

			console.log('Successfully joined ' + channelName);
		} else {
			// someone joined one of the channels we should be in
			withChannel(server, channelName,
				function(channel) {
					var newUserlistEntry = new data.UserlistEntry();

					newUserlistEntry.nick = origin.nick;
					newUserlistEntry.user = origin.user;
					newUserlistEntry.host = origin.host;

					channel.userlist.push(newUserlistEntry);

					//sendToWeb(user, ...
				},
				silentFailCallback
			);
		}
	}
}

function sendToWeb(user, msgId, data) {
	user.activeWebSockets.forEach(function(socket) {
		socket.emit(msgId, data);
	});
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

					sendToServer(server, 'NICK ' + server.nickname);
					sendToServer(server, 'USER ' + server.username + ' ' + server.username + ' ' + server.host + ' :' + server.realName);
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

function sendToServer(server, data) {
	console.log('SEND: ' + data);
	if (server.socket !== null) {
		server.socket.write(data + '\r\n');
	} else {
		console.log('sendToServer received server with null socket');
	}
}

function processLineFromServer(user, server, line) {
	console.log('Line: ' + line);

	parseResult = parseLine(line);

	if (parseResult !== null) {
		if (parseResult.command in serverCommandHandlers) {
			// TODO: origin can be a server

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

