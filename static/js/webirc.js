var webircApp = angular.module('webircApp', []);

webircApp.directive('loginbox', function($rootScope) {
	return {
		scope: true,
		link: function(scope) {
			scope.login = function() {
				$rootScope.sendToGateway('Login', {
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

webircApp.directive('chatlog', function() {
	return {
		restrict: 'E',
		require: '^resizeMaincell',
		compile: function(element, attr, linker) {
			return function($scope, $element, $attr, resizeMaincellCtrl) {
				var lastLen = 0;

				$scope.$watchCollection($attr.activityLog, function(activityLog) {
					if (activityLog.length > lastLen) {
						// get only the newly-added entries
						var newEntries = activityLog.slice(lastLen);

						// and append them
						newEntries.forEach(function(activity) {
							$element.append(elementFromActivity(activity));
						});

						resizeMaincellCtrl.delayedScroll();
					} else {
						// some elements were removed
						// this won't happen often, so we can be lazy and re-generate the entire chatlog
						$element.children().remove();

						activityLog.forEach(function(activity) {
							$element.append(elementFromActivity(activity));
						});

						resizeMaincellCtrl.resetScroll();
					}

					lastLen = activityLog.length;
				});
			}
		}
	};

	function elementFromActivity(activity) {
		var originNickOrName = sc.utils.originNickOrName;

		switch (activity.type) {
			case 'ActionMessage':
				return basicText('activity_action', '* ' + originNickOrName(activity.origin) + ' ' + activity.text);
			case 'ChatMessage':
				return basicText('activity', '<' + originNickOrName(activity.origin) + '> ' + activity.text);
			case 'Error':
				return basicText('activity_error', '* ' + activity.text);
			case 'Info':
				return basicText('activity_info', '* ' + activity.text);
			case 'Join':
				return basicText('activity_info', '* Join: ' + activity.who.nick + ' (' + activity.who.user + '@' + activity.who.host + ')');
			case 'Kick':
				var msg = '* ' + activity.targetNick + ' was kicked by ' + originNickOrName(activity.origin);

				if (activity.kickMessage) {
					msg += ' (' + activity.kickMessage + ')';
				}
				return basicText('activity_kick', msg);
			case 'KickMe':
				var msg = '* You were kicked by ' + originNickOrName(activity.origin);

				if (activity.kickMessage) {
					msg += ' (' + activity.kickMessage + ')';
				}
				return basicText('activity_kick', msg);
			case 'ModeChange':
				return basicText('activity_info', '* ' + originNickOrName(activity.origin) + ' sets mode: ' + activity.modes + ' ' + activity.modeArgs.join(' '));
			case 'MyActionMessage':
				return basicText('activity_action', '* ' + activity.nick + ' ' + activity.text);
			case 'MyChatMessage':
				return basicText('activity_mychat', '<' + activity.nick + '> ' + activity.text);
			case 'NickChange':
				return basicText('activity_info', '* ' + activity.oldNickname + ' is now known as ' + activity.newNickname);
			case 'Notice':
				return basicText('activity_notice', '* Notice from ' + originNickOrName(activity.origin) + ': ' + activity.text);
			case 'Part':
				return basicText('activity_info', '* Part: ' + activity.who.nick + ' (' + activity.who.user + '@' + activity.who.host + ')');
			case 'Quit':
				var msg = '* Quit: ' + activity.who.nick + ' (' + activity.who.user + '@' + activity.who.host + ')';

				if (activity.quitMessage) {
					msg += ' (' + activity.quitMessage + ')';
				}
				return basicText('activity_info', msg);
			case 'Text':
				return basicText('activity', activity.text);
			default:
				return basicText('activity', '*** Unsupported activit type: ' + activity.type);
		}

		function basicText(className, text) {
			return angular.element('<div/>').addClass(className).text(text);
		}
	}
});

webircApp.directive('userlist', function() {
	return {
		scope: true,
		link: function(scope) {
			scope.getUserlistNamePrefix = function(userlistEntry) {
				if ('owner' in userlistEntry) {
					return '~';
				} else if ('admin' in userlistEntry) {
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
		element.bind('keydown', function(e) {
			if (e.keyCode === 13) { // enter
				var lines = element.val().replace(/\r\n/g, '\n').split('\n').filter(function(line) { return (line.length > 0); });

				if (lines.length > 0) {
					$rootScope.sendToGateway('ChatboxSend', {lines: lines, exec: !e.shiftKey});
				}

				element.val('');

				e.preventDefault();
			}
		});

		$rootScope.$watch('state.currentActiveWindow', function(value) {
			$rootScope.$broadcast('FocusKey', 'Chatbox');
		});
	};
});

webircApp.directive('chatboxAutocomplete', function($rootScope) {
	return function(scope, element) {
		var rawElement = element[0];

		var autoComplete = initAutoComplete();

		element.bind('keydown', function(e) {
			if (e.keyCode === 9) { // tab
				var activeWindow = sc.utils.getWindowByPath($rootScope.state, $rootScope.state.currentActiveWindow);

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
	};
});

webircApp.directive('chatboxAutogrow', function($rootScope, $timeout) {
	return function(scope, element) {
		var shadow = angular.element('<div/>').addClass('chatboxshadow');

		// append the shadow to the chatbox's parent (chatboxwrapper)
		element.parent().append(shadow);

		var chatBox = $(element);

		var checkHeight = function() {
			// manually control scrolling as it causes visual glitches
			chatBox.css('overflow-y', 'hidden');

			shadow.css('width', chatBox.width() + 'px');

			var previousHeight = chatBox.height();

			var newContentHtml = chatBox.val().replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/&/g, '&amp;')
				.replace(/\n$/, '<br/>.')
				.replace(/\n/g, '<br/>')
				.replace(/ {2,}/g, function(space) { return (new Array(space.length).join('&nbsp;')) + ' '; })
				.replace(/^$/g, '.');

			shadow.html(newContentHtml);

			var targetHeight = $(shadow).height();
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
				$rootScope.$apply();
			}
		};
		element.bind('input paste keypress keydown change', checkHeight);

		// call it initially to set the initial height
		$timeout(function() {
			checkHeight();
		});
	};
});

function AppCtrl($rootScope, socketFactory) {
	initializeSocketConnection($rootScope, socketFactory);
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
