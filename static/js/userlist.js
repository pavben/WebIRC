function Userlist(windowId, initialList) {
	this.windowId = windowId;
	this.users = [];
	this.nextUserlistId = 0;

	// build the userlist divs
	initialList.forEach(function(user) {
		this.addUser(user);
	}, this); // passing the userlist object as 'this'
}

Userlist.prototype.addUser = function(userlistEntry) {
	userlistEntry.userlistId = this.getNextUserlistId();

	var insertIdx = 0;
	for (var i = 0; i < this.users.length; i++) {
		if (userlistSortFunction(userlistEntry, this.users[i]) >= 0) {
			insertIdx = i + 1;
		} else {
			break;
		}
	}

	this.users.splice(insertIdx, 0, userlistEntry);

	var divToInsert = $('<div/>').attr('id', 'userlist_' + this.windowId + '_' + userlistEntry.userlistId).text(getUserlistNamePrefix(userlistEntry) + userlistEntry.nick)

	if (insertIdx === 0) {
		windowIdToObject('#userlist_', this.windowId).prepend(divToInsert);
	} else {
		$('#userlist_' + this.windowId + '_' + this.users[insertIdx - 1].userlistId).after(divToInsert);
	}
}

Userlist.prototype.removeUser = function(nick) {
	var userlistEntry = null;

	var matchedUsersAndRest = partition(
		function(u) {
			return (u.nick === nick);
		},
		this.users
	);

	var matchedUsers = matchedUsersAndRest.trueList;
	this.users = matchedUsersAndRest.falseList;

	if (matchedUsers.length === 1) {
		var userlistEntry = matchedUsers.shift();

		var userlistEntryDiv = $('#userlist_' + this.windowId + '_' + userlistEntry.userlistId);

		userlistEntryDiv.remove();
	} else {
		console.log('Unexpected: matchedUsers.length in Userlist.removeUser is ' + matchedUsers.length);
	}
}

Userlist.prototype.getNextUserlistId = function() {
	return this.nextUserlistId++;
}

function userlistSortFunction(a, b) {
	function getModeScore(u) {
		if ('owner' in u) {
			return 0;
		} else if ('op' in u) {
			return 1;
		} else if ('halfop' in u) {
			return 2;
		} else if ('voice' in u) {
			return 3;
		} else {
			return 4;
		}
	}

	var modeScoreA = getModeScore(a);
	var modeScoreB = getModeScore(b);

	if (modeScoreA < modeScoreB) {
		return -1;
	} else if (modeScoreA > modeScoreB) {
		return 1;
	} else {
		var nickA = a.nick.toLowerCase();
		var nickB = b.nick.toLowerCase();

		if (nickA < nickB) {
			return -1;
		} else if (nickA > nickB) {
			return 1;
		} else {
			return 0;
		}
	}
}

function getUserlistNamePrefix(userlistEntry) {
	if ('owner' in userlistEntry) {
		return '&';
	} else if ('op' in userlistEntry) {
		return '@';
	} else if ('halfop' in userlistEntry) {
		return '%';
	} else if ('voice' in userlistEntry) {
		return '+';
	} else {
		return '';
	}
}
