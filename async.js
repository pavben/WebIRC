"use strict";

// TODO: look into handling exceptions
function map(list, f, cb) {
	var nextIndex = 0;
	var results = [];

	var next = function() {
		if (nextIndex < list.length) {
			f(list[nextIndex++], function(err, res) {
				if (err) {
					process.nextTick(cb.bind(null, err));
				} else {
					results.push(res);
					process.nextTick(next);
				}
			});
		} else {
			process.nextTick(cb.bind(null, null, results));
		}
	};

	next();
}

exports.map = map;
