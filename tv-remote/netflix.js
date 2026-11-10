// Netflix IDs for shows, so a card on the TV can open that show inside Netflix
// (Netflix on webOS opens `m=https://www.netflix.com/title/<id>&source_type=4`).
// The IDs come from Wikidata (free, no key): a show's TMDB ID (P4983) -> its Netflix ID (P1874).
// Answers are kept in ~/Library/Caches/tv-remote/netflix-ids.json; "not found" is retried after a week.
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = path.join(os.homedir(), 'Library', 'Caches', 'tv-remote', 'netflix-ids.json');
const WEEK = 7 * 24 * 3600 * 1000;
let ids = null;
function load() { if (!ids) { try { ids = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { ids = {}; } } return ids; }
function save() { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(ids)); } catch (e) {} }

let busy = null;
// Looks up any TMDB IDs it doesn't know yet (one Wikidata request for the lot).
async function fetchMissing(tmdbIds) {
  const c = load(), now = Date.now();
  const need = [...new Set(tmdbIds.filter(Boolean).map(String))].filter((t) => !c[t] || (!c[t].n && now - c[t].at > WEEK));
  if (!need.length) return;
  const q = 'SELECT ?t ?n WHERE { VALUES ?t { ' + need.map((t) => '"' + t.replace(/\D/g, '') + '"').join(' ') + ' } ?s wdt:P4983 ?t; wdt:P1874 ?n. }';
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q),
    { headers: { 'User-Agent': 'tv-home-personal/1.0', Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('wikidata ' + r.status);
  const found = {};
  ((await r.json()).results.bindings || []).forEach((b) => { found[b.t.value] = b.n.value; });
  need.forEach((t) => { c[t] = { n: found[t] || null, at: now }; });
  save();
}

// Adds `netflix: "<id>"` to every item that has a TMDB ID and is on Netflix (as far as Wikidata knows).
// Never makes the show lists wait more than a few seconds: unknown IDs are filled in for the next request.
async function addIds(items, tmdbOf) {
  const list = items.filter(Boolean);
  const wanted = list.map(tmdbOf);
  if (!busy) busy = fetchMissing(wanted).catch(() => {}).finally(() => { busy = null; });
  await Promise.race([busy, new Promise((r) => setTimeout(r, 4000))]);
  const c = load();
  list.forEach((it, i) => { const t = wanted[i]; if (t && c[t] && c[t].n) it.netflix = c[t].n; });
  return items;
}

module.exports = { addIds };
