var webircApp = angular.module('webircApp', []);

webircApp.directive('loginbox', function() {
	return {
		scope: true,
		link: function(scope) {
			scope.login = function() {
				sendToGateway('Login', {
					username: scope.username,
					password: scope.password
				});

				if (window.webkitNotifications && window.webkitNotifications.checkPermission() !== 0) {
					window.webkitNotifications.requestPermission();
				}
			};

			scope.passwordKeyDown = function(event) {
				if (event.keyCode === 13) {
					scope.login();
				}
			}
		}
	};
});

webircApp.directive('focusKey', function($timeout) {
	return {
		link: function(scope, element, attrs) {
			scope.$on('FocusKey', function(e, focusKey) {
				if (focusKey === attrs.focusKey) {
					$timeout(function() {
						element[0].focus();
					});
				}
			});
		}
	};
});

// TODO: this scrolling code needs to be redesigned
webircApp.directive('resizeMaincell', function($rootScope) {
	return {
		controller: function($scope, $element, $timeout) {
			var chatlogDiv = $element[0];

			$scope.delayedScroll = this.delayedScroll = function(force) {
				function doScroll(force) {
					if (chatlogDiv.lastScrollTopTarget && chatlogDiv.scrollTop >= chatlogDiv.lastScrollTopTarget - 30) {
						// if they scroll near the bottom
						chatlogDiv.scrollLock = false;
					}
					else if (chatlogDiv.lastScrollTop && chatlogDiv.scrollTop < chatlogDiv.lastScrollTop) {
						// if the user scrolled up the chat log
						chatlogDiv.scrollLock = true;
					}

					var chatlogDivJQ = $(chatlogDiv);

					var scrollTopTarget = getScrollTopTarget(chatlogDivJQ);

					function getScrollTopTarget(theDiv) {
						// scrollHeight of 0 means the div is out of view, so we check for that case to avoid returning a negative
						if (theDiv[0].scrollHeight > 0) {
							return theDiv[0].scrollHeight // start with the total scroll height
								- theDiv.outerHeight() // subtract (height + padding + border)
								+ parseInt(theDiv.css('border-top-width')) // readd the top border
								+ parseInt(theDiv.css('border-bottom-width')) // readd the bottom border
						} else {
							return 0;
						}
					}

					if (force) {
						chatlogDiv.scrollLock = false;
					}

					if (!chatlogDiv.scrollLock)
					{
						chatlogDiv.scrollTop = scrollTopTarget;
					}

					chatlogDiv.lastScrollTop = chatlogDiv.scrollTop;
					chatlogDiv.lastScrollTopTarget = scrollTopTarget;
				}

				$timeout(doScroll.bind(null, force));
			}

			this.resetScroll = function() {
				//delete chatlogDiv.lastScrollTopTarget;
				delete chatlogDiv.lastScrollTop;
				//delete chatlogDiv.scrollLock;
			}
		},
		link: function(scope, element, attrs) {
			var getResizeParams = function() {
				var bodyOverflowY = 'hidden';

				var maincellHeight = getTargetHeightForMaincell();

				if (maincellHeight < 300) {
					maincellHeight = 300;
					// if the scrollbars are needed, enable them
					bodyOverflowY = 'auto';
				}

				return {maincellHeight: maincellHeight, bodyOverflowY: bodyOverflowY};
			}

			scope.$watch(getResizeParams, function(newVal, oldVal) {
				scope.maincellHeight = newVal.maincellHeight + 'px';
				//scope.bodyOverflowY = newVal.bodyOverflowY;

				scope.delayedScroll();
			}, true);

			if (attrs.resizeMaincell) {
				scope.$watch(attrs.resizeMaincell, function(newVal, oldVal) {
					if (newVal) {
						// if this window is becoming active, scroll to the bottom
						scope.delayedScroll(true);
					}
				}, true);
			}

			angular.element(window).bind('resize orientationchange', function() {
				// we need to rerun getResizeParams on resize
				scope.$apply();
			});
		}
	}
});

webircApp.directive('activitylogentry', function() {
	return {
		require: '^resizeMaincell',
		link: function(scope, element, attrs, resizeMaincellCtrl) {
			if (scope.$last) {
				resizeMaincellCtrl.delayedScroll();
			}

			element.bind('$destroy', function() {
					resizeMaincellCtrl.resetScroll();
			});
		}
	};
});

webircApp.directive('userlist', function() {
	return {
		scope: true,
		link: function(scope) {
			scope.getUserlistNamePrefix = function(userlistEntry) {
				if ('owner' in userlistEntry) {
					return '&';
				} else if ('op' in userlistEntry) {
					return '@';
				} else if ('halfop' in userlistEntry) {
					return '%';
				} else if ('voice' in userlistEntry) {
					return '+';
				} else {
					return '';
				}
			};
		}
	};
});

