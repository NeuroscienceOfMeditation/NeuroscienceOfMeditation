/* The Meditation Lab, brain section: EEG from Brandmeyer & Delorme 2018 (OpenNeuro ds001787, CC0).
   Pre-processed by lab/analysis/eeg_openneuro_*.py. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const BASE = (window.LAB_BASE || '/lab/data/').replace(/data\/$/, 'eeg/');
  const root = $('.lab'), sec = $('#brain'); if (!sec) return;
  const css = n => getComputedStyle(root).getPropertyValue(n).trim();
  const fmt = (v, d = 0) => Number.isFinite(v) ? v.toFixed(d) : '–';
  const cache = {};
  let S = null, person = null, roi = 'centre', view = 'expert';

  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; }
  function svgFor(box, H, label) {
    const W = Math.max(300, Math.round(box.clientWidth));
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
    box.innerHTML = ''; box.appendChild(svg); return [svg, W];
  }
  const path = (pts, X, Y) => pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  const label = id => 'Person ' + id.replace('sub-0', '').replace('sub-', '');

  /* ---------- how often minds wandered ---------- */
  function wander() {
    const box = $('[data-eeg-wander]'), H = 260, P = { l: 46, r: 12, t: 30, b: 40 };
    const [svg, W] = svgFor(box, H, 'Share of check-ins where each person rated mind wandering above meditation, experts and less experienced');
    const cols = [['expert', 'Experts'], ['novice', 'Less experienced']];
    const cw = (W - P.l - P.r) / 2, X = i => P.l + cw * (i + 0.5), Y = v => H - P.b - v * (H - P.t - P.b);
    [0, 0.25, 0.5, 0.75, 1].forEach(v => { el('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), stroke: css('--line') }, svg); el('text', { x: P.l - 7, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = (v * 100) + '%'; });
    el('text', { x: P.l, y: 14 }, svg).textContent = W < 520 ? 'mind wandering rated higher' : 'share of check-ins where mind wandering was rated higher than meditation';
    cols.forEach(([g, name], i) => {
      const items = S.subjects.filter(s => s.group === g && s.n_med + s.n_mw >= 5).map(s => ({ s, v: s.n_mw / (s.n_med + s.n_mw) }));
      items.sort((a, b) => a.v - b.v);
      items.forEach((it, k) => { const jx = (k / Math.max(1, items.length - 1) - 0.5) * Math.min(cw * 0.55, 120);
        const c = el('circle', { cx: X(i) + jx, cy: Y(it.v), r: 6, fill: g === 'expert' ? css('--med') : css('--pre') }, svg);
        el('title', {}, c).textContent = `${label(it.s.id)}: ${Math.round(it.v * 100)}% of ${it.s.n_med + it.s.n_mw} check-ins that leaned one way`; });
      const m = items.reduce((a, b) => a + b.v, 0) / items.length;
      el('line', { x1: X(i) - cw * 0.34, x2: X(i) + cw * 0.34, y1: Y(m), y2: Y(m), stroke: css('--ink'), 'stroke-width': 2, opacity: 0.6 }, svg);
      el('text', { x: X(i) + cw * 0.36, y: Y(m) + 4 }, svg).textContent = Math.round(m * 100) + '%';
      el('text', { x: X(i), y: H - 14, 'text-anchor': 'middle', class: 'lab-rowlabel' }, svg).textContent = `${name} (${items.length})`;
    });
  }

  /* ---------- people ---------- */
  function people() {
    const box = $('[data-eeg-people]'); const ok = S.subjects.filter(s => s.ok);
    box.innerHTML = '<span class="lab-grp">Experts</span>' + ok.filter(s => s.group === 'expert').map(s => `<button type="button" data-s="${s.id}">${s.id.slice(-2)}</button>`).join('') +
      '<span class="lab-grp">Less experienced</span>' + ok.filter(s => s.group === 'novice').map(s => `<button type="button" data-s="${s.id}">${s.id.slice(-2)}</button>`).join('');
    box.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) choose(b.dataset.s); });
    choose(ok.find(s => s.group === 'expert').id);
  }
  async function get(id) { if (!cache[id]) cache[id] = fetch(BASE + id + '.json').then(r => r.json()); return cache[id]; }
  async function choose(id) {
    person = id; $('[data-eeg-people]').querySelectorAll('[data-s]').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === id));
    const d = await get(id); if (person !== id) return;
    const s = S.subjects.find(x => x.id === id);
    $('[data-eeg-who]').innerHTML = `<b>${label(id)}</b> · ${s.group === 'expert' ? 'expert' : 'less experienced'} · ${s.probes} check-ins: rated meditating more ${s.n_med}×, mind wandering more ${s.n_mw}×, equal ${s.n_eq}×. Clean 10-second windows used: ${d.ep_med} and ${d.ep_mw}.`;
    traces(d); if (view === 'person') spectrum();
  }

  /* ---------- ten seconds before the bell ---------- */
  function traces(d) {
    [['med', 'Rated: meditating', css('--med'), $('[data-eeg-tr-med]')], ['mw', 'Rated: mind wandering', css('--pre'), $('[data-eeg-tr-mw]')]].forEach(([k, name, col, box]) => {
      const ex = d.examples && d.examples[k];
      const rowH = 44, P = { l: 34, r: 8, t: 26, b: 22 }, H = P.t + rowH * 6 + P.b;
      const [svg, W] = svgFor(box, H, `${name}: 10 seconds of EEG from 6 electrodes`);
      el('text', { x: P.l, y: 15, class: 'lab-rowlabel' }, svg).textContent = name;
      if (!ex) { el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, svg).textContent = 'No clean example for this person'; return; }
      const n = ex[0].length, X = i => P.l + i / (n - 1) * (W - P.l - P.r), scale = rowH / 80; // 80 microvolts per row
      ex.forEach((ch, r) => {
        const mid = P.t + rowH * (r + 0.5), m = ch.reduce((a, b) => a + b, 0) / n;
        el('text', { x: P.l - 6, y: mid + 4, 'text-anchor': 'end' }, svg).textContent = d.ex_chans[r];
        let dd = ''; for (let i = 0; i < n; i++) dd += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + (mid - (ch[i] - m) * scale).toFixed(1);
        el('path', { d: dd, fill: 'none', stroke: col, 'stroke-width': 0.9 }, svg);
      });
      [0, 2, 4, 6, 8, 10].forEach(t => el('text', { x: P.l + t / 10 * (W - P.l - P.r), y: H - 5, 'text-anchor': 'middle' }, svg).textContent = t === 0 ? '−10 s' : t === 10 ? 'bell' : `−${10 - t}`);
    });
  }

  /* ---------- spectrum ---------- */
  async function spectrum() {
    const box = $('[data-eeg-spec]'), H = 300, P = { l: 46, r: 12, t: 34, b: 40 };
    let spec, who;
    if (view === 'person') { const d = await get(person); spec = d.spec[roi]; who = label(person); }
    else { spec = S.groups[view].spec[roi]; who = view === 'expert' ? `all ${S.groups.expert.n} experts` : `all ${S.groups.novice.n} less experienced`; }
    const F = S.freqs;
    const [svg, W] = svgFor(box, H, `Brain-wave power by frequency, ${who}, ${roi} of the head`);
    const all = spec.med.concat(spec.mw); let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const X = f => P.l + (f - 1) / 29 * (W - P.l - P.r), Y = v => H - P.b - (v - lo) / (hi - lo) * (H - P.t - P.b);
    [['theta', 4, 7], ['alpha', 9, 11]].forEach(([n, a, b]) => { el('rect', { x: X(a), y: P.t, width: X(b) - X(a), height: H - P.t - P.b, class: 'lab-band' }, svg);
      el('text', { x: (X(a) + X(b)) / 2, y: H - P.b - 8, 'text-anchor': 'middle', class: 'lab-bandlabel' }, svg).textContent = n; });
    [1, 5, 10, 15, 20, 25, 30].forEach(f => el('text', { x: X(f), y: H - P.b + 18, 'text-anchor': 'middle' }, svg).textContent = f);
    el('text', { x: W - P.r, y: H - 4, 'text-anchor': 'end' }, svg).textContent = 'frequency, cycles per second (Hz)';
    el('text', { x: P.l, y: 14 }, svg).textContent = 'power (log scale)';
    [['mw', css('--pre'), 'Mind wandering'], ['med', css('--med'), 'Meditating']].forEach(([k, col]) =>
      el('path', { d: path(F.map((f, i) => [f, spec[k][i]]), X, Y), fill: 'none', stroke: col, 'stroke-width': 2.2 }, svg));
    let lx = W - P.r - 250; [['Meditating', css('--med')], ['Mind wandering', css('--pre')]].forEach(([n, col]) => { el('rect', { x: lx, y: 9, width: 14, height: 4, fill: col }, svg); el('text', { x: lx + 20, y: 15 }, svg).textContent = n; lx += 120; });
    const stat = view === 'person' ? null : S.groups[view];
    const note = $('[data-eeg-specnote]');
    if (stat) {
      const b = roi === 'front' ? 'theta' : 'alpha', r = stat[b][roi];
      note.textContent = `${b === 'theta' ? 'Theta' : 'Alpha'} power, ${roi === 'front' ? 'front' : roi === 'centre' ? 'centre' : 'back'} of the head: ${r.pct > 0 ? r.pct + '% higher' : Math.abs(r.pct) + '% lower'} when meditating than when mind wandering, on average; higher in ${r.up} of ${r.n} people.`;
    } else note.textContent = `One person's average over their clean 10-second windows. Single people vary a lot; the group view is more reliable.`;
  }

  function bindToggles() {
    sec.querySelectorAll('[data-eeg-roi]').forEach(b => b.addEventListener('click', () => { roi = b.dataset.eegRoi; sec.querySelectorAll('[data-eeg-roi]').forEach(x => x.setAttribute('aria-pressed', x === b)); spectrum(); }));
    sec.querySelectorAll('[data-eeg-view]').forEach(b => b.addEventListener('click', () => { view = b.dataset.eegView; sec.querySelectorAll('[data-eeg-view]').forEach(x => x.setAttribute('aria-pressed', x === b)); spectrum(); }));
  }

  fetch(BASE + 'summary.json').then(r => r.json()).then(s => { S = s; wander(); people(); bindToggles(); spectrum(); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!S) return; wander(); spectrum(); get(person).then(traces); }, 150); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S) { wander(); spectrum(); get(person).then(traces); } }); } catch (e) {}
})();
