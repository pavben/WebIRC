function runTest(master, testId) {
	if (testId === '1') {
		if (master.activeWindow.type === 'channel') {
			var channelOrQuery = master.activeWindow.object;

			master.user.applyStateChange('Join', master.activeWindow.windowPath, {
				nick: 'wezirc',
				user: 'user',
				host: 'host'
			});
		} else {
			master.showError('Must be used in a channel');
		}
	}
}

module.exports.runTest = runTest;
