const SUBS_MARK = "OwO";
const UNSB_MARK = "XwX";
const SUBS_TITLE = "Subscribe to this tag";
const UNSB_TITLE = "Unsubscribe from this tag";
const SBTN_UID_PREFIX = "sbtn_uid_prefix_";
//const SBAI_UID = "sbai_uid";
const WATCHED_MENUBUTTON_CAPTION = "Watched";
const TAG_PER_QUERY_LIMIT = 40;
const VERBOSE_LOGGING = false;
const DEBUG_LOGGING = false;
const MERGE_LOGGING = false;
const ERROR_LOGGING = true;
const IS_CHROME = !browser;
//const IS_CHROME = true; // Reference to "chrome" instead of "browser"
const api = browser || chrome;

/////////////////////////////////////////////////////////////////////////////////////
//Init
document.head.addEventListener("toggleSubscription", toggleSubscription);
document.head.addEventListener("viewWatched", viewWatched);


async function main(){
	let storedTags = [];
	let storedSubscriptions = await load("subscriptions");
	if (storedSubscriptions && storedSubscriptions.hasOwnProperty("subscriptions")){
		storedTags = storedSubscriptions.subscriptions;
	}
	linkify(storedTags);
	let cumLoad = await load("watchTower");
	if (cumLoad && cumLoad.hasOwnProperty("watchTower") && window.location.href == cumLoad.watchTower.url){
		masterPreviews = getPreviewList(document);
		currentPage = cumLoad.watchTower.page;
		if (storedTags.length > TAG_PER_QUERY_LIMIT){
			getDirty(currentPage, storedTags);
		} else {
			doneSlaveProcessing();
		}
	}
}
main();

//let slaveRequestsPending = 0;

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

function generateSubscriptionButton(tag, storedTags){
	let subscribed = storedTags.includes(tag);

	let mark = document.createElement("a");
	mark.setAttribute("href", "javascript:void(0)");
	mark.setAttribute("id", SBTN_UID_PREFIX + tag);
	mark.style.margin = "2px";
	mark.textContent = subscribed ? UNSB_MARK : SUBS_MARK;
	mark.title = subscribed ? UNSB_TITLE : SUBS_TITLE;
	mark.addEventListener("click", toggleSubscription);
	mark.dataset.tagName = tag;
	//enforceAdoptingBySubscriptionButton(mark, tag);
	return mark;
}

//Event listener for Watched button (and paginator)
function viewWatched(event){
	let mrSandman = event.srcElement || event.target;
	if (mrSandman.textContent === WATCHED_MENUBUTTON_CAPTION)
		currentPage = 1;
	else
		currentPage = parseInt(mrSandman.textContent);

	let qurl = generateURL(currentPage, generateQueries()[0]);
	save({"watchTower": {"url": qurl, "page": currentPage}}).then(()=>{
		window.location.href = qurl;
	});
}

//Add subscription buttons to tag list
function linkifyTags(ul, storedTags){
	if (ul){
		let tagList = ul.getElementsByTagName("li");
		for (let item of tagList){
			let tag = getTagFromLi(item);

			if (!tag){
				continue;
			} else {
				item.prepend(generateSubscriptionButton(tag, storedTags));
			}
		}
	}
}
function linkify(storedTags){
	//Linkify tags
	let tagBox = document.getElementById("tag-box");
	if (!tagBox)
		tagBox = document.getElementById("tag-list");
	for (let runner of tagBox.children){
		if (runner.nodeName == "UL")
			linkifyTags(runner);
	}

	//Then linkify navbar
	let ul = document.getElementById("nav-posts").parentElement;
	let watchTower = document.createElement("li");
	let poneWithFleshlight = document.createElement("a");
	poneWithFleshlight.href = "javascript:void(0)";
	poneWithFleshlight.id = "nav-watched";
	poneWithFleshlight.addEventListener("click", viewWatched);//setAttribute("onclick", generateWatchedEventCode(1));
	poneWithFleshlight.textContent = WATCHED_MENUBUTTON_CAPTION;

	watchTower.append(poneWithFleshlight);
	//ul.insertBefore(watchTower, ul.childNodes[2]);
	//ul.insertBefore(watchTower, ul.children[1]);
	ul.children[0].after(watchTower);
}



async function save(json){
	await api.storage.local.set(json);
}

async function load(key){
	return await browser.storage.local.get(key);
}