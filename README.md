# WebIRC

This is a new concept for an always-on web-based IRC "client". WebIRC runs as a daemon (similar to a BNC), and is always connected to your favorite IRC networks. Seamlessly open the same session from home, work, and your mobile devices to continue exactly where you left off.

## Screenshot
![](http://img17.imageshack.us/img17/8301/fydc.jpg)

## Setting it up

1. Clone the repo, cd into it
2. Run `npm install`
3. Copy config.json.example to config.json and edit it to set the server details
4. Want HTTPS?
  * Yes: Run `./makecert.sh`
  * No: Change `"port": 28443` to `"port": null` in config.json under `"https"`
5. Run `node main.js`

Then look at the console. Did it connect to your server? Visit `http://localhost:28080` (or whatever port you've set in config.json) to access the client. Try logging in from your iPad at the same time and see how it runs smoothly with multiple simultaneous sessions (that's part of the goal for this project).

Features:

* Smart tab auto-complete prioritizing recent activity, including nicknames of those who recently left/quit
* Paste multi-line messages
* Connect to IRC servers using SSL
* Connect to multiple servers at the same time
* Webkit notifications for when your name is mentioned

Commands:

* /join #channel, /part #channel
* /msg <nick> <text> to start a private chat
* /mode #channel <modes> to set channel modes
* /hop to rejoin the current channel
* /sessions to list currently logged-in sessions, or /logout [all]
* All other commands are treated as raw and sent to the server directly. For example, you can do: `/privmsg #chan :text`

## Not yet supported
* Activity timestamps
* Clickable links in messages
* File transfers
* Scripting engine

## License
MIT
