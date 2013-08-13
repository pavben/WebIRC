require('./utils.js').installGlobals();

var fs = require('fs-extra');

exports.data = {};

function load(configFilePath, cb) {
	fs.readJson(configFilePath, check(
		function(err) {
			if (err.code === 'ENOENT') {
				cb();
			} else {
				cb(err);
			}
		},
		function(configObj) {
			console.log('Read config', configObj);

			exports.data = configObj;

			cb();
		}
	));
}

exports.load = load;
