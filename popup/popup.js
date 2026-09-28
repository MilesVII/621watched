
const e = {
	indicator: document.querySelector(".indicator"),
	notice: {
		box: document.querySelector(".notice"),
		text: document.querySelector(".notice-text"),
		action: document.querySelector(".notice-action")
	},
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
		startCheck(storedTags, storedQueries);
	}

	e.backup.toggle.addEventListener("click", showBackupOptions);
	e.backup.import.addEventListener("click", importTagsFromBackup);
	e.backup.copy.addEventListener("click", copyTags);
	e.customQueries.add.addEventListener("click", addCustomQuery);
	e.hideSubsCheckbox.addEventListener("change", toggleSubsButton);
	e.hideSubsCheckbox.checked = Boolean(storage[2]);
	e.permalink.href = WATCHED_URL;

	loadTagsToBackupText(storedTags, storedQueries);

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

//Shows an explanation under the counter. action is optional:
//	{ label, href } opens a link in a new tab, { label, onClick } runs a handler
function showNotice(text, action = null){
	e.notice.text.textContent = text;
	e.notice.box.classList.remove("hidden");

	const button = e.notice.action.cloneNode(false); //drop listeners from a previous notice
	e.notice.action.replaceWith(button);
	e.notice.action = button;

	if (!action){
		button.classList.add("hidden");
		return;
	}
	button.textContent = action.label;
	button.classList.remove("hidden");
	if (action.href){
		button.href = action.href;
		button.target = "_blank";
	} else {
		button.href = "#";
		button.addEventListener("click", event => {
			event.preventDefault();
			action.onClick();
		});
	}
}

function hideNotice(){
	e.notice.box.classList.add("hidden");
}

async function hasHostPermission(){
	try {
		return await browser.permissions.contains({ origins: [E621_ORIGIN_PATTERN] });
	} catch (error){
		//permissions API unavailable: assume granted and let fetch() report the truth
		return true;
	}
}

//permissions.request must be called synchronously from a user gesture (the click handler),
//so nothing may be awaited before it
function requestHostPermission(storedTags, storedQueries){
	browser.permissions.request({ origins: [E621_ORIGIN_PATTERN] })
		.then(granted => {
			if (granted)
				startCheck(storedTags, storedQueries);
		})
		.catch(error => {
			showNotice("Couldn't request permission: " + error.message);
		});
}

async function startCheck(storedTags, storedQueries){
	hideNotice();

	if (!await hasHostPermission()){
		setCheckingStatus("Can't check for new images");
		showNotice(
			"The extension isn't allowed to access e621.net, so it can't look for new posts. " +
			"Grant it access (or enable it in the extension's permission settings) and it will check again.",
			{ label: "Allow access to e621.net", onClick: () => requestHostPermission(storedTags, storedQueries) }
		);
		return;
	}

	const lastSeen = await load("lastSeen");
	if (lastSeen){
		checkForNewImages(lastSeen, storedTags, storedQueries);
	} else {
		setCheckingStatus("Last seen post is unknown, please view watched tags manually");
	}
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

	const results = await fetchPages(urls, counter => {
		setCheckingStatus("Checking for new images... (" + counter + "/" + urls.length + ")");
	});

	const loaded = results.filter(r => r.ok);
	const failed = results.filter(r => !r.ok);
	if (ERROR_LOGGING && failed.length > 0)
		console.log("Failed to load search queries", failed);

	//Count across every page that did load. If some page consisted entirely of unseen
	//posts there are more on its next pages, so the total is a lower bound ("N+")
	let newPostCounter = 0;
	let overflow = false;
	for (const result of loaded){
		const newPosts = countUnseenPosts(result.dom, lastSeen);
		newPostCounter += newPosts.count;
		if (newPosts.overflow)
			overflow = true;
	}

	if (loaded.length == 0){
		setCheckingStatus("Can't check for new images");
		explainFailure(failed[0], storedTags, storedQueries);
		return;
	}

	let echo;
	if (overflow)
		echo = newPostCounter + "+ new images";
	else if (newPostCounter == 0)
		echo = "No new images";
	else if (newPostCounter == 1)
		echo = newPostCounter + " new image";
	else
		echo = newPostCounter + " new images";

	if (failed.length > 0)
		echo += " (" + failed.length + " of " + results.length + " queries failed)";

	setCheckingStatus(echo);
	if (failed.length > 0)
		explainFailure(failed[0], storedTags, storedQueries);
}

