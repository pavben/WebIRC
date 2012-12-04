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
			var lines = chatbox.val().replace(/\r\n/g, '\n').split('\n').filter(function(line) { return (line.length > 0); });

			if (lines.length > 0) {
				sendToGateway('ChatboxSend', {windowId: visibleWindowId, lines: lines, exec: !e.shiftKey});
			}

			chatbox.val('').change();

			return false;
		}
	});
}

