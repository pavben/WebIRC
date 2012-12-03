var state = null;

$(window).bind('load', function() {
	// initialize the auto-growing chatbox and append the shadow div to the chatboxwrapper
	initializeAutoGrowingTextArea($('#chatbox'), $('#chatboxwrapper'));

	$(window).resize(onResize);

	onResize();

	//$('#chatlog').css('transition', 'all .5s ease');
	
	startWebSocketConnection();
});

