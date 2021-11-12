const IS_CHROME = false;
const TAG_PER_QUERY_LIMIT = 6;
const DEBUG_LOGGING = true;
const ERROR_LOGGING = true;

let storedTags = [];
load("subscriptions", loadedSubscriptions);

function loadedSubscriptions(result){
	if (result != null && result.hasOwnProperty("subscriptions")){
		storedTags = result.subscriptions;
		refresh();
		load("lastSeen", checkForNewImages);
	}
	initIO();
}

function refresh(){
	let ul = document.getElementById("watchedTags");
	while (ul.lastChild) {
		ul.removeChild(ul.lastChild);
	}

	let query = [""];
	for (let i = 0; i < storedTags.length; ++i){
		ul.appendChild(generateEntry(storedTags[i]));
	}

	//**Reference to combatfox.js:linkify()
	let watchedButton = document.getElementById("viewWatched");
	let qurl = generateURL(1, generateQueries()[0]);
	save({"watchTower": {"url": qurl, "page": 1}});
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
	let li = document.createElement("li");
	li.style.textAlign = "center";

	let a = document.createElement("a");
	a.href = "https://e621.net/posts?tags=" + sanitize(tag);
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

let idArray = [];
let failedToLoad = false;
let lastSeen = 0;
let slaveRequestsPending = 0;
function checkForNewImages(result){
	if (result != null && result.hasOwnProperty("lastSeen")){
		lastSeen = result.lastSeen;
	}
	if (storedTags.length > 0)
		getDirty();
}

function getDirty(){
	if (lastSeen == 0){
		setCheckingStatus("Last seen post is unknown, please view watched tags manually");
		return;
	}
	setCheckingStatus("Checking for new images...")

	let queryQueue = generateQueries();
	for (let i = 0; i < queryQueue.length; ++i){
		let request = new XMLHttpRequest();
		request.addEventListener("load", onSlavePageLoad);
		request.open("GET", generateURL(1, queryQueue[i]));
		request.send();
		++slaveRequestsPending;
	}
}

function onSlavePageLoad() {
	if (this.status != 200 || failedToLoad){
		if (ERROR_LOGGING)
			console.log("Error occured while loading additional query: " + this.status);
		failedToLoad = true;
		tryDoneSlaveLoading();
		return;
	}
	let slave = new DOMParser().parseFromString(this.responseText, "text/html");
	retrieveIdArrayFromPageContent(slave, idArray);
	tryDoneSlaveLoading();
}

//Modified getPreviewList
function retrieveIdArrayFromPageContent(node, array){
	let previews = node.getElementById("posts-container").children;

	//Get child node with no id containing all previews
	// for (let i = 0; i < divContainer.childNodes.length; ++i){
	// 	if (divContainer.childNodes[i].nodeType == 1 && 
	// 	    !divContainer.childNodes[i].hasAttribute("id")){
	// 		previews = divContainer.childNodes[i].childNodes;
	// 		break;
	// 	}
	// }

	if (!previews || failedToLoad){
		failedToLoad = true;
		return;
	}

	let j = array.length;
	for (let preview of previews){
		let collision = false;
		for (let k = 0; k < array.length; ++k){
			if (array[k] == getId(preview)){
				collision = true;
				break;
			}
		}

		if (!collision){
			array[j++] = getId(preview);
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
	let counter = 0;
	if (!failedToLoad){
		for (let i = 0; i < idArray.length; ++i)
			if (lastSeen < idArray[i])
				++counter;
	}

	let echo;
	if (failedToLoad)
		echo = "Failed to load, please check manually";
	else if (counter == idArray.length)
		echo = counter + "+ new images";
	else if (counter == 0)
		echo = "No new images";
	else if (counter == 1)
		echo = counter + " new image";
	else
		echo = counter + " new images";

	setCheckingStatus(echo);
}

/////////////////////////////////////////////////////////////////////////////////////
//Backup Options

function showBackupOptions(){
	document.getElementById("backupshow_button").style.display = "none";
	document.getElementById("backup").style.display = "block";
}

function importTags(){
	storedTags = document.getElementById("io").value.split("\n");
	save({"subscriptions": storedTags});
	document.getElementById("import_button").textContent = "Saved succesfully. Please reopen the window";
}

function exportTags(){
	loadTagsToIO();
	let io = document.getElementById("io");
	io.focus();
	io.select();
	document.execCommand("copy");
}

function loadTagsToIO(){
	document.getElementById("io").value = storedTags.join("\n");
}

function initIO(){
	document.getElementById("import_button").addEventListener("click", importTags);
	document.getElementById("backupshow_button").addEventListener("click", showBackupOptions);
	document.getElementById("export_button").addEventListener("click", exportTags);
	loadTagsToIO();
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

//Generate array of search queries
function generateQueries(){
	let query = [""];
	for (let i = 0; i < storedTags.length; ++i){
		let ti = Math.floor(i / TAG_PER_QUERY_LIMIT);
		if (ti >= query.length)
			query[ti] = "";
		query[ti] += encodeURIComponent("~" + storedTags[i].split(" ").join("_") + " ");
	}
	return query;
}

//Generate URL for search query
function generateURL(page, q){
	return "https://e621.net/posts?page=" + page + "&tags=" + q;
}

//Retrieve publication id from preview node
function getId(preview){
	return parseInt(preview.getAttribute("data-id"), 10);
}

function getTagFromLi(li){
	let tagLinks = li.getElementsByTagName("a");
	for (let tagLink of tagLinks){
		if (isTagAnchor(tagLink)){
			return tagLink.textContent.trim();
		}
	}
}

function getUlFromTagbox(tagBox){
	for (let runner of tagBox.children)
		if (runner.nodeName == "UL")
			return runner;
}

//Detect if provided element is tag link
function isTagAnchor(element){
	//Old version of e621:
	//return (element.hasAttribute("href") && element.href.includes("/post/search?tags=") && !element.hasAttribute("style"));
	//New version of e621, little more independent
	//return (element.hasAttribute("href") && element.href.includes("/posts?tags=") && !element.hasAttribute("style"));
	//New version of e621, more precise
	return element.classList.contains("search-tag");
}
