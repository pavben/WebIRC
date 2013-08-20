function installGlobals() {
	var globalFunctions = {
		check: function(errorHandler, okHandler) {
			return function(err, val) {
				if (!err) {
					okHandler.call(global, val);
				} else {
					errorHandler.call(global, err);
				}
			}
		}
	};

	Object.keys(globalFunctions).forEach(function(functionName) {
		global[functionName] = globalFunctions[functionName];
	});
}

function isNickname(name) {
	if (name.match(/^[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]*$/i)) {
		return true;
	} else {
		return false;
	}
}

function parseCtcpMessage(str) {
	var match;
	if (match = str.match(/^\u0001([^\s]+)(?: (.+))?\u0001$/)) {
		return {command: match[1].toUpperCase(), args: (typeof match[2] === 'undefined' ? null : match[2])};
	} else {
		return null;
	}
}

function toCtcp(command, args) {
	var ret = String.fromCharCode(1);

	ret += command.toUpperCase();

	if (typeof args !== 'undefined') {
		ret += ' ' + args;
	}

	ret += String.fromCharCode(1);

	return ret;
}


// note: we only validate the nick!user@host format and not what characters can or cannot be in each
// on failure to match, we assume str is a server origin
function parseOrigin(str) {
	var match;
	if (match = str.match(/^([^!]+?)!([^@]+?)@(.+?)$/)) {
		return new ClientOrigin(match[1], match[2], match[3]);
	} else {
		return new ServerOrigin(str);
	}
}

// Possible channel types: & # + ! . ~
function parseTarget(str) {
	if (str.match(/^[#&+.~][^\s]{1,99}|![A-Z0-5]{5}[^\s]{1,94}$/)) {
		return new ChannelTarget(str);
	} else if (str.match(/^[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]*$/i)) { // http://stackoverflow.com/questions/5163255/regular-expression-to-match-irc-nickname
		return new ClientTarget(str);
	} else {
		return null;
	}
}

function withParsedTarget(targetName, successCallback, failureCallback) {
	var maybeTarget = parseTarget(targetName);

	if (maybeTarget instanceof ChannelTarget ||
		maybeTarget instanceof ClientTarget) {
		successCallback(maybeTarget);
	} else {
		failureCallback();
	}
}

exports.installGlobals = installGlobals;
exports.isNickname = isNickname;
exports.parseCtcpMessage = parseCtcpMessage;
exports.toCtcp = toCtcp;
exports.parseOrigin = parseOrigin;
exports.parseTarget = parseTarget;
exports.withParsedTarget = withParsedTarget;
