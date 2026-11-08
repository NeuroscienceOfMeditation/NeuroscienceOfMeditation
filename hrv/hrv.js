/* Measure your practice: RR-interval viewer and morning HRV log.
   Everything runs in the browser; nothing is uploaded. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const css = n => getComputedStyle(document.querySelector('.hv')).getPropertyValue(n).trim();
  const fmt = (v, d = 0) => Number.isFinite(v) ? v.toFixed(d) : '–';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- parsing and cleaning ---------- */
  function parseRR(text) {
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      const nums = line.match(/-?\d+(?:[.,]\d+)?/g);
      if (!nums) continue;
      // one value per line: the last number (exports often put a timestamp first)
      const plaus = x => { const v = parseFloat(x.replace(',', '.')); return (v >= 250 && v <= 2500) || (v >= 0.25 && v <= 2.5); };
      for (const raw of (nums.length > 1 && nums.every(plaus) ? nums : [nums[nums.length - 1]])) {
        let v = parseFloat(raw.replace(',', '.'));
        if (v > 0 && v < 3) v *= 1000;            // seconds -> ms
        out.push(v);
      }
    }
    return out;
  }
  function clean(rr) {
    const ok = new Array(rr.length).fill(false), kept = [];
    for (let i = 0; i < rr.length; i++) {
      const v = rr[i];
      if (!(v >= 250 && v <= 2500)) continue;
      // a missed or extra beat changes the interval by 40-100%; real breathing swings change it
      // by well under 15% from one beat to the next, even at 30 bpm swings (Peng et al. 1999)
      const last = kept.length ? rr[kept[kept.length - 1]] : null;
      const raw5 = rr.slice(Math.max(0, i - 5), i).filter(x => x >= 250 && x <= 2500).sort((a, b) => a - b);
      const med = raw5.length >= 3 ? raw5[raw5.length >> 1] : null;
      const near = (ref) => ref && Math.abs(v - ref) / ref <= 0.25;
      if ((last || med) && !near(last) && !near(med)) continue;
      ok[i] = true; kept.push(i);
    }
    return ok;
  }
  function stats(rr) {
    const ok = clean(rr);
    let t = 0, n = 0, sum = 0, sq = 0, dn = 0; const pts = [], good = [];
    for (let i = 0; i < rr.length; i++) {
      const v = rr[i]; if (v > 0 && v < 4000) t += v / 1000;
      if (!ok[i]) continue;
      good.push(v); pts.push([t, 60000 / v]);
      if (i > 0 && ok[i - 1]) { const d = v - rr[i - 1]; sq += d * d; dn++; }
    }
    n = good.length; sum = good.reduce((a, b) => a + b, 0);
    const mean = sum / n, sd = Math.sqrt(good.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
    const rmssd = Math.sqrt(sq / Math.max(1, dn));
    return { n: rr.length, kept: n, dropped: rr.length - n, dur: t, hr: 60000 / mean, rmssd, ln: Math.log(rmssd), sdnn: sd, pts };
  }

  /* ---------- chart helpers ---------- */
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; }
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function axes(svg, W, H, P, xs, ys, X, Y, xl, yl) {
    const grid = css('--line') || 'rgba(0,0,0,.12)';
    ys.forEach(v => { el('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), stroke: grid }, svg); el('text', { x: P.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v; });
    xs.forEach(v => { el('text', { x: X(v), y: H - P.b + 18, 'text-anchor': 'middle' }, svg).textContent = typeof v === 'string' ? v : v; });
    el('text', { x: P.l, y: 14 }, svg).textContent = yl;
    el('text', { x: W - P.r, y: H - 4, 'text-anchor': 'end' }, svg).textContent = xl;
  }

  /* ---------- RR viewer ---------- */
  const slots = $$('[data-slot]'), chart = $('[data-chart]');
  if (!chart) return;
  const data = {};
  function renderSlot(slot) {
    const id = slot.dataset.slot, txt = $('[data-paste]', slot).value, box = $('[data-stats]', slot);
    const rr = parseRR(txt);
    if (rr.length < 10) { delete data[id]; box.innerHTML = rr.length ? '<p class="hv-warn">Need at least 10 beats.</p>' : ''; return; }
    const s = stats(rr); data[id] = s;
    const pct = 100 * s.dropped / s.n;
    box.innerHTML = `<div class="hv-stat"><b>${fmt(s.rmssd, 1)}</b><span>RMSSD, ms</span></div>
      <div class="hv-stat"><b>${fmt(s.hr, 0)}</b><span>Mean heart rate</span></div>
      <div class="hv-stat"><b>${fmt(s.sdnn, 1)}</b><span>SDNN, ms</span></div>
      <div class="hv-stat"><b>${fmt(s.dur / 60, 1)}</b><span>Minutes, ${s.kept} beats</span></div>
      ${pct > 5 ? `<p class="hv-warn">${fmt(pct, 1)}% of beats were dropped as likely errors. Treat these numbers with care.</p>` : ''}`;
  }
  function drawRR() {
    const sets = slots.map(s => ({ id: s.dataset.slot, name: $('[data-label]', s).value, s: data[s.dataset.slot] })).filter(x => x.s);
    if (!sets.length) { chart.innerHTML = '<p class="hv-empty">Your heart rate will appear here, beat by beat.</p>'; return; }
    const W = Math.max(340, Math.round(chart.clientWidth - 28)), H = W < 600 ? 300 : 340, P = { l: 40, r: 12, t: W < 600 ? 66 : 46, b: 34 };
    const tmax = Math.max(...sets.map(x => x.s.dur));
    let lo = Infinity, hi = -Infinity; sets.forEach(x => x.s.pts.forEach(p => { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }));
    lo = Math.floor(lo / 5) * 5 - 5; hi = Math.ceil(hi / 5) * 5 + 5;
    const X = t => P.l + (t / tmax) * (W - P.l - P.r), Y = v => H - P.b - ((v - lo) / (hi - lo)) * (H - P.t - P.b);
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Heart rate beat by beat: ' + sets.map(x => `${x.name}, RMSSD ${fmt(x.s.rmssd, 1)} ms`).join('; '));
    const xt = niceTicks(0, tmax / 60, 8).map(m => m);
    axes(svg, W, H, P, [], niceTicks(lo, hi, 5), X, Y, 'minutes', 'beats per minute');
    xt.forEach(m => { el('text', { x: X(m * 60), y: H - P.b + 18, 'text-anchor': 'middle' }, svg).textContent = m; });
    sets.forEach(x => {
      const col = x.id === '1' ? css('--a') : css('--b');
      el('path', { d: x.s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(''), fill: 'none', stroke: col, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, svg);
    });
    let lx = P.l, ly = 34; sets.forEach(x => { const col = x.id === '1' ? css('--a') : css('--b');
      const label = `${x.name} · RMSSD ${fmt(x.s.rmssd, 1)} ms`, w = 30 + label.length * 6.4;
      if (lx > P.l && lx + w > W) { lx = P.l; ly += 18; }
      el('rect', { x: lx, y: ly - 5, width: 14, height: 4, fill: col }, svg);
      el('text', { x: lx + 20, y: ly }, svg).textContent = label; lx += w; });
    chart.innerHTML = ''; chart.appendChild(svg);
  }
  slots.forEach(slot => {
    const ta = $('[data-paste]', slot);
    const go = () => { renderSlot(slot); drawRR(); };
    ta.addEventListener('input', go);
    $('[data-label]', slot).addEventListener('input', drawRR);
    $('[data-file]', slot).addEventListener('change', e => { const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { ta.value = t; const nm = $('[data-label]', slot); if (/^Recording [AB]$/.test(nm.value)) nm.value = f.name.replace(/\.[^.]+$/, ''); go(); }); });
  });
  /* simulated example: clearly labelled, generated here, not real data */
  function simulate(slow) {
    const out = []; let t = 0, seed = slow ? 7 : 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    while (t < 300) {
      const br = slow ? 6 : 14, amp = slow ? 11 : 3.5;
      const hr = 66 + amp * Math.sin(2 * Math.PI * (br / 60) * t) + 1.2 * rnd();
      const rr = 60000 / hr; out.push(Math.round(rr)); t += rr / 1000;
    }
    return out.join('\n');
  }
  $('[data-demo]').addEventListener('click', () => {
    const [a, b] = slots;
    $('[data-label]', a).value = 'Simulated: normal breathing'; $('[data-paste]', a).value = simulate(false);
    $('[data-label]', b).value = 'Simulated: six breaths a minute'; $('[data-paste]', b).value = simulate(true);
    slots.forEach(renderSlot); drawRR();
  });

  /* ---------- morning log ---------- */
  const KEY = 'nom-hrv-log-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  let log = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(log)); } catch (e) {} };
  const form = $('[data-logform]'), lchart = $('[data-logchart]'), lsum = $('[data-logsum]');
  const dIn = $('[data-ldate]'); dIn.value = new Date().toISOString().slice(0, 10);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = dIn.value, v = +$('[data-lval]').value; if (!d || !(v > 0)) return;
    log = log.filter(x => x.d !== d).concat({ d, v, p: $('[data-lprac]').checked }).sort((a, b) => a.d < b.d ? -1 : 1);
    save(); drawLog(); $('[data-lval]').value = '';
    const nx = new Date(d); nx.setDate(nx.getDate() + 1); dIn.value = nx.toISOString().slice(0, 10);
  });
  $('[data-lclear]').addEventListener('click', () => { if (!log.length) return; log = []; save(); drawLog(); });
  $('[data-lcsv]').addEventListener('click', () => {
    const csv = 'date,rmssd_ms,ln_rmssd,practised_yesterday\n' + log.map(x => `${x.d},${x.v},${Math.log(x.v).toFixed(3)},${x.p ? 1 : 0}`).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'hrv-morning-log.csv'; a.click();
  });
  const day = s => Math.round(new Date(s + 'T00:00:00').getTime() / 864e5);
  function drawLog() {
    if (!log.length) { lchart.innerHTML = '<p class="hv-empty">Add a few mornings to see your trend.</p>'; lsum.innerHTML = ''; return; }
    const pts = log.map(x => ({ x: day(x.d), y: Math.log(x.v), p: x.p, d: x.d, v: x.v }));
    // 7-day rolling mean over calendar days (needs at least 3 readings in the window)
    const roll = pts.map(q => { const w = pts.filter(r => r.x <= q.x && r.x > q.x - 7); return w.length >= 3 ? { x: q.x, y: w.reduce((a, b) => a + b.y, 0) / w.length } : null; }).filter(Boolean);
    const W = Math.max(320, Math.round(lchart.clientWidth - 28)), H = 300, P = { l: 40, r: 12, t: 40, b: 34 };
    const x0 = pts[0].x, x1 = Math.max(pts[pts.length - 1].x, x0 + 6);
    let lo = Math.min(...pts.map(p => p.y)), hi = Math.max(...pts.map(p => p.y)); const pad = Math.max(0.15, (hi - lo) * 0.15); lo -= pad; hi += pad;
    const X = v => P.l + (v - x0) / (x1 - x0) * (W - P.l - P.r), Y = v => H - P.b - (v - lo) / (hi - lo) * (H - P.t - P.b);
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Morning log: ${log.length} readings of ln RMSSD with a 7-day rolling average`);
    const grid = css('--line');
    niceTicks(lo, hi, 4).forEach(v => { el('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), stroke: grid }, svg); el('text', { x: P.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v.toFixed(1); });
    el('text', { x: P.l, y: 14 }, svg).textContent = 'ln RMSSD';
    [pts[0], pts[pts.length - 1]].forEach((p, i) => { el('text', { x: X(p.x), y: H - P.b + 18, 'text-anchor': i ? 'end' : 'start' }, svg).textContent = p.d.slice(5); });
    if (roll.length > 1) el('path', { d: roll.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(''), fill: 'none', stroke: css('--b'), 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    pts.forEach(p => { const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: 4.5, fill: p.p ? css('--a') : 'none', stroke: css('--a'), 'stroke-width': 1.8 }, svg);
      el('title', {}, c).textContent = `${p.d}: RMSSD ${p.v} ms${p.p ? ', practised the day before' : ''}`; });
    el('text', { x: P.l, y: 30 }, svg).textContent = '● practised the day before   ○ not   — 7-day average';
    lchart.innerHTML = ''; lchart.appendChild(svg);
    const last7 = pts.filter(p => p.x > pts[pts.length - 1].x - 7), m = last7.reduce((a, b) => a + b.y, 0) / last7.length;
    const sd = Math.sqrt(last7.reduce((a, b) => a + (b.y - m) ** 2, 0) / Math.max(1, last7.length - 1));
    lsum.innerHTML = `<div class="hv-stat"><b>${log.length}</b><span>Mornings logged</span></div>
      <div class="hv-stat"><b>${last7.length >= 3 ? fmt(Math.exp(m), 0) : '–'}</b><span>7-day average RMSSD, ms</span></div>
      <div class="hv-stat"><b>${last7.length >= 3 ? fmt(100 * sd / m, 1) + '%' : '–'}</b><span>Day-to-day spread (CV of ln)</span></div>`;
  }
  drawLog();
  /* redraw on theme change or resize, so colours and text size stay right */
  let rt; const redraw = () => { clearTimeout(rt); rt = setTimeout(() => { drawRR(); drawLog(); }, 120); };
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw); } catch (e) {}
  addEventListener('resize', redraw);
})();
