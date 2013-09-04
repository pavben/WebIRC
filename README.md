# WebIRC

This is a new concept for an always-on web-based IRC "client". WebIRC runs as a daemon (similar to a BNC), and is always connected to your favorite IRC networks. Seamlessly open the same session from home, work, and your mobile devices to continue exactly where you left off.

## Screenshot
![](http://img405.imageshack.us/img405/6546/y22g.png)

## Status
Early stage development. Some of the basic features aren't in yet.

## Setting it up

1. Clone the repo, cd into it
2. Run `npm install`
3. Edit config.json to set the server details
4. Run `node main.js`

Then look at the console. Did it connect to your server? Visit `http://localhost:28080` (or whatever port you've set in config.json) to access the client. Try logging in from your iPad at the same time and see how it runs smoothly with multiple simultaneous sessions (that's part of the goal for this project).

What works:

* /join #channel, /part #channel
* /close channels or private message windows (will later add an 'x' close on tabs)
* Talk in channels
* Smart tab auto-complete prioritizing recent activity, including nicknames of those who recently left/quit
* Receive private messages and talk in them
* Paste multi-line messages
* Connect to IRC servers using SSL
* /hop to rejoin the current channel
* /sessions to list currently logged-in sessions, or /logout [all]
* Webkit notifications for when your name is mentioned

## Not yet supported
* Sending/receiving files
* Multiple servers at the same time (it might work, but I haven't tried it yet)

## License
MIT
