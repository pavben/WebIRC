var utils = require('./utils.js');

var serverCommandHandlers = {
	'ME': getHandlersData(1, 1, {channel: handleChannelMe}),
	'SERVER': getHandlersData(2, 0, {any: handleServer}),
};

function handleChannelMe(server, channel, text) {
	channel.enterActivity('ActionMessage', { nick: server.nickname, text: text }, true);

	server.send('PRIVMSG ' + channel.name + ' :' + utils.toCtcp('ACTION', text));
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
			this.server.reconnect(processLineFromServer);
	}
}

function handleClientCommand(objs, command, args) {
	if (command in serverCommandHandlers) {
		var handlersData = serverCommandHandlers[command];

		var parsedArgs = parseArgs(handlersData.numPossibleArgs, args);

		if (parsedArgs.length >= handlersData.numRequiredArgs) {
			var handlers = handlersData.handlers;
			var handlerThisObject = {
				numArgs: parsedArgs.length
			};

			(function() {
				if (objs.type === 'channel') {
					if ('channel' in handlers) {
						return handlers['channel'].apply(handlerThisObject, [objs.server, objs.channel].concat(parsedArgs));
					}
				}

				if ('any' in handlers) {
					return handlers['any'].apply(handlerThisObject, [objs.server].concat(parsedArgs));
				}

				// if here, no handlers matched
				objs.server.user.sendActivityForActiveWindow('BasicError', {text: 'Can\'t run that here'});
			})();
		} else {
			objs.server.user.sendActivityForActiveWindow('BasicError', {text: 'Not enough parameters'});
		}
	} else {
		server.send(command + ' ' + args);
	}
}

function getHandlersData(numPossibleArgs, numRequiredArgs, handlers) {
	var ret = {};

	ret.numPossibleArgs = numPossibleArgs;
	ret.numRequiredArgs = numRequiredArgs;
	ret.handlers = handlers;

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

