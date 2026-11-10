// Phone remote for LG webOS TVs.
// Runs on your Mac (or any always-on computer on the same Wi-Fi), serves the remote page,
// and forwards button presses to the TV over LG's local network protocol.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LGTV = require('lgtv2');
const { getShows, tmdbInfo } = require('./shows');
const watching = require('./watching');
const foryou = require('./foryou');
const netflix = require('./netflix');

const PORT = Number(process.env.PORT || 8787);
const CONFIG = path.join(__dirname, 'config.json');
const PUBLIC = path.join(__dirname, 'public');

// ---------- config (TV address) ----------
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) { return {}; }
}
let config = loadConfig();
if (process.env.TV_HOST) config.host = process.env.TV_HOST;
if (process.env.TV_URL) config.url = process.env.TV_URL; // e.g. ws://127.0.0.1:3999 for the mock TV

// ---------- TV connection ----------
let tv = null;
let state = { connected: false, prompt: false, volume: null, muted: null, error: null };
let pointer = null;

function connect() {
  if (tv) { try { tv.disconnect(); } catch (e) {} tv = null; pointer = null; }
  state = { connected: false, prompt: false, volume: null, muted: null, error: null };
  if (!config.host && !config.url) return;
  tv = new LGTV(config.url ? { url: config.url, keyFile: path.join(__dirname, '.tv-key') } : { host: config.host, keyFile: path.join(__dirname, '.tv-key') });
  tv.on('prompt', () => { state.prompt = true; console.log('Accept the connection request on the TV screen.'); });
  tv.on('connect', () => {
    state.connected = true; state.prompt = false; state.error = null; console.log('Connected to TV');
    pollInputs(); clearInterval(inputsT); inputsT = setInterval(pollInputs, 10000);
    tv.subscribe('ssap://audio/getVolume', (err, res) => {
      if (err || !res) return;
      if (typeof res.volume === 'number') state.volume = res.volume;
      if (typeof res.muted === 'boolean') state.muted = res.muted;
    });
  });
  tv.on('close', () => { state.connected = false; pointer = null; });
  tv.on('error', (err) => { state.error = String((err && err.message) || err); });
}

// ---------- HDMI inputs (used to show the Nintendo Switch tile only while it is connected) ----------
let inputs = [], inputsT = null;
async function pollInputs() {
  try {
    const r = await ask('ssap://tv/getExternalInputList');
    inputs = (r.devices || []).map((d) => ({ id: d.id || '', label: d.label || '', connected: !!d.connected,
      appId: d.appId || ('com.webos.app.' + String(d.id || '').toLowerCase().replace('_', '')) }));
  } catch (e) { /* TV busy or older firmware: keep the last list */ }
}
// Games consoles are found by the name they report over HDMI ("Nintendo Switch", "PS5"...),
// or by port: SWITCH_HDMI / PS_HDMI, or "switchHdmi" / "psHdmi" in config.json
const CONSOLES = { switch: { re: /switch|nintendo/i, port: () => process.env.SWITCH_HDMI || config.switchHdmi },
  playstation: { re: /playstation|ps5|ps4|ps3|sony/i, port: () => process.env.PS_HDMI || config.psHdmi } };
function consoleInfo(kind) {
  const c = CONSOLES[kind]; if (!c) return null;
  const n = Number(c.port() || 0);
  const d = inputs.find((x) => c.re.test(x.label)) || (n ? inputs.find((x) => x.id === 'HDMI_' + n) : null);
  return d ? { connected: d.connected, appId: d.appId, label: d.label } : null;
}
const switchInfo = () => consoleInfo('switch');

const ask = (uri, payload) => new Promise((resolve, reject) => {
  if (!tv || !state.connected) return reject(new Error('TV not connected'));
  tv.request(uri, payload || {}, (err, res) => (err ? reject(err) : resolve(res)));
});

async function sendButton(name) {
  if (!tv || !state.connected) throw new Error('TV not connected');
  if (!pointer) pointer = await tv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket');
  pointer.send('button', { name });
}

// ---------- actions ----------
const BUTTONS = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT', 'ENTER', 'BACK', 'HOME', 'MENU', 'EXIT', 'INFO', 'PLAY', 'PAUSE', 'STOP', 'REWIND', 'FASTFORWARD',
  'VOLUMEUP', 'VOLUMEDOWN', 'MUTE', 'CHANNELUP', 'CHANNELDOWN', 'RED', 'GREEN', 'YELLOW', 'BLUE', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const APPS = { firetv: 'com.webos.app.hdmi1', store: 'com.webos.app.discovery', netflix: 'netflix', disney: 'com.disney.disneyplus-prod', prime: 'amazon', youtube: 'youtube.leanback.v4', settings: 'com.palm.app.settings' };

