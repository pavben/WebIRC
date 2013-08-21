var fs = require('fs');

exports.data = {};

function load(configFilePath, cb) {
	fs.readFile(configFilePath, check(
		function(err) {
			console.log('readFile returned failure!', err);
			if (err.code === 'ENOENT') {
				cb();
			} else {
				cb(err);
			}
		},
		function(data) {
			var configObj = null;
			try {
				configObj = JSON.parse(data);
			} catch(err) {
				cb(err);
			}

			console.log('Read config', configObj);

			exports.data = configObj;

			cb();
		}
	));
}

exports.load = load;
