"use strict";

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
	this.activeEntity.closeWindow();
}

function handleHop() {
	var self = this;

	if (this.activeEntity.type === 'channel') {
		this.server.ifRegistered(function() {
			var channel = self.activeEntity;

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

	if (this.activeEntity.type === 'channel' || this.activeEntity.type === 'query') {
		this.server.ifRegistered(function() {
			var channelOrQuery = self.activeEntity;

			self.user.applyStateChange('MyActionMessage', self.activeEntity.entityId, text);

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
		self.server.ifRegistered(function() {
			var displayed = false;

			if (target instanceof ClientTarget) {
				// /msg nick@server will not open the query window
				if (target.server === null) {
					var query = self.server.ensureQuery(target.toString());

					self.user.applyStateChange('MyChatMessage', query.entityId, text);

					self.user.setActiveEntity(query.entityId);

					displayed = true;
				}
			} else if (target instanceof ChannelTarget) {
				self.server.withChannel(target.name, silentFail(function(channel) {
					self.user.applyStateChange('MyChatMessage', channel.entityId, text);

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

	this.server.ifRegistered(function() {
		self.user.showInfo('Notice to ' + targetName + ': ' + text);

		self.server.send('NOTICE ' + targetName + ' :' + text);
	});
}

function handleServer(host, port) {
	function trySetPort(portStr) {
		var portNum = parseInt(portStr);

		if (!isNaN(portNum)) {
			serverChanges.port = portNum;
		}
	}

	this.server.disconnect();

	if (this.numArgs >= 1) { // if host provided
		var serverChanges = {};

		serverChanges.host = host;
		serverChanges.port = 6667;
		serverChanges.ssl = false;

		if (this.numArgs >= 2) { // if port provided
			if (port.substring(0, 1) === '+') {
				trySetPort(port.substring(1));

				serverChanges.ssl = true;
			} else {
				trySetPort(port);
			}
		}

		this.user.applyStateChange('EditServer', this.server.entityId, serverChanges);
	}

	this.server.reconnect();
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

	this.server.ifRegistered(function() {
		self.server.send('WHOIS ' + targetName);
	});
}

function handleClientCommand(activeEntity, command, args, sessionId) {
	if (command in serverCommandHandlers) {
		var handlerData = serverCommandHandlers[command];

		var parsedArgs = parseArgs(handlerData.numPossibleArgs, args);

		if (parsedArgs.length >= handlerData.numRequiredArgs) {
			var handler = handlerData.handler;
			var handlerThisObject = {
				sessionId: sessionId,
				user: activeEntity.server.user,
				server: activeEntity.server,
				activeEntity: activeEntity,
				numArgs: parsedArgs.length
			};

			handler.apply(handlerThisObject, parsedArgs);
		} else {
			// error: Not enough parameters
		}
	} else {
		activeEntity.server.ifRegistered(function() {
			activeEntity.server.send(command + ' ' + args);
		});
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

