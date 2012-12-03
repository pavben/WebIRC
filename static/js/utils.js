function partition(boolFunc, list) {
	var trueList = [];
	var falseList = [];

	for (var i in list) {
		if (boolFunc(list[i])) {
			trueList.push(list[i]);
		} else {
			falseList.push(list[i]);
		}
	}

	return {trueList: trueList, falseList: falseList};
}

function log(msg) {
	window.console.log(msg);
}

