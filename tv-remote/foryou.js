// "For you": recommendations based on the genres of the shows in your Continue watching list.
//  - profile:     which genres you watch most (recent shows count a bit more)
//  - picks:       shows TMDB links to the ones you watch, scored by genre match + how often they come up + rating
//  - because:     shows similar to the one you watched most recently
//  - where:       which UK app each pick is on (TMDB "watch providers"), so OK opens the right app
//  - rankRecommended: reorders "Recommended this week" so your genres come first, with a short reason
const fs = require('fs');
const path = require('path');

const HOURS = 3600 * 1000;
const cache = new Map();   // url -> { at, data }
function token() { try { return fs.readFileSync(path.join(__dirname, '.tmdb-key'), 'utf8').trim(); } catch (e) { return ''; } }

async function tmdb(p, maxAgeH) {
  const url = 'https://api.themoviedb.org/3' + p;
  const c = cache.get(url);
  if (c && Date.now() - c.at < (maxAgeH || 12) * HOURS) return c.data;
  const t = token();
  if (!t) throw new Error('no TMDB key');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t, accept: 'application/json' } });
  if (!r.ok) throw new Error(p + ' -> ' + r.status);
  const data = await r.json();
  cache.set(url, { at: Date.now(), data: data });
  return data;
}
// run async jobs a few at a time (polite to the API, quick enough for the TV)
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } }));
  return out;
}
const IMG = (p, size) => (p ? 'https://image.tmdb.org/t/p/' + size + p : null);
const PROVIDERS = { 'Netflix': 'netflix', 'Netflix basic with Ads': 'netflix', 'Disney Plus': 'disney', 'Amazon Prime Video': 'prime', 'Amazon Prime Video with Ads': 'prime',
  'BBC iPlayer': 'iplayer', 'ITVX': 'itvx', 'ITVX Premium': 'itvx', 'YouTube': 'youtube', 'YouTube Premium': 'youtube' };
// TMDB and TVMaze name genres a little differently; compare them on simple shared words
// friendlier names for TMDB's combined genres when shown on screen
const SHOW = { 'Sci-Fi & Fantasy': 'Sci-Fi', 'Action & Adventure': 'Adventure', 'War & Politics': 'Politics', 'Soap': 'Soaps' };
const nice = (g) => SHOW[g] || g;
const norm = (g) => String(g).toLowerCase().replace('sci-fi', 'science-fiction').split(/\s*&\s*|\s*\/\s*/).map((x) => x.trim()).filter(Boolean);

async function genreNames() {
  const d = await tmdb('/genre/tv/list?language=en', 24 * 7);
  const m = {}; (d.genres || []).forEach((g) => { m[g.id] = g.name; }); return m;
}
async function findId(title) {
  const d = await tmdb('/search/tv?query=' + encodeURIComponent(title), 24 * 7);
  return d.results && d.results[0] ? d.results[0].id : null;
}
async function where(id) {
  try {
    const d = await tmdb('/tv/' + id + '/watch/providers', 12);
    const gb = (d.results && d.results.GB && d.results.GB.flatrate) || [];
    const ours = gb.map((p) => PROVIDERS[p.provider_name]).find(Boolean);
    return { service: ours || (gb[0] ? 'other' : null), provider: gb[0] ? gb[0].provider_name : null };
  } catch (e) { return { service: null, provider: null }; }
}
async function trailerOf(id) {
  try {
    const v = await tmdb('/tv/' + id + '/videos', 24);
    const yt = (v.results || []).filter((x) => x.site === 'YouTube');
    const best = yt.find((x) => x.type === 'Trailer' && x.official) || yt.find((x) => x.type === 'Trailer') || yt.find((x) => x.type === 'Teaser') || yt[0];
    return best ? best.key : null;
  } catch (e) { return null; }
}

let last = { sig: '', at: 0, data: null };

