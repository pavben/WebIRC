exports.isNickname = function(name) {
	if (name.match(/^[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]*$/i)) {
		return true;
	} else {
		return false; 
	}
}

exports.parseCtcpMessage = function(str) {
	var match;
	if (match = str.match(/^\u0001([^\s]+)(?: (.+))?\u0001$/)) {
		return {command: match[1].toUpperCase(), args: (typeof match[2] === 'undefined' ? null : match[2])};
	} else {
		return null;
	}
}

exports.toCtcp = function(command, args) {
	var ret = String.fromCharCode(1);

	ret += command.toUpperCase();

	if (typeof args !== 'undefined') {
		ret += ' ' + args;
	}

	ret += String.fromCharCode(1);

	return ret;
}

