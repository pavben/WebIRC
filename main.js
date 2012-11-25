var express = require('express');
var app = express();
var http = require('http');
var io = require('socket.io');
var irc = require('./irc.js');

var Config = {
	sessionSecret: 'notsecret',
	sessionKey: 'sid'
}

var sessionStore = new express.session.MemoryStore();

app.configure(function() {
	app.use(express.cookieParser());
	app.use(express.session({
		store: sessionStore,
		secret: Config.sessionSecret,
		maxAge: 24 * 60 * 60,
		key: Config.sessionKey
	}));
	app.use(express.static(__dirname + '/static'));
});

app.get('/test', function(req, res) {
	console.log("Sessions: %j", sessionStore);
	res.end("hey");
});

var server = http.createServer(app);
server.listen(28081);
var sio = io.listen(server);

sio.configure(function() {
	sio.set('authorization', function(data, accept) {
		console.log(data.headers.cookie);
	});
});

irc.blah();

