const SUBS_MARK = "OwO";
const UNSB_MARK = "XwX";
const SUBS_TITLE = "Subscribe to this tag";
const UNSB_TITLE = "Unsubscribe from this tag";
const SBTN_UID_PREFIX = "sbtn_uid_prefix_";
const SBAI_UID = "sbai_uid";
const WATCHED_MENUBUTTON_CAPTION = "Watched";
const IS_CHROME = false; // Reference to "chrome" instead of "browser"
const TAG_PER_QUERY_LIMIT = 6;
const VERBOSE_LOGGING = false;
const DEBUG_LOGGING = false;
const MERGE_LOGGING = false;
const ERROR_LOGGING = true;

/////////////////////////////////////////////////////////////////////////////////////
//Init
var storedTags = [];
document.head.addEventListener("toggleSubscription", toggleSubscription);
document.head.addEventListener("viewWatched", viewWatched);

load("subscriptions", loadedSubscriptions);
function loadedSubscriptions(result){
	if (result && result.hasOwnProperty("subscriptions")){
		storedTags = result.subscriptions;
	}
	linkify();
	onPageLoad();
}

/////////////////////////////////////////////////////////////////////////////////////
//Default page processor


function toggleSubscription(event){
	if (VERBOSE_LOGGING)
		console.log("Received toggle event");

	let mrSandman = event.srcElement || event.target;

	//CSP halts the execution if I try to call getElementByID
	var tag = mrSandman.lastChild.textContent;
	if (VERBOSE_LOGGING)
		console.log(mrSandman);

	if (!storedTags.includes(tag)){
		if (VERBOSE_LOGGING)
			console.log("Adding...");
		mrSandman.textContent = UNSB_MARK;
		mrSandman.title = UNSB_TITLE;
		//Somehow subscription button is losing its child when changing textContent
		enforceAdoptingBySubscriptionButton(mrSandman, tag);
		storedTags.push(tag);
		save({"subscriptions": storedTags});
		if (DEBUG_LOGGING)
			console.log("Added successfully");
	} else {
		var i = storedTags.indexOf(tag);
		if (i > -1){
			if (VERBOSE_LOGGING)
				console.log("Removing...");
			mrSandman.textContent = SUBS_MARK;
			mrSandman.title = SUBS_TITLE;
			enforceAdoptingBySubscriptionButton(mrSandman, tag);
			storedTags.splice(i, 1);
			save({"subscriptions": storedTags});
			save({"lastSeen": 0});
			if (DEBUG_LOGGING)
				console.log("Removed");
		} else if (ERROR_LOGGING){
			console.log("E621E: Everything goes wrong");
		}
	}
	if (DEBUG_LOGGING)
		console.log(storedTags);
}

//**Referenced by popup.js:refresh()
function linkify(){
	//Linkify tags
	var tagBox = document.getElementById("tag-box");
	if (!tagBox)
		tagBox = document.getElementById("tag-list");
	for (let runner of tagBox.children){
		if (runner.nodeName == "UL")
			linkifyTags(runner);
	}

	//Then linkify navbar
	var ul = document.getElementById("nav-posts").parentElement;
	var watchTower = document.createElement("li");
	var poneWithFleshlight = document.createElement("a");
	poneWithFleshlight.href = "javascript:void(0)";
	poneWithFleshlight.id = "nav-watched";
	poneWithFleshlight.addEventListener("click", viewWatched);//setAttribute("onclick", generateWatchedEventCode(1));
	poneWithFleshlight.textContent = WATCHED_MENUBUTTON_CAPTION;

	watchTower.append(poneWithFleshlight);
	ul.insertBefore(watchTower, ul.childNodes[2]);
}

/////////////////////////////////////////////////////////////////////////////////////
//Watched Page processor

var masterPreviews;
var currentPage;
//**Referenced by popup.js:refresh()
//Event listener for Watched button (and paginator)
function viewWatched(event){
	let mrSandman = event.srcElement || event.target;
	//console.log(mrSandman);
	if (mrSandman.textContent === WATCHED_MENUBUTTON_CAPTION)
		currentPage = 1;
	else
		currentPage = parseInt(mrSandman.textContent);

	var qurl = generateURL(currentPage, generateQueries()[0]);
	save({"watchTower": {"url": qurl, "page": currentPage}});
	window.location.href = qurl;
	//window.open(qurl, "_blank");
}

//Called every time page and storedTags loaded
function onPageLoad(){
	load("watchTower", onPageLoadPartTwo);
}
function onPageLoadPartTwo(cumLoad){
	if (cumLoad && cumLoad.hasOwnProperty("watchTower") && window.location.href == cumLoad.watchTower.url){
		masterPreviews = getPreviewList(document);
		currentPage = cumLoad.watchTower.page;
		if (storedTags.length > TAG_PER_QUERY_LIMIT){
			getDirty(currentPage);
		} else {
			doneSlaveProcessing();
		}
	}
}

var slaveRequestsPending = 0;
//Called when tag query exceeds limit
function getDirty(page){
	var queryQueue = generateQueries();
	for (let i = 1; i < queryQueue.length; ++i){
		var request = new XMLHttpRequest();
		request.addEventListener("load", onSlavePageLoad);
		request.open("GET", generateURL(page, queryQueue[i]));
		request.send();
		++slaveRequestsPending;
	}
	processPaginator();
	overwriteSearchInput();
}

