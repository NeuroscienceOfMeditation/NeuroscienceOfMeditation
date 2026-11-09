/* The Meditation Lab: heart-rate recordings from Peng et al. 1999 (PhysioNet, ODC-By).
   Data are pre-processed by lab/analysis/heart_physionet.py. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const BASE = window.LAB_BASE || '/lab/data/';
  const root = $('.lab');
  const css = n => getComputedStyle(root).getPropertyValue(n).trim();
  const fmt = (v, d = 0) => Number.isFinite(v) ? v.toFixed(d) : '–';
  const PEOPLE = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'Y1', 'Y2', 'Y3', 'Y4'];
  const cache = {};
  let cur = 'C1', minute = 10, summary = null;

  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; }
  function svgFor(box, H, label) {
    const W = Math.max(300, Math.round(box.clientWidth));
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
    box.innerHTML = ''; box.appendChild(svg); return [svg, W];
  }
  function ticks(lo, hi, n) {
    const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6)); return out;
  }
  function path(pts, X, Y) { let d = '', pen = false; for (const [x, y] of pts) { if (!Number.isFinite(y)) { pen = false; continue; } d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1); pen = true; } return d; }
  function yAxis(svg, P, W, Y, vals, dec = 0) {
    vals.forEach(v => { el('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), stroke: css('--line') }, svg); el('text', { x: P.l - 7, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v.toFixed(dec); });
  }

  /* ---------- people ---------- */
  const peopleBox = $('[data-people]');
  peopleBox.innerHTML = '<span class="lab-grp">Chi meditation</span>' + PEOPLE.slice(0, 8).map(p => `<button type="button" data-p="${p}">${p}</button>`).join('') +
    '<span class="lab-grp">Kundalini Yoga</span>' + PEOPLE.slice(8).map(p => `<button type="button" data-p="${p}">${p}</button>`).join('');
  peopleBox.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) choose(b.dataset.p); });

  async function get(p) { if (!cache[p]) cache[p] = fetch(BASE + p + '.json').then(r => r.json()); return cache[p]; }
  async function choose(p) {
    cur = p; peopleBox.querySelectorAll('[data-p]').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === p));
    const d = await get(p); if (cur !== p) return;
    const maxMin = Math.max(d.pre.hr.length, d.med.hr.length) / d.pre.fs / 60;
    const slider = $('[data-minute]'); slider.max = Math.max(0, Math.floor(maxMin - 2));
    if (minute > +slider.max) minute = Math.min(10, +slider.max);
    slider.value = minute;
    drawAll(d);
  }
  function drawAll(d) { stats(d); overview(d); zoom(d); spectrum(d); everyone(); }

  /* ---------- stats ---------- */
  function stats(d) {
    const a = d.pre.stats, b = d.med.stats, grp = d.group === 'chi' ? 'Chi meditation, beginner' : 'Kundalini Yoga, advanced';
    const up = b.Am > a.Am * 1.1, same = Math.abs(b.Am - a.Am) <= a.Am * 0.1;
    $('[data-stats]').innerHTML = `
      <div class="lab-who"><b>${d.subject}</b><span>${grp}</span></div>
      <div class="hv-stat"><b>${fmt(a.hr)} → ${fmt(b.hr)}</b><span>Average heart rate, before → during</span></div>
      <div class="hv-stat"><b>±${fmt(a.Am, 1)} → ±${fmt(b.Am, 1)}</b><span>Typical swing, beats per minute</span></div>
      <div class="hv-stat"><b>${fmt(b.peak * 60, 1)} a minute</b><span>Strongest rhythm during practice</span></div>
      <div class="hv-stat"><b>${fmt(a.rmssd, 0)} → ${fmt(b.rmssd, 0)}</b><span>RMSSD, ms, before → during</span></div>
      <p class="lab-verdict">${same ? 'For this person the swings stayed about the same size during meditation.' : up ? `During meditation this person's heart swung about ${fmt(b.Am / a.Am, 1)} times as hard as before.` : 'For this person the swings were smaller during meditation.'}</p>`;
  }

  /* ---------- overview ---------- */
  const ovBox = $('[data-overview]');
  function overview(d) {
    const fs = d.pre.fs, rows = [['Before', d.pre.hr, css('--pre')], ['During', d.med.hr, css('--med')]];
    const all = d.pre.hr.concat(d.med.hr); let lo = Math.min(...all), hi = Math.max(...all);
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const tmax = Math.max(d.pre.hr.length, d.med.hr.length) / fs / 60;
    const rowH = 120, gap = 26, P = { l: 40, r: 12, t: 22 }, H = P.t + rowH * 2 + gap + 30;
    const [svg, W] = svgFor(ovBox, H, `Heart rate of ${d.subject} before and during meditation`);
    const X = m => P.l + m / tmax * (W - P.l - P.r);
    rows.forEach(([name, hr, col], i) => {
      const top = P.t + i * (rowH + gap), Y = v => top + rowH - (v - lo) / (hi - lo) * rowH;
      yAxis(svg, P, W, Y, ticks(lo, hi, 3));
      el('text', { x: P.l, y: top - 7, class: 'lab-rowlabel' }, svg).textContent = name;
      const step = 2, pts = []; for (let k = 0; k < hr.length; k += step) pts.push([k / fs / 60, hr[k]]);
      el('path', { d: path(pts, X, Y), fill: 'none', stroke: col, 'stroke-width': 1.1 }, svg);
    });
    ticks(0, tmax, 8).forEach(m => el('text', { x: X(m), y: H - 6, 'text-anchor': 'middle' }, svg).textContent = m + (m === 0 ? ' min' : ''));
    const brush = el('rect', { x: X(minute), y: P.t - 4, width: X(minute + 2) - X(minute), height: rowH * 2 + gap + 8, class: 'lab-brush' }, svg);
    const setFrom = e => { const b = svg.getBoundingClientRect(); const x = (e.clientX - b.left) / b.width * W; let m = (x - P.l) / (W - P.l - P.r) * tmax - 1;
      m = Math.max(0, Math.min(+$('[data-minute]').max, Math.round(m * 2) / 2)); minute = m; $('[data-minute]').value = m; brush.setAttribute('x', X(m)); zoom(d); };
    let down = false;
    svg.addEventListener('pointerdown', e => { down = true; svg.setPointerCapture(e.pointerId); setFrom(e); });
    svg.addEventListener('pointermove', e => { if (down) setFrom(e); });
    svg.addEventListener('pointerup', () => { down = false; });
    svg.style.cursor = 'crosshair'; svg.style.touchAction = 'pan-y';
  }

  /* ---------- zoom ---------- */
  function zoom(d) {
    $('[data-minout]').textContent = minute;
    const fs = d.pre.fs, a = Math.round(minute * 60 * fs), b = a + 120 * fs;
    const segs = [['Before', d.pre.hr.slice(a, b), css('--pre'), $('[data-zoom-pre]')], ['During', d.med.hr.slice(a, b), css('--med'), $('[data-zoom-med]')]];
    const vals = segs.flatMap(s => s[1]); let lo = Math.min(...vals), hi = Math.max(...vals);
    if (!vals.length) { lo = 50; hi = 100; }
    lo = Math.floor(lo / 5) * 5 - 5; hi = Math.ceil(hi / 5) * 5 + 5;
    segs.forEach(([name, hr, col, box]) => {
      const H = 210, P = { l: 40, r: 10, t: 26, b: 26 };
      const [svg, W] = svgFor(box, H, `${name} meditation, minutes ${minute} to ${minute + 2}`);
      const X = s => P.l + s / 120 * (W - P.l - P.r), Y = v => H - P.b - (v - lo) / (hi - lo) * (H - P.t - P.b);
      yAxis(svg, P, W, Y, ticks(lo, hi, 4));
      el('text', { x: P.l, y: 15, class: 'lab-rowlabel' }, svg).textContent = `${name} · minutes ${minute}–${minute + 2}`;
      [0, 30, 60, 90, 120].forEach(s => el('text', { x: X(s), y: H - 7, 'text-anchor': 'middle' }, svg).textContent = s + (s === 120 ? ' s' : ''));
      if (!hr.length) { el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, svg).textContent = 'This recording ended earlier'; return; }
      el('path', { d: path(hr.map((v, k) => [k / fs, v]), X, Y), fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    });
  }
  $('[data-minute]').addEventListener('input', e => { minute = +e.target.value; get(cur).then(d => { overview(d); zoom(d); }); });

  /* ---------- spectrum ---------- */
  function spectrum(d) {
    const box = $('[data-spectrum]'), H = 300, P = { l: 46, r: 12, t: 30, b: 40 };
    const [svg, W] = svgFor(box, H, `Strength of each heart-rate rhythm for ${d.subject}, before and during`);
    const lim = 24; // cycles per minute
    const sets = [['Before', d.pre, css('--pre')], ['During', d.med, css('--med')]];
    const hi = Math.max(...sets.flatMap(([, s]) => s.spec_p.filter((p, i) => s.spec_f[i] * 60 >= 1.5 && s.spec_f[i] * 60 <= lim))) * 1.08;
    const X = c => P.l + c / lim * (W - P.l - P.r), Y = v => H - P.b - Math.min(v, hi) / hi * (H - P.t - P.b);
    el('rect', { x: X(4.5), y: P.t, width: X(7.5) - X(4.5), height: H - P.t - P.b, class: 'lab-band' }, svg);
    el('text', { x: (X(4.5) + X(7.5)) / 2, y: H - P.b - 8, 'text-anchor': 'middle', class: 'lab-bandlabel' }, svg).textContent = 'slow breathing';
    [0, 6, 12, 18, 24].forEach(c => el('text', { x: X(c), y: H - P.b + 18, 'text-anchor': 'middle' }, svg).textContent = c);
    el('text', { x: W - P.r, y: H - 4, 'text-anchor': 'end' }, svg).textContent = 'cycles per minute';
    el('text', { x: P.l, y: 14 }, svg).textContent = 'strength (power)';
    el('line', { x1: P.l, x2: W - P.r, y1: Y(0), y2: Y(0), stroke: css('--line') }, svg);
    sets.forEach(([name, s, col]) => {
      const pts = s.spec_f.map((f, i) => [f * 60, s.spec_p[i]]).filter(p => p[0] <= lim && p[0] >= 1.5);
      el('path', { d: path(pts, X, Y), fill: 'none', stroke: col, 'stroke-width': 2.2 }, svg);
    });
    let lx = W - P.r - 170; sets.forEach(([name, , col]) => { el('rect', { x: lx, y: 9, width: 14, height: 4, fill: col }, svg); el('text', { x: lx + 20, y: 15 }, svg).textContent = name; lx += 85; });
    $('[data-spec-note]').textContent = `Below about 1.5 cycles a minute the chart is cut off: those slow drifts come from posture and activity, not breathing. ${d.subject}'s strongest rhythm during practice: ${fmt(d.med.stats.peak * 60, 1)} cycles a minute.`;
  }

  /* ---------- everyone ---------- */
  const COLS = [['chi', 'pre', 'Chi, before'], ['chi', 'med', 'Chi, during'], ['yoga', 'pre', 'Kundalini, before'], ['yoga', 'med', 'Kundalini, during'], ['normal', 'rec', 'Asleep'], ['metron', 'rec', 'Paced breathing'], ['ironman', 'rec', 'Athletes asleep']];
  function everyone() {
    if (!summary) return;
    const box = $('[data-everyone]'), H = 340, P = { l: 46, r: 12, t: 24, b: 56 };
    const [svg, W] = svgFor(box, H, 'Typical heart-rate swing for every person in the study, by group');
    const hi = Math.ceil(Math.max(...summary.map(s => s.Am)) / 5) * 5;
    const cw = (W - P.l - P.r) / COLS.length, X = i => P.l + cw * (i + 0.5), Y = v => H - P.b - v / hi * (H - P.t - P.b);
    yAxis(svg, P, W, Y, ticks(0, hi, 4));
    el('text', { x: P.l, y: 13 }, svg).textContent = 'typical swing, ± beats per minute';
    el('line', { x1: P.l + cw * 4, x2: P.l + cw * 4, y1: P.t, y2: H - P.b + 40, stroke: css('--line'), 'stroke-dasharray': '4 4' }, svg);
    el('text', { x: P.l + cw * 5.5, y: H - 6, 'text-anchor': 'middle', class: 'lab-rowlabel' }, svg).textContent = 'never meditated';
    const pos = {};
    COLS.forEach(([g, ph, label], i) => {
      const items = summary.filter(s => s.group === g && s.phase === ph).sort((a, b) => a.subject < b.subject ? -1 : 1);
      const words = label.split(', ');
      words.forEach((w, k) => el('text', { x: X(i), y: H - P.b + 18 + k * 15, 'text-anchor': 'middle' }, svg).textContent = w);
      items.forEach((s, k) => { const jitter = items.length > 1 ? (k / (items.length - 1) - 0.5) * Math.min(cw * 0.5, 40) : 0; pos[s.subject + s.phase] = [X(i) + jitter, Y(s.Am)]; });
    });
    PEOPLE.forEach(p => { const a = pos[p + 'pre'], b = pos[p + 'med']; if (a && b) el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: p === cur ? css('--med') : css('--line'), 'stroke-width': p === cur ? 2.5 : 1.2 }, svg); });
    COLS.forEach(([g, ph], i) => summary.filter(s => s.group === g && s.phase === ph).forEach(s => {
      const [x, y] = pos[s.subject + s.phase], me = s.subject === cur;
      const c = el('circle', { cx: x, cy: y, r: me ? 7 : 5, fill: ph === 'med' ? css('--med') : ph === 'pre' ? css('--pre') : css('--ctl'), stroke: me ? css('--ink') : 'none', 'stroke-width': 2 }, svg);
      el('title', {}, c).textContent = `${s.subject}: ±${fmt(s.Am, 1)} beats per minute`;
    }));
    COLS.forEach(([g, ph], i) => { const v = summary.filter(s => s.group === g && s.phase === ph).map(s => s.Am); const m = v.reduce((a, b) => a + b, 0) / v.length;
      el('line', { x1: X(i) - cw * 0.36, x2: X(i) + cw * 0.36, y1: Y(m), y2: Y(m), stroke: css('--ink'), 'stroke-width': 2, opacity: 0.55 }, svg); });
  }

  fetch(BASE + 'summary.json').then(r => r.json()).then(s => { summary = s; everyone(); });
  choose(cur);
  let rt; const redraw = () => { clearTimeout(rt); rt = setTimeout(() => get(cur).then(drawAll), 150); };
  addEventListener('resize', redraw);
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw); } catch (e) {}
})();
