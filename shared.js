const TAG_PER_QUERY_LIMIT = 40;
const WATCHED_URL_FLAG = "&redirect=watched";
const WATCHED_URL = "https://e621.net/#" + WATCHED_URL_FLAG;
const E621_ORIGIN_PATTERN = "*://*.e621.net/*"; //must match host_permissions in manifest.json
const VERBOSE_LOGGING = false;
const DEBUG_LOGGING = false;
const MERGE_LOGGING = false;
const ERROR_LOGGING = false;
const IS_CHROME = !browser;

if (!browser) var browser = chrome;

//Fetches every URL in parallel. Never throws: each URL gets a result object
//	{ url, status, ok, dom, error, message }
//where error is null on success or one of:
//	"network"   - fetch() itself rejected (no host permission, offline, blocked, redirect)
//	"challenge" - Cloudflare served a browser challenge instead of the page
//	"http"      - any other non-2xx response
async function fetchPages(urls, pageLoadedCallback = null){
	let loadedPages = 0;
	const reportProgress = () => {
		loadedPages += 1;
		if (pageLoadedCallback)
			pageLoadedCallback(loadedPages);
	};

	return Promise.all(urls.map(async url => {
		const result = { url, status: 0, ok: false, dom: null, error: null, message: "" };
		try {
			//credentials: "include" sends the user's e621 cookies (session, cf_clearance),
			//so the request looks like the user's own browsing rather than an anonymous bot
			const response = await fetch(url, {
				redirect: "error",
				credentials: "include"
			});
			result.status = response.status;
			const body = await response.text();

			if (isCloudflareChallenge(response, body)){
				result.error = "challenge";
			} else if (!response.ok){
				result.error = "http";
				result.message = response.statusText;
			} else {
				result.dom = new DOMParser().parseFromString(body, "text/html");
				result.ok = true;
			}
		} catch (e){
			result.error = "network";
			result.message = (e && e.message) ? e.message : String(e);
		}
		reportProgress();
		return result;
	}));
}

function isCloudflareChallenge(response, body){
	if (response.headers.get("cf-mitigated") == "challenge")
		return true;
	if (response.status != 403 && response.status != 503)
		return false;
	return /cdn-cgi\/challenge-platform|cf-chl|cf_chl|Just a moment/i.test(body);
}

//Backwards-compatible wrapper used by the content script:
//returns parsed documents, or [] if any page failed to load
async function loadPages(urls, pageLoadedCallback = null){
	const results = await fetchPages(urls, pageLoadedCallback);
	if (results.some(r => !r.ok)) return [];
	return results.map(r => r.dom);
}

function censor(previews){
	let blacklistRaw = Array.from(document.querySelectorAll("meta")).find(e => e.name == "blacklisted-tags");
	if (!blacklistRaw || !blacklistRaw.content) return [...previews];
	blacklistRaw = blacklistRaw.content;
	let blacklist = JSON.parse(blacklistRaw)
	
	return previews.filter(preview => {
		let tags = preview.dataset.tags.split(" ");
		return !tags.some(t => blacklist.includes(t));
	})
}

function getPreviews(node){
	return [...node.querySelectorAll("article")];
}

//Generate array of search queries
function generateQueries(storedTags){
	let queries = [];

	for (let offset = 0; offset < storedTags.length; offset += TAG_PER_QUERY_LIMIT){
		let batch = storedTags.slice(offset, offset + TAG_PER_QUERY_LIMIT);
		let query = batch.map(tag => encodeURIComponent("~" + tag.split(" ").join("_"))).join("+");

		queries.push(query);
	}

	return queries;
}

function encodeSearchQuery(query){
	return encodeURIComponent(query);
}

function generateURL(page, query){
	return "https://e621.net/posts?page=" + page + (query ? "&tags=" + query : "");
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