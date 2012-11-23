$(window).bind('load', function() {
	// initialize the auto-growing chatbox and append the shadow div to the chatboxwrapper
	initializeAutoGrowingTextArea($('#chatbox'), $('#chatboxwrapper'));

	$(window).resize(onResize);

	onResize();

	$('#chatlog').css('transition', 'all .5s ease');

	var sio = io.connect();
});

function onResize() {
	// disable scrolling as it interferes with calculations and causes visual glitches
	$('body').css('overflow-y', 'hidden');
	//var chatAndNickTable = $('#chatandnicktable');
	var chatlogDiv = $('#chatlog');
	var outerWrapper = $('#outerwrapper');
	var chatboxWrapper = $('#chatboxwrapper');
	var newChatlogHeight = $(window).height() // start with the full height
		- chatlogDiv.offset().top // remove all up to the start of chatlog
		- stripPx(chatlogDiv.css('padding-top')) // top and bottom paddings are not counted in the height
		- stripPx(chatlogDiv.css('padding-bottom'))
		- stripPx(chatlogDiv.css('border-top-width')) // same for border
		- stripPx(chatlogDiv.css('border-bottom-width'))
		- stripPx(chatboxWrapper.css('margin-top')) // remove the height of the spacer above the chatbox
		- chatboxWrapper.outerHeight() // remove the height of the chatbox wrapper
		- stripPx($('#outerwrapper').css('padding-bottom')); // remove the height of the spacer below the chatbox
	;

	if (newChatlogHeight < 400) {
		newChatlogHeight = 400;
		// if the scrollbars are needed, enable them
		$('body').css('overflow-y', 'auto');
	}

	chatlogDiv.css('height', newChatlogHeight);

	// scroll the chatlog to the bottom, if possible
	//instantScrollChatlogToBottom(chatlogDiv);

	//$('#chat_chatbox').focus();
}

function initializeAutoGrowingTextArea(chatBox, appendShadowTo) {
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
			onResize();
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
function stripPx(text) {
	return text.replace('px', '');
}

function log(msg) {
	window.console.log(msg);
}

