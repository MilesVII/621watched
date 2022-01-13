const SUBS_MARK = "OwO";
const UNSB_MARK = "XwX";
const SUBS_TITLE = "Subscribe to this tag";
const UNSB_TITLE = "Unsubscribe from this tag";
const SBTN_UID_PREFIX = "sbtn_uid_prefix_";
const WATCHED_MENUBUTTON_CAPTION = "Watched";

main();

async function main(){
	let storedTags = [];
	let storedSubscriptions = await load("subscriptions");
	if (storedSubscriptions){
		storedTags = storedSubscriptions;
	}

	linkifyPage(storedTags);

	let cumLoad = await load("watchTower");
	if (cumLoad && window.location.href == cumLoad.url){
		//It is watched page
		let currentPage = cumLoad.page;

		let masterPreviews = getPreviews(document);
		if (storedTags.length > TAG_PER_QUERY_LIMIT){
			await getDirty(currentPage, storedTags, masterPreviews);
		}
		
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

//Called when tag query exceeds limit
async function getDirty(page, storedTags, masterPreviews){
	let queryQueue = generateQueries(storedTags);
	let urls = queryQueue.map(e => {return generateURL(page, e)});

	// let requests = [];
	// for (let query of queryQueue.slice(1)){
	// 	let url = generateURL(page, query)
	// 	requests.push(fetch(url));
	// }
	// let responses = await Promise.all(requests);

	// let parsed = [];
	// for (let response of responses){
	// 	parsed.push(response.text());
	// }

	let pages = await loadPages(urls); //await Promise.all(parsed);
	for (let page of pages){
		//let slavePage = new DOMParser().parseFromString(slavePageHTML, "text/html");
		let previews = getPreviews(page);

		while (previews.length > 0){
			for (let masterPreview of masterPreviews){
				let isLastMasterPreview = masterPreview == (masterPreviews[masterPreviews.length - 1]);
				if (tryEmbedPreview(previews[0], masterPreview, isLastMasterPreview))
					break;
			}
		}

		//Embed trendingtags
		let tagBox = getTagBox(page);
		if (tagBox){
			embedTrendingTags(tagBox, storedTags);
		}
	}
}

function embedTrendingTags(slaveTagBox, storedTags){
	linkifyTags(slaveTagBox, storedTags);

	let tagBox = getTagBox(document);
	if (slaveTagBox)
		slaveTagBox = slaveTagBox.querySelector("ul");
	if (tagBox)
		tagBox.append(slaveTagBox);
		// while (slaveTagBox.children.length > 0)
}

//Insert slave preview node into page near master node
function tryEmbedPreview(slave, master, override){
	let slaveId = getIdFromPreview(slave);
	let masterId = getIdFromPreview(master);
	
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

function getPreviews(node){
	let container = node.getElementById("posts-container");
	return container.children;
}

function generateSubscriptionButton(tag, storedTags){
	let subscribed = storedTags.includes(tag);

	let mark = document.createElement("a");
	mark.setAttribute("href", "javascript:void(0)");
	mark.setAttribute("id", SBTN_UID_PREFIX + tag);
	mark.style.margin = "2px";
	mark.textContent = subscribed ? UNSB_MARK : SUBS_MARK;
	mark.title = subscribed ? UNSB_TITLE : SUBS_TITLE;
	mark.addEventListener("click", e => toggleSubscription(e, storedTags, tag));
	mark.dataset.tagName = tag;
	//enforceAdoptingBySubscriptionButton(mark, tag);
	return mark;
}

//Event listener for Watched button (and paginator)
async function viewWatched(event, storedTags){
	let mrSandman = event.srcElement || event.target;
	let currentPage;

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
	//Both browsers are barking, but everything works
	console.log(tag);

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
		}
	}
	if (DEBUG_LOGGING)
		console.log(storedTags);
}

//Add subscription buttons to tag list
function linkifyTags(tagBox, storedTags){
	if (!tagBox){
		return;
	}
	let tagList = tagBox.querySelectorAll("li");
	for (let item of tagList){
		let tag = item.querySelector(".search-tag");

		if (!tag){
			continue;
		} else {
			item.prepend(generateSubscriptionButton(tag.textContent, storedTags));
		}
	}
}

function linkifyPage(storedTags){
	let tagBox = getTagBox(document);
	if (tagBox){
		linkifyTags(tagBox, storedTags);
	}

	//Then linkify navbar
	let ul = document.getElementById("nav-posts").parentElement;
	let watchTower = document.createElement("li");

	let poneWithFleshlight = document.createElement("a");
	poneWithFleshlight.href = "javascript:void(0)";
	poneWithFleshlight.id = "nav-watched";
	poneWithFleshlight.addEventListener("click", e => viewWatched(e, storedTags));
	poneWithFleshlight.textContent = WATCHED_MENUBUTTON_CAPTION;

	watchTower.append(poneWithFleshlight);
	ul.children[0].after(watchTower);

	processPaginator(storedTags);
	overwriteSearchInput(storedTags);
}

function getTagBox(root){
	let tagBox = root.getElementById("tag-box");
	if (!tagBox)
		tagBox = root.getElementById("tag-list");
	if (tagBox)
		return tagBox;
}

//Add event dispatching to inform processor that page is changed
function processPaginator(storedTags){
	let pageLinks = document.querySelectorAll(".numbered-page");

	for (let pageLink of pageLinks)
		for (let link of pageLink.querySelectorAll("a"))
			if (link.href.includes("/posts?page=")){
				link.addEventListener("click", e => viewWatched(e, storedTags));
			}
}

function getIdFromPreview(preview){
	return parseInt(preview.getAttribute("data-id"), 10);
}

//Replace text in search field with actual query
function overwriteSearchInput(storedTags){
	document.getElementById("tags").value = decodeURIComponent(generateQueries(storedTags).join("").split("+").join(" "));
}