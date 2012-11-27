var net = require('net');
var data = require('./data.js');

var serverCommandHandlers = {
	'001': handle001,
	'PING': handlePing,
	'JOIN': handleJoin,
}

function handle001(user, server, origin, getNextArg) {
	server.desiredChannels.forEach(function(channel) {
		sendToServer(server, 'JOIN ' + channel);
	});
}

function handlePing(user, server, origin, getNextArg) {
	var nextArg = getNextArg();

	if (nextArg !== null) {
		sendToServer(server, 'PONG :' + nextArg.arg);
	}
}

function handleJoin(user, server, origin, getNextArg) {
	if (origin !== null && server.nickname !== null) {
		var channelArg = getNextArg();

		if (channelArg !== null) {
			if (origin.nick === server.nickname) {
				// the server is confirming that we've joined some channel
				server.channels.push(channelArg.arg);

				console.log('Successfully joined ' + channelArg.arg);
			}
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

	var origin = null;
	var command = null;

	var getNextArg = getNextArgGen(line);

	var firstArg = getNextArg();
	if (firstArg.colon) {
		origin = firstArg.arg;

		if (!firstArg.last) {
			command = getNextArg().arg;
		} else {
			console.log('Line started with a colon, but no command arg provided.');
			return;
		}
	} else {
		command = firstArg.arg;
	}

	if (command in serverCommandHandlers) {
		serverCommandHandlers[command](user, server, (origin !== null ? parseNickUserHost(origin) : null), getNextArg);
	} else {
		//console.log('No handler for command ' + command);
	}
}

function getNextArgGen(str) {
	var firstArg = true;
	var buf = str;

	return function() {
		if (buf === null) {
			return null;
		}

		var arg = null;
		var isColon = false;

		if (buf.length >= 1 && buf.charAt(0) === ':') {
			isColon = true;

			if (firstArg) {
				firstArg = false;

				// first arg starts with a :
				var spaceAt = str.indexOf(' ');

				if (spaceAt !== -1) {
					arg = buf.substring(1, spaceAt);
					buf = buf.substring(spaceAt + 1);
				} else {
					arg = buf.substring(1);
					buf = null;
				}
			} else {
				// multiword arg
				arg = buf.substring(1);
				buf = null;
			}
		} else {
			firstArg = false;

			var spaceAt = buf.indexOf(' ');

			if (spaceAt !== -1) {
				arg = buf.substring(0, spaceAt);
				buf = buf.substring(spaceAt + 1);
			} else {
				arg = buf;
				buf = null;
			}
		}

		return {arg: arg, last: (buf === null), colon: isColon};
	};
}

// note: we only validate the nick!user@host format and not what characters can or cannot be in each
function parseNickUserHost(str) {
	var match;
	if (match = str.match(/^([^!]+?)!([^@]+?)@(.+?)$/)) {
		return {nick: match[1], user: match[2], host: match[3]};
	} else {
		return null;
	}
}

