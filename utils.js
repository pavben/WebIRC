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

exports.isNickname = isNickname;
exports.parseCtcpMessage = parseCtcpMessage;
exports.toCtcp = toCtcp;

