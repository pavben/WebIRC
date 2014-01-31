var async = require('./../async.js');
var domain = require('domain');
var should = require('should');

describe('basic', function() {
	describe('basic', function() {
		it('sync', function(cb) {
			async()
				.add('userId', function() {
					return 3;
				})
				.add(function(userId) {
					userId.should.equal(3);
				})
				.run(function(err) {
					(err === undefined).should.be.ok;

					cb();
				});
		});

		it('instant cb', function(cb) {
			async()
				.add('groupId', function(cb) {
					cb(null, 7);
				})
				.add(function(groupId) {
					groupId.should.equal(7);
				})
				.run(function(err) {
					(err === undefined).should.be.ok;

					cb();
				});
		});

		it('async', function(cb) {
			async()
				.add('groupId', function(cb) {
					process.nextTick(function() {
						cb(null, 7);
					});
				})
				.add(function(groupId) {
					groupId.should.equal(7);
				})
				.run(function(err) {
					(err === undefined).should.be.ok;

					cb();
				});
		});

		it('unused block name', function(cb) {
			async()
				.add('userId', function() {
					return 3;
				})
				.run(function(err) {
					(err === undefined).should.be.ok;

					cb();
				});
		});
	});

	describe('raised exceptions', function() {
		it('sync throw', function(cb) {
			async()
				.add('userId', function() {
					throw new Error();
				})
				.add(function(userId) {
					false.should.be.ok; // must not be run
				})
				.run(function(err) {
					err.should.be.ok;

					cb();
				});
		});

		it('async throw', function(cb) {
			async()
				.add('groupId', function(cb) {
					throw new Error();
				})
				.add(function(groupId) {
					false.should.be.ok; // must not be run
				})
				.run(function(err) {
					err.should.be.ok;

					cb();
				});
		});
	});

	describe.only('improper usage', function() {
		it('nonexistent dependency', function(cb) {
			try {
				async()
					.add('userId', function() {
						return 3;
					})
					.add(function(randomDep) {
					})
					.run(function() {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/not provided by/);

				cb();
			}
		});

		it('duplicate dependency', function(cb) {
			try {
				async()
					.add('userId', function() {
						return 3;
					})
					.add(function(userId, userId) {
					})
					.run(function() {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/listed multiple times/);

				cb();
			}
		});

		it('callback out of order', function(cb) {
			try {
				async()
					.add('userId', function() {
						return 3;
					})
					.add(function(cb, userId) {
					})
					.run(function() {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/must be the last argument/);

				cb();
			}
		});

		it('callback listed twice', function(cb) {
			try {
				async()
					.add(function(cb, cb) {
					})
					.run(function() {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/callback listed multiple times/);

				cb();
			}
		});

		it('double-callback before completion', function(cb) {
			var d = domain.create();

			d.on('error', function(err) {
				d.exit();

				err.message.should.match(/double-callback/);

				cb();
			});

			d.run(function() {
				async()
					.add(function(cb) {
						cb();

						setTimeout(cb, 1);
					})
					.add(function(cb) {
						setTimeout(cb, 50); // give it enough time so that the double-callback happens before the .run cb
					})
					.run(function(err) {
						false.should.be.ok; // double-callback error should happen before this and abort
					});
			});
		});

		it('double-callback after completion', function(cb) {
			var d = domain.create();
			var runCbCalled = false;

			d.on('error', function(err) {
				d.exit();

				err.message.should.match(/double-callback/);

				runCbCalled.should.be.ok;

				cb();
			});

			d.run(function() {
				async()
					.add(function(cb) {
						cb();

						setTimeout(cb, 20);
					})
					.run(function(err) {
						runCbCalled = true;
					});
			});
		});
	});
});