async function build(watchList) {
  const sig = watchList.map((w) => w.title).join('|');
  if (last.data && last.sig === sig && Date.now() - last.at < 6 * HOURS) return last.data;
  const empty = { profile: [], topGenres: [], picks: [], because: null, insight: '' };
  if (!watchList.length || !token()) return empty;
  const G = await genreNames();
  const recent = watchList.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));

  // 1) your taste: genres of what you watch (the most recent shows count a little more)
  const seeds = (await pool(recent, 4, async (w) => {
    const id = await findId(w.title); if (!id) return null;
    const d = await tmdb('/tv/' + id, 24);
    return { title: w.title, id: id, genres: (d.genres || []).map((g) => g.name) };
  })).filter(Boolean);
  const weight = {};
  seeds.forEach((s, i) => { const w = 1 + Math.max(0, 0.5 - i * 0.1); s.genres.forEach((g) => { weight[g] = (weight[g] || 0) + w; }); });
  const profile = Object.keys(weight).map((g) => ({ genre: g, weight: weight[g] })).sort((a, b) => b.weight - a.weight);
  const topGenres = profile.slice(0, 3).map((p) => p.genre);
  const topW = profile.slice(0, 3).reduce((a, p) => a + p.weight, 0) || 1;
  const seedIds = new Set(seeds.map((s) => s.id));

  // 2) candidates: what TMDB recommends for each show you watch
  const lists = await pool(seeds, 4, async (s) => ({ seed: s, results: ((await tmdb('/tv/' + s.id + '/recommendations?page=1', 12)).results || []) }));
  const cand = new Map();
  lists.filter(Boolean).forEach(({ seed, results }) => results.forEach((r) => {
    if (seedIds.has(r.id) || !r.poster_path) return;
    const c = cand.get(r.id) || { id: r.id, name: r.name, poster: IMG(r.poster_path, 'w500'), backdrop: IMG(r.backdrop_path, 'w780'), overview: r.overview || '',
      year: (r.first_air_date || '').slice(0, 4), vote: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
      genres: (r.genre_ids || []).map((g) => G[g]).filter(Boolean), from: [] };
    if (!c.from.includes(seed.title)) c.from.push(seed.title);
    cand.set(r.id, c);
  }));
  // score: genre match with your taste (45%), recommended by several of your shows (30%), rating (25%)
  const scored = [...cand.values()].map((c) => {
    const gm = Math.min(1, c.genres.reduce((a, g) => a + (weight[g] || 0), 0) / topW);
    const score = 0.45 * gm + 0.3 * Math.min(1, c.from.length / 2) + 0.25 * ((c.vote || 6) / 10);
    const liked = c.genres.filter((g) => topGenres.includes(g));
    return Object.assign(c, { score: score, match: Math.max(55, Math.min(99, Math.round(50 + 50 * score))),
      why: 'Because you watched ' + c.from.slice(0, 2).join(' and '), tags: (liked.length ? liked : c.genres).slice(0, 2).map(nice) });
  }).sort((a, b) => b.score - a.score);

  // 3) where to watch each one in the UK (+ a trailer for the preview)
  async function finish(list) {
    await pool(list, 5, async (c) => { Object.assign(c, await where(c.id)); c.trailer = await trailerOf(c.id); });
    return list;
  }
  // shows on your own apps (Netflix, Disney+, Prime Video, iPlayer, ITVX, YouTube) come first: you can press OK and watch them
  const pool24 = await finish(scored.slice(0, 24));
  pool24.forEach((c) => { const mine = c.service && c.service !== 'other'; c.score += mine ? 0.12 : -0.08; c.match = Math.max(55, Math.min(99, Math.round(50 + 50 * c.score))); });
  pool24.sort((a, b) => b.score - a.score);
  const picks = pool24.slice(0, 12);
  const latest = seeds[0];
  const becauseItems = latest ? await finish(scored.filter((c) => c.from.includes(latest.title) && !picks.slice(0, 6).includes(c)).slice(0, 10)) : [];

  const data = {
    profile: profile, topGenres: topGenres, picks: picks,
    because: latest && becauseItems.length ? { title: latest.title, items: becauseItems } : null,
    insight: topGenres.length ? 'You watch mostly ' + (topGenres.length > 1 ? topGenres.slice(0, -1).map(nice).join(', ') + ' & ' + nice(topGenres[topGenres.length - 1]) : nice(topGenres[0])) : ''
  };
  last = { sig: sig, at: Date.now(), data: data };
  return data;
}

// Recommended this week: your genres first (TVMaze genres vs your TMDB taste), with a short reason
function rankRecommended(rec, fy) {
  if (!fy || !fy.profile || !fy.profile.length) return rec;
  const words = {}; fy.profile.forEach((p) => norm(p.genre).forEach((w) => { words[w] = (words[w] || 0) + p.weight; }));
  return rec.map((r, i) => {
    const gs = String(r.genres || '').split(' · ').filter(Boolean);
    const hits = gs.filter((g) => norm(g).some((w) => words[w]));
    const m = hits.reduce((a, g) => a + Math.max.apply(null, norm(g).map((w) => words[w] || 0)), 0);
    return Object.assign({}, r, { tasteScore: m - i * 0.01, why: hits.length ? 'Matches your ' + hits.slice(0, 2).join(' & ') : '' });
  }).sort((a, b) => b.tasteScore - a.tasteScore);
}

module.exports = { build, rankRecommended };
