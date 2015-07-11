"use strict";

let utils = require('./utils.js');
let test = require('./test.js');

let serverCommandHandlers = {
	'CLOSE': getHandler(0, 0, handleClose),
	'HELP': getHandler(0, 0, handleHelp),
	'HOP': getHandler(0, 0, handleHop),
	'LOGOUT': getHandler(1, 0, handleLogout),
	'ME': getHandler(1, 1, handleMe),
	'MSG': getHandler(2, 2, handleMsg),
	'NOTICE': getHandler(2, 2, handleNotice),
	'RAW': getHandler(1, 0, handleRaw),
	'QUIT': getHandler(1, 0, handleQuit),
	'SERVER': getHandler(3, 0, handleServer),
	'SESSIONS': getHandler(0, 0, handleSessions),
	'TEST': getHandler(1, 1, handleTest),
	'TOPIC': getHandler(2, 1, handleTopic),
	'W': getHandler(1, 1, handleWhois),
	'WHOIS': getHandler(1, 1, handleWhois),
};

function handleClose() {
	this.activeEntity.removeEntity();
}

function handleHelp() {
	this.user.showInfo('Common commands:');
	this.user.showInfo('/server [host] [port] [password] to connect to a new server in the current server window. Prefix the port with + for SSL. If you got disconnected and want to reconnect to the same server, just type /server with no parameters.');
	this.user.showInfo('/join #channel [key] to join a channel with the optional key');
	this.user.showInfo('/msg <nick> <text> to start a private chat');
	this.user.showInfo('/close to close the current window. This is the same as clicking the X in the window list column.');
	this.user.showInfo('/sessions to list currently logged-in sessions, or /logout [all]');
	this.user.showInfo('All unrecognized commands are treated as raw and sent to the server directly. For example, you can do: /privmsg #chan :text');
}

function handleHop() {
	if (this.activeEntity.type === 'channel') {
		this.server.requireConnected(() => {
			let channel = this.activeEntity;
			channel.rejoin();
		});
	} else {
		this.user.showError('Use /hop in a channel to rejoin');
	}
}

function handleLogout(all) {
	if (typeof all === 'string' && all.toLowerCase() === 'all') {
		let numSessions = 0;
		let loggedInSessionsCopy = this.user.loggedInSessions.slice();
		loggedInSessionsCopy.forEach(sessionId => {
			if (this.user.removeLoggedInSession(sessionId)) {
				numSessions++;
			}
		});
		this.user.showInfo(numSessions + ' session(s) have been logged out. Feel free to close your browser.');
	} else {
		if (this.user.removeLoggedInSession(this.sessionId)) {
			this.user.showInfo('Your current browser session is now logged out. Feel free to close your browser.');
		} else {
			this.user.showInfo('Your current browser session is already logged out. Feel free to close your browser.');
		}
	}
}

function handleMe(text) {
	if (this.activeEntity.type === 'channel' || this.activeEntity.type === 'query') {
		this.server.requireConnected(() => {
			let channelOrQuery = this.activeEntity;
			this.user.applyStateChange('MyActionMessage', this.activeEntity.entityId, text);
			this.server.send('PRIVMSG ' + channelOrQuery.name + ' :' + utils.toCtcp('ACTION', text));
		});
	} else {
		this.user.showError('Can\'t /me in this window');
	}
}

function handleMsg(targetName, text) {
	utils.withParsedTarget(targetName, check(err => {
		this.user.showError('Invalid target');
	}, target => {
		this.server.requireConnected(() => {
			let displayed = false;
			if (target instanceof ClientTarget) {
				// /msg nick@server will not open the query window
				if (target.server === null) {
					let query = this.server.ensureQuery(target.toString());
					this.user.applyStateChange('MyChatMessage', query.entityId, text);
					this.user.setActiveEntity(query.entityId);
					displayed = true;
				}
			} else if (target instanceof ChannelTarget) {
				this.server.withChannel(target.name, silentFail(channel => {
					this.user.applyStateChange('MyChatMessage', channel.entityId, text);
					displayed = true;
				}));
			}
			if (!displayed) {
				this.user.showInfo('To ' + targetName + ': ' + text);
			}
			// send the message to the unparsed target name
			this.server.send('PRIVMSG ' + targetName + ' :' + text);
		});
	}));
}

