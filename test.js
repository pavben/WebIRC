function runTest(master, testId) {
	if (testId === '1') {
		if (master.activeWindow.type === 'channel') {
			master.user.applyStateChange('Join', master.activeWindow.windowPath, {
				nick: 'wezirc',
				user: 'user',
				host: 'host'
			});
		} else {
			master.showError('Must be used in a channel');
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
			master.showError('Must be used in a channel');
		}
	}
}

module.exports.runTest = runTest;
