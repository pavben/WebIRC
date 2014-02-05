# WebIRC

This is a new concept for an always-on web-based IRC client. WebIRC runs as a server and is always connected to your favorite IRC networks. Seamlessly open the same session from home, work, and your mobile devices to continue exactly where you left off.

## Screenshot
![screenshot](https://f.cloud.github.com/assets/2124408/2074550/7bb2bcf8-8d7c-11e3-9a03-56133d9379ff.png)


## Setting it up

1. Clone the repo, cd into it.
2. Run `npm install`
3. Copy config.json.example to config.json and edit it to set the server details.
4. If you want HTTPS (highly recommended for any real use), run `./makecert.sh` and then set `"port": 28443` in config.json under `"https"`. You should also set the HTTP port to null at this point to accept only HTTPS.
5. Copy `user.json.example` to `users/me.json` (and create the users directory). Edit the file to set your user details.
6. Run `node main.js`.
7. Visit `http://localhost:28080` (or whatever port you've set in config.json) to access the client.

Try logging in from your iPad at the same time and see how it runs smoothly with multiple simultaneous sessions (that's part of the goal for this project).

## Features

* Smart tab auto-complete prioritizing recent activity, including nicknames of those who recently left/quit
* All state (chats with history, channels, servers) persists through restarts and updates
* Paste multi-line messages
* Connect to IRC servers using SSL
* Connect to multiple servers at the same time
* Webkit notifications for when your name is mentioned
* Chatbox history for repeating/modifying commands (up/down arrow keys)
* Clickable links in messages, including channel links
* Timestamps on messages by hovering over them

## Commands

* /join #channel, /part #channel
* /msg <nick> <text> to start a private chat
* /mode #channel <modes> to set channel modes
* /hop to rejoin the current channel
* /server [host] [port] [password] to connect to a new server in the current server window. Prefix the port with + for SSL.
* /sessions to list currently logged-in sessions, or /logout [all]
* All unrecognized commands are treated as raw and sent to the server directly. For example, you can do: `/privmsg #chan :text`

## Adding users

1. Make sure WebIRC is not running. (Adding users at runtime is coming soon)
2. Copy `user.json.example` to `users/USERNAME.json`.
3. Edit the file and set the user's details.

## Not yet supported
* File transfers
* Scripting engine

## License
MIT
