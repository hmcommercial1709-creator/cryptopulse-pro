const host = process.env.SITE_URL ?? 'https://cryptopulse.pro';
const key = process.env.INDEXNOW_KEY;
if (!key) throw new Error('INDEXNOW_KEY is required');
const urls = process.argv.slice(2);
if (!urls.length) throw new Error('Pass one or more absolute URLs to submit');
const endpoint = 'https://api.indexnow.org/indexnow';
const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: new URL(host).host, key, keyLocation: `${host}/${key}.txt`, urlList: urls }) });
if (!response.ok) throw new Error(`IndexNow failed: ${response.status} ${await response.text()}`);
console.log(`Submitted ${urls.length} URL(s) to IndexNow.`);
