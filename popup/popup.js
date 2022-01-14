main();

async function main(){
	let storedTags = [];
	let tagsStorage = await load("subscriptions");
	if (tagsStorage){
		storedTags = tagsStorage;
	}
	let storedQueries = [];
	let queryStorage = await load("customQueries");
	if (queryStorage && Array.isArray(queryStorage)){
		storedQueries = queryStorage;
	}

	if (storedTags.length + storedQueries.length > 0){
		refresh(storedTags, storedQueries);
		let lastSeen = await load("lastSeen");

		if (lastSeen){
			checkForNewImages(lastSeen, storedTags, storedQueries);
		} else {
			setCheckingStatus("Last seen post is unknown, please view watched tags manually");
		}
	}

	document.getElementById("import_button").addEventListener("click", importTagsFromBackup);
	document.getElementById("backupshow_button").addEventListener("click", showBackupOptions);
	document.getElementById("copy_button").addEventListener("click", e => copyTags(storedTags));
	document.getElementById("customQueryAdderButton").addEventListener("click", addCustomQuery);
	loadTagsToBackupText(storedTags);
}

async function refresh(storedTags, storedQueries, skipQueries = false){
	//Update list of tags
	let ul = document.getElementById("watchedTags");
	while (ul.lastChild) {
		ul.removeChild(ul.lastChild);
	}
	for (let tag of storedTags){
		ul.appendChild(generateTagItem(tag));
	}
	if (!skipQueries)
		for (let query of storedQueries){
			createCustomQueryItem(query);
		}

	let subscriptionsLength = storedTags.length + storedQueries.length;
	//Generate link for Watched button and reset watchTower
	let watchedButton = document.getElementById("viewWatched");
	let qurl = generateURL(1, generateQueries(storedTags)[0]);
	await save({
		"watchTower": {
			"url": qurl, 
			"page": 1
		}
	});
	watchedButton.href = qurl;
	watchedButton.target = "_blank";
	watchedButton.style.display = subscriptionsLength == 0 ? "none" : "block";
	watchedButton.textContent = "View watched";

	document.getElementById("nuffin").style.display = subscriptionsLength == 0 ? "block" : "none";
}

function generateTagItem(tag){
	let li = document.createElement("li");
	li.className = "tagItem";

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

async function checkForNewImages(lastSeen, storedTags, storedQueries){
	if ((storedTags.length + storedQueries.length) == 0)
		return;
	
	setCheckingStatus("Checking for new images...");

	let queryQueue = generateQueries(storedTags);
	let urls = queryQueue.map(e => generateURL(1, e));
	
	if (storedQueries && storedQueries.length > 0){
		let additionalURLs = storedQueries.map(query => {
			return generateURL(1, encodeSearchQuery(query));
		});
		urls = urls.concat(additionalURLs);
	}

	console.log(urls);
	let pages = await loadPages(urls, counter => {
		setCheckingStatus("Checking for new images... (" + counter + "/" + urls.length + ")");
	});
	
	// for (let i = 0; i < queryQueue.length; ++i){
	// 	let request = new XMLHttpRequest();
	// 	request.addEventListener("load", onSlavePageLoad);
	// 	request.open("GET", generateURL(1, queryQueue[i]));
	// 	request.send();
	// }

	let newPostCounter = 0;
	let failedToLoad = false;
	let overflow = 0;
	if (pages.length == 0) {
		if (ERROR_LOGGING)
			console.log("Error occured while loading search queries");
		failedToLoad = true;
	} else {
		for (let page of pages){
			//let slave = new DOMParser().parseFromString(page, "text/html");
			let newPosts = countUnseenPosts(page, lastSeen);
			if (newPosts.overflow) {
				overflow = newPosts.batch;
				break;
			} else {
				newPostCounter += newPosts.count;
			}
		}
	}

	let echo;
	if (failedToLoad)
		echo = "Failed to load, please check manually";
	else if (overflow > 0)
		echo = overflow + "+ new images";
	else if (newPostCounter == 0)
		echo = "No new images";
	else if (newPostCounter == 1)
		echo = newPostCounter + " new image";
	else
		echo = newPostCounter + " new images";

	setCheckingStatus(echo);
}

function countUnseenPosts(slavePage, lastSeen){
	let previews = slavePage.getElementById("posts-container").children;

	// let counter = 0;
	// for (let preview of previews){
	// 	let id = getPostId(preview);
	// 	if (id > lastSeen)
	// 		counter += 1;
	// 	else
	// 		break;
	// }
	// return counter;

	let newPreviews = Array.from(previews).filter(preview => getPostId(preview) > lastSeen);
	return {
		count: newPreviews.length,
		batch: previews.length,
		overflow: previews.length == newPreviews.length
	};
}

/////////////////////////////////////////////////////////////////////////////////////
//Backup Options

function showBackupOptions(){
	document.getElementById("backupshow_button").style.display = "none";
	document.getElementById("backup").style.display = "block";
}

async function importTagsFromBackup(){
	storedTags = document.getElementById("backupText").value.trim().split("\n");
	await save({"subscriptions": storedTags});
	document.getElementById("import_button").textContent = "Saved succesfully. Please reopen the window";
}

function copyTags(storedTags){
	loadTagsToBackupText(storedTags);
	let backupText = document.getElementById("backupText");
	backupText.focus();
	backupText.select();
	document.execCommand("copy");
}

function loadTagsToBackupText(storedTags){
	document.getElementById("backupText").value = storedTags.join("\n");
}

/////////////////////////////////////////////////////////////////////////////////////
//Custom queries
function createCustomQueryItem(value){
	let container = document.createElement("div");
	container.style.display = "block";
	container.style.marginBottom = "4px";

	let newItem = document.createElement("div");
	newItem.className = "customQueryItem";
	newItem.textContent = value;

	let closeButton = document.createElement("div");
	closeButton.className = "sidebutton close";
	closeButton.textContent = "X";
	closeButton.addEventListener("click", async () => {
		let storedQueries = await load("customQueries");
		if (storedQueries){
			let i = storedQueries.indexOf(value);
			if (i >= 0){
				storedQueries.splice(i, 1);
				await save({
					customQueries: storedQueries
				});
				console.log(storedQueries);
				container.remove();
			}
		}
	});


	container.appendChild(newItem);
	container.appendChild(closeButton);

	document.getElementById("customQueryList").appendChild(container);
}

async function addCustomQuery(){
	let input = document.getElementById("customQueriesInput");
	let v = input.value.trim();
	if (v.length == 0) return;

	let storedQueries = await load("customQueries");

	if (!storedQueries || !Array.isArray(storedQueries)){
		storedQueries = [];
	}
	storedQueries.push(v);
	await save({
		customQueries: storedQueries
	})

	let storedTags = [];
	let tagsStorage = await load("subscriptions");
	if (tagsStorage){
		storedTags = tagsStorage;
	}
	refresh(storedTags, storedQueries, true);

	createCustomQueryItem(v);

	input.value = "";
}