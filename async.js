"use strict";

var assert = require('assert');

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

function AsyncTracker() {
	this.provides = {};
	this.deps = {};
	this.runQueue = [];
	this.runCb = null;
	this.tasksRemaining = 0;
}

AsyncTracker.prototype = {
	add: function() {
		var addArgs = arguments;
		var provides = null;
		var depsList = [];
		var func = null;

		if (addArgs.length >= 1) {
			func = Array.prototype.pop.call(addArgs);

			assert(typeof func === 'function');
		}

		var readProvidesAndDeps = function() {
			if (addArgs.length >= 1) {
				var val = Array.prototype.pop.call(addArgs);

				if (typeof val === 'string') {
					assert(provides === null);

					provides = val;
				} else if (Array.isArray(val)) {
					assert(depsList.length === 0);

					depsList = val;
				}

				readProvidesAndDeps();
			}
		}

		readProvidesAndDeps();

		var asyncBlock = new AsyncBlock(this, provides, depsList, func);

		this._addBlock(asyncBlock);

		return this;
	},
	run: function(cb) {
		this.runCb = (cb ? runOnce(cb) : function() {});

		this.runQueue.forEach(function(asyncBlock) {
			asyncBlock.runIfSatisfied();
		});
	},
	_addBlock: function(asyncBlock) {
		var self = this;

		// provides
		if (asyncBlock.provides !== null) {
			if (asyncBlock.provides in this.provides) {
				throw new Error('async: value provided (' + asyncBlock.provides + ') is already provided by another block.');
			} else {
				this.provides[asyncBlock.provides] = asyncBlock;
			}
		}

		// deps
		Object.keys(asyncBlock.deps).forEach(function(dep) {
			if (dep in self.deps) {
				self.deps[dep].push(asyncBlock);
			} else {
				self.deps[dep] = [asyncBlock];
			}
		});

		// runQueue
		this.runQueue.push(asyncBlock);

		this.tasksRemaining++;
	},
	_taskFinished: function(depProvided) {
		if (depProvided !== null) {
			if (depProvided in this.deps) {
				this.deps[depProvided].forEach(function(targetBlock) {
					targetBlock.depProvided(depProvided);
				});
			} else {
				console.warn('async: value provided (' + depProvided + ') is not depended on.');
			}
		}

		this.tasksRemaining--;

		if (this.tasksRemaining === 0) {
			this.runCb();
		}
	},
	_onError: function(err) {
		this.runCb(err);
	}
};

function AsyncBlock(tracker, provides, rawDepsList, func) {
	if (provides !== null) {
		if (provides.length == 0 || provides[0] === '@') {
			throw new Error('async: "' + provides + '" is an invalid block name.');
		}
	}

	this.tracker = tracker;
	this.provides = provides;
	this.func = func;

	this.providedValue = undefined;
	this.depsForParams = [];
	this.deps = {};
	this.depsRemaining = 0;
	this._addDeps(rawDepsList);
	this.triggered = false;
}

AsyncBlock.prototype = {
	_addDeps: function(rawDepsList) {
		function parseParam(param) {
			var resultNeeded = true;

			if (param.length > 0 && param[0] === '@') {
				resultNeeded = false;

				param = param.slice(1);
			}

			return {
				resultNeeded: resultNeeded,
				param: param
			}
		}

		var self = this;

		rawDepsList.forEach(function(param) {
			var parseResult = parseParam(param);

			if (parseResult.param in self.deps) {
				throw new Error('async: dependency (' + parseResult.param + ') is listed multiple times.');
			}

			if (parseResult.param in self.tracker.provides) {
				self.deps[parseResult.param] = false; // false = result not yet available

				if (parseResult.resultNeeded) {
					self.depsForParams.push(self.tracker.provides[parseResult.param]);
				}

				self.depsRemaining++;
			} else {
				throw new Error('async: dependency (' + parseResult.param + ') is not provided by any earlier blocks.');
			}
		});

		if (this.func.length > this.depsForParams.length + 1) {
			throw new Error('async: function has ' + this.func.length + ' params, but only ' + this.depsForParams.length + ' dependencies.');
		} else if (this.func.length < this.depsForParams.length) {
			throw new Error('async: function has ' + this.func.length + ' params while there are ' + this.depsForParams.length + ' dependencies.');
		}
	},
	depProvided: function(dep) {
		if (dep in this.deps) {
			// ensure that depProvided is only called once for each dependency
			assert(!this.deps[dep]);

			this.deps[dep] = true;
			this.depsRemaining--;

			if (this.depsRemaining === 0) {
				this.runIfSatisfied();
			}
		}
	},
	runIfSatisfied: function() {
		var self = this;

		if (this.triggered) {
			return;
		}

		if (this.depsRemaining === 0) {
			this.triggered = true;

			var args = this.depsForParams.map(function(depAsyncBlock) {
				return depAsyncBlock.providedValue;
			});

			var funcAsync = (this.func.length == this.depsForParams.length + 1);

			var handleResult = function(err) {
				if (err) {
					self.tracker._onError(err);
				} else {
					if (arguments.length >= 2) {
						self.providedValue = arguments[1];
					}

					self.tracker._taskFinished(self.provides);
				}
			};

			if (funcAsync) {
				args.push(runOnceOrThrow(handleResult));
			}

			var funcRet;
			var handleResultOnce = runOnce(handleResult);

			try {
				funcRet = this.func.apply(this.func, args);
			} catch(err) {
				handleResultOnce(err);
			}

			if (!funcAsync) {
				handleResultOnce(null, funcRet);
			}
		}
	}
};

function runOnce(cb) {
	var ran = false;
	var self = this;

	return function() {
		if (!ran) {
			ran = true;

			cb.apply(self, arguments);
		}
	};
}

function runOnceOrThrow(cb) {
	var ran = false;
	var self = this;

	return function() {
		if (ran) {
			throw new Error('async: double-callback detected');
		}

		ran = true;

		cb.apply(self, arguments);
	};
}

function async() {
	return new AsyncTracker();
}

async.map = map;

module.exports = async;
