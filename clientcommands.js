var utils = require('./utils.js');
var test = require('./test.js');

var serverCommandHandlers = {
	'HOP': getHandler(0, 0, handleHop),
	'LOGOUT': getHandler(1, 0, handleLogout),
	'ME': getHandler(1, 1, handleMe),
	'MSG': getHandler(2, 2, handleMsg),
	'SERVER': getHandler(2, 0, handleServer),
	'SESSIONS': getHandler(0, 0, handleSessions),
	'TEST': getHandler(1, 1, handleTest),
};

function handleHop() {
	if (this.activeWindow.type === 'channel') {
		var channel = this.activeWindow.object;

		channel.rejoin();
	} else {
		this.showError('Use /hop in a channel to rejoin');
	}
}

function handleLogout(all) {
	var self = this;

	if (all && all.toLowerCase() === 'all') {
		var numSessions = 0;

		var loggedInSessionsCopy = this.user.loggedInSessions.slice(0);

		loggedInSessionsCopy.forEach(function(sessionId) {
			if (self.user.removeLoggedInSession(sessionId)) {
				numSessions++;
			}
		});

		self.showInfo(numSessions + ' session(s) have been logged out. Feel free to close your browser.');
	} else {
		if (this.user.removeLoggedInSession(this.sessionId)) {
			this.showInfo('Your current browser session is now logged out. Feel free to close your browser.');
		} else {
			this.showInfo('Your current browser session is already logged out. Feel free to close your browser.');
		}
	}
}

function handleMe(text) {
	if (this.activeWindow.type === 'channel' || this.activeWindow.type === 'query') {
		var channelOrQuery = this.activeWindow.object;

		this.user.applyStateChange('MyActionMessage', this.activeWindow.windowPath, text);

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

					self.user.applyStateChange('MyChatMessage', query.toWindowPath(), text);

					self.user.setActiveWindow(query.toWindowPath());
				} else {
					self.showInfo('To ' + target.toString() + ': ' + text);
				}

				self.server.send('PRIVMSG ' + target.toString() + ' :' + text);

			} else if (target instanceof ChannelTarget) {
				var channel = self.server.findChannel(target.name);

				if (channel) {
					self.user.applyStateChange('MyChatMessage', channel.toWindowPath(), text);
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

function handleSessions() {
	var self = this;

	if (this.user.loggedInSessions.length > 0) {
		this.showInfo('Logged-in sessions:');

		this.user.loggedInSessions.forEach(function(sessionId, i) {
			self.showInfo((i + 1) + ' - ' + sessionId + (sessionId == self.sessionId ? ' (current)' : ''));
		});
	} else {
		this.showInfo('No logged-in sessions.');
	}
}

function handleTest(testId) {
	test.runTest(this, testId);
}

function showError(text) {
	this.user.applyStateChange('Error', this.activeWindow.windowPath, text);
}

function showInfo(text) {
	this.user.applyStateChange('Info', this.activeWindow.windowPath, text);
}

function handleClientCommand(activeWindow, command, args, sessionId) {
	if (command in serverCommandHandlers) {
		var handlerData = serverCommandHandlers[command];

		var parsedArgs = parseArgs(handlerData.numPossibleArgs, args);

		if (parsedArgs.length >= handlerData.numRequiredArgs) {
			var handler = handlerData.handler;
			var handlerThisObject = {
				sessionId: sessionId,
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

