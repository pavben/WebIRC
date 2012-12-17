function isNickname(name) {
	if (name.match(/^[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]*$/i)) {
		return true;
	} else {
		return false; 
	}
}

exports.isNickname = isNickname;

