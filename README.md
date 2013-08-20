# WebIRC

This is a new concept for an always-on web-based IRC "client". WebIRC runs as a daemon (similar to a BNC), so you are always connected to your favorite IRC networks. Want to log in to the same session from home, work, and your mobile devices? Continue your conversations from anywhere with a modern web browser.

## Screenshot
![](http://img405.imageshack.us/img405/6546/y22g.png)

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
* /close channels or private message windows
* Talk in channels
* Receive private messages and talk in them
* Paste multi-line messages
* Connect to IRC servers using SSL

## Not yet supported
* Sending/receiving files
* Multiple servers at the same time (it might work, but I haven't tried it yet)

## License
MIT
