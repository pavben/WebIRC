"use strict";

require('./utils.js').installGlobals();

function runTest(master, testId) {
	if (testId === '1') {
		if (master.activeEntity.type === 'channel') {
			master.user.applyStateChange('Join', master.activeEntity.entityId, {
				nick: 'wezirc',
				user: 'user',
				host: 'host'
			});
		} else {
			master.user.showError('Must be used in a channel');
		}
	} else if (testId === '2') {
		if (master.activeEntity.type === 'channel') {
			for (let i of indices(1000)) {
				master.user.applyStateChange('Join', master.activeEntity.entityId, {
					nick: 'u' + i,
					user: 'user',
					host: 'host'
				});
			}
		} else {
			master.user.showError('Must be used in a channel');
		}
	} else if (testId === '3') {
		if (master.activeEntity.type === 'channel') {
			master.user.applyStateChange('Join', master.activeEntity.entityId, {
				nick: 'paulAWAY',
				user: 'user',
				host: 'host',
				type: 'client'
			});

			master.user.applyStateChange('ChatMessage', master.activeEntity.entityId, {
				nick: 'paulAWAY',
				user: 'user',
				host: 'host',
				type: 'client'
			}, 'test message');

			master.user.applyStateChange('NickChange', master.activeEntity.server.entityId, 'paulAWAY', 'paul');
		} else {
			master.user.showError('Must be used in a channel');
		}
	} else if (testId === 'userdupes') {
		if (master.activeEntity.type === 'channel') {
			const channel = master.activeEntity;
			const userlist = channel.userlist.slice(0);
			userlist.sort(function(a, b) {
				if (a.nick < b.nick) {
					return -1;
				} else if (a.nick > b.nick) {
					return 1;
				} else {
					return 0;
				}
			});
			let last = null;
			let numDupes = 0;
			userlist.forEach(function(entry) {
				if (last != null && last == entry.nick) {
					master.user.showInfo('Duplicate nick: ' + entry.nick);
					numDupes++;
				}
				last = entry.nick;
			});
			master.user.showInfo('Dupes: ' + numDupes);
		} else {
			master.user.showError('Must be used in a channel');
		}
	}
}

module.exports.runTest = runTest;
