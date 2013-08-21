var utils = require('./utils.js');

var serverCommandHandlers = {
	'CLOSE': getHandler(0, 0, handleClose),
	'HOP': getHandler(0, 0, handleHop),
	'ME': getHandler(1, 1, handleMe),
	'MSG': getHandler(2, 2, handleMsg),
	'SERVER': getHandler(2, 0, handleServer),
};

function handleClose() {
	if (this.activeWindow.type === 'channel') {
		var server = this.activeWindow.server;
		var channel = this.activeWindow.object;

		if (channel.inChannel) {
			channel.rejoining = false;

			server.send('PART ' + channel.name);
		} else {
			server.removeChannel(channel.name);
		}
	} else if (this.activeWindow.type === 'query') {
		var server = this.activeWindow.server;
		var query = this.activeWindow.object;

		server.removeQuery(query.name);
	} else {
		this.showError('Can\'t /close this window');
	}
}

function handleHop() {
	if (this.activeWindow.type === 'channel') {
		var channel = this.activeWindow.object;

		channel.rejoin();
	} else {
		this.showError('Use /hop in a channel to rejoin');
	}
}

function handleMe(text) {
	if (this.activeWindow.type === 'channel' || this.activeWindow.type === 'query') {
		var channelOrQuery = this.activeWindow.object;

		this.user.applyStateChange('ActionMessage', this.activeWindow.windowPath, this.server.nickname, text);

		this.server.send('PRIVMSG ' + channelOrQuery.name + ' :' + utils.toCtcp('ACTION', text));
	} else {
		this.showError('Can\'t /me in this window');
	}
}

function handleMsg(targetName, text) {
	var self = this;

	utils.withParsedTarget(targetName, check(function(err) {
		self.showError('Invalid target');
	}, function(target) {
		if (self.server.connected) {
			if (target instanceof ClientTarget) {
				if (!target.server) {
					var query = self.server.ensureQuery(target.toString());

					self.user.applyStateChange('ChatMessage', query.toWindowPath(), self.server.nickname, text);

					self.user.setActiveWindow(query.toWindowPath());
				} else {
					self.showInfo('To ' + target.toString() + ': ' + text);
				}

				self.server.send('PRIVMSG ' + target.toString() + ' :' + text);

			} else if (target instanceof ChannelTarget) {
				var channel = self.server.findChannel(target.name);

				if (channel) {
					self.user.applyStateChange('ChatMessage', channel.toWindowPath(), self.server.nickname, text);
				} else {
					self.showInfo('To ' + target.name + ': ' + text);
				}

				self.server.send('PRIVMSG ' + target.name + ' :' + text);
			} else {
				self.showError('Unsupported target');
			}
		} else {
			self.showError('Not connected');
		}
	}));
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

function showError(text) {
	this.user.applyStateChange('Error', this.activeWindow.windowPath, text);
}

function showInfo(text) {
	this.user.applyStateChange('Info', this.activeWindow.windowPath, text);
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
				numArgs: parsedArgs.length,
				showError: showError,
				showInfo: showInfo
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

function silentFailCallback() {
	// silent fail (not so silent just yet)
	console.log('silentFailCallback');
}

module.exports.handleClientCommand = handleClientCommand;

