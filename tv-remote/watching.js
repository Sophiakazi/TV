// "Continue watching" for the TV home screen.
// Netflix, Disney+ and the others don't share what you've watched, so the list lives here on the Mac
// (watching.json) and you keep it up to date from the phone remote (or the LG remote's colour buttons).
// TVMaze fills in the episode names, lengths, episode pictures and when new episodes come out.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'watching.json');
const DAY = 86400000;
const SERVICES = ['netflix', 'disney', 'prime', 'youtube', 'iplayer', 'itvx', 'other'];
const showCache = new Map();   // TVMaze id -> { at, show }

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'tv-home-personal/1.0' } });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function load() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { raw = []; }
  // older lists were just titles
  return raw.map((x) => (typeof x === 'string'
    ? { key: slug(x), tvmaze: null, title: x, service: 'netflix', season: 1, episode: 1, progress: 0, updated: Date.now() }
    : x));
}
function save(list) { fs.writeFileSync(FILE, JSON.stringify(list.slice(0, 30), null, 2)); }

function guessService(show) {
  const n = String((show.webChannel && show.webChannel.name) || (show.network && show.network.name) || '').toLowerCase();
  if (n.includes('netflix')) return 'netflix';
  if (n.includes('disney')) return 'disney';
  if (n.includes('prime') || n.includes('amazon')) return 'prime';
  if (n.includes('bbc')) return 'iplayer';
  if (n.includes('itv')) return 'itvx';
  if (n.includes('youtube')) return 'youtube';
  return 'other';
}

async function showById(id) {
  const c = showCache.get(id);
  if (c && Date.now() - c.at < DAY / 2) return c.show;
  const show = await getJson('https://api.tvmaze.com/shows/' + id + '?embed=episodes');
  showCache.set(id, { at: Date.now(), show: show });
  return show;
}
const regular = (eps) => (eps || []).filter((e) => e.number != null && e.type !== 'insignificant_special')
  .sort((a, b) => a.season - b.season || a.number - b.number);

// phone search box -> matching shows with posters
async function search(q) {
  q = String(q || '').trim();
  if (!q) return [];
  const r = await getJson('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(q));
  return r.slice(0, 8).map(({ show: s }) => ({
    id: s.id, name: s.name, year: (s.premiered || '').slice(0, 4),
    network: (s.webChannel && s.webChannel.name) || (s.network && s.network.name) || '',
    image: s.image && s.image.medium, service: guessService(s)
  }));
}

// move on to the next real episode (crossing into the next season when needed)
async function advance(it) {
  it.progress = 0;
  try {
    if (it.tvmaze) {
      const eps = regular((await showById(it.tvmaze))._embedded.episodes);
      const i = eps.findIndex((e) => e.season === it.season && e.number === it.episode);
      const n = eps[i + 1];
      if (n) { it.season = n.season; it.episode = n.number; return; }
    }
  } catch (e) { /* offline: just count up */ }
  it.episode += 1;
}

// { op: 'add' | 'update' | 'next' | 'remove', ... }  (also accepts the old { add } / { remove } forms)
async function apply(b) {
  let list = load();
  const op = b.op || (b.add ? 'add' : b.remove ? 'remove' : '');
  if (op === 'add') {
    let tv = Number(b.tvmaze) || 0, title = String(b.title || b.add || '').trim().slice(0, 80), service = b.service;
    if (!tv && title) {
      try { const s = await getJson('https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(title)); tv = s.id; title = s.name; if (!service) service = guessService(s); } catch (e) {}
    }
    if (!title) throw new Error('Which show?');
    const key = tv ? 'tv' + tv : slug(title);
    list = list.filter((x) => x.key !== key);
    list.unshift({ key: key, tvmaze: tv || null, title: title, service: SERVICES.includes(service) ? service : 'netflix',
      season: Math.max(1, parseInt(b.season, 10) || 1), episode: Math.max(1, parseInt(b.episode, 10) || 1), progress: 0, updated: Date.now() });
    return save(list);
  }
  const k = String(b.key || b.remove || '');
  const it = list.find((x) => x.key === k || x.title === k);
  if (!it) throw new Error("That show isn't in your list");
  if (op === 'remove') list = list.filter((x) => x !== it);
  else if (op === 'next') { await advance(it); it.updated = Date.now(); }
  else if (op === 'update') {
    if (b.season) it.season = Math.max(1, parseInt(b.season, 10) || 1);
    if (b.episode) it.episode = Math.max(1, parseInt(b.episode, 10) || 1);
    if (b.progress != null) it.progress = Math.max(0, Math.min(1, Number(b.progress) || 0));
    if (SERVICES.includes(b.service)) it.service = b.service;
    it.updated = Date.now();
  } else throw new Error('Unknown change');
  list.sort((a, c) => c.updated - a.updated);   // most recently watched first
  save(list);
}

// cards for the TV and the phone: episode name, length, time left, picture, "New episode"
async function cards(tmdbInfo) {
  const list = load().sort((a, c) => c.updated - a.updated), now = Date.now();
  // shows saved by name only (older lists): find them on TVMaze once and remember
  let changed = false;
  for (const it of list) {
    if (it.tvmaze) continue;
    try {
      const s = await getJson('https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(it.title));
      it.tvmaze = s.id; it.key = 'tv' + s.id; it.title = s.name; changed = true;
    } catch (e) {}
  }
  if (changed) save(list);
  return Promise.all(list.map(async (it) => {
    const out = { key: it.key, title: it.title, service: it.service, season: it.season, episode: it.episode, progress: it.progress || 0 };
    try {
      if (it.tvmaze) {
        const show = await showById(it.tvmaze), eps = regular(show._embedded && show._embedded.episodes);
        out.image = show.image && (show.image.original || show.image.medium);
        const i = eps.findIndex((e) => e.season === it.season && e.number === it.episode), cur = eps[i];
        out.runtime = (cur && cur.runtime) || show.averageRuntime || show.runtime || null;
        if (cur) { out.epName = cur.name; out.still = cur.image && (cur.image.original || cur.image.medium); }
        const later = i >= 0 ? eps.slice(i + 1) : [];
        const aired = later.filter((e) => e.airstamp && Date.parse(e.airstamp) <= now);
        out.toWatch = aired.length;   // aired episodes still ahead of you
        if (cur && cur.airstamp && Date.parse(cur.airstamp) > now) {
          out.badge = 'Out ' + new Date(cur.airstamp).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        } else if ((cur && cur.airstamp && now - Date.parse(cur.airstamp) < 10 * DAY && !it.progress) || aired.some((e) => now - Date.parse(e.airstamp) < 10 * DAY)) {
          out.badge = 'New episode';
        }
      }
    } catch (e) { /* TVMaze unreachable: show what we have */ }
    try { Object.assign(out, await tmdbInfo(it.title)); } catch (e) {}
    return out;
  }));
}

module.exports = { apply, cards, search, load, SERVICES };
