var utils = require('./utils.js');
var test = require('./test.js');

var serverCommandHandlers = {
	'CLOSE': getHandler(0, 0, handleClose),
	'HOP': getHandler(0, 0, handleHop),
	'LOGOUT': getHandler(1, 0, handleLogout),
	'ME': getHandler(1, 1, handleMe),
	'MSG': getHandler(2, 2, handleMsg),
	'NOTICE': getHandler(2, 2, handleNotice),
	'SERVER': getHandler(2, 0, handleServer),
	'SESSIONS': getHandler(0, 0, handleSessions),
	'TEST': getHandler(1, 1, handleTest),
	'W': getHandler(1, 1, handleWhois),
	'WHOIS': getHandler(1, 1, handleWhois),
};

function handleClose() {
	this.activeWindow.object.closeWindow();
}

function handleHop() {
	var self = this;

	if (this.activeWindow.type === 'channel') {
		this.server.ifConnected(function() {
			var channel = self.activeWindow.object;

			channel.rejoin();
		});
	} else {
		this.user.showError('Use /hop in a channel to rejoin');
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

		self.user.showInfo(numSessions + ' session(s) have been logged out. Feel free to close your browser.');
	} else {
		if (this.user.removeLoggedInSession(this.sessionId)) {
			this.user.showInfo('Your current browser session is now logged out. Feel free to close your browser.');
		} else {
			this.user.showInfo('Your current browser session is already logged out. Feel free to close your browser.');
		}
	}
}

function handleMe(text) {
	var self = this;

	if (this.activeWindow.type === 'channel' || this.activeWindow.type === 'query') {
		this.server.ifConnected(function() {
			var channelOrQuery = self.activeWindow.object;

			self.user.applyStateChange('MyActionMessage', self.activeWindow.windowPath, text);

			self.server.send('PRIVMSG ' + channelOrQuery.name + ' :' + utils.toCtcp('ACTION', text));
		});
	} else {
		this.user.showError('Can\'t /me in this window');
	}
}

function handleMsg(targetName, text) {
	var self = this;

	utils.withParsedTarget(targetName, check(function(err) {
		self.user.showError('Invalid target');
	}, function(target) {
		self.server.ifConnected(function() {
			var displayed = false;

			if (target instanceof ClientTarget) {
				if (!target.server) {
					var query = self.server.ensureQuery(target.toString());

					self.user.applyStateChange('MyChatMessage', query.toWindowPath(), text);

					self.user.setActiveWindow(query.toWindowPath());

					displayed = true;
				}
			} else if (target instanceof ChannelTarget) {
				self.server.withChannel(target.name, silentFail(function(channel) {
					self.user.applyStateChange('MyChatMessage', channel.toWindowPath(), text);

					displayed = true;
				}));
			}

			if (!displayed) {
				self.user.showInfo('To ' + targetName + ': ' + text);
			}

			// send the message to the unparsed target name
			self.server.send('PRIVMSG ' + targetName + ' :' + text);
		});
	}));
}

function handleNotice(targetName, text) {
	var self = this;

	this.server.ifConnected(function() {
		self.user.showInfo('Notice to ' + targetName + ': ' + text);

		self.server.send('NOTICE ' + targetName + ' :' + text);
	});
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
		this.user.showInfo('Logged-in sessions:');

		this.user.loggedInSessions.forEach(function(sessionId, i) {
			self.user.showInfo((i + 1) + ' - ' + sessionId + (sessionId == self.sessionId ? ' (current)' : ''));
		});
	} else {
		this.user.showInfo('No logged-in sessions.');
	}
}

function handleTest(testId) {
	test.runTest(this, testId);
}

function handleWhois(targetName) {
	var self = this;

	this.server.ifConnected(function() {
		self.server.send('WHOIS ' + targetName);
	});
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

function silentFailCallback() {
	// silent fail (not so silent just yet)
	console.log('silentFailCallback');
}

module.exports.handleClientCommand = handleClientCommand;

