var fs = require('fs');
var winston = require('winston');

var logger = null;

function init(logLevel) {
	if (!isValidLogLevel(logLevel)) {
		logLevel = 'warn';
	}

	var logDir = 'logs';

	// sync is okay as this is on startup
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir);
	}

	var unixTime = Math.floor((new Date()).getTime() / 1000);
	var logPrefix = logDir + '/' + unixTime + '-';

	logger = new winston.Logger({
		transports: [
			new winston.transports.Console({
				level: logLevel
			}),
			new winston.transports.File({
				filename: logPrefix + 'main.log',
				level: logLevel,
				json: false
			})
		],
		exceptionHandlers: [
			new winston.transports.Console(),
			new winston.transports.File({
				filename: logPrefix + 'exceptions.log',
				json: false
			})
		]
	});

	logger.info('Logger initialized with logLevel %s', logLevel)
}

function info() {
	if (logger)
		logger.info.apply(this, arguments);
}

function warn() {
	if (logger)
		logger.warn.apply(this, arguments);
}

function error() {
	if (logger)
		logger.error.apply(this, arguments);
}

function isValidLogLevel(logLevel) {
	return (typeof logLevel === 'string' && ['error', 'warn', 'info'].indexOf(logLevel) >= 0);
}

module.exports.init = init;
module.exports.info = info;
module.exports.warn = warn;
module.exports.error = error;
