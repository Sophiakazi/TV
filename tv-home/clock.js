// Liquid-Glass clock (in the style of the iOS 26 lock screen, clear glass).
// Each digit is a clear lens: you see the wallpaper straight through it, slightly magnified,
// and bent more strongly just inside the edges, the way thick glass bends light. A faint tint,
// a bright rim that catches a slowly moving light (like tilting a phone), a soft edge and a
// drifting glint finish it. Digits that change roll in, like iOS.
(function () {
  const NS = 'http://www.w3.org/2000/svg', XL = 'http://www.w3.org/1999/xlink';
  const FONTS = {
    condensed: { family: '"Barlow Condensed", "Arial Narrow", sans-serif', weight: 700, cap: 0.70 },
    rounded:   { family: '"Nunito", ui-rounded, "Arial Rounded MT Bold", sans-serif', weight: 900, cap: 0.705 },
    classic:   { family: '-apple-system, "Helvetica Neue", Arial, sans-serif', weight: 800, cap: 0.72 },
    serif:     { family: 'Georgia, "Times New Roman", serif', weight: 700, cap: 0.70 }
  };
  let host, glass, svg, gG, clip, hair, lens, tintImg = '', edgeStops = [], rimDarkStops = [], chars = [], text = '', geo = null;
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
  const shade = (h, f, a) => 'rgba(' + rgb(h).map((v) => Math.round(v * f)).join(',') + ',' + a + ')';
  const stop = (o, c, a) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a });
  const ease = { calcMode: 'spline', keyTimes: '0;0.5;1', keySplines: '.45 0 .55 1;.45 0 .55 1', repeatCount: 'indefinite' };

  function build() {
    host = document.getElementById('time');
    if (!host) return false;
    host.textContent = '';
    glass = document.createElement('div'); glass.className = 'clk-glass';
    svg = el('svg', { class: 'clk-fx', 'aria-hidden': 'true' });
    gG = el('g', { id: 'clkG' });
    clip = el('clipPath', { id: 'clkClip' });
    const full = () => el('rect', { class: 'full', x: 0, y: 0 });

    // light that sways back and forth across the rims (the "tilt")
    const sway = () => el('animateTransform', Object.assign({ attributeName: 'gradientTransform', type: 'rotate', values: '-58 .5 .5;58 .5 .5;-58 .5 .5', dur: '14s' }, ease));
    const gLight = el('linearGradient', { id: 'clkLight', x1: 0, y1: 0, x2: 1, y2: 1 }, [stop(0, '#fff', 1), stop(0.38, '#fff', 0.5), stop(0.7, '#fff', 0.06), stop(1, '#fff', 0), sway()]);
    const gLight2 = el('linearGradient', { id: 'clkLight2', x1: 1, y1: 1, x2: 0, y2: 0 }, [stop(0, '#fff', 0.42), stop(0.3, '#fff', 0.1), stop(0.6, '#fff', 0), sway()]);
    // the outer edge: barely there on the lit side, a deeper shade of the tint on the far side (like real glass)
    edgeStops = [stop(0, '#000', 0.1), stop(0.6, '#000', 0.35), stop(1, '#000', 0.8)];
    const gEdge = el('linearGradient', { id: 'clkEdge', x1: 0.2, y1: 0, x2: 0.8, y2: 1 }, edgeStops);
    rimDarkStops = [stop(0, '#000', 0), stop(0.55, '#000', 0), stop(1, '#000', 0.2)];
    const gDark = el('linearGradient', { id: 'clkDark', x1: 0, y1: 0, x2: 1, y2: 1 }, rimDarkStops.concat([sway()]));
    const gSheen = el('linearGradient', { id: 'clkSheen', x1: 0, y1: 0, x2: 0, y2: 1 }, [stop(0, '#fff', 0.14), stop(0.35, '#fff', 0), stop(0.8, '#fff', 0), stop(1, '#fff', 0.06)]);
    const gSpec = el('radialGradient', { id: 'clkSpec', cx: 0.25, cy: 0.08, r: 0.3 }, [stop(0, '#fff', 0.55), stop(0.4, '#fff', 0.12), stop(1, '#fff', 0),
      el('animate', Object.assign({ attributeName: 'cx', values: '.12;.88;.12', dur: '14s' }, ease)),
      el('animate', Object.assign({ attributeName: 'cy', values: '.04;.26;.04', dur: '14s' }, ease))]);
    const fRim = el('filter', { id: 'clkRimSoft', x: '-10%', y: '-10%', width: '120%', height: '120%' }, [el('feGaussianBlur', { class: 'rimsoft', stdDeviation: 0.8 })]);
    // the view through the glass edge comes out a touch brighter, as it does through real glass
    const fTone = el('filter', { id: 'clkTone' }, [el('feComponentTransfer', {}, ['R', 'G', 'B'].map((c) => el('feFunc' + c, { type: 'linear', slope: 1.12, intercept: 0.02 })))]);
    const fSoft = el('filter', { id: 'clkSoft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, [el('feGaussianBlur', { class: 'soft', stdDeviation: 2 })]);
    const fShadow = el('filter', { id: 'clkShadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, [el('feGaussianBlur', { class: 'shadowblur', stdDeviation: 4 })]);
    const useG = (a) => el('use', Object.assign({ href: '#clkG' }, a));
    const mBody = el('mask', { id: 'clkBody', maskUnits: 'userSpaceOnUse' }, [useG({ fill: '#fff' })]);
    const mOut = el('mask', { id: 'clkOut', maskUnits: 'userSpaceOnUse' }, [Object.assign(full(), {}), useG({ fill: '#000' })]);
    mOut.firstChild.setAttribute('fill', '#fff');
    const mRim = el('mask', { id: 'clkRim', maskUnits: 'userSpaceOnUse' }, [useG({ fill: 'none', stroke: '#fff', class: 'sw-rim', 'stroke-linejoin': 'round' })]);
    const mBev = el('mask', { id: 'clkBev', maskUnits: 'userSpaceOnUse' }, [useG({ fill: 'none', stroke: '#fff', class: 'sw-bev', 'stroke-linejoin': 'round' })]);
    const mLens = el('mask', { id: 'clkLens', maskUnits: 'userSpaceOnUse' }, [useG({ fill: 'none', stroke: '#fff', class: 'sw-lens', 'stroke-linejoin': 'round', filter: 'url(#clkSoft)' })]);
    const band = (id, cls) => el('mask', { id: id, maskUnits: 'userSpaceOnUse' }, [useG({ fill: '#fff' }), useG({ fill: '#000', class: cls })]);
    const mBottom = band('clkBotBand', 'sh-b'), mLeft = band('clkLeftBand', 'sh-l'), mRight = band('clkRightBand', 'sh-r');
    svg.appendChild(el('defs', {}, [gG, clip, gLight, gLight2, fRim, fTone, gEdge, gDark, gSheen, gSpec, fSoft, fShadow, mBody, mOut, mRim, mBev, mLens, mBottom, mLeft, mRight]));

    // soft shadow below the glass (outside the digits only)
    svg.appendChild(el('g', { mask: 'url(#clkOut)' }, [el('g', { class: 'shadow' }, [useG({ fill: 'rgba(4,14,34,.14)', filter: 'url(#clkShadow)' })])]));
    // thin dark edge, just outside the glass
    hair = useG({ fill: 'none', stroke: 'rgba(0,0,0,.16)', class: 'sw-hair', 'stroke-linejoin': 'round' });
    svg.appendChild(el('g', { mask: 'url(#clkOut)' }, [hair]));
    // the background seen through the edge of the glass: bent (magnified) much more strongly than in the middle
    lens = el('image', { class: 'lens', preserveAspectRatio: 'none', x: 0, y: 0, width: 1, height: 1, opacity: 0, filter: 'url(#clkTone)' });
    svg.appendChild(el('g', { mask: 'url(#clkBody)' }, [el('g', { mask: 'url(#clkLens)' }, [lens])]));
    // light inside the glass
    const sheen = full(); sheen.setAttribute('fill', 'url(#clkSheen)');
    const bev = full(); bev.setAttribute('fill', '#fff'); bev.setAttribute('opacity', '.08'); bev.setAttribute('mask', 'url(#clkBev)');
    const dark = full(); dark.setAttribute('fill', 'url(#clkDark)'); dark.setAttribute('mask', 'url(#clkBev)'); dark.setAttribute('opacity', '0');
    const glowB = full(); glowB.setAttribute('fill', '#fff'); glowB.setAttribute('opacity', '.18'); glowB.setAttribute('mask', 'url(#clkBotBand)');
    const glowL = full(); glowL.setAttribute('fill', '#fff'); glowL.setAttribute('opacity', '.1'); glowL.setAttribute('mask', 'url(#clkLeftBand)');
    const shadeR = full(); shadeR.setAttribute('fill', '#000'); shadeR.setAttribute('opacity', '.1'); shadeR.setAttribute('mask', 'url(#clkRightBand)');
    const rim = full(); rim.setAttribute('fill', 'url(#clkLight)'); rim.setAttribute('mask', 'url(#clkRim)');
    const rim2 = full(); rim2.setAttribute('fill', 'url(#clkLight2)'); rim2.setAttribute('mask', 'url(#clkRim)');
    const spec = full(); spec.setAttribute('fill', 'url(#clkSpec)');
    svg.appendChild(el('g', { mask: 'url(#clkBody)' }, [sheen, el('g', { filter: 'url(#clkSoft)' }, [bev, glowB, glowL, shadeR]), dark, el('g', { filter: 'url(#clkRimSoft)' }, [rim, rim2]), spec]));

    host.appendChild(glass); host.appendChild(svg);
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
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('font-family', F.family); svg.setAttribute('font-weight', F.weight); svg.setAttribute('font-size', fs.toFixed(2));
    svg.querySelectorAll('rect.full').forEach((r) => { r.setAttribute('width', W); r.setAttribute('height', H); });
    const w = (cls, v) => svg.querySelectorAll('.' + cls).forEach((e) => e.setAttribute('stroke-width', v.toFixed(2)));
    w('sw-hair', Math.max(2, GH * 0.012));
    w('sw-rim', Math.max(2.6, GH * 0.016));
    svg.querySelector('.rimsoft').setAttribute('stdDeviation', Math.max(0.6, GH * 0.0045).toFixed(2));
    w('sw-bev', Math.max(5, GH * 0.06));
    w('sw-lens', Math.max(8, GH * 0.1));
    svg.querySelector('.soft').setAttribute('stdDeviation', Math.max(1.5, GH * 0.022).toFixed(2));
    svg.querySelectorAll('.sh-b').forEach((e) => e.setAttribute('transform', 'translate(0,' + (-GH * 0.04).toFixed(2) + ')'));
    svg.querySelectorAll('.sh-l').forEach((e) => e.setAttribute('transform', 'translate(' + (GH * 0.05).toFixed(2) + ',0)'));
    svg.querySelectorAll('.sh-r').forEach((e) => e.setAttribute('transform', 'translate(' + (-GH * 0.03).toFixed(2) + ',0)'));
    svg.querySelector('.shadowblur').setAttribute('stdDeviation', Math.max(2, GH * 0.012).toFixed(2));
    svg.querySelector('g.shadow').setAttribute('transform', 'translate(0,' + Math.max(2, GH * 0.012).toFixed(2) + ')');
    host.style.setProperty('--clk-blur', style.style === 'solid' ? '0px' : '2px');
    chars.forEach((c) => { if (!c.out) place(c, c.entering ? 'in' : '', false); });
    lensLayout();
  }

  // Line the wallpaper up behind the clock, magnified around the clock's centre (m = how strongly the glass bends)
  function lensLayout() {
    const bg = window.__bgFile, nat = bg && natural[bg];
    if (style.style === 'solid' || !nat) {
      glass.style.backgroundImage = ''; glass.style.backgroundSize = ''; glass.style.backgroundPosition = '';
      host.classList.remove('lensed'); lens.setAttribute('opacity', '0'); return;
    }
    const r = host.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    const sc = Math.max(W / nat.w, H / nat.h), dw = nat.w * sc, dh = nat.h * sc, dx = (W - dw) / 2, dy = (H - dh) / 2;   // the photo is "cover"-fitted
    const Cx = r.left + r.width / 2, Cy = r.top + r.height / 2;
    const at = (m) => ({ x: Cx - r.left - m * (Cx - dx), y: Cy - r.top - m * (Cy - dy), w: dw * m, h: dh * m });
    const body = at(1.06), edge = at(1.3);
    glass.style.backgroundImage = tintImg + ', url("' + bg + '")';
    glass.style.backgroundSize = '100% 100%, ' + body.w.toFixed(1) + 'px ' + body.h.toFixed(1) + 'px';
    glass.style.backgroundPosition = '0 0, ' + body.x.toFixed(1) + 'px ' + body.y.toFixed(1) + 'px';
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
    if (solid) host.style.setProperty('--clk-tint', rgba(t, 0.97));
    else {
      const a = 0.3 - 0.25 * (style.glass / 100);   // clear glass: just a wash of colour (higher "Glass" = clearer)
      tintImg = 'linear-gradient(180deg,' + rgba(t, Math.min(1, a + 0.06)) + ' 0%,' + rgba(t, a) + ' 100%)';
      host.style.setProperty('--clk-tint', tintImg);
    }
    host.classList.toggle('solid', solid);
    hair.setAttribute('stroke', solid ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,0)');
    rimDarkStops.forEach((s) => s.setAttribute('stop-color', shade(t, 0.3, 1)));
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
