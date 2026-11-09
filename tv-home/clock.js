// Liquid-Glass clock (in the style of the iOS 26 lock screen, clear glass).
// Each digit is a clear lens: you see the wallpaper straight through it, slightly magnified, and bent
// more strongly just inside the edges, the way thick glass bends light.
// The edge is measured from a close-up of Apple's clock (sizes are shares of the digit height):
//  - a thin dark line hugging the outside of every digit (0.7%)
//  - a crisp near-white line just inside the top and bottom edges (0.7%), a softer one inside the left edges
//  - light pooling just inside the bottom edges (3.5%), a soft glow inside the left edges,
//    and a little shade inside the right edges
// A glint drifts slowly along the rim (like tilting a phone). Digits that change roll in, like iOS.
(function () {
  const NS = 'http://www.w3.org/2000/svg', XL = 'http://www.w3.org/1999/xlink';
  const FONTS = {
    condensed: { family: '"Barlow Condensed", "Arial Narrow", sans-serif', weight: 700, cap: 0.70 },
    rounded:   { family: '"Nunito", ui-rounded, "Arial Rounded MT Bold", sans-serif', weight: 900, cap: 0.705 },
    classic:   { family: '-apple-system, "Helvetica Neue", Arial, sans-serif', weight: 800, cap: 0.72 },
    serif:     { family: 'Georgia, "Times New Roman", serif', weight: 700, cap: 0.70 }
  };
  let host, glass, svg, gl, gG, clip, hair, lens, lensTint, lensMilk, tintLayers = [], chars = [], text = '', geo = null;
  const natural = {};   // wallpaper file -> its pixel size (to line the lens up with the screen)
  let style = { font: 'condensed', stretch: 28, tint: '#a8e1ff', glass: 60, style: 'glass' };
  const mctx = document.createElement('canvas').getContext('2d');

  const el = (n, a, kids) => {
    const e = document.createElementNS(NS, n);
    for (const k in (a || {})) {
      if (k === 'href') { e.setAttribute('href', a[k]); e.setAttributeNS(XL, 'xlink:href', a[k]); } else e.setAttribute(k, a[k]);
    }
    (kids || []).forEach((c) => e.appendChild(c));
    return e;
  };
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (h, a) => 'rgba(' + rgb(h).join(',') + ',' + a + ')';
  const stop = (o, c, a) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a });
  const ease = { calcMode: 'spline', keyTimes: '0;0.5;1', keySplines: '.45 0 .55 1;.45 0 .55 1', repeatCount: 'indefinite' };

  function build() {
    host = document.getElementById('time');
    if (!host) return false;
    host.textContent = '';
    glass = document.createElement('div'); glass.className = 'clk-glass';
    svg = el('svg', { class: 'clk-fx', 'aria-hidden': 'true' });
    gl = el('svg', { class: 'clk-fx', 'aria-hidden': 'true' });   // the moving glint, kept apart so the rest stays still
    svg.style.willChange = 'transform';
    gG = el('g', { id: 'clkG' });
    clip = el('clipPath', { id: 'clkClip' });
    const full = () => el('rect', { class: 'full', x: 0, y: 0 });
    const useG = (a) => el('use', Object.assign({ href: '#clkG' }, a));
    const paint = (f, op, m) => { const r = full(); r.setAttribute('fill', f); if (op != null) r.setAttribute('opacity', op); if (m) r.setAttribute('mask', 'url(#' + m + ')'); return r; };
    const mask = (id, kids) => el('mask', { id: id, maskUnits: 'userSpaceOnUse' }, kids);
    // the part of each digit within a set distance of the edges facing one way: the digit minus a copy of itself
    // nudged that way, so the band follows every curve and thins out where the edge turns away from that side
    const band = (id, cls) => mask(id, [useG({ fill: '#fff' }), useG({ fill: '#000', class: cls })]);

    const fSoft = el('filter', { id: 'clkSoft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, [el('feGaussianBlur', { class: 'soft', stdDeviation: 2 })]);
    const fCrisp = el('filter', { id: 'clkCrisp', x: '-10%', y: '-10%', width: '120%', height: '120%' }, [el('feGaussianBlur', { class: 'crisp', stdDeviation: 0.4 })]);
    const fShadow = el('filter', { id: 'clkShadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, [el('feGaussianBlur', { class: 'shadowblur', stdDeviation: 4 })]);
    // the view through the glass edge comes out a touch brighter, as it does through real glass
    const fTone = el('filter', { id: 'clkTone' }, [el('feComponentTransfer', {}, ['R', 'G', 'B'].map((c) => el('feFunc' + c, { type: 'linear', slope: 1.12, intercept: 0.02 })))]);
    const gSheen = el('linearGradient', { id: 'clkSheen', x1: 0, y1: 0, x2: 0, y2: 1 }, [stop(0, '#fff', 0.1), stop(0.4, '#fff', 0), stop(1, '#fff', 0)]);
    const mOut = mask('clkOut', [paint('#fff'), useG({ fill: '#000' })]);
    const mBody = mask('clkBody', [useG({ fill: '#fff' })]);
    const mLens = mask('clkLens', [useG({ fill: 'none', stroke: '#fff', class: 'sw-lens', 'stroke-linejoin': 'round', filter: 'url(#clkSoft)' })]);
    const bands = [['clkGlowB', 'sh-gb'], ['clkGlowB2', 'sh-gb2'], ['clkGlowL', 'sh-gl'], ['clkShadeR', 'sh-sr'], ['clkShadeR2', 'sh-sr2'],
      ['clkRimT', 'sh-rt'], ['clkRimB', 'sh-rb'], ['clkRimL', 'sh-rl']].map((b) => band(b[0], b[1]));
    svg.appendChild(el('defs', {}, [gG, clip, gSheen, fSoft, fCrisp, fShadow, fTone, mOut, mBody, mLens].concat(bands)));

    // a faint soft shadow under the digits (outside only)
    svg.appendChild(el('g', { mask: 'url(#clkOut)' }, [el('g', { class: 'shadow' }, [useG({ fill: 'rgba(4,14,34,.06)', filter: 'url(#clkShadow)' })])]));
    // the thin dark line hugging every digit, just outside the glass
    hair = useG({ fill: 'none', stroke: 'rgba(0,0,0,.38)', class: 'sw-hair', 'stroke-linejoin': 'round' });
    svg.appendChild(el('g', { mask: 'url(#clkOut)' }, [hair]));
    // the background seen through the edge of the glass: bent (magnified) much more strongly than in the middle,
    // with the same tint as the rest of the glass
    lens = el('image', { class: 'lens', preserveAspectRatio: 'none', x: 0, y: 0, width: 1, height: 1, opacity: 0, filter: 'url(#clkTone)' });
    lensTint = paint('#fff', 0); lensMilk = paint('#fff', 0);
    svg.appendChild(el('g', { mask: 'url(#clkBody)' }, [el('g', { mask: 'url(#clkLens)', class: 'lensband' }, [lens, lensTint, lensMilk])]));
    // light inside the glass (measured from Apple's clock): light pooling at the bottom, a soft glow at the left,
    // a little shade at the right, then the crisp bright lines
    svg.appendChild(el('g', { mask: 'url(#clkBody)' }, [
      paint('url(#clkSheen)'),
      el('g', { filter: 'url(#clkSoft)' }, [paint('#fff', 0.14, 'clkGlowB'), paint('#fff', 0.18, 'clkGlowB2'), paint('#fff', 0.08, 'clkGlowL'),
        paint('#000', 0.06, 'clkShadeR'), paint('#000', 0.09, 'clkShadeR2')]),
      el('g', { filter: 'url(#clkCrisp)' }, [paint('#fff', 0.9, 'clkRimT'), paint('#fff', 0.92, 'clkRimB'), paint('#fff', 0.38, 'clkRimL')])
    ]));

    // the glint that drifts slowly along the rim, like light moving across glass as a phone tilts
    const gSpec = el('radialGradient', { id: 'clkSpec', cx: 0.25, cy: 0.08, r: 0.3 }, [stop(0, '#fff', 0.6), stop(0.4, '#fff', 0.14), stop(1, '#fff', 0),
      el('animate', Object.assign({ attributeName: 'cx', values: '.12;.88;.12', dur: '14s' }, ease)),
      el('animate', Object.assign({ attributeName: 'cy', values: '.04;.26;.04', dur: '14s' }, ease))]);
    const mRim = mask('clkRim', [useG({ fill: 'none', stroke: '#fff', class: 'sw-rim', 'stroke-linejoin': 'round' })]);
    const mBodyG = mask('clkBodyG', [useG({ fill: '#fff' })]);
    gl.appendChild(el('defs', {}, [gSpec, mRim, mBodyG]));
    gl.appendChild(el('g', { mask: 'url(#clkBodyG)' }, [paint('url(#clkSpec)', 1, 'clkRim')]));

    host.appendChild(glass); host.appendChild(svg); host.appendChild(gl);
    return true;
  }

  // per-glyph transform (stretch + the roll used when a digit changes)
  function tf(dy, k) {
    const g = geo; if (!g) return '';
    const cy = g.A / 2;
    return 'translate(' + g.p + 'px,' + g.p + 'px) scale(1,' + g.s.toFixed(4) + ') translate(0px,' + (cy + dy).toFixed(2) + 'px) scale(1,' + k + ') translate(0px,' + (-cy).toFixed(2) + 'px)';
  }
  // animated = true only for the digit roll; resizing (screensaver, new font) must never lag behind
  const ROLL = 'transform .6s cubic-bezier(.2,.8,.2,1), opacity .45s ease';
  function place(c, state, animated) {
    const d = state === 'in' ? geo.A * 0.42 : state === 'out' ? -geo.A * 0.42 : 0, k = state ? 0.12 : 1;
    [c.g, c.k].forEach((e) => {
      e.style.transition = animated ? ROLL : 'none';
      e.setAttribute('x', c.x.toFixed(2)); e.setAttribute('y', geo.A.toFixed(2));
      e.style.transform = tf(d, k); e.style.opacity = state ? '0' : '1';
    });
  }
  function mk(ch) {
    const a = { 'vector-effect': 'non-scaling-stroke' };
    const g = el('text', a), k = el('text', a);
    g.textContent = ch; k.textContent = ch;
    gG.appendChild(g); clip.appendChild(k);
    return { c: ch, g: g, k: k, x: 0, out: false };
  }

  function layout() {
    if (!host && !build()) return;
    const F = FONTS[style.font] || FONTS.condensed;
    const fs = parseFloat(getComputedStyle(host).fontSize) || 120;
    const s = 1 + 2 * (style.stretch / 100);
    mctx.font = F.weight + ' ' + fs + 'px ' + F.family;
    const m = mctx.measureText('0123456789');
    const A = m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : F.cap * fs;
    const D = m.actualBoundingBoxDescent > 0 ? Math.min(m.actualBoundingBoxDescent, fs * 0.05) : 0;
    const p = Math.ceil(fs * 0.08);
    let x = 0;
    chars.filter((c) => !c.out).forEach((c) => { c.x = x; x += mctx.measureText(c.c).width; });
    const W = Math.ceil(x + p * 2), H = Math.ceil((A + D) * s + p * 2), GH = A * s;
    geo = { fs: fs, s: s, A: A, p: p };
    host.style.width = W + 'px'; host.style.height = H + 'px';
    [svg, gl].forEach((e) => {
      e.setAttribute('width', W); e.setAttribute('height', H); e.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      e.setAttribute('font-family', F.family); e.setAttribute('font-weight', F.weight); e.setAttribute('font-size', fs.toFixed(2));
    });
    host.querySelectorAll('rect.full').forEach((r) => { r.setAttribute('width', W); r.setAttribute('height', H); });
    const px = (f, min) => Math.max(min, GH * f);   // a share of the digit height, never thinner than min pixels
    const sw = (cls, v) => host.querySelectorAll('.' + cls).forEach((e) => e.setAttribute('stroke-width', v.toFixed(2)));
    sw('sw-hair', 2 * px(0.0105, 1.2));  // half of this stroke shows, outside the edge
    sw('sw-rim', 2 * px(0.012, 1));
    sw('sw-lens', px(0.1, 8));
    host.querySelector('.soft').setAttribute('stdDeviation', px(0.011, 0.8).toFixed(2));
    host.querySelector('.crisp').setAttribute('stdDeviation', px(0.0012, 0.25).toFixed(2));
    const nudge = (cls, dx, dy) => host.querySelectorAll('.' + cls).forEach((e) => e.setAttribute('transform', 'translate(' + dx.toFixed(2) + ',' + dy.toFixed(2) + ')'));
    nudge('sh-gb', 0, -px(0.035, 3)); nudge('sh-gb2', 0, -px(0.014, 1.5));   // light pooling inside the bottom edges
    nudge('sh-gl', px(0.03, 2.5), 0);                                      // soft glow inside the left edges
    nudge('sh-sr', -px(0.03, 2.5), 0); nudge('sh-sr2', -px(0.012, 1), 0);   // shade inside the right edges
    nudge('sh-rt', 0, px(0.009, 1)); nudge('sh-rb', 0, -px(0.009, 1)); nudge('sh-rl', px(0.006, 0.8), 0);   // the crisp bright lines
    host.querySelector('.shadowblur').setAttribute('stdDeviation', px(0.012, 2).toFixed(2));
    host.querySelector('g.shadow').setAttribute('transform', 'translate(0,' + px(0.012, 2).toFixed(2) + ')');
    host.style.setProperty('--clk-blur', style.style === 'solid' ? '0px' : '2px');
    chars.forEach((c) => { if (!c.out) place(c, c.entering ? 'in' : '', false); });
    lensLayout();
  }

  // Line the wallpaper up behind the clock, magnified around the clock's centre (m = how strongly the glass bends)
  function lensLayout() {
    const bg = window.__bgFile, nat = bg && natural[bg], band = svg.querySelector('.lensband');
    if (style.style === 'solid' || !nat) {
      glass.style.backgroundImage = ''; glass.style.backgroundSize = ''; glass.style.backgroundPosition = '';
      host.classList.remove('lensed'); lens.setAttribute('opacity', '0'); band.style.display = 'none'; return;
    }
    band.style.display = '';
    const r = host.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    const sc = Math.max(W / nat.w, H / nat.h), dw = nat.w * sc, dh = nat.h * sc, dx = (W - dw) / 2, dy = (H - dh) / 2;   // the photo is "cover"-fitted
    const Cx = r.left + r.width / 2, Cy = r.top + r.height / 2;
    const at = (m) => ({ x: Cx - r.left - m * (Cx - dx), y: Cy - r.top - m * (Cy - dy), w: dw * m, h: dh * m });
    const body = at(1.06), edge = at(1.3), n = tintLayers.length;
    glass.style.backgroundImage = tintLayers.concat(['url("' + bg + '")']).join(', ');
    glass.style.backgroundSize = Array(n).fill('100% 100%').concat([body.w.toFixed(1) + 'px ' + body.h.toFixed(1) + 'px']).join(', ');
    glass.style.backgroundPosition = Array(n).fill('0 0').concat([body.x.toFixed(1) + 'px ' + body.y.toFixed(1) + 'px']).join(', ');
    glass.style.backgroundRepeat = 'no-repeat';
    host.classList.add('lensed');
    if (lens.getAttribute('data-src') !== bg) { lens.setAttribute('href', bg); lens.setAttributeNS(XL, 'xlink:href', bg); lens.setAttribute('data-src', bg); }
    lens.setAttribute('x', edge.x.toFixed(1)); lens.setAttribute('y', edge.y.toFixed(1));
    lens.setAttribute('width', edge.w.toFixed(1)); lens.setAttribute('height', edge.h.toFixed(1));
    lens.setAttribute('opacity', '0.9');
  }
  function learn(file) {
    if (!file) return;
    if (natural[file]) { layout(); return; }
    const im = new Image();
    im.onload = () => { natural[file] = { w: im.naturalWidth, h: im.naturalHeight }; if (window.__bgFile === file) layout(); };
    im.src = file;
  }
  window.addEventListener('bgfile', () => learn(window.__bgFile));

  function paint() {
    if (!host && !build()) return;
    const t = style.tint, solid = style.style === 'solid';
    if (solid) { tintLayers = []; host.style.setProperty('--clk-tint', rgba(t, 0.97)); }
    else {
      // clear glass: a wash of colour plus a little milkiness. "Glass" on the phone: 100 = nearly clear,
      // 0 = pale and milky like Apple's light tints
      const g = Math.max(0, Math.min(1, style.glass / 100)), a = 0.42 - 0.36 * g, milk = 0.36 * (1 - g);
      tintLayers = ['linear-gradient(180deg,' + rgba(t, Math.min(1, a + 0.06)) + ' 0%,' + rgba(t, a) + ' 100%)',
        'linear-gradient(rgba(255,255,255,' + milk.toFixed(3) + '),rgba(255,255,255,' + milk.toFixed(3) + '))'];
      host.style.setProperty('--clk-tint', tintLayers.join(', '));
      lensTint.setAttribute('fill', t); lensTint.setAttribute('opacity', (a + 0.03).toFixed(3));
      lensMilk.setAttribute('opacity', milk.toFixed(3));
    }
    host.classList.toggle('solid', solid);
    hair.setAttribute('stroke', solid ? 'rgba(0,0,0,.26)' : 'rgba(0,0,0,.3)');
  }

  function setText(str) {
    if (!host && !build()) return;
    if (str === text) return;
    const first = !text; text = str;
    const live = chars.filter((c) => !c.out), leaving = [];
    const next = str.split('').map((ch, i) => {
      const o = live[i];
      if (o && o.c === ch) return o;
      if (o) leaving.push(o);
      const n = mk(ch); n.entering = !first; return n;
    });
    live.slice(str.length).forEach((o) => leaving.push(o));
    leaving.forEach((o) => { o.out = true; });
    chars = next.concat(leaving);
    layout();
    leaving.forEach((o) => {
      place(o, 'out', true);
      setTimeout(() => { o.g.remove(); o.k.remove(); chars = chars.filter((c) => c !== o); }, 700);
    });
    if (!first) {
      void svg.getBoundingClientRect();   // commit the "below, squashed" start position first
      setTimeout(() => next.forEach((n) => { if (n.entering) { n.entering = false; place(n, '', true); } }), 30);
    }
  }

  function setStyle(c) {
    if (!c) return;
    style = Object.assign({}, style, c);
    if (!host && !build()) return;
    paint(); layout();
  }

  // keep the glass in step while the screensaver grows/moves the clock, and on resize / font load
  let animUntil = 0;
  function follow() { layout(); if (Date.now() < animUntil) requestAnimationFrame(follow); }
  function animate(ms) { const go = Date.now() >= animUntil; animUntil = Date.now() + ms; if (go) requestAnimationFrame(follow); }
  window.addEventListener('resize', () => layout());
  new MutationObserver(() => animate(1600)).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-clk-font'] });
  if (document.fonts && document.fonts.load) {
    Promise.all(Object.keys(FONTS).map((k) => document.fonts.load(FONTS[k].weight + ' 100px ' + FONTS[k].family).catch(() => {}))).then(() => layout());
  }

  window.GlassClock = { setText: setText, setStyle: setStyle, relayout: layout };
})();
