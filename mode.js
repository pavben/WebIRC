"use strict";

var ModeType = {
	NONE: 0,
	PLUS_ONLY: 1,
	BOTH: 2
};

function parseChannelModes(modes, args) {
 	var modesWithParams = {};

	modesWithParams['a'] = ModeType.BOTH;
	modesWithParams['b'] = ModeType.BOTH;
	modesWithParams['e'] = ModeType.BOTH;
	modesWithParams['f'] = ModeType.BOTH;
	modesWithParams['h'] = ModeType.BOTH;
	modesWithParams['I'] = ModeType.BOTH;
	modesWithParams['j'] = ModeType.BOTH;
	modesWithParams['k'] = ModeType.BOTH;
	modesWithParams['l'] = ModeType.PLUS_ONLY;
	modesWithParams['L'] = ModeType.BOTH;
	modesWithParams['o'] = ModeType.BOTH;
	modesWithParams['q'] = ModeType.BOTH;
	modesWithParams['v'] = ModeType.BOTH;

	return parseModes(modes, args, modesWithParams);
}

function parseUserModes(modes, args) {
	return parseModes(modes, args, {});
}

function parseModes(modes, args, modesWithParams) {
	var plus = null;

	var parsedModes = [];

	var argIdx = 0;

	for (var i = 0; i < modes.length; i++) {
		var c = modes.charAt(i);

		if (c === '+') {
			plus = true;
		} else if (c === '-') {
			plus = false;
		} else {
			// it's a mode
			if (plus === null) {
				// if we got a mode before a +/-, invalid input
				return null;
			}

			var modeType = ModeType.NONE;
			if (c in modesWithParams) {
				modeType = modesWithParams[c];
			}

			// if this mode requires an arg, grab it
			var arg = null;
			if (modeType === ModeType.BOTH || (modeType === ModeType.PLUS_ONLY && plus)) {
				if (argIdx < args.length) {
					arg = args[argIdx++];
				} else {
					return null; // not enough args
				}
			}

			parsedModes.push({mode: c, plus: plus, arg: arg});
		}
	}

	return parsedModes;
}

function getUserlistEntryAttributeByMode(mode) {
	switch (mode) {
		case 'q':
			return 'owner';
		case 'a':
			return 'admin';
		case 'o':
			return 'op';
		case 'h':
			return 'halfop';
		case 'v':
			return 'voice';
		default:
			return null;
	}
}

module.exports.parseChannelModes = parseChannelModes;
module.exports.parseUserModes = parseUserModes;
module.exports.getUserlistEntryAttributeByMode = getUserlistEntryAttributeByMode;

