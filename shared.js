const TAG_PER_QUERY_LIMIT = 40;
const VERBOSE_LOGGING = true;
const DEBUG_LOGGING = true;
const MERGE_LOGGING = true;
const ERROR_LOGGING = true;
const IS_CHROME = !browser;

if (!browser) var browser = chrome;

async function loadPages(urls){
	let requests = [];
	let failed = false;
	
	//can't use Promise.allSettled due to poor support by older browsers
	for (let url of urls){
		let promise = new Promise(resolve => {
			fetch(url, {redirect: "error"})
				.then(response => resolve(response))
				.catch(e => {
					failed = true;
					resolve(null);
				});
		});
		requests.push(promise);
	}
	let responses = await Promise.all(requests);
	if (failed) return [];

	let parsed = [];
	for (let response of responses){
		if (response)
			parsed.push(response.text());
	}

	let pages = await Promise.all(parsed);

	let doms = pages.map(page => new DOMParser().parseFromString(page, "text/html"));

	return doms;
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

function getPostId(preview){
	return parseInt(preview.dataset.id, 10);
}

async function save(json){
	await browser.storage.local.set(json);
}

async function load(key){
	let stored;
	if (IS_CHROME){
		stored = await new Promise(resolve => {
			chrome.storage.local.get(key, r => {resolve(r)});
		});
	} else {
		stored = await browser.storage.local.get(key);
	}
	if (stored && stored[key])
		return stored[key];
	else
		return null;
}