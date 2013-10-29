function runTest(master, testId) {
	if (testId === '1') {
		if (master.activeWindow.type === 'channel') {
			master.user.applyStateChange('Join', master.activeWindow.windowPath, {
				nick: 'wezirc',
				user: 'user',
				host: 'host'
			});
		} else {
			master.user.showError('Must be used in a channel');
		}
	} else if (testId === '2') {
		if (master.activeWindow.type === 'channel') {
			for (var i = 0; i < 1000; i++) {
				master.user.applyStateChange('Join', master.activeWindow.windowPath, {
					nick: 'u' + i,
					user: 'user',
					host: 'host'
				});
			}
		} else {
			master.user.showError('Must be used in a channel');
		}
	} else if (testId === '3') {
		if (master.activeWindow.type === 'channel') {
			master.user.applyStateChange('Join', master.activeWindow.windowPath, {
				nick: 'paulAWAY',
				user: 'user',
				host: 'host',
				type: 'client'
			});

			master.user.applyStateChange('ChatMessage', master.activeWindow.windowPath, {
				nick: 'paulAWAY',
				user: 'user',
				host: 'host',
				type: 'client'
			}, 'test message');

			master.user.applyStateChange('NickChange', master.activeWindow.windowPath.serverIdx, 'paulAWAY', 'paul');
		} else {
			master.user.showError('Must be used in a channel');
		}
	} else if (testId === 'userdupes') {
		if (master.activeWindow.type === 'channel') {
			var channel = master.activeWindow.object;

			var userlist = channel.userlist.slice(0);

			userlist.sort(function(a, b) {
				if (a.nick < b.nick) {
					return -1;
				} else if (a.nick > b.nick) {
					return 1;
				} else {
					return 0;
				}
			});

			var last = null;
			var numDupes = 0;

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