// ---------- TV home-page background (the TV page polls /api/bg) ----------
const BACKGROUNDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'backgrounds.json'), 'utf8'));
let bgSel = { id: 'auto', v: 1 };
// App-icon look on the TV shelf: style 'normal' | 'glass', optional colour overlay (#rrggbb or '' for none). Saved so it survives restarts.
const ICONS_FILE = path.join(__dirname, 'icons.json');
let iconSel = { style: 'normal', tint: '' };
// Clock look on the TV (like iOS Font & Colour): font, stretch 0-100, tint, glass opacity 0-100, style glass|solid
const CLOCK_FILE = path.join(__dirname, 'clock.json');
const CLOCK_DEFAULT = { font: 'condensed', stretch: 28, tint: '#a8e1ff', glass: 80, style: 'glass' };
const cleanClock = (j) => ({
  font: ['rounded', 'classic', 'serif', 'condensed'].includes(j && j.font) ? j.font : CLOCK_DEFAULT.font,
  stretch: Math.max(0, Math.min(100, Number(j && j.stretch))) || (j && j.stretch === 0 ? 0 : CLOCK_DEFAULT.stretch),
  tint: /^#[0-9a-f]{6}$/i.test((j && j.tint) || '') ? j.tint : CLOCK_DEFAULT.tint,
  glass: Math.max(0, Math.min(100, Number(j && j.glass))) || (j && j.glass === 0 ? 0 : CLOCK_DEFAULT.glass),
  style: (j && j.style) === 'solid' ? 'solid' : 'glass'
});
let clockSel = CLOCK_DEFAULT;
try { clockSel = cleanClock(JSON.parse(fs.readFileSync(CLOCK_FILE, 'utf8'))); } catch (e) {}
try { const j = JSON.parse(fs.readFileSync(ICONS_FILE, 'utf8')); if (j && (j.style === 'normal' || j.style === 'glass')) iconSel = { style: j.style, tint: /^#[0-9a-f]{6}$/i.test(j.tint || '') ? j.tint : '' }; } catch (e) {}
const bgNow = () => { const b = BACKGROUNDS.find((x) => x.id === bgSel.id) || BACKGROUNDS[0]; return { id: b.id, v: bgSel.v, file: b.file, credit: b.credit }; };

const actions = {
  async clock(b) { clockSel = cleanClock(b); fs.writeFileSync(CLOCK_FILE, JSON.stringify(clockSel)); },
  async pointer(b) {   // phone trackpad -> the TV's on-screen cursor: { dx, dy } moves, { click: true } clicks, { scroll } scrolls
    if (!tv || !state.connected) throw new Error('TV not connected');
    if (!pointer) pointer = await tv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket');
    const n = (v) => Math.max(-200, Math.min(200, Math.round(Number(v) || 0)));
    if (b.dx || b.dy) pointer.send('move', { dx: n(b.dx), dy: n(b.dy), drag: 0 });
    if (b.scroll) pointer.send('scroll', { dx: 0, dy: n(b.scroll) });
    if (b.click) pointer.send('click');
  },
  async icons(b) {
    const style = b.style === 'glass' ? 'glass' : 'normal';
    const tint = /^#[0-9a-f]{6}$/i.test(b.tint || '') ? b.tint : '';
    iconSel = { style, tint };
    fs.writeFileSync(ICONS_FILE, JSON.stringify(iconSel));
  },
  async watch(b) { return watching.apply(b); },   // Continue watching: add / update / next / remove
  async bg(b) {
    let id = b.id;
    const i = BACKGROUNDS.findIndex((x) => x.id === bgSel.id);
    if (id === 'next') id = BACKGROUNDS[(i + 1) % BACKGROUNDS.length].id;
    if (id === 'prev') id = BACKGROUNDS[(i - 1 + BACKGROUNDS.length) % BACKGROUNDS.length].id;
    if (!BACKGROUNDS.some((x) => x.id === id)) throw new Error('unknown background');
    bgSel = { id, v: bgSel.v + 1 };
  },
  async button(b) { if (!BUTTONS.has(b.name)) throw new Error('unknown button'); await sendButton(b.name); },
  async volume(b) {
    if (b.set != null) return ask('ssap://audio/setVolume', { volume: Math.max(0, Math.min(100, Number(b.set))) });
    return sendButton(b.dir === 'down' ? 'VOLUMEDOWN' : 'VOLUMEUP');
  },
  async mute() { return ask('ssap://audio/setMute', { mute: !state.muted }); },
  async off() { return ask('ssap://system/turnOff'); },
  async on() {
    if (!tv) throw new Error('No TV address set');
    await tv.wake(); // needs "Wake on LAN" / "Mobile TV On" enabled on the TV
  },
  async app(b) {
    if (CONSOLES[b.name]) {
      const c = consoleInfo(b.name);
      if (!c || !c.connected) throw new Error(b.name === 'switch' ? "The Switch isn't connected or switched on" : "The PlayStation isn't connected or switched on");
      return ask('ssap://system.launcher/launch', { id: c.appId });
    }
    const FIND = { itvx: /itv/i, iplayer: /iplayer|bbc/i };   // ids differ between TVs, so look them up
    if (FIND[b.name]) {
      const r = await ask('ssap://com.webos.applicationManager/listLaunchPoints');
      const lp = (r.launchPoints || []).find((x) => FIND[b.name].test(x.title || ''));
      if (!lp) throw new Error('That app isn\'t installed on the TV');
      return ask('ssap://system.launcher/launch', { id: lp.id });
    }
    const id = APPS[b.name] || b.id;
    if (!id) throw new Error('unknown app');
    return ask('ssap://system.launcher/launch', { id });
  },
  async input(b) {
    const n = Number(b.n);
    if (!(n >= 1 && n <= 4)) throw new Error('bad input');
    return ask('ssap://system.launcher/launch', { id: 'com.webos.app.hdmi' + n });
  },
  async type(b) { return ask('ssap://com.webos.service.ime/insertText', { text: String(b.text || ''), replace: 0 }); },
  async deleteText() { return ask('ssap://com.webos.service.ime/deleteCharacters', { count: 1 }); },
  async enterKey() { return ask('ssap://com.webos.service.ime/sendEnterKey'); },
  // Opens the TV's web browser on a search page. (Searching inside Netflix/Disney+ isn't possible from outside.)
  async search(b) {
    const q = encodeURIComponent(String(b.q || '').trim());
    if (!q) throw new Error('empty search');
    const url = b.where === 'youtube' ? 'https://www.youtube.com/results?search_query=' + q : 'https://www.google.com/search?q=' + q;
    return ask('ssap://system.launcher/open', { target: url });
  },
  async toast(b) { return ask('ssap://system.notifications/createToast', { message: String(b.message || '').slice(0, 120) }); },
  async config(b) {
    const host = String(b.host || '').trim();
    if (!/^[\w.\-]+$/.test(host)) throw new Error('bad address');
    config = Object.assign({}, config, { host });
    fs.writeFileSync(CONFIG, JSON.stringify({ host }, null, 2));
    connect();
  }
};

// ---------- http ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj)); }

// /img?w=500&u=<picture link>: a shrunk copy of a show picture. TVmaze sends its pictures at full size
// (up to 5 megapixels), and unpacking dozens of those froze the TV, so the Mac shrinks them once
// with macOS's `sips` and keeps the small copies in ~/Library/Caches/tv-remote.
const IMG_DIR = path.join(os.homedir(), 'Library', 'Caches', 'tv-remote');
const IMG_HOSTS = ['static.tvmaze.com', 'image.tmdb.org'];
const imgBusy = new Map();
function smallImage(url, res) {
  let src;
  try { src = new URL(url.searchParams.get('u') || ''); } catch (e) { res.writeHead(400); return res.end(); }
  const w = Math.max(100, Math.min(1920, parseInt(url.searchParams.get('w'), 10) || 500));
  if (src.protocol !== 'https:' || !IMG_HOSTS.includes(src.hostname)) { res.writeHead(400); return res.end(); }
  const file = path.join(IMG_DIR, require('crypto').createHash('sha1').update(src.href + '|' + w).digest('hex') + '.jpg');
  const serve = () => fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(302, { Location: src.href }); return res.end(); }   // couldn't shrink it: send the original
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000', 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
  });
  if (fs.existsSync(file)) return serve();
  if (!imgBusy.has(file)) {
    imgBusy.set(file, (async () => {
      fs.mkdirSync(IMG_DIR, { recursive: true });
      const r = await fetch(src.href, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const tmp = file + '.' + process.pid + '.src';
      fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
      await new Promise((ok, no) => require('child_process').execFile('/usr/bin/sips',
        ['-Z', String(w), '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', tmp, '--out', file], (e) => (e ? no(e) : ok())));
      fs.unlinkSync(tmp);
    })().catch(() => {}).finally(() => imgBusy.delete(file)));
  }
  imgBusy.get(file).then(serve);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' }); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/api/bg') return send(res, 200, Object.assign(bgNow(), { icons: iconSel, clock: clockSel, switch: switchInfo(), playstation: consoleInfo('playstation'), inputs: inputs }));
  if (req.method === 'GET' && url.pathname === '/api/inputs') return send(res, 200, { inputs, switch: switchInfo() });
  if (req.method === 'GET' && url.pathname === '/api/clock') return send(res, 200, clockSel);
  if (req.method === 'GET' && url.pathname === '/api/icons') return send(res, 200, iconSel);
  if (req.method === 'GET' && url.pathname === '/api/watching') { watching.cards(tmdbInfo).then((w) => send(res, 200, w)).catch((e) => send(res, 502, { error: String(e.message || e) })); return; }
  if (req.method === 'GET' && url.pathname === '/api/showsearch') { watching.search(url.searchParams.get('q')).then((r) => send(res, 200, r)).catch(() => send(res, 200, [])); return; }
  if (req.method === 'GET' && url.pathname === '/api/shows') {
    Promise.all([getShows(), watching.cards(tmdbInfo), foryou.build(watching.load()).catch(() => null)])
      .then(async ([d, w, fy]) => {
        // Netflix IDs, so the TV can open each Netflix show directly instead of just the Netflix app
        const onNetflix = [].concat(d.top10 || [], (w || []).filter((s) => s.service === 'netflix'),
          ((fy && fy.picks) || []).concat((fy && fy.because && fy.because.items) || []).filter((p) => p.service === 'netflix'));
        await netflix.addIds(onNetflix, (s) => s.tmdbId || (s.poster !== undefined ? s.id : null)).catch(() => {});
        return [d, w, fy];
      })
      .then(([d, w, fy]) => send(res, 200, Object.assign({}, d, { watching: w, forYou: fy, recommended: foryou.rankRecommended(d.recommended || [], fy) })))
      .catch((e) => send(res, 502, { error: String(e.message || e) }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/embed') {   // tiny muted trailer player the TV page shows inside a card
    const v = url.searchParams.get('v') || '';
    if (!/^[\w-]{6,15}$/.test(v)) { res.writeHead(400); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    // YouTube player API: muted autoplay, no controls; tells the TV page the moment it is really playing,
    // so the card can fade the video in without ever flashing YouTube's own play/pause button
    return res.end('<!doctype html><meta charset=utf-8><meta name="referrer" content="strict-origin-when-cross-origin">' +
      '<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p,iframe{position:absolute;left:0;top:0;width:100%;height:100%;border:0}</style>' +
      '<div id="p"></div><script>var V=' + JSON.stringify(v) + ';' +
      'function onYouTubeIframeAPIReady(){new YT.Player("p",{videoId:V,host:"https://www.youtube.com",' +
      'playerVars:{autoplay:1,mute:1,controls:0,modestbranding:1,playsinline:1,loop:1,playlist:V,rel:0,iv_load_policy:3,disablekb:1,fs:0,origin:location.origin},' +
      'events:{onReady:function(e){e.target.mute();e.target.playVideo();},' +
      'onStateChange:function(e){if(e.data===1){parent.postMessage({yt:"playing"},"*");}if(e.data===0){e.target.playVideo();}}}});}' +
      '</script><script src="https://www.youtube.com/iframe_api"></script>');
  }
  if (req.method === 'GET' && url.pathname === '/img') return smallImage(url, res);
  if (req.method === 'GET' && url.pathname === '/api/bgs') return send(res, 200, { current: bgSel.id, list: BACKGROUNDS.map(({ id, name, thumb }) => ({ id, name, thumb })) });
  if (url.pathname === '/api/status') return send(res, 200, Object.assign({ host: config.host || config.url || null }, state));
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5);
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      try {
        const fn = actions[name];
        if (!fn) return send(res, 404, { ok: false, error: 'unknown action' });
        await fn(body ? JSON.parse(body) : {});
        send(res, 200, { ok: true });
      } catch (e) { send(res, 200, { ok: false, error: String((e && e.message) || e) }); }
    });
    return;
  }
  // static files
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = [].concat(...Object.values(os.networkInterfaces())).filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('TV remote is running. Open this on your phone (same Wi-Fi):');
  ips.forEach((ip) => console.log('  http://' + ip + ':' + PORT));
  if (!config.host && !config.url) console.log('No TV address yet - enter it on the phone screen, or set TV_HOST.');
});
connect();
getShows().catch(() => {});   // warm the recommendations cache so the TV never waits
foryou.build(watching.load()).catch(() => {});
setInterval(() => getShows().catch(() => {}), 6 * 3600 * 1000);
