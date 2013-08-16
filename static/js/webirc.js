var webircApp = angular.module('webircApp', []);

$(window).bind('load', function() {
	initializeChatboxHandler();

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

function initializeChatboxHandler() {
	var chatbox = $('#chatbox');

	chatbox.keypress(function(e) {
		if (e.which === 13) {
			var lines = chatbox.val().replace(/\r\n/g, '\n').split('\n').filter(function(line) { return (line.length > 0); });

			if (lines.length > 0) {
				sendToGateway('ChatboxSend', {lines: lines, exec: !e.shiftKey});
			}

			chatbox.val('').change();

			return false;
		}
	});
}

function AppCtrl($scope, socket) {
	// HACK: Ugly.
	$scope.safeApply = function(fn) {
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
	initializeWebSocketConnection($scope, socket);

	// initialize the auto-growing chatbox and append the shadow div to the chatboxwrapper
	initializeAutoGrowingTextArea($('#chatbox'), $('#chatboxwrapper'), function() {
		// we need to rerun $scope.getResizeParams on resize
		$scope.safeApply();
	});

	$scope.getResizeParams = function() {
		var bodyOverflowY = 'hidden';

		var maincellHeight = getTargetHeightForMaincell();

		if (maincellHeight < 300) {
			maincellHeight = 300;
			// if the scrollbars are needed, enable them
			bodyOverflowY = 'auto';
		}

		return {maincellHeight: maincellHeight, bodyOverflowY: bodyOverflowY};
	}

	$scope.$watch($scope.getResizeParams, function(newVal, oldVal) {
		console.log('maincellHeight changed to ' + newVal.maincellHeight);
		$scope.maincellHeight = newVal.maincellHeight + 'px';
		$scope.bodyOverflowY = newVal.bodyOverflowY;
	}, true);

	$(window).bind('resize orientationchange', function() {
		// we need to rerun $scope.getResizeParams on resize
		$scope.safeApply();
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

