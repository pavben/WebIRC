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
				.add(['userId'], function(userId, cb) {
					userId.should.equal(3);

					cb();
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
				.add(['groupId'], function(groupId) {
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
				.add(['groupId'], function(groupId) {
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

		it('same dep used in multiple places', function(cb) {
			async()
				.add('userId', function() {
					return 3;
				})
				.add(['userId'], function(userId) {
					userId.should.equal(3);
				})
				.add(['userId'], function(userId) {
					userId.should.equal(3);
				})
				.run(function(err) {
					(err === undefined).should.be.ok;

					cb();
				});
		});

		it('valueless dependencies', function(cb) {
			async()
				.add('userId', function() {
					return 3;
				})
				.add('startServer', function(cb) {
					cb();
				})
				.add('groupId', function() {
					return 7;
				})
				.add(['@startServer', 'userId', 'groupId'], function(userId, groupId) {
					userId.should.equal(3);
					groupId.should.equal(7);
				})
				.add(['userId', '@startServer', 'groupId'], function(userId, groupId) {
					userId.should.equal(3);
					groupId.should.equal(7);
				})
				.add(['userId', 'groupId', '@startServer'], function(userId, groupId) {
					userId.should.equal(3);
					groupId.should.equal(7);
				})
				.add(['@startServer', 'userId', 'groupId'], function(userId, groupId, cb) {
					userId.should.equal(3);
					groupId.should.equal(7);

					cb();
				})
				.add(['userId', '@startServer', 'groupId'], function(userId, groupId, cb) {
					userId.should.equal(3);
					groupId.should.equal(7);

					cb();
				})
				.add(['userId', 'groupId', '@startServer'], function(userId, groupId, cb) {
					userId.should.equal(3);
					groupId.should.equal(7);

					cb();
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
				.add(['userId'], function(userId) {
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
				.add(['groupId'], function(groupId) {
					false.should.be.ok; // must not be run
				})
				.run(function(err) {
					err.should.be.ok;

					cb();
				});
		});
	});

	describe('improper usage', function() {
		it('nonexistent dependency', function(cb) {
			try {
				async()
					.add('userId', function() {
						return 3;
					})
					.add(['randomDep'], function(randomDep) {
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
					.add(['userId', 'userId'], function(userId, userId) {
					})
					.run(function() {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/listed multiple times/);

				cb();
			}
		});

		it('too many params listed', function(cb) {
			try {
				async()
					.add('userId', function() {
						return 3;
					})
					.add(['userId'], function(userId, groupId, level) {
					})
					.run(function(err) {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/3 params, but only 1 dependencies/);

				cb();
			}
		});

		it('too many deps listed', function(cb) {
			try {
				async()
					.add('userId', function() {
						return 3;
					})
					.add('groupId', function() {
						return 7;
					})
					.add('level', function() {
						return 1;
					})
					.add(['userId', 'groupId', 'level'], function(userId) {
					})
					.run(function(err) {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/1 params while there are 3 dependencies/);

				cb();
			}
		});

		it('empty block name', function(cb) {
			try {
				async()
					.add('', function() {
						return 3;
					})
					.run(function() {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/invalid block name/);

				cb();
			}
		});

		it('reserved block prefix', function(cb) {
			try {
				async()
					.add('@userId', function() {
						return 3;
					})
					.run(function() {
						false.should.be.ok;
					});
			} catch (err) {
				err.message.should.match(/invalid block name/);

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
