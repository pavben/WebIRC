var net = require('net');
var data = require('./data.js');

var serverCommandHandlers = {
	'001': handleCommandRequireArgs(0, handle001),
//	'353': handle353, // RPL_NAMREPLY
//	'366': handle366, // RPL_ENDOFNAMES
	'PING': handleCommandRequireArgs(1, handlePing),
	'JOIN': handleCommandRequireArgs(1, handleJoin),
}

function handleCommandRequireArgs(requiredNumArgs, handler) {
	return function(numArgs, args) {
		if (numArgs >= requiredNumArgs) {
			return handler.apply(null, args);
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

function handlePing(user, server, origin, arg) {
	sendToServer(server, 'PONG :' + arg);
}

function handleJoin(user, server, origin, channel) {
	if (origin !== null && server.nickname !== null) {
		// if the nickname of the joiner matches ours
		if (origin.nick === server.nickname) {
			// the server is confirming that we've joined some channel
			server.channels.push(channel);

			console.log('Successfully joined ' + channel);
		}
	}
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

