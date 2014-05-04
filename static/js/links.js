"use strict";

var LinkChunkType = {
	Text : 1,
	Url : 2,
	Channel : 3
}

function convertLinksForDomTree(root, server) {
	// make a copy of child nodes for iterating since we'll be changing it as we go
	var childNodes = Array.prototype.slice.call(root.childNodes, 0);

	childNodes.forEach(function(childNode) {
		if (childNode.nodeType === 1) { // element that may have children to recurse onto
			convertLinksForDomTree(childNode, server);
		} else if (childNode.nodeType === 3) { // text
			var chunks = textMessageToLinkChunks(childNode.data);

			// this if is just an optimization to avoid the insertBefore/remove of the same node
			if (chunks.length > 1 || (chunks.length == 1 && chunks[0].type != LinkChunkType.Text)) {
				chunks.forEach(function(chunk) {
					root.insertBefore(linkChunkToElement(chunk, server), childNode);
				});

				root.removeChild(childNode);
			}
		}
	});
}

function linkChunkToElement(chunk, server) {
	function getLinkAnchor(label, url) {
		var newAnchor = document.createElement('a');

		newAnchor.appendChild(document.createTextNode(label));

		newAnchor.className = 'chatlogLink';
		newAnchor.title = url;
		newAnchor.href = url;
		newAnchor.target = '_blank';
		newAnchor.tabIndex = -1;

		return newAnchor;
	}

	function getLinkSpan(label, tooltip, f) {
		var newSpan = document.createElement('span');

		newSpan.appendChild(document.createTextNode(label));

		newSpan.className = 'chatlogLink';
		newSpan.title = tooltip;
		newSpan.onclick = f;

		return newSpan;
	}

	switch (chunk.type) {
		case LinkChunkType.Text:
			return document.createTextNode(chunk.text);
		case LinkChunkType.Url:
			var url = (/^https?:\/\//i).test(chunk.text) ? chunk.text : 'http://' + chunk.text;

			return getLinkAnchor(chunk.text, url);
		case LinkChunkType.Channel:
			return getLinkSpan(chunk.text, 'Join ' + chunk.text + ' on ' + server.label + '.', function() {
				g_requestJoinChannelOnServer(server.entityId, chunk.text);
			});
		default:
			return document.createTextNode('*** UNKNOWN LINK CHUNK ELEMENT ***');
	}
}

function textMessageToLinkChunks(textMessage) {
	/*
	\b(https?:\/\/www\.|https?:\/\/|www\.)
	(([-\w\d]+\.)+([\w]{2,4})|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))
	(:\d{1,5})?
	(\/?
		(
			(
				[-\w\d+&@#\/%=$?~_\|\.,;:!]*
				\([-\w\d+&@#\/%=$?~_\|\.,;:!]*\)
				(
					[-\w\d+&@#\/%=$?~_\|]*
					([\.,;:!]+[-\w\d+&@#\/%=$?~_\|]+)*
				)?
			)
			|
			(
				[-\w\d+&@#\/%=$?~_\|]*
				([\.,;:!]+[-\w\d+&@#\/%=$?~_\|]+)*
			)
		)?
	)?
	*/
	var urlRegex = /\b(https?:\/\/www\.|https?:\/\/|www\.)(([-\w\d]+\.)+([\w]{2,4})|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))(:\d{1,5})?(\/?(([-\w\d+&@#\/%=$?~_\|\.,;:!]*\([-\w\d+&@#\/%=$?~_\|\.,;:!]*\)([-\w\d+&@#\/%=$?~_\|]*([\.,;:!]+[-\w\d+&@#\/%=$?~_\|]+)*)?)|([-\w\d+&@#\/%=$?~_\|]*([\.,;:!]+[-\w\d+&@#\/%=$?~_\|]+)*))?)?/i;
	var channelRegex = /#[A-Z0-9._-]{1,32}\b/i; // TODO: fix #chan. case

	var linkRegexes = [{
		type: LinkChunkType.Url,
		regex: urlRegex
	}, {
		type: LinkChunkType.Channel,
		regex: channelRegex
	}];

	var chunks = [];

	function addChunk(type, text) {
		chunks.push({ type: type, text: text });
	}

	function getNextMatch(str, linkRegexes) {
		var bestMatchPos = null;
		var bestMatchType = null;
		var bestMatchRegex = null;

		linkRegexes.forEach(function(linkRegex) {
			var matchPos = str.search(linkRegex.regex);

			if (matchPos >= 0) {
				if (bestMatchPos == null || matchPos < bestMatchPos) {
					bestMatchPos = matchPos;
					bestMatchType = linkRegex.type;
					bestMatchRegex = linkRegex.regex;
				}
			}
		});

		if (bestMatchPos !== null) {
			return {
				pos: bestMatchPos,
				type: bestMatchType,
				length: str.slice(bestMatchPos).match(bestMatchRegex)[0].length
			};
		} else {
			return null;
		}
	}

	var tempString = textMessage;

	while (true) {
		var nextMatch = getNextMatch(tempString, linkRegexes);

		if (nextMatch !== null) {
			// the text before the match is considered to be normal text
			var normalTextChunk = tempString.slice(0, nextMatch.pos);
			if (normalTextChunk != '') {
				addChunk(LinkChunkType.Text, normalTextChunk);
			}

			// advance the string past the normal text to the beginning of the match
			tempString = tempString.slice(nextMatch.pos);

			addChunk(nextMatch.type, tempString.slice(0, nextMatch.length));

			// advance the string past the match
			tempString = tempString.slice(nextMatch.length);
		} else {
			// take the last normal text chunk and push it, if non-empty
			if (tempString != '') {
				addChunk(LinkChunkType.Text, tempString);
			}
			break;
		}
	}

	return chunks;
}
