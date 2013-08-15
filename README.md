# WebIRC

This is a new web-based concept for an always-on IRC client.

## Features

* WebIRC runs as a daemon (similar to a BNC), so you are always connected to your favorite IRC networks.
* Want to log in to the same IRC session from home, work, and your mobile devices? Control your client from anywhere with a modern web browser.
* Run the daemon on one of your servers and WebIRC will use the server's IP, hiding yours. How about some sweet vhost? :D

## Status
Early stage development. It's NOT ready, it's not stable, and many of the basic features are not yet implemented.

## Setting it up

1. Clone the repo, cd into it
2. Run `npm install`
3. Edit config.json to set the server details
4. Run `node main.js`

Then look at the console. Did it connect to your server? Visit `http://localhost:28081` (or whatever port you've set in config.json) to access the client. Try logging in from your iPad at the same time and see how it runs smoothly with multiple simultaneous sessions (that's part of the goal for this project).

You can also:

* /join #channel, /part #channel
* Talk
* Paste multi-line messages

# License
MIT
