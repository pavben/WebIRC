var utils = require('./utils.js');

var serverCommandHandlers = {
	'ME': getHandler(1, 1, handleMe),
	'SERVER': getHandler(2, 0, handleServer),
};

function handleMe(text) {
	if (this.activeWindow.type === 'channel' || this.activeWindow.type === 'query') {
		var channelOrQuery = this.activeWindow.object;

		this.user.applyStateChange('ActionMessage', this.activeWindow.windowPath, this.server.nickname, text);

		this.server.send('PRIVMSG ' + channelOrQuery.name + ' :' + utils.toCtcp('ACTION', text));
	} else {
		console.log('Unsupported window type for command');
	}
}

function handleServer(host, port) {
	switch (this.numArgs) {
		case 2:
			this.server.port = port;
			// fall through
		case 1:
			this.server.host = host;
			// fall through
		case 0:
			this.server.reconnect();
	}
}

function handleClientCommand(activeWindow, command, args) {
	if (command in serverCommandHandlers) {
		var handlerData = serverCommandHandlers[command];

		var parsedArgs = parseArgs(handlerData.numPossibleArgs, args);

		if (parsedArgs.length >= handlerData.numRequiredArgs) {
			var handler = handlerData.handler;
			var handlerThisObject = {
				user: activeWindow.server.user,
				server: activeWindow.server,
				activeWindow: activeWindow,
				numArgs: parsedArgs.length
			};

			handler.apply(handlerThisObject, parsedArgs);
		} else {
			// error: Not enough parameters
		}
	} else {
		// TODO: are we connected?
		activeWindow.server.send(command + ' ' + args);
	}
}

function getHandler(numPossibleArgs, numRequiredArgs, handler) {
	var ret = {};

	ret.numPossibleArgs = numPossibleArgs;
	ret.numRequiredArgs = numRequiredArgs;
	ret.handler = handler;

	return ret;
}

function parseArgs(numPossibleArgs, str) {
	var parsedArgs = [];

	while (str.length > 0) {
		if (parsedArgs.length < numPossibleArgs - 1) {
			var spaceIdx = str.indexOf(' ');

			if (spaceIdx !== -1) {
				parsedArgs.push(str.substring(0, spaceIdx));
				str = str.substring(spaceIdx + 1);
			} else {
				parsedArgs.push(str);
				str = '';
			}
		} else {
			parsedArgs.push(str);
			str = '';
		}
	}

	return parsedArgs;
}

module.exports.handleClientCommand = handleClientCommand;

