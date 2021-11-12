const SUBS_MARK = "OwO";
const UNSB_MARK = "XwX";
const SUBS_TITLE = "Subscribe to this tag";
const UNSB_TITLE = "Unsubscribe from this tag";
const SBTN_UID_PREFIX = "sbtn_uid_prefix_";
const IS_CHROME = true; // Reference to "chrome" instead of "browser"
const IS_BRAVE = true; // Do not use 'this' in event details to refer to subscription button
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

if (IS_CHROME)
	chrome.storage.local.get("subscriptions", loadedSubscriptions);
else
	browser.storage.local.get("subscriptions").then(loadedSubscriptions, errorCallback);

function loadedSubscriptions(result){
	if (result != null && result.hasOwnProperty("subscriptions")){
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

	var tag = event.detail.tag;
	if (IS_BRAVE)
		var sender = findTagButtonForBrave(tag);
	else
		var sender = event.detail.sender;
	if (VERBOSE_LOGGING)
		console.log(sender);

	if (!storedTags.includes(tag)){
		if (VERBOSE_LOGGING)
			console.log("Adding...");
		sender.textContent = UNSB_MARK;
		sender.title = UNSB_TITLE;
		storedTags.push(tag);
		save({subscriptions: storedTags});
		if (DEBUG_LOGGING)
			console.log("Added successfully");
	} else {
		var i = storedTags.indexOf(tag);
		if (i > -1){
			if (VERBOSE_LOGGING)
				console.log("Removing...");
			sender.textContent = SUBS_MARK;
			sender.title = SUBS_TITLE;
			storedTags.splice(i, 1);
			save({subscriptions: storedTags});
			if (DEBUG_LOGGING)
				console.log("Removed");
		} else if (ERROR_LOGGING){
			console.log("E621E: Everything goes wrong");
		}
	}
	if (DEBUG_LOGGING)
		console.log(storedTags);
}

function linkify(){
	//Linkify tags
	linkifyTags(document.getElementById("tag-sidebar"));

	//Then linkify navbar
	var ul = document.getElementById("navbar");
	var watchTower = document.createElement("li");
	var poneWithFleshlight = document.createElement("a");
	poneWithFleshlight.href = "javascript:void(0)";
	poneWithFleshlight.setAttribute("onclick", generateWatchedEventCode(1));
	poneWithFleshlight.textContent = "Watched";

	watchTower.append(poneWithFleshlight);
	ul.insertBefore(watchTower, ul.childNodes[2]);
}

/////////////////////////////////////////////////////////////////////////////////////
//Watched Page processor

var masterPreviews;
//Event listener for Watched button (and paginator)
function viewWatched(event){
	var qurl = generateURL(event.detail.page, generateQueries()[0]);
	save({watchTower: {url: qurl, page: event.detail.page}});
	window.location.href = qurl;
	//(storedTags.length > TAG_PER_QUERY_LIMIT)
}

//Called every time page and storedTags loaded
function onPageLoad(){
	load("watchTower", onPageLoadPartTwo);
}
function onPageLoadPartTwo(cumLoad){
	if (cumLoad != null && window.location.href == cumLoad.watchTower.url){
		//save({watchTower: "Undef URL"});
		if (storedTags.length > TAG_PER_QUERY_LIMIT){
			getDirty(cumLoad.watchTower.page);
		}
	}
}

//Called when tag query exceeds limit
function getDirty(page){
	masterPreviews = getPreviewList(document);
	var queryQueue = generateQueries();
	for (var i = 1; i < queryQueue.length; ++i){
		var request = new XMLHttpRequest();
		request.addEventListener("load", onSlavePageLoad);
		request.open("GET", generateURL(page, queryQueue[i]));
		request.send();
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
		return;
	}
	var slave = new DOMParser().parseFromString(this.responseText, "text/html");

	//Embed pictures
	var previews = getPreviewList(slave);

	if (previews == null){
		if (ERROR_LOGGING)
			console.log("Error occured while parsing slavePage");
		return;
	}

	for (var i = 0; i < previews.length; ++i)
	for (var j = 0; j < masterPreviews.length; ++j){
		var nodeIsValid = previews[i].nodeType == 1 && masterPreviews[j].nodeType == 1;
		var override = j == (masterPreviews.length - 1);

		if (nodeIsValid && tryEmbedPreview(previews[i], masterPreviews[j], override))
			break;
	}

	//Embed trendingtags
	embedTrendingTags(slave.getElementById("tag-sidebar"));
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
function embedTrendingTags(node){
	linkifyTags(node);
	/*var slaveTags = node.getElementsByTagName("li");
	for (var i = 0; i < slaveTags.length; ++i){
		document.getElementById("tag-sidebar").append(slaveTags[i]);
	}*/
	document.getElementById("tag-sidebar").parentNode.append(node);
}

//Add event dispatching to inform processor that page is changed
function processPaginator(){
	var pageLinks = document.getElementById("paginator").getElementsByTagName("a");

	for (var i = 0; i < pageLinks.length; ++i){
		if (pageLinks[i].href.includes("/post/index/")){
			pageLinks[i].setAttribute("onclick", generateWatchedEventCode(parsePageId(pageLinks[i].href)));
		}
	}
}

//Replace text in search field with actual query
function overwriteSearchInput(){
	document.getElementById("tags").value = decodeURI(generateQueries().join(""));
}

/////////////////////////////////////////////////////////////////////////////////////
//Utils

//Detect if provided element is tag link
function isTagAnchor(element){
	return (element.hasAttribute("href") && element.href.includes("/post/search?tags=") && !element.hasAttribute("style"));
}

//Add subscription buttons to tag list
function linkifyTags(ul){
	if (ul){
		var tagList = ul.getElementsByTagName("li");
		for (var i = 0; i < tagList.length; ++i){
			if (tagList[i].className.startsWith("tag-type")){
				var tagLinks = tagList[i].getElementsByTagName("a");
				var tag = null;
				for (var j = 0; j < tagLinks.length; ++j){
					if (isTagAnchor(tagLinks[j])){
						tag = tagLinks[j].textContent.trim();
						break;
					}
				}

				if (!tag){
					continue;
				} else {
					tagList[i].insertBefore(generateSubscriptionButton(tag), tagList[i].childNodes[0]);
				}
			}
		}
	}
}

//Get list of preview nodes from page
function getPreviewList(node){
	var divContainer = node.getElementsByClassName("content-post")[0];

	//Get child node with no id containing all previews
	for (var i = 0; i < divContainer.childNodes.length; ++i){
		if (divContainer.childNodes[i].nodeType == 1 && 
		    !divContainer.childNodes[i].hasAttribute("id")){
			return divContainer.childNodes[i].childNodes;
		}
	}
	return null;
}

//Retrieve page number from page link
function parsePageId(url){
	var signature = "/post/index/";
	var startIndex = url.indexOf(signature) + signature.length;
	var endIndex = url.indexOf("/", startIndex);
	return parseInt(url.substring(startIndex, endIndex));
}

//Retrieve publication id from preview node
function getId(preview){
	return parseInt(preview.id.substring(1), 10);
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

function generateWatchedEventCode(page){
	return "document.head.dispatchEvent(new CustomEvent('viewWatched', {detail:{page: " + page + "}}));";
}

function generateSubscriptionButton(tag){
	var subscribed = storedTags.includes(tag);
	var mark = document.createElement("a");
	mark.setAttribute("href", "javascript:void(0)");
	mark.setAttribute("id", SBTN_UID_PREFIX + tag);
	mark.style.margin = "2px";
	mark.textContent = subscribed ? UNSB_MARK : SUBS_MARK;
	mark.title = subscribed ? UNSB_TITLE : SUBS_TITLE;
	if (IS_BRAVE)
		mark.setAttribute("onclick", "document.head.dispatchEvent(new CustomEvent('toggleSubscription', {detail:{tag: '" + tag + "'}}));");
	else
		mark.setAttribute("onclick", "document.head.dispatchEvent(new CustomEvent('toggleSubscription', {detail:{tag: '" + tag + "', sender: this}}));");

	return mark;
}

//Brave is not able to refer to this as element from callback
function findTagButtonForBrave(tag){
	if (VERBOSE_LOGGING)
		console.log("findTagButton() call: \"" + SBTN_UID_PREFIX + tag + "\"");
	return (document.getElementById(SBTN_UID_PREFIX + tag));
}

function errorCallback(){
	if (ERROR_LOGGING)
		console.log("Error occured while loading from storage");
}

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