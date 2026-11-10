// TV recommendations for the TV home page's second screen.
//  - "Top 10 on Netflix": Netflix's own public weekly Top 10 list (UK, TV category)
//  - "Recommended": shows on UK TV and streaming this week, most popular first (TVMaze)
// Posters come from TVMaze. Everything is cached, so the TV page gets answers fast.
const fs = require('fs');
const path = require('path');
const COUNTRY = process.env.SHOWS_COUNTRY || 'GB';
const TOP10_URL = 'https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv';
const HOURS = 3600 * 1000;

let cache = { at: 0, data: null };
const posterCache = new Map();

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'tv-home-personal/1.0' } });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}

// TMDB: trailer key + landscape image + description for each show (key read from .tmdb-key, never sent to the TV)
const infoCache = new Map();
function tmdbToken() { try { return fs.readFileSync(path.join(__dirname, '.tmdb-key'), 'utf8').trim(); } catch (e) { return ''; } }
async function tmdbInfo(name) {
  const token = tmdbToken();
  if (!token) return {};
  if (infoCache.has(name)) return infoCache.get(name);
  let out = {};
  try {
    const h = { Authorization: 'Bearer ' + token, accept: 'application/json' };
    const s = await (await fetch('https://api.themoviedb.org/3/search/tv?query=' + encodeURIComponent(name), { headers: h })).json();
    const hit = s.results && s.results[0];
    if (hit) {
      out = {
        backdrop: hit.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + hit.backdrop_path : null,
        tmdbId: hit.id, overview: hit.overview || '', year: (hit.first_air_date || '').slice(0, 4), vote: hit.vote_average ? Math.round(hit.vote_average * 10) / 10 : null
      };
      const [det, cr] = await Promise.all([
        fetch('https://api.themoviedb.org/3/tv/' + hit.id, { headers: h }).then((r) => r.json()).catch(() => ({})),
        fetch('https://api.themoviedb.org/3/tv/' + hit.id + '/content_ratings', { headers: h }).then((r) => r.json()).catch(() => ({}))
      ]);
      out.genre = (det.genres && det.genres[0] && det.genres[0].name) || '';
      out.seasons = det.number_of_seasons || null;
      const gb = (cr.results || []).find((x) => x.iso_3166_1 === 'GB');
      out.age = gb ? gb.rating : '';
      const v = await (await fetch('https://api.themoviedb.org/3/tv/' + hit.id + '/videos', { headers: h })).json();
      const yt = (v.results || []).filter((x) => x.site === 'YouTube');
      const best = yt.find((x) => x.type === 'Trailer' && x.official) || yt.find((x) => x.type === 'Trailer') || yt.find((x) => x.type === 'Teaser') || yt[0];
      out.trailer = best ? best.key : null;
    }
  } catch (e) { /* no extra info: the card falls back to the poster */ }
  infoCache.set(name, out);
  return out;
}

async function netflixTop10() {
  const r = await fetch(TOP10_URL, { headers: { 'User-Agent': 'tv-home-personal/1.0' } });
  if (!r.ok) throw new Error('top10 ' + r.status);
  const text = await r.text();
  const rows = [];
  let week = '';
  for (const line of text.split('\n')) {
    if (line.indexOf('\t' + COUNTRY + '\t') === -1) continue;
    const c = line.split('\t');
    if (c[1] !== COUNTRY || c[3] !== 'TV') continue;
    rows.push({ week: c[2], rank: Number(c[4]), title: c[5], season: c[6] === 'N/A' ? '' : c[6] });
    if (c[2] > week) week = c[2];
  }
  return { week, items: rows.filter((x) => x.week === week).sort((a, b) => a.rank - b.rank).slice(0, 10) };
}

async function poster(title) {
  if (posterCache.has(title)) return posterCache.get(title);
  let img = null;
  try {
    const s = await getJson('https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(title));
    img = (s.image && (s.image.original || s.image.medium)) || null;
  } catch (e) { /* no match: the card shows a text placeholder */ }
  posterCache.set(title, img);
  return img;
}

function ymd(d) { return d.toISOString().slice(0, 10); }

async function recommended() {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(ymd(new Date(Date.now() + i * 86400000)));
  const lists = await Promise.all(days.flatMap((d) => [
    getJson('https://api.tvmaze.com/schedule/web?date=' + d + '&country=' + COUNTRY).catch(() => []),
    getJson('https://api.tvmaze.com/schedule?date=' + d + '&country=' + COUNTRY).catch(() => [])
  ]));
  const seen = new Map();
  for (const ep of [].concat(...lists)) {
    const sh = (ep._embedded && ep._embedded.show) || ep.show;
    if (!sh || !sh.image || seen.has(sh.id)) continue;
    const channel = (sh.webChannel && sh.webChannel.name) || (sh.network && sh.network.name) || '';
    seen.set(sh.id, {
      id: sh.id, name: sh.name, image: sh.image.original || sh.image.medium, channel, weight: sh.weight || 0,
      rating: sh.rating && sh.rating.average, genres: (sh.genres || []).slice(0, 2).join(' · '), type: sh.type
    });
  }
  return [...seen.values()].filter((s) => s.type !== 'Talk Show' && s.type !== 'News' && s.type !== 'Variety')
    .sort((a, b) => b.weight - a.weight).slice(0, 12);
}

async function build() {
  const [top, rec] = await Promise.all([netflixTop10().catch(() => ({ week: '', items: [] })), recommended().catch(() => [])]);
  const items = await Promise.all(top.items.map(async (x) => Object.assign({}, x, { image: await poster(x.title) }, await tmdbInfo(x.title))));
  const recT = await Promise.all(rec.map(async (x) => Object.assign({}, x, await tmdbInfo(x.name))));
  return { country: COUNTRY, week: top.week, top10: items, recommended: recT };
}

async function getShows() {
  if (cache.data && Date.now() - cache.at < 6 * HOURS) return cache.data;
  try {
    const d = await build();
    if (d.top10.length || d.recommended.length) cache = { at: Date.now(), data: d };
    return cache.data || d;
  } catch (e) {
    if (cache.data) return cache.data;
    throw e;
  }
}

module.exports = { getShows, tmdbInfo };