function handleNotice(targetName, text) {
	this.server.requireConnected(() => {
		this.user.showInfo('Notice to ' + targetName + ': ' + text);
		this.server.send('NOTICE ' + targetName + ' :' + text);
	});
}

function handleRaw(cmd) {
	this.server.requireConnected(() => {
		this.server.send(cmd);
	});
}

function handleQuit(msg) {
	this.server.requireConnected(() => {
		msg = msg || ''; // empty if not provided
		this.server.send('QUIT :' + msg);
		this.server.disconnect(true);
	}, {
		allowUnregistered: true
	});
}

function handleServer(host, port, password) {
	function trySetPort(portStr) {
		let portNum = parseInt(portStr);
		if (!isNaN(portNum)) {
			serverChanges.port = portNum;
		}
	}
	// disconnect first since it's unclean to be changing host/port while connected
	this.server.disconnect();
	if (this.numArgs >= 1) { // if host provided
		let serverChanges = {};
		serverChanges.label = host;
		serverChanges.host = host;
		serverChanges.port = 6667;
		serverChanges.ssl = false;
		serverChanges.password = null;
		if (this.numArgs >= 2) { // if port provided
			if (port.substring(0, 1) === '+') {
				trySetPort(port.substring(1));
				serverChanges.ssl = true;
			} else {
				trySetPort(port);
			}
			if (this.numArgs >= 3) { // if password provided
				serverChanges.password = password;
			}
		}
		this.user.applyStateChange('EditServer', this.server.entityId, serverChanges);
	}
	this.server.reconnect();
}

function handleSessions() {
	if (this.user.loggedInSessions.length > 0) {
		this.user.showInfo('Logged-in sessions:');
		this.user.loggedInSessions.forEach((sessionId, i) => {
			this.user.showInfo((i + 1) + ' - ' + sessionId + (sessionId == this.sessionId ? ' (current)' : ''));
		});
	} else {
		this.user.showInfo('No logged-in sessions.');
	}
}

function handleTest(testId) {
	test.runTest(this, testId);
}

function handleTopic(channel, text) {
	this.server.requireConnected(() => {
		if (this.numArgs == 1) {
			this.server.send('TOPIC ' + channel);
		} else if (this.numArgs == 2) {
			this.server.send('TOPIC ' + channel + ' :' + text);
		}
	});
}

function handleWhois(targetName) {
	this.server.requireConnected(() => {
		this.server.send('WHOIS ' + targetName);
	});
}

function handleClientCommand(activeEntity, command, args, sessionId) {
	if (command in serverCommandHandlers) {
		let handlerData = serverCommandHandlers[command];
		let parsedArgs = parseArgs(handlerData.numPossibleArgs, args);
		if (parsedArgs.length >= handlerData.numRequiredArgs) {
			let handler = handlerData.handler;
			let handlerThisObject = {
				sessionId: sessionId,
				user: activeEntity.server.user,
				server: activeEntity.server,
				activeEntity: activeEntity,
				numArgs: parsedArgs.length
			};
			handler.apply(handlerThisObject, parsedArgs);
		} else {
			activeEntity.server.user.showError('Not enough parameters.');
		}
	} else {
		activeEntity.server.requireConnected(function() {
			activeEntity.server.send(command + ' ' + args);
		});
	}
}

function getHandler(numPossibleArgs, numRequiredArgs, handler) {
	let ret = {};
	ret.numPossibleArgs = numPossibleArgs;
	ret.numRequiredArgs = numRequiredArgs;
	ret.handler = handler;
	return ret;
}

function parseArgs(numPossibleArgs, str) {
	let parsedArgs = [];
	while (str.length > 0) {
		if (parsedArgs.length < numPossibleArgs - 1) {
			let spaceIdx = str.indexOf(' ');
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

