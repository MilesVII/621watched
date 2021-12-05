const SUBS_MARK = "OwO";
const UNSB_MARK = "XwX";
const SUBS_TITLE = "Subscribe to this tag";
const UNSB_TITLE = "Unsubscribe from this tag";
const SBTN_UID_PREFIX = "sbtn_uid_prefix_";
//const SBAI_UID = "sbai_uid";
const WATCHED_MENUBUTTON_CAPTION = "Watched";
const TAG_PER_QUERY_LIMIT = 40;
const VERBOSE_LOGGING = true;
const DEBUG_LOGGING = true;
const MERGE_LOGGING = true;
const ERROR_LOGGING = true;
const IS_CHROME = !browser;

if (!browser) var browser = chrome;

/////////////////////////////////////////////////////////////////////////////////////
//Init
document.head.addEventListener("toggleSubscription", toggleSubscription);
//document.head.addEventListener("viewWatched", viewWatched);
main();

async function main(){
	let storedTags = [];
	let storedSubscriptions = await load("subscriptions");
	if (storedSubscriptions && storedSubscriptions.hasOwnProperty("subscriptions")){
		storedTags = storedSubscriptions.subscriptions;
	}

	linkifyPage(storedTags);
	console.log("linkify page done");

	let cumLoad = await load("watchTower");
	if (cumLoad && cumLoad.watchTower && window.location.href == cumLoad.watchTower.url){
		//It is watched page
		let currentPage = cumLoad.watchTower.page;

		masterPreviews = getPreviewList(document);
		if (storedTags.length > TAG_PER_QUERY_LIMIT){
			await getDirty(currentPage, storedTags);
		}
		
		//doneSlaveProcessing();
		if (currentPage == 1){
			for (let i = 0; i < masterPreviews.length; ++i){
				if (masterPreviews[i].nodeType == 1){
					save({
						"lastSeen": getPostId(masterPreviews[i])
					});
					break;
				}
			}
		}
	}
}

//Generate array of search queries
function generateQueries(storedTags){
	let queries = [];

	for (let offset = 0; offset < storedTags.length; offset += TAG_PER_QUERY_LIMIT){
		let batch = storedTags.slice(offset, offset + TAG_PER_QUERY_LIMIT);
		// for (let tag of slice){
		// 	query += encodeURIComponent("~" + tag.split(" ").join("_")) + "+";
		// }
		let query = batch.map(tag => encodeURIComponent("~" + tag.split(" ").join("_"))).join("+");

		queries.push(query);
	}

	return queries;
}

function generateURL(page, query){
	return "https://e621.net/posts?page=" + page + "&tags=" + query;
}

//Called when tag query exceeds limit
async function getDirty(page, storedTags){
	let queryQueue = generateQueries(storedTags);
	// for (let i = 1; i < queryQueue.length; ++i){
	// 	let request = new XMLHttpRequest();
	// 	request.addEventListener("load", onSlavePageLoad);
	// 	request.open("GET", );
	// 	request.send();
	// 	++slaveRequestsPending;
	// }

	let requests = [];
	for (let query of queryQueue.slice(0)){
		let url = generateURL(page, query)
		requests.push(fetch(url));
	}
	let responses = await Promise.all(requests);

	const slave = document.implementation.createHTMLDocument();
	slave.innerHTML = await responses[0].text();
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
	let slave = new DOMParser().parseFromString(this.responseText, "text/html");

	//Embed pictures
	let previews = getPreviewList(slave);

	if (!previews){
		if (ERROR_LOGGING)
			console.log("Error occured while parsing slavePage");
		tryDoneSlaveProcessing();
		return;
	}

	while (previews.length > 0){
		for (let masterPreview of masterPreviews){
			//Removed node type validation because I discovered "children" property
			let override = masterPreview == (masterPreviews[masterPreviews.length - 1]);
			if (tryEmbedPreview(previews[0], masterPreview, override))
				break;
		}
	}

	//Embed trendingtags
	embedTrendingTags(getUlFromTagbox(slave.getElementById("tag-box")));

	tryDoneSlaveProcessing();	
}

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

function getPostId(preview){
	return parseInt(preview.dataset.id, 10);
}