function explainFailure(result, storedTags, storedQueries){
	const retry = { label: "Try again", onClick: () => startCheck(storedTags, storedQueries) };

	switch (result.error){
		case "challenge":
			showNotice(
				"e621.net is asking to solve a Cloudflare check before it serves pages. " +
				"Opening e621.net *might* help.",
				{ label: "Open e621.net", href: "https://e621.net/posts" }
			);
			break;
		case "http":
			showNotice(
				`e621.net answered with HTTP ${result.status}${result.message ? ` (${result.message})` : ""}. ` +
				"The site may be down, rate limiting, or blocking this request.",
				retry
			);
			break;
		default: //network
			showNotice(
				`Couldn't reach e621.net: ${result.message || "network error"}.`,
				retry
			);
			break;
	}
}

function countUnseenPosts(slavePage, lastSeen){
	const previews = getPreviews(slavePage);
	const newPreviews = previews.filter(preview => getPostId(preview) > lastSeen);

	return {
		count: newPreviews.length,
		batch: previews.length,
		//a page made only of unseen posts means its next pages hold more;
		//an empty page must not count as overflow
		overflow: previews.length > 0 && previews.length == newPreviews.length
	};
}

/////////////////////////////////////////////////////////////////////////////////////
//Backup Options

function showBackupOptions() {
	e.backup.toggle.classList.add("hidden")
	e.backup.view.classList.remove("hidden");
}

//Backup format: one tag per line, then this separator, then one custom query per line.
//Tags can't start with "-", so the separator line can never be mistaken for a tag.
//Backups made before the separator existed contain tags only.
const BACKUP_QUERIES_SEPARATOR = "--- custom queries ---";

function serializeBackup(storedTags, storedQueries){
	return [...storedTags, BACKUP_QUERIES_SEPARATOR, ...storedQueries].join("\n");
}

//Returns { tags, queries }; queries is null for an old tags-only backup
function parseBackup(text){
	const unique = list => [...new Set(list)];
	const lines = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);
	const separatorAt = lines.indexOf(BACKUP_QUERIES_SEPARATOR);

	if (separatorAt < 0)
		return { tags: unique(lines), queries: null };
	return {
		tags: unique(lines.slice(0, separatorAt)),
		queries: unique(lines.slice(separatorAt + 1))
	};
}

async function importTagsFromBackup() {
	const backup = parseBackup(e.backup.textarea.value);
	if (backup.tags.length == 0 && backup.queries == null){
		e.backup.import.textContent = "Nothing to import";
		return;
	}

	const storedTags = backup.tags;
	const storedQueries = backup.queries ?? ((await load("customQueries")) || []);
	await save({
		"subscriptions": storedTags,
		"customQueries": storedQueries
	});

	//Redraw the popup in place instead of asking to reopen it
	e.customQueries.list.innerHTML = "";
	await refresh(storedTags, storedQueries);
	startCheck(storedTags, storedQueries);
	e.backup.import.textContent = "Imported";
}

async function copyTags() {
	const [storedTags, storedQueries] = await Promise.all([
		load("subscriptions"),
		load("customQueries")
	]);
	loadTagsToBackupText(storedTags || [], storedQueries || []);
	const backupText = e.backup.textarea;
	backupText.focus();
	backupText.select();
	document.execCommand("copy");
}

function loadTagsToBackupText(storedTags, storedQueries){
	e.backup.textarea.value = serializeBackup(storedTags, storedQueries);
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
