const SUBS_MARK = "OwO";
const UNSB_MARK = "XwX";
const SUBS_TITLE = "Subscribe to this tag";
const UNSB_TITLE = "Unsubscribe from this tag";
const SBTN_UID_PREFIX = "sbtn_uid_prefix_";
const WATCHED_MENUBUTTON_CAPTION = "Watched";

main();

async function main(){
	const storage = await Promise.all([
		load("subscriptions"),
		load("customQueries"),
		load("hideSubsButton"),
		load("watchTower")
	]);

	let storedTags = storage[0] || [];
	let storedQueries = storage[1] || [];
	let hideSubuscriptionButtons = Boolean(storage[2]);

	let cumLoad = storage[3];
	if (window.location.href.endsWith(WATCHED_URL_FLAG)){
		let page = cumLoad ? cumLoad.page : 1;
		let qurl = generateURL(page, generateQueries(storedTags)[0]);
		await save({
			"watchTower": {
				"url": qurl, 
				"page": page
			}
		});
		console.log(qurl);
		window.location.replace(qurl);
		return;
	}

	linkifyPage(storedTags, hideSubuscriptionButtons);

	if (cumLoad && decodeURIComponent(window.location.href) == decodeURIComponent(cumLoad.url)){
		//It is watched page
		let currentPage = cumLoad.page;

		let masterPreviews = getPreviews(document);
		if (storedTags.length > TAG_PER_QUERY_LIMIT || storedQueries.length > 0){
			await getDirty(currentPage, storedTags, storedQueries, masterPreviews);
		}
		
		if (currentPage == 1){
			for (let preview of masterPreviews){
				if (preview.tagName != "ARTICLE") continue;

				await save({
					"lastSeen": getPostId(preview)
				});
				break;
			}
		}
		//overwriteSearchInput(storedTags);
		processPaginator(storedTags);
	}
}

function createProgressbar(max){
	let bar = document.createElement("progress");
	bar.style.width = "100%";
	bar.max = max;
	return {
		element: bar,
		set: v => bar.value = v
	}
}
//Called when tag query exceeds limit
async function getDirty(page, storedTags, storedQueries, masterPreviews){
	let queryQueue = generateQueries(storedTags).slice(1);
	let urls = queryQueue.map(e => generateURL(page, e));

	if (storedQueries && storedQueries.length > 0){
		let additionalURLs = storedQueries.map(query => {
			return generateURL(page, encodeSearchQuery(query));
		});
		urls = urls.concat(additionalURLs);
	}

	let progressbarCallback = null;
	if (urls.length > 1){
		let bar = createProgressbar(urls.length);
		progressbarCallback = counter => bar.set(counter);
		(document.querySelector(".navigation") || document.querySelector("nav")).appendChild(bar.element);
	}

	let pages = await loadPages(urls, progressbarCallback);

	for (let page of pages){
		let previews = censor(getPreviews(page));

		while (previews.length > 0){
			const slavePreview = previews.pop();
			for (let masterPreview of masterPreviews){
				let isLastMasterPreview = masterPreview == (masterPreviews[masterPreviews.length - 1]);
				if (tryEmbedPreview(slavePreview, masterPreview, isLastMasterPreview))
					break;
			}
		}

		//Embed trendingtags
		let tagBox = getTagBox(page);
		if (tagBox){
			embedTrendingTags(tagBox, storedTags);
		}
	}

	const blackEnabler = document.querySelector("disable-all-blacklists");
	if (blackEnabler) blackEnabler.click();
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
async function viewWatched(event, storedTags, page){
	let qurl = generateURL(page, generateQueries(storedTags)[0]);
	await save({
		"watchTower": {
			"url": qurl, 
			"page": page
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
			//save({"lastSeen": 0});
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

function linkifyPage(storedTags, hideSubuscriptionButtons){
	let tagBox = getTagBox(document);
	if (tagBox && !hideSubuscriptionButtons){
		linkifyTags(tagBox, storedTags);
	}

	//Then linkify navbar
	let watchTower;
	let seat;

	const poneWithFleshlight = document.createElement("a");
	poneWithFleshlight.href = "javascript:void(0)";
	poneWithFleshlight.id = "nav-watched";
	poneWithFleshlight.addEventListener("click", e => viewWatched(e, storedTags, 1));
	poneWithFleshlight.textContent = WATCHED_MENUBUTTON_CAPTION;

	const navPosts = document.getElementById("nav-posts");
	if (navPosts){
		const ul = navPosts.parentElement;
		watchTower = document.createElement("li");
		watchTower.append(poneWithFleshlight);
		ul.children[0].after(watchTower);
	} else {
		// main page
		document
			.getElementById("links")
			?.children[0]
			.after(poneWithFleshlight);
	}
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
				let page = parseInt(link.textContent, 10);
				link.addEventListener("click", e => viewWatched(e, storedTags, page));
			}
}

function getIdFromPreview(preview){
	return parseInt(preview.getAttribute("data-id"), 10);
}

//Replace text in search field with actual query
function overwriteSearchInput(storedTags){
	document.getElementById("tags").value = decodeURIComponent(generateQueries(storedTags).join("").split("+").join(" "));
}
