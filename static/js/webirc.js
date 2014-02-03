"use strict";

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
				delete chatlogDiv.lastScrollTop;
			}
		},
		link: function(scope, element, attrs) {
			var getResizeParams = function() {
				var bodyOverflowY = 'hidden';

				var maincellHeight = getTargetHeightForMaincell(scope.chatboxHeight);

				if (!maincellHeight) {
					maincellHeight = 0;
				}

				if (maincellHeight < 300) {
					maincellHeight = 300;
					// if the scrollbars are needed, enable them
					bodyOverflowY = 'auto';
				}

				return {maincellHeight: maincellHeight, bodyOverflowY: bodyOverflowY};
			}

			scope.$watch(getResizeParams, function(newVal) {
				scope.maincellHeight = newVal.maincellHeight + 'px';

				scope.delayedScroll();
			}, true);

			var entity = scope.$eval(attrs.resizeMaincell);

			$rootScope.$watch('state.activeEntityId', function(newActiveEntityId) {
				if (newActiveEntityId === entity.entityId) {
					// if this window is becoming active, scroll to the bottom
					scope.delayedScroll(true);
				}
			}, true);

			angular.element(window).bind('resize orientationchange', function() {
				// we need to rerun getResizeParams on resize
				scope.$apply();
			});
		}
	}
});

webircApp.directive('addserverbutton', function($rootScope) {
	return {
		compile: function(element, attr) {
			return function($scope, $element, $attr) {
				var trElement = angular.element('<div/>').addClass('tablerow');
				var maincellElement = angular.element('<div/>').addClass('addserverbutton_maincell');
				var rightcellElement = angular.element('<div/>').addClass('sidebutton_rightcell');

				trElement.append(maincellElement);
				trElement.append(rightcellElement);

				$element.append(trElement);

				$scope.$watch($attr.hoverLabel, function(newHoverLabel) {
					if (typeof newHoverLabel === 'string') {
						rightcellElement[0].title = newHoverLabel;
					}
				}, true);

				var eventInner = angular.element('<div/>').addClass('sidebutton_rightinner_addserver');

				rightcellElement.append(eventInner);

				rightcellElement.on('mousedown', function() {
					$scope.requestAddServer();
				});
			}
		}
	}
});

webircApp.directive('windowbutton', function($rootScope) {
	return {
		compile: function(element, attr) {
			return function($scope, $element, $attr) {
				var alertCount = 0;
				var eventCount = 0;
				var entityId = null;
				var isCurrent = false;
				var updateView = null;

				// the elements
				var trElement = angular.element('<div/>').addClass('tablerow');
				var maincellElement = angular.element('<div/>').addClass('windowbutton_maincell');
				var rightcellElement = angular.element('<div/>').addClass('sidebutton_rightcell');

				trElement.append(maincellElement);
				trElement.append(rightcellElement);

				$element.append(trElement);

				// attributes
				var label = null;
				var altLabel = '';

				var updateLabel = function() {
					maincellElement.removeClass('windowbutton_alttitle');

					if (!label) {
						maincellElement.addClass('windowbutton_alttitle');
					}

					maincellElement.text(label || altLabel);
				}

				$scope.$watch($attr.label, function(newLabel) {
					if (typeof newLabel === 'string' && newLabel.length > 0) {
						label = newLabel;
					} else {
						label = null;
					}

					updateLabel();
				}, true);

				if ('altLabel' in $attr) {
					$scope.$watch($attr.altLabel, function(newAltLabel) {
						altLabel = newAltLabel;

						updateLabel();
					}, true);
				}

				$scope.$watch($attr.hoverLabel, function(newHoverLabel) {
					if (typeof newHoverLabel === 'string') {
						$element[0].title = newHoverLabel;
					}
				}, true);

				$scope.$watch($attr.entity + '.entityId', function(newEntityId) {
					entityId = newEntityId;

					updateView();
				});

				maincellElement.on('mousedown', function() {
					$scope.requestSetActiveEntity(entityId);
				});

				rightcellElement.on('mousedown', function() {
					if (isCurrent) {
						// if current, the right cell contains the close button
						$scope.requestCloseWindow(entityId);
					} else {
						// otherwise treat it the same as clicking on the label
						$scope.requestSetActiveEntity(entityId);
					}
				});

				$scope.$watch($attr.entity + '.numEvents', function(newEventCount) {
					eventCount = newEventCount;

					updateView();
				});

				$scope.$watch($attr.entity + '.numAlerts', function(newAlertCount) {
					alertCount = newAlertCount;

					updateView();
				});

				$rootScope.$watch('state.activeEntityId', function(newActiveEntityId) {
					isCurrent = (entityId === newActiveEntityId);

					updateView();
				});

				updateView = function() {
					$element.removeClass('windowbutton_current');

					rightcellElement.children().remove();

					if (isCurrent) {
						$element.addClass('windowbutton_current');
					}

					if (isCurrent) {
						var closeInner = angular.element('<div/>').addClass('sidebutton_rightinner_close');

						rightcellElement.append(closeInner);
					} else if (alertCount > 0) {
						var alertInner = angular.element('<div/>').addClass('sidebutton_rightinner_alert');

						alertInner.text(alertCount < 10 ? alertCount : '9+');

						rightcellElement.append(alertInner);
					} else if (eventCount > 0) {
						var eventInner = angular.element('<div/>').addClass('sidebutton_rightinner_event');

						eventInner.text(eventCount < 10 ? eventCount : '9+');

						rightcellElement.append(eventInner);
					}
				}

				updateView();
			}
		}
	}
});