webircApp.directive('chatbox', function($rootScope) {
	return function(scope, element) {
		var rawElement = element[0];

		var autoComplete = initAutoComplete();

		element.bind('keydown', function(e) {
			if (e.keyCode === 13) { // enter
				var lines = element.val().replace(/\r\n/g, '\n').split('\n').filter(function(line) { return (line.length > 0); });

				if (lines.length > 0) {
					// TODO: put this on $rootScope
					sendToGateway('ChatboxSend', {lines: lines, exec: !e.shiftKey});
				}

				element.val('');

				// TODO: remove this when the auto-growing chatbox stuff is put into a directive
				$(element).change();

				e.preventDefault();
			} else if (e.keyCode === 9) { // tab
				var activeWindow = sc.utils.getWindowByPath(scope.state, scope.state.currentActiveWindow);

				var autoCompleteResult = autoComplete.next(element.val(), rawElement.selectionStart, activeWindow);

				if (autoCompleteResult) {
					element.val(autoCompleteResult.chatboxValue);

					rawElement.selectionStart = rawElement.selectionEnd = autoCompleteResult.cursorPos;
				}

				e.preventDefault();
			} else {
				// any other keypress resets the autocomplete
				autoComplete.reset();
			}
		});

		scope.$watch('state.currentActiveWindow', function(value) {
			$rootScope.$broadcast('FocusKey', 'Chatbox');
		});
	};
});

$(window).bind('load', function() {
	angular.bootstrap(document, ['webircApp']);
});

function initializeAutoGrowingTextArea(chatBox, appendShadowTo, resizeCallback) {
	var shadow = $('<div/>').addClass('chatboxshadow').appendTo(appendShadowTo);

	var checkHeight = function() {
		// manually control scrolling as it causes visual glitches
		chatBox.css('overflow-y', 'hidden');
		shadow.css('width', chatBox.width());

		var previousHeight = chatBox.height();

		var newContentHtml = chatBox.val().replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/&/g, '&amp;')
			.replace(/\n$/, '<br/>.')
			.replace(/\n/g, '<br/>')
			.replace(/ {2,}/g, function(space) { return (new Array(space.length).join('&nbsp;')) + ' '; })
			.replace(/^$/g, '.');

		shadow.html(newContentHtml);

		var targetHeight = shadow.height();
		var minHeight = stripPx(chatBox.css('line-height'));
		if (targetHeight > 150) {
			targetHeight = 150;

			// now scrolling will be needed
			chatBox.css('overflow-y', 'auto');
		} else if (targetHeight < minHeight) {
			targetHeight = minHeight;
		}

		if (targetHeight != previousHeight) {
			chatBox.css('height', targetHeight);
			resizeCallback();
		}
	};
	bindTextChangeEvents(chatBox, checkHeight);

	// call it initially to set the initial height
	checkHeight();
}

function bindTextChangeEvents(field, checkForChangeFunction) {
	field.bind({
		'input': checkForChangeFunction,
		'paste': checkForChangeFunction,
		'keypress': checkForChangeFunction,
		'keydown': checkForChangeFunction,
		'change': checkForChangeFunction
	});
}

function AppCtrl($rootScope, socket) {
	// HACK: Ugly.
	$rootScope.safeApply = function(fn) {
		var phase = this.$root.$$phase;
		if (phase == '$apply' || phase == '$digest') {
			if (typeof(fn) === 'function') {
				fn();
			}
		} else {
			this.$apply();
		}
	};

	// TODO: Can we have this start after page load?
	initializeWebSocketConnection($rootScope, socket);

	// TODO: convert this into a directive
	// initialize the auto-growing chatbox and append the shadow div to the chatboxwrapper
	initializeAutoGrowingTextArea($('#chatbox'), $('#chatboxwrapper'), function() {
		// we need to rerun $scope.getResizeParams on resize
		$rootScope.safeApply();
	});
}

function getTargetHeightForMaincell() {
	var maincellDiv = $('#maincell');
	var chatboxWrapper = $('#chatboxwrapper');
	var outerWrapper = $('#outerwrapper');

	return ($(window).height()
		- maincellDiv.offset().top
		- stripPx(chatboxWrapper.css('margin-top')) // remove the height of the spacer above the chatbox
		- chatboxWrapper.outerHeight() // remove the height of the chatbox wrapper
		- stripPx(outerWrapper.css('padding-bottom'))
	);
}

function stripPx(text) {
	return parseInt(text.replace('px', ''), 10);
}

function arrayRemoveDuplicates(arr) {
	var seen = {};

	return arr.filter(function(el) {
		return seen[el] ? false : (seen[el] = true);
	});
}
