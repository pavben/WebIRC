var visibleWindowId = null;

function onResize() {
	var maincellDiv = $('#maincell');
	if (visibleWindowId !== null) {
		updateChatlogHeight(visibleWindowId);
		maincellDiv.css('height', 'auto');
	} else {
		// disable scrolling as it causes scrollbar flickering
		$('body').css('overflow-y', 'hidden');

		var targetMaincellHeight = getTargetHeightForMaincell();

		if (targetMaincellHeight < 300) {
			targetMaincellHeight = 300;
			// if the scrollbars are needed, enable them
			$('body').css('overflow-y', 'auto');
		}
		maincellDiv.css('height', targetMaincellHeight);
	}

	$('#chatbox').focus();
}

function updateChatlogHeight(windowId) {
	// disable scrolling as it causes scrollbar flickering
	$('body').css('overflow-y', 'hidden');

	var chatlogDiv = windowIdToObject('#chatlog_', windowId);
	var newChatlogHeight = getTargetHeightForMaincell()
		- stripPx(chatlogDiv.css('padding-top')) // top and bottom paddings are not counted in the height
		- stripPx(chatlogDiv.css('padding-bottom'))
		- stripPx(chatlogDiv.css('border-top-width')) // same for border
		- stripPx(chatlogDiv.css('border-bottom-width'));

	if (newChatlogHeight < 200) {
		newChatlogHeight = 200;
		// if the scrollbars are needed, enable them
		$('body').css('overflow-y', 'auto');
	}
	chatlogDiv.css('height', newChatlogHeight);

	// scroll the chatlog to the bottom, if possible
	//instantScrollChatlogToBottom(chatlogDiv);
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

function addWindow(windowId, windowType) {
	var maincellContent = null;
	switch(windowType) {
		case 'server':
		case 'pm':
			maincellContent = $('<div/>').attr('id', 'chatlog_' + windowId).addClass('chatlog');
			break;
		case 'channel':
			maincellContent = $('<div/>').addClass('fixedtable').append(
				$('<div/>').addClass('tablerow').append(
					$('<div/>').addClass('tablecell').append(
						$('<div/>').attr('id', 'chatlog_' + windowId).addClass('chatlog')
					)
				).append(
					$('<div/>').addClass('mainspacercell')
				).append(
					$('<div/>').addClass('userlistcell').append(
						$('<div/>').attr('id', 'userlist_' + windowId).addClass('userlist')
					)
				)
			);
			break;
		default:
			console.log('Unknown windowType in addWindow');
			return;
	}

	$('#maincell').append(
		$('<div/>').attr('id', 'maincell_' + windowId).hide().append(maincellContent)
	);

	setVisibleWindowId(windowId);
}

function setVisibleWindowId(windowId) {
	windowIdToObject('#maincell_', visibleWindowId).hide();

	visibleWindowId = windowId;

	windowIdToObject('#maincell_', visibleWindowId).show();

	onResize();
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

function windowIdToObject(prefix, windowId) {
	var divId = prefix;
	if (windowId !== null) {
		divId += windowId;
	} else {
		divId += 'none';
	}

	return $(divId);
}

function stripPx(text) {
	return parseInt(text.replace('px', ''), 10);
}

