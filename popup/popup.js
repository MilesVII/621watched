const IS_CHROME = true;

var storedTags = [];

if (IS_CHROME)
	chrome.storage.local.get("subscriptions", loadedSubscriptions);
else
	browser.storage.local.get("subscriptions").then(loadedSubscriptions, errorCallback);

function loadedSubscriptions(result){
	if (result != null && result.hasOwnProperty("subscriptions")){
		storedTags = result.subscriptions;
	}
	refresh();
}

function refresh(){
	var ul = document.getElementById("watchedTags");
	while (ul.lastChild) {
		ul.removeChild(ul.lastChild);
	}

	var query = [""];
	for (var i = 0; i < storedTags.length; ++i){
		ul.appendChild(generateEntry(storedTags[i]));
	}

	document.getElementById("nuffin").style.display = storedTags.length == 0 ? "block" : "none";
}

/*function remove(tag){
	document.getElementById("Belly").textContent = "CALL";

	var i = storedTags.indexOf(tag);
	if (i > -1){
		storedTags.splice(i, 1);
		save({"subscriptions": storedTags});
	}
	refresh();
}*/

function errorCallback(){
	console.log("Error occured");
}

function generateEntry(tag){
	var li = document.createElement("li");
	li.appendChild(document.createTextNode(tag));
	li.style.textAlign = "center";
	/*var a = document.createElement("a");
	a.setAttribute("href", "javascript:void(0)");
	a.setAttribute("onclick", "remove(" + tag + ");");
	a.textContent = "X";
	li.appendChild(a);*/

	return li;
}

/*function save(json){
	if (IS_CHROME)
		chrome.storage.local.set(json);
	else
		browser.storage.local.set(json);
}*/