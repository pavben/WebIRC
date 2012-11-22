var express = require('express');
var app = express();

app.use(express.static(__dirname + '/static'));

app.get('/test', function(req, res) {
	res.end('yep');
});

app.listen(28081);

