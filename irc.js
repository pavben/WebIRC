var net = require('net');

var serverCommandHandlers = {
	'001': handle001,
	'PING': handlePing
}

function handle001(serverSocket, origin, getNextArg) {
	sendToServer(serverSocket, 'JOIN #test');
}

function handlePing(serverSocket, origin, getNextArg) {
	var nextArg = getNextArg();

	if (nextArg !== null) {
		sendToServer(serverSocket, 'PONG :' + nextArg.arg);
	}
}

exports.blah = function() {
	var serverSocket = net.connect({host: 'test.server', port: 6667},
		function() {
			console.log('connected');
			sendToServer(serverSocket, 'NICK webirc');
			sendToServer(serverSocket, 'USER webirc webirc test.server :webirc');
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

			processLineFromServer(line);
		}
	});

	serverSocket.on('end', function() {
		console.log('disconnected');
	});

	function processLineFromServer(line) {
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
			serverCommandHandlers[command](serverSocket, (origin !== null ? parseNickUserHost(origin) : null), getNextArg);
		} else {
			//console.log('No handler for command ' + command);
		}
	}
}

function sendToServer(serverSocket, data) {
	console.log('SEND: ' + data);
	serverSocket.write(data + '\r\n');
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

