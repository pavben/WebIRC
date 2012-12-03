var state = null;

$(window).bind('load', function() {
	// initialize the auto-growing chatbox and append the shadow div to the chatboxwrapper
	initializeAutoGrowingTextArea($('#chatbox'), $('#chatboxwrapper'));

	initializeChatboxHandler();

	$(window).resize(onResize);

	onResize();

	//$('#chatlog').css('transition', 'all .5s ease');
	
	startWebSocketConnection();
});


function initializeChatboxHandler() {
	var chatbox = $('#chatbox');

	chatbox.keypress(function(e) {
		if (e.which === 13) {
			var chatboxVal = chatbox.val();

			if (chatboxVal.length > 0) {
				var lines = chatboxVal.replace(/\r\n/g, '\n').split('\n');
				sendToGateway('ChatboxSend', {windowId: visibleWindowId, lines: lines, exec: !e.shiftKey});
				chatbox.val('');
			}

			return false;
		}
	});
}