webircApp.directive('chatlog', function() {
	return {
		restrict: 'E',
		require: '^resizeMaincell',
		compile: function(element, attr) {
			return function($scope, $element, $attr, resizeMaincellCtrl) {
				var server = null;

				$scope.$watch($attr.server, function(newServer) {
					server = newServer;
				});

				var lastLen = 0;

				$scope.$watchCollection($attr.activityLog, function(activityLog) {
					function convertLinksForDomTreeAng(root, server) {
						convertLinksForDomTree(root[0], server);

						return root;
					}

					function appendActivities(activities) {
						activities.forEach(function(activity) {
							$element.append(convertLinksForDomTreeAng(elementFromActivity(activity), server));
						});
					}

					if (activityLog.length > lastLen) {
						// get only the newly-added entries
						var newEntries = activityLog.slice(lastLen);

						// and append them
						appendActivities(newEntries);

						resizeMaincellCtrl.delayedScroll();
					} else {
						// some elements were removed
						// this won't happen often, so we can be lazy and re-generate the entire chatlog
						$element.children().remove();

						appendActivities(activityLog);

						resizeMaincellCtrl.resetScroll();
					}

					lastLen = activityLog.length;
				});
			}
		}
	};

	function elementFromActivity(activity) {
		var innerSpan = elementFromActivityNoTime(activity);

		innerSpan[0].title = moment(activity.time * 1000).calendar();

		return angular.element('<div />').append(innerSpan);
	}

	function elementFromActivityNoTime(activity) {
		var originNickOrName = sc.utils.originNickOrName;

		var activityHandlers = {
			'ActionMessage': function(activity) {
				var className = 'activity';

				if (activity.mentionMe) {
					className = 'activity_mentionme';
				}

				return basicText(className, '* ' + originNickOrName(activity.origin) + ' ' + activity.text);
			},
			'ChannelNotice': function(activity) {
				return basicText('activity_notice', '-' + originNickOrName(activity.origin) + ':' + activity.channelName + '- ' + activity.text);
			},
			'ChatMessage': function(activity) {
				var className = 'activity';

				if (activity.mentionMe) {
					className = 'activity_mentionme';
				}

				return basicText(className, '<' + originNickOrName(activity.origin) + '> ' + activity.text);
			},
			'Error': function(activity) {
				return basicText('activity_error', '* ' + activity.text);
			},
			'Info': function(activity) {
				return basicText('activity_info', '* ' + activity.text);
			},
			'Join': function(activity) {
				return basicText('activity_info', '* Join: ' + activity.who.nick + ' (' + activity.who.user + '@' + activity.who.host + ')');
			},
			'Kick': function(activity) {
				var msg = '* ' + activity.targetNick + ' was kicked by ' + originNickOrName(activity.origin);

				if (activity.kickMessage) {
					msg += ' (' + activity.kickMessage + ')';
				}
				return basicText('activity_kick', msg);
			},
			'KickMe': function(activity) {
				var msg = '* You were kicked by ' + originNickOrName(activity.origin);

				if (activity.kickMessage) {
					msg += ' (' + activity.kickMessage + ')';
				}
				return basicText('activity_kick', msg);
			},
			'ModeChange': function(activity) {
				return basicText('activity_info', '* ' + originNickOrName(activity.origin) + ' sets mode: ' + activity.modes + ' ' + activity.modeArgs.join(' '));
			},
			'MyActionMessage': function(activity) {
				return basicText('activity_mychat', '* ' + activity.nick + ' ' + activity.text);
			},
			'MyChatMessage': function(activity) {
				return basicText('activity_mychat', '<' + activity.nick + '> ' + activity.text);
			},
			'NickChange': function(activity) {
				return basicText('activity_info', '* ' + activity.oldNickname + ' is now known as ' + activity.newNickname);
			},
			'Notice': function(activity) {
				return basicText('activity_notice', '-' + originNickOrName(activity.origin) + '- ' + activity.text);
			},
			'Part': function(activity) {
				return basicText('activity_info', '* Part: ' + activity.who.nick + ' (' + activity.who.user + '@' + activity.who.host + ')');
			},
			'Quit': function(activity) {
				var msg = '* Quit: ' + activity.who.nick + ' (' + activity.who.user + '@' + activity.who.host + ')';

				if (activity.quitMessage) {
					msg += ' (' + activity.quitMessage + ')';
				}
				return basicText('activity_info', msg);
			},
			'SetTopic': function(activity) {
				return basicText('activity_info', '* ' + originNickOrName(activity.origin) + ' sets topic to: ' + activity.newTopic);
			},
			'Text': function(activity) {
				return basicText('activity', activity.text);
			},
			'Whois': function(activity) {
				return basicText('activity_whois', '* ' + activity.text);
			}
		};

		if (activity.type in activityHandlers) {
			return activityHandlers[activity.type](activity);
		} else {
			return basicText('activity', '*** Unsupported activity type: ' + activity.type);
		}

		function basicText(className, text) {
			return angular.element('<span />').addClass(className).text(text);
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

			scope.getUserlistClass = function(userlistEntry) {
				if ('owner' in userlistEntry) {
					return 'userlist_color_owner';
				} else if ('admin' in userlistEntry) {
					return 'userlist_color_admin';
				} else if ('op' in userlistEntry) {
					return 'userlist_color_op';
				} else if ('halfop' in userlistEntry) {
					return 'userlist_color_halfop';
				} else if ('voice' in userlistEntry) {
					return 'userlist_color_voice';
				} else {
					return null;
				}
			};
		}
	};
});

