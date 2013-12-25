var LinkChunkType = {
	Text : 1,
	Url : 2,
	Email : 3
}

function convertLinksForDomTree(root) {
	for (var i = 0; i < root.childNodes.length; i++) {
		var childNode = root.childNodes[i];

		if (childNode.nodeType === 1) { // element that may have children to recurse onto
			convertLinksForDomTree(childNode);
		} else if (childNode.nodeType === 3) { // text
			var chunks = textMessageToLinkChunks(childNode.data);

			// this if is just an optimization to avoid the insertBefore/remove of the same node
			if (chunks.length > 1 || (chunks.length == 1 && chunks[0].type != LinkChunkType.Text)) {
				chunks.forEach(function(chunk) {
					root.insertBefore(linkChunkToElement(chunk), childNode);
				});

				root.removeChild(childNode);
			}
		}
	};
}

function linkChunkToElement(chunk) {
	switch (chunk.type) {
		case LinkChunkType.Text:
			return document.createTextNode(chunk.text);
		case LinkChunkType.Url:
			var newA = document.createElement('a');

			newA.href = chunk.text;
			newA.target = '_blank';

			newA.appendChild(document.createTextNode(chunk.text));

			return newA;
		case LinkChunkType.Email:
			var newA = document.createElement('a');

			newA.href = 'mailto:' + chunk.text;
			newA.target = '_blank';

			newA.appendChild(document.createTextNode(chunk.text));

			return newA;
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
				[-\w\d+&@#\/%=$?~_\|\.]*
				\([-\w\d+&@#\/%=$?~_\|\.]*\)
				(
					[-\w\d+&@#\/%=$?~_\|]*
					([\.;]+[-\w\d+&@#\/%=$?~_\|]+)*
				)?
			)
			|
			(
				[-\w\d+&@#\/%=$?~_\|]*
				([\.;]+[-\w\d+&@#\/%=$?~_\|]+)*
			)
		)?
	)?
	*/
	var urlRegex = /\b(https?:\/\/www\.|https?:\/\/|www\.)(([-\w\d]+\.)+([\w]{2,4})|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))(:\d{1,5})?(\/?(([-\w\d+&@#\/%=$?~_\|\.]*\([-\w\d+&@#\/%=$?~_\|\.]*\)([-\w\d+&@#\/%=$?~_\|]*([\.;]+[-\w\d+&@#\/%=$?~_\|]+)*)?)|([-\w\d+&@#\/%=$?~_\|]*([\.;]+[-\w\d+&@#\/%=$?~_\|]+)*))?)?/i;
	var emailRegex = /\b[A-Z0-9._%-]+@[A-Z0-9-]+\.[A-Z]{2,4}\b/i;

	var first = true;
	var tempString = textMessage;
	var chunks = [];

	function addChunk(type, text) {
		chunks.push({ type: type, text: text });
	}

	while (true) {
		var nextMatchPosUrl = tempString.search(urlRegex);
		var nextMatchPosEmail = tempString.search(emailRegex);

		var nextMatchType = null;
		var nextMatchPos = -1;

		if (nextMatchPosUrl >= 0 && (nextMatchPosEmail == -1 || nextMatchPosUrl <= nextMatchPosEmail)) {
			nextMatchType = LinkChunkType.Url;
			nextMatchPos = nextMatchPosUrl;
		} else if (nextMatchPosEmail >= 0 /* && (nextMatchPosUrl == -1 || nextMatchPosEmail <= nextMatchPosUrl */) {
			nextMatchType = LinkChunkType.Email;
			nextMatchPos = nextMatchPosEmail;
		}

		if (nextMatchPos >= 0) {
			// the text before the match is considered to be normal text
			var normalTextChunk = tempString.substring(0, nextMatchPos);
			if (normalTextChunk != '') {
				addChunk(LinkChunkType.Text, normalTextChunk);
			}

			// advance the string past the normal text to the beginning of the match
			tempString = tempString.substring(nextMatchPos);

			var matchLength = tempString.match(nextMatchType == LinkChunkType.Url ? urlRegex : emailRegex)[0].length;
			addChunk(nextMatchType, tempString.substring(0, matchLength));

			// advance the string past the match
			tempString = tempString.substring(matchLength);
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