function onSlavePageLoad() {
	if (DEBUG_LOGGING)
		console.log("Finished request to " + this.responseURL);
	if (this.status != 200){
		if (ERROR_LOGGING)
			console.log("Error occured while loading additional query: " + this.status);
		tryDoneSlaveProcessing();
		return;
	}
	var slave = new DOMParser().parseFromString(this.responseText, "text/html");

	//Embed pictures
	var previews = getPreviewList(slave);

	if (!previews){
		if (ERROR_LOGGING)
			console.log("Error occured while parsing slavePage");
		tryDoneSlaveProcessing();
		return;
	}

	while (previews.length > 0){
		for (let masterPreview of masterPreviews){
			//Removed node type validation because I discovered "children" property
			var override = masterPreview == (masterPreviews[masterPreviews.length - 1]);
			if (tryEmbedPreview(previews[0], masterPreview, override))
				break;
		}
	}

	//Embed trendingtags
	embedTrendingTags(getUlFromTagbox(slave.getElementById("tag-box")));

	tryDoneSlaveProcessing();	
}

function tryDoneSlaveProcessing(){
	--slaveRequestsPending;
	if (slaveRequestsPending == 0){
		doneSlaveProcessing();
	}
}

function doneSlaveProcessing(){
	//embedTrendingTags(document.createTextNode("Done loading"));
	
	if (currentPage == 1){
		for (let i = 0; i < masterPreviews.length; ++i){
			if (masterPreviews[i].nodeType == 1){
				save({"lastSeen": getId(masterPreviews[i])});
				break;
			}
		}
	}
}

/////////////////////////////////////////////////////////////////////////////////////
//Page modifiers

//Insert slave preview node into page near master node
function tryEmbedPreview(slave, master, override){
	var slaveId = getId(slave);
	var masterId = getId(master);
	
	if (slaveId == masterId){
		if (MERGE_LOGGING)
			console.log("ignored:" + slaveId);
		slave.parentNode.removeChild(slave);

		return true;
	} else if (slaveId > masterId){
		if (MERGE_LOGGING)
			console.log("insert:" + slaveId);
		
		master.parentNode.insertBefore(slave, master);
		return true;
	} else if (override){
		if (MERGE_LOGGING)
			console.log("end:" + slaveId);
		
		master.parentNode.append(slave);
		return true;
	}
	return false;
}

//Append list of trending tags from slave queries
function embedTrendingTags(slaveUl){
	linkifyTags(slaveUl);

	var tagBox = document.getElementById("tag-box");
	var masterUl = getUlFromTagbox(tagBox);

	if (masterUl)
		while (slaveUl.children.length > 0)
			masterUl.append(slaveUl.children[0]);
}

//Add event dispatching to inform processor that page is changed
function processPaginator(){
	var pageLinks = document.getElementsByClassName("numbered-page");

	for (let pageLink of pageLinks){
		for (let link of pageLink.children){
			if (link.nodeName == "A" && link.href.includes("/posts?page=")){
				link.addEventListener("click", viewWatched);//setAttribute("onclick", generateWatchedEventCode(parseInt(link.textContent.trim())));
			}
		}
	}
}

//Replace text in search field with actual query
function overwriteSearchInput(){
	document.getElementById("tags").value = decodeURI(generateQueries().join("").split("+").join(" "));
}

/////////////////////////////////////////////////////////////////////////////////////
//Utils

//Add subscription buttons to tag list
function linkifyTags(ul){
	if (ul){
		var tagList = ul.getElementsByTagName("li");
		for (let liEntry of tagList){
			var tag = getTagFromLi(liEntry);

			if (!tag){
				continue;
			} else {
				liEntry.insertBefore(generateSubscriptionButton(tag), liEntry.childNodes[0]);
			}
		}
	}
}

//Get list of preview nodes from page
//**Referenced by popup.js:retrieveIdArrayFromPageContent()
function getPreviewList(node){
	var container = node.getElementById("posts-container");

	//Needed only for old e621
	/*//Get child node with no id containing all previews
	for (let i = 0; i < divContainer.childNodes.length; ++i){
		if (divContainer.childNodes[i].nodeType == 1 && 
		    !divContainer.childNodes[i].hasAttribute("id")){
			return divContainer.childNodes[i].childNodes;
		}
	}
	return null;*/
	return container.children;
}

/*function generateWatchedEventCode(page){
	return "document.head.dispatchEvent(new CustomEvent(\"viewWatched\", {\"detail\":{\"page\": " + page + "}}));";
}*/

function enforceAdoptingBySubscriptionButton(sbtn, tag){	
	if (sbtn.children.length == 0){
		let additionalInfo = document.createElement("div");
		additionalInfo.style.display = "none";
		additionalInfo.setAttribute("id", SBAI_UID);
		additionalInfo.textContent = tag;
		sbtn.appendChild(additionalInfo);
	}
}

function generateSubscriptionButton(tag){
	let subscribed = storedTags.includes(tag);

	let mark = document.createElement("a");
	mark.setAttribute("href", "javascript:void(0)");
	mark.setAttribute("id", SBTN_UID_PREFIX + tag);
	mark.style.margin = "2px";
	mark.textContent = subscribed ? UNSB_MARK : SUBS_MARK;
	mark.title = subscribed ? UNSB_TITLE : SUBS_TITLE;
	mark.addEventListener("click", toggleSubscription);
	//mark.setAttribute("onclick", "document.head.dispatchEvent(new CustomEvent(\"toggleSubscription\", {\"detail\":{\"tag\": \"" + tag + "\"}}));");
	enforceAdoptingBySubscriptionButton(mark, tag);
	return mark;
}

function errorCallback(){
	if (ERROR_LOGGING)
		console.log("Error occured while loading from storage");
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
	var query = [""];
	for (let i = 0; i < storedTags.length; ++i){
		var ti = Math.floor(i / TAG_PER_QUERY_LIMIT);
		if (ti >= query.length)
			query[ti] = "";
		query[ti] += encodeURIComponent("~" + storedTags[i].split(" ").join("_") + "+").split("%2B").join("+");
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
	var tagLinks = li.getElementsByTagName("a");
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