webircApp.directive('chatbox', function($rootScope, $timeout) {
	return function(scope, element, attrs) {
		var history = [];
		var currentHistoryId = null;

		var entity = null;

		scope.$watch(attrs.entity, function(newEntity) {
			entity = newEntity;
		});

		element.bind('keydown', function(e) {
			function setCursorPosToEnd() {
				var rawElement = element[0];

				rawElement.selectionStart = rawElement.selectionEnd = element.val().length;
			}

			if (e.keyCode === 13) { // enter
				var lines = element.val().replace(/\r\n/g, '\n').split('\n').filter(function(line) { return (line.length > 0); });

				if (lines.length > 0) {
					lines.forEach(function(line) {
						history.push(line);
					});

					$rootScope.sendToGateway('ChatboxSend', {
						lines: lines,
						exec: !e.shiftKey,
						entityId: entity.entityId
					});
				}

				if (history.length > 40) {
					history = history.slice(10);
				}

				currentHistoryId = null;

				element.val('');

				e.preventDefault();
			} else if (e.keyCode === 38) { // up
				if (currentHistoryId === null) {
					currentHistoryId = history.length - 1;
				} else if (currentHistoryId > 0) {
					currentHistoryId--;
				}

				element.val(history[currentHistoryId]);

				setCursorPosToEnd();

				e.preventDefault();
			} else if (e.keyCode === 40) { // down
				if (currentHistoryId === null) {
					// no effect
				} else if (currentHistoryId < history.length - 1) {
					currentHistoryId++;

					element.val(history[currentHistoryId]);
				} else {
					currentHistoryId = null;

					element.val('');
				}

				setCursorPosToEnd();

				e.preventDefault();
			}
		});

		$rootScope.$watch('state.activeEntityId', function(newActiveEntityId) {
			if (entity.entityId === newActiveEntityId) {
				// if our entity is becoming active, focus the chatbox

				$timeout(function() {
					element[0].focus();
				});
			}
		});
	};
});

webircApp.directive('chatboxAutocomplete', function($rootScope) {
	return function(scope, element) {
		var rawElement = element[0];

		var autoComplete = initAutoComplete();

		element.bind('keydown', function(e) {
			if (e.keyCode === 9) { // tab
				var activeEntity = sc.utils.getEntityById($rootScope.state, $rootScope.state.activeEntityId);

				var autoCompleteResult = autoComplete.next(element.val(), rawElement.selectionStart, activeEntity);

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

				scope.chatboxHeight = targetHeight;

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

function getTargetHeightForMaincell(chatboxHeight) {
	var chatboxWrapper = $('.chatboxwrapper');

	if (typeof chatboxHeight !== 'number') {
		return null;
	}

	return ($(window).height()
		- stripPx(chatboxWrapper.css('padding-top'))
		- chatboxHeight
		- stripPx(chatboxWrapper.css('padding-bottom'))
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