function generateSubscriptionButton(tag, storedTags){
	let subscribed = storedTags.includes(tag);

	let mark = document.createElement("a");
	mark.setAttribute("href", "javascript:void(0)");
	mark.setAttribute("id", SBTN_UID_PREFIX + tag);
	mark.style.margin = "2px";
	mark.textContent = subscribed ? UNSB_MARK : SUBS_MARK;
	mark.title = subscribed ? UNSB_TITLE : SUBS_TITLE;
	let wrapperFunction = e => {toggleSubscription(e, storedTags, tag);}
	mark.addEventListener("click", wrapperFunction);
	mark.dataset.tagName = tag;
	//enforceAdoptingBySubscriptionButton(mark, tag);
	return mark;
}

//Event listener for Watched button (and paginator)
async function viewWatched(event, storedTags){
	let mrSandman = event.srcElement || event.target;
	if (mrSandman.textContent === WATCHED_MENUBUTTON_CAPTION)
		currentPage = 1;
	else
		currentPage = parseInt(mrSandman.textContent);

	let qurl = generateURL(currentPage, generateQueries(storedTags)[0]);
	await save({
		"watchTower": {
			"url": qurl, 
			"page": currentPage
		}
	});
	window.location.href = qurl;
}

function toggleSubscription(event, storedTags, tag){
	if (VERBOSE_LOGGING)
		console.log("Received toggle event");

	let mrSandman = event.srcElement || event.target;

	//CSP halts the execution if I try to call getElementByID
	//var tag = mrSandman.lastChild.textContent;
	//let tag = mrSandman.dataset.tagName;
	//alert(tag)

	if (!storedTags.includes(tag)){
		if (VERBOSE_LOGGING)
			console.log("Adding...");
		mrSandman.textContent = UNSB_MARK;
		mrSandman.title = UNSB_TITLE;
		storedTags.push(tag);
		save({"subscriptions": storedTags});
		if (DEBUG_LOGGING)
			console.log("Added successfully");
	} else {
		let i = storedTags.indexOf(tag);
		if (i > -1){
			if (VERBOSE_LOGGING)
				console.log("Removing...");
			mrSandman.textContent = SUBS_MARK;
			mrSandman.title = SUBS_TITLE;
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

function linkifyPage(storedTags){
	//Add subscription buttons to tag list
	function linkifyTags(ul, storedTags){
		if (ul){
			let tagList = ul.getElementsByTagName("li");
			for (let item of tagList){
				let tag = item.querySelector(".search-tag");

				if (!tag){
					continue;
				} else {
					item.prepend(generateSubscriptionButton(tag, storedTags));
				}
			}
		}
	}
	
	let tagBox = document.getElementById("tag-box");
	if (!tagBox)
		tagBox = document.getElementById("tag-list");
	if (tagBox){
		console.log(tagBox.children);
		for (let runner of tagBox.children){
			if (runner.nodeName == "UL")
				linkifyTags(runner, storedTags);
		}
	}

	//Then linkify navbar
	let ul = document.getElementById("nav-posts").parentElement;
	let watchTower = document.createElement("li");

	let poneWithFleshlight = document.createElement("a");
	poneWithFleshlight.href = "javascript:void(0)";
	poneWithFleshlight.id = "nav-watched";
	let fuckEvents = (e) => {viewWatched(e, storedTags)};
	poneWithFleshlight.addEventListener("click", fuckEvents);
	poneWithFleshlight.textContent = WATCHED_MENUBUTTON_CAPTION;

	watchTower.append(poneWithFleshlight);
	ul.children[0].after(watchTower);

	processPaginator(storedTags);
	overwriteSearchInput(storedTags);
}

function addSubscribtionButtons(storedTags){

}

//Add event dispatching to inform processor that page is changed
function processPaginator(storedTags){
	var pageLinks = document.getElementsByClassName("numbered-page");

	for (let pageLink of pageLinks)
		for (let link of pageLink.querySelectorAll("a"))
			if (link.href.includes("/posts?page=")){
				let fuckEvents = (e) => {viewWatched(e, storedTags)};
				link.addEventListener("click", fuckEvents);
			}
}

//Replace text in search field with actual query
function overwriteSearchInput(storedTags){
	document.getElementById("tags").value = decodeURIComponent(generateQueries(storedTags).join("").split("+").join(" "));
}

async function save(json){
	await api.storage.local.set(json);
}

async function load(key){
	if (IS_CHROME){
		return await new Promise(resolve => {
			chrome.storage.local.get(key, r => {resolve(r)});
		});
	} else {
		return await browser.storage.local.get(key);
	}
}