
const e = {
	indicator: document.querySelector(".indicator"),
	mainButton: document.querySelector(".view-button"),
	tagList: {
		placeholder: document.querySelector(".tag-list-placeholder"),
		the: document.querySelector(".tag-list")
	},
	customQueries: {
		list: document.querySelector(".custom-query-list"),
		input: document.querySelector("#custom-query-input"),
		add: document.querySelector("#custom-query-input-add")
	},
	hideSubsCheckbox: document.querySelector("#hide-subs-button-checkbox"),
	permalink: document.querySelector("#permalink"),
	backup: {
		view: document.querySelector(".backup-view"),
		toggle: document.querySelector("#backup-view-toggle"),
		textarea: document.querySelector("#backup-textarea"),
		import: document.querySelector("#backup-import"),
		copy: document.querySelector("#backup-copy")
	},
	footer: {
		title: document.querySelector("footer .title")
	}
};

const titles = [
	", the one, the only",
	", the other one",
	", the servant of cringe",
	", the uhhhh ano~",
	", the dick painter",
	", the fops hors",
	" =P",
	" lemon melon cookie"
];

main();

async function main(){
	const storage = await Promise.all([
		load("subscriptions"),
		load("customQueries"),
		load("hideSubsButton")
	]);

	let storedTags = storage[0] || [];
	let storedQueries = storage[1] || [];

	if (storedTags.length + storedQueries.length > 0){
		refresh(storedTags, storedQueries);
		let lastSeen = await load("lastSeen");

		if (lastSeen){
			checkForNewImages(lastSeen, storedTags, storedQueries);
		} else {
			setCheckingStatus("Last seen post is unknown, please view watched tags manually");
		}
	}

	e.backup.toggle.addEventListener("click", showBackupOptions);
	e.backup.import.addEventListener("click", importTagsFromBackup);
	e.backup.copy.addEventListener("click", copyTags);
	e.customQueries.add.addEventListener("click", addCustomQuery);
	e.hideSubsCheckbox.addEventListener("change", toggleSubsButton);
	e.hideSubsCheckbox.checked = Boolean(storage[2]);
	e.permalink.href = WATCHED_URL;

	loadTagsToBackupText(storedTags);

	e.footer.title.textContent = titles[Math.floor((titles.length - 1) * Math.random())];
}

async function refresh(storedTags, storedQueries, skipQueries = false){
	//Update list of tags
	const tagList = e.tagList.the;
	tagList.innerHTML = "";
	for (const tag of storedTags)
		tagList.appendChild(generateTagItem(tag));

	if (!skipQueries)
		for (let query of storedQueries)
			createCustomQueryItem(query);

	// Generate a link for Watched button and reset watchTower
	let watchedButton = e.mainButton;
	let qurl = generateURL(1, generateQueries(storedTags)[0]);
	await save({
		"watchTower": {
			"url": qurl, 
			"page": 1
		}
	});
	watchedButton.href = qurl;

	const subscriptionsLength = storedTags.length + storedQueries.length;
	const placeholder = e.tagList.placeholder;
	if (subscriptionsLength == 0){
		placeholder.classList.remove("hidden");
		watchedButton.classList.add("hidden");
	} else {
		placeholder.classList.add("hidden");
		watchedButton.classList.remove("hidden");
	}
}

function generateTagItem(tag){
	let a = document.createElement("a");
	a.className = "button-spacing";
	a.href = "https://e621.net/posts?tags=" + sanitize(tag);
	a.target = "_blank";
	a.textContent = tag;
	a.title = tag;

	return a;
}

function sanitize(tag){
	return encodeURIComponent(tag.split(" ").join("_"))
}

function setCheckingStatus(status){
	e.indicator.textContent = status;
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

	let pages = await loadPages(urls, counter => {
		setCheckingStatus("Checking for new images... (" + counter + "/" + urls.length + ")");
	});

	let newPostCounter = 0;
	let failedToLoad = false;
	let overflow = 0;
	if (pages.length == 0) {
		if (ERROR_LOGGING)
			console.log("Error occured while loading search queries");
		failedToLoad = true;
	} else {
		for (let page of pages){
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
	const previews = getPreviews(slavePage);
	const newPreviews = previews.filter(preview => getPostId(preview) > lastSeen);

	return {
		count: newPreviews.length,
		batch: previews.length,
		overflow: previews.length == newPreviews.length
	};
}

/////////////////////////////////////////////////////////////////////////////////////
//Backup Options

function showBackupOptions() {
	e.backup.toggle.classList.add("hidden")
	e.backup.view.classList.remove("hidden");
}

async function importTagsFromBackup() {
	storedTags = e.backup.textarea.value.trim().split("\n");
	await save({"subscriptions": storedTags});
	e.backup.import.textContent = "Saved succesfully. Please reopen the window";
}

async function copyTags() {
	const storedTags = await load("subscriptions");
	loadTagsToBackupText(storedTags);
	const backupText = e.backup.textarea;
	backupText.focus();
	backupText.select();
	document.execCommand("copy");
}

function loadTagsToBackupText(storedTags){
	e.backup.textarea.value = storedTags.join("\n");
}

function toggleSubsButton(){
	let checkbox = e.hideSubsCheckbox;
	checkbox.checked;
	
	save({
		"hideSubsButton": checkbox.checked
	});
}

/////////////////////////////////////////////////////////////////////////////////////
//Custom queries
function createCustomQueryItem(value){
	const container = document.createElement("div");
	container.className = "custom-query-item";

	const newItem = document.createElement("div");
	newItem.className = "custom-query-item-main button-spacing";
	newItem.title = newItem.textContent = value;

	const closeButton = document.createElement("div");
	closeButton.className = "custom-query-item-side close";
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

	e.customQueries.list.appendChild(container);
}

async function addCustomQuery(){
	const input = e.customQueries.input;
	const value = input.value.trim();
	if (value.length == 0) return;

	let storedQueries = await load("customQueries");

	if (!storedQueries || !Array.isArray(storedQueries)){
		storedQueries = [];
	}
	storedQueries.push(value);
	await save({
		customQueries: storedQueries
	});

	const storedTags = await load("subscriptions") ?? [];
	refresh(storedTags, storedQueries, true);

	createCustomQueryItem(value);

	input.value = "";
}
