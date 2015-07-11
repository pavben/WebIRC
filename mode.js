"use strict";

const ModeArgumentPresence = {
	NONE: 0,
	PLUS_ONLY: 1,
	BOTH: 2
};

function parseChannelModes(modes, args) {
 	const modeToPresence = new Map();
	modeToPresence.set('a', ModeArgumentPresence.BOTH);
	modeToPresence.set('b', ModeArgumentPresence.BOTH);
	modeToPresence.set('e', ModeArgumentPresence.BOTH);
	modeToPresence.set('f', ModeArgumentPresence.BOTH);
	modeToPresence.set('h', ModeArgumentPresence.BOTH);
	modeToPresence.set('I', ModeArgumentPresence.BOTH);
	modeToPresence.set('j', ModeArgumentPresence.BOTH);
	modeToPresence.set('k', ModeArgumentPresence.BOTH);
	modeToPresence.set('l', ModeArgumentPresence.PLUS_ONLY);
	modeToPresence.set('L', ModeArgumentPresence.BOTH);
	modeToPresence.set('o', ModeArgumentPresence.BOTH);
	modeToPresence.set('q', ModeArgumentPresence.BOTH);
	modeToPresence.set('v', ModeArgumentPresence.BOTH);
	return parseModes(modes, args, modeToPresence);
}

function parseUserModes(modes, args) {
	return parseModes(modes, args, new Map());
}

function parseModes(modes, args, modeToPresence) {
	let plus = null;
	const parsedModes = [];
	const argsIter = args[Symbol.iterator]();
	for (let c of modes) {
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
			const modeType = modeToPresence.has(c) ? modeToPresence.get(c) : ModeArgumentPresence.NONE;
			// if this mode has an arg, grab it
			let arg = null;
			if (modeType === ModeArgumentPresence.BOTH || (modeType === ModeArgumentPresence.PLUS_ONLY && plus)) {
				const nextArg = argsIter.next();
				if (!nextArg.done) {
					arg = nextArg.value;
				} else {
					return null; // not enough args
				}
			}
			parsedModes.push({
				mode: c,
				plus: plus,
				arg: arg
			});
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

