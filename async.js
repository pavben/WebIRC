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
		var provides = null;
		var func = null;
		var funcAsync = false;

		if (arguments.length >= 1) {
			func = Array.prototype.pop.call(arguments);
		}

		if (arguments.length >= 1) {
			provides = Array.prototype.pop.call(arguments);
		}

		var asyncBlock = new AsyncBlock(this, provides, func);

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
				self.deps[dep].append(asyncBlock);
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

function AsyncBlock(tracker, provides, func) {
	this.tracker = tracker;
	this.provides = provides;
	this.func = func;

	this.providedValue = undefined;
	this.depsList = [];
	this.deps = {};
	this.funcAsync = false; // default to false unless we see a callback param
	this.depsRemaining = 0;
	this._addDeps(getParamNames(func));
	this.triggered = false;
}

AsyncBlock.prototype = {
	_addDeps: function(params) {
		var self = this;

		params.forEach(function(param) {
			if (param in self.deps) {
				throw new Error('async: dependency (' + param + ') is listed multiple times.');
			}

			// special case: recognize the 'cb' param at the end for async functions
			if (param === 'cb') {
				if (!self.funcAsync) {
					self.funcAsync = true;
				} else {
					throw new Error('async: callback listed multiple times in function arguments');
				}
				return; // move on to the next param
			}

			if (self.funcAsync) {
				throw new Error('async: callback must be the last argument');
			}

			if (param in self.tracker.provides) {
				self.deps[param] = false; // false = result not yet available
				self.depsList.push(self.tracker.provides[param]);
				self.depsRemaining++;
			} else {
				throw new Error('async: dependency (' + param + ') is not provided by any earlier blocks.');
			}
		});
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

			var args = this.depsList.map(function(depAsyncBlock) {
				return depAsyncBlock.providedValue;
			});

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

			if (this.funcAsync) {
				args.push(runOnceOrThrow(handleResult));
			}

			var funcRet;
			var handleResultOnce = runOnce(handleResult);

			try {
				funcRet = this.func.apply(this.func, args);
			} catch(err) {
				handleResultOnce(err);
			}

			if (!this.funcAsync) {
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

function getParamNames(func) {
	var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
	var fnStr = func.toString().replace(STRIP_COMMENTS, '');
	var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(/([^\s,]+)/g);

	if (result === null) {
		result = [];
	}

	return result;
}

async.map = map;

module.exports = async;
