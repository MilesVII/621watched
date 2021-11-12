const IS_CHROME = true;
const TAG_PER_QUERY_LIMIT = 6;
const ERROR_LOGGING = true;

var storedTags = [];

load("subscriptions", loadedSubscriptions);

function loadedSubscriptions(result){
	if (result != null && result.hasOwnProperty("subscriptions")){
		storedTags = result.subscriptions;
		refresh();
		load("lastSeen", checkForNewImages);
	}
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

	//**Reference to combatfox.js:linkify()
	var watchedButton = document.getElementById("viewWatched");
	var qurl = generateURL(1, generateQueries()[0]);
	save({watchTower: {url: qurl, page: 1}});
	watchedButton.href = qurl;
	watchedButton.target = "_blank";
	watchedButton.style.display = storedTags.length == 0 ? "none" : "block";
	watchedButton.textContent = "View watched";
	document.getElementById("nuffin").style.display = storedTags.length == 0 ? "block" : "none";
}

function errorCallback(){
	console.log("Error occured");
}

function generateEntry(tag){
	var li = document.createElement("li");
	li.style.textAlign = "center";

	var a = document.createElement("a");
	a.href = "https://e621.net/post/index/1/" + sanitize(tag);
	a.target = "_blank";
	a.textContent = tag;
	li.appendChild(a);

	return li;
}

function sanitize(tag){
	return encodeURIComponent(tag.split(" ").join("_"))
}

function setCheckingStatus(status){
	document.getElementById("newImages").textContent = status;
}

/////////////////////////////////////////////////////////////////////////////////////
//Slave Request Sender, related but not similar to combatfox.js

var idArray = [];
var lastSeen = 0;
var slaveRequestsPending = 0;
function checkForNewImages(result){
	if (result != null && result.hasOwnProperty("lastSeen")){
		lastSeen = result.lastSeen;
	}
	if (storedTags.length > 0)
		getDirty();
}

function getDirty(){
	if (lastSeen == 0){
		setCheckingStatus("Please view watched tags to check amount of unseen images");
		return;
	}
	setCheckingStatus("Checking for new images...")

	var queryQueue = generateQueries();
	for (var i = 0; i < queryQueue.length; ++i){
		var request = new XMLHttpRequest();
		request.addEventListener("load", onSlavePageLoad);
		request.open("GET", generateURL(1, queryQueue[i]));
		request.send();
		++slaveRequestsPending;
	}
}

function onSlavePageLoad() {
	if (this.status != 200){
		if (ERROR_LOGGING)
			console.log("Error occured while loading additional query: " + this.status);
		tryDoneSlaveLoading();
		return;
	}
	var slave = new DOMParser().parseFromString(this.responseText, "text/html");
	retrieveIdArrayFromPageContent(slave, idArray);
	tryDoneSlaveLoading();
}

//Modified getPreviewList
function retrieveIdArrayFromPageContent(node, array){
	var divContainer = node.getElementsByClassName("content-post")[0];

	var previews;
	//Get child node with no id containing all previews
	for (var i = 0; i < divContainer.childNodes.length; ++i){
		if (divContainer.childNodes[i].nodeType == 1 && 
		    !divContainer.childNodes[i].hasAttribute("id")){
			previews = divContainer.childNodes[i].childNodes;
			break;
		}
	}

	if (previews == null)
		return null;

	var j = array.length;
	for (var i = 0; i < previews.length; ++i){
		var nodeIsValid = previews[i].nodeType == 1;
		if (nodeIsValid){
			var collision = false;
			for (var k = 0; k < array.length; ++k){
				if (array[k] == getId(previews[i])){
					collision = true;
					break;
				}
			}

			if (!collision){
				array[j++] = getId(previews[i]);
			}
		}
	}
}

function tryDoneSlaveLoading(){
	--slaveRequestsPending;
	if (slaveRequestsPending == 0){
		doneChecking();
	}
}

function doneChecking(){
	var counter = 0;
	for (var i = 0; i < idArray.length; ++i){
		if (lastSeen < idArray[i])
			++counter;
	}

	var echo;
	if (counter == idArray.length)
		echo = counter + "+ new images";
	else if (counter == 0)
		echo = "No new images"
	else if (counter == 1)
		echo = counter + " new image";
	else
		echo = counter + " new images";

	setCheckingStatus(echo);
}

/////////////////////////////////////////////////////////////////////////////////////
//Shared code

function save(json){
	if (IS_CHROME)
		chrome.storage.local.set(json);
	else
		browser.storage.local.set(json);
}

function load(key, callback){
	if (IS_CHROME)
		chrome.storage.local.get(key, callback);
	else
		browser.storage.local.get(key).then(callback, errorCallback);
}

//Generate URL for search query
function generateURL(page, q){
	return "https://e621.net/post/index/" + page + "/" + q;
}

//Generate array of search queries
function generateQueries(){
	var query = [""];
	for (var i = 0; i < storedTags.length; ++i){
		var ti = Math.floor(i / TAG_PER_QUERY_LIMIT);
		if (ti >= query.length)
			query[ti] = "";
		query[ti] += encodeURIComponent("~" + storedTags[i].split(" ").join("_") + " ");
	}
	return query;
}

//Retrieve publication id from preview node
function getId(preview){
	return parseInt(preview.id.substring(1), 10);
}
