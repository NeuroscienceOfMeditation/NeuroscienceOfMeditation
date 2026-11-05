/* The Meditation Brain Atlas.
   Cortex: fsaverage5 pial surface, regions grouped from Schaefer 2018 (MIT).
   Deep structures: Melbourne Subcortex Atlas S1 (Tian 2020); brainstem and cerebellum from the
   Diedrichsen lab cerebellar template (CC BY). Practice maps: peak clusters from Fox et al. 2016.
   Data: brain.bin (built by build_brain.py). Text: _data/brain_atlas.yml */
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const A = window.BRAIN_ATLAS || {};
const REGIONS = A.regions || [], NETWORKS = A.networks || [], REFS = A.refs || {};
const TOURS = A.tours || (A.tour ? [A.tour] : []), PR = A.practices || { list: [] };
let TOUR = TOURS[0] || null;
const $ = (s, r = document) => r.querySelector(s);
const canvas = $('[data-ba-canvas]'), card = $('[data-ba-card]'), tip = $('[data-ba-tip]');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GRADE = { E: 'Established', S: 'Suggestive', X: 'Speculative', C: 'Contradicted' };
const BASE = (document.querySelector('link[href*="atlas.css"]') || {}).href ? '' : '';

/* ---------- scene ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xfff6e6, 0x5a4a3a, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 4); camera.add(key);
const rim = new THREE.DirectionalLight(0xffe2c0, 0.6); rim.position.set(-3, -1, -2); camera.add(rim);
scene.add(camera);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
controls.minDistance = 2.6; controls.maxDistance = 10;
controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.6;
camera.position.set(-5.2, 1.4, 2.6);

function size() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (camera.aspect < 1 && !size.done) { camera.position.setLength(7.6 / Math.max(0.55, camera.aspect)); size.done = true; }
}
new ResizeObserver(size).observe(canvas);

/* ---------- load ---------- */
const buf = await fetch(new URL('./brain.bin', import.meta.url)).then(r => r.arrayBuffer());
const dv = new DataView(buf);
const NV = dv.getUint32(4, true), NF = dv.getUint32(8, true), DNV = dv.getUint32(12, true), DNF = dv.getUint32(16, true);
const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
const SC = dv.getFloat32(20, true);
const CEN = magic === 'BRN3' ? [dv.getFloat32(24, true), dv.getFloat32(28, true), dv.getFloat32(32, true)] : [0, 0, 0];
let o = magic === 'BRN3' ? 36 : 24;
const take = (T, n, bytes) => { const a = new T(buf.slice(o, o + n * bytes)); o += n * bytes; return a; };
const cq = take(Int16Array, NV * 3, 2), cf = take(Uint32Array, NF * 3, 4);
const regionOf = take(Uint8Array, NV, 1), netOf = take(Uint8Array, NV, 1), sulc = take(Uint8Array, NV, 1);
const dq = take(Int16Array, DNV * 3, 2), df = take(Uint32Array, DNF * 3, 4), deepOf = take(Uint8Array, DNV, 1);

function toPos(q, n) {           // brain RAS -> three.js (y up): x, z, -y
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = q[i * 3] / 32767 * 1.2; p[i * 3 + 1] = q[i * 3 + 2] / 32767 * 1.2; p[i * 3 + 2] = -q[i * 3 + 1] / 32767 * 1.2; }
  return p;
}
const pos = toPos(cq, NV), dpos = toPos(dq, DNV);
/* MNI millimetres -> scene */
const mni = (x, y, z) => new THREE.Vector3((x - CEN[0]) / SC * 1.2, (z - CEN[2]) / SC * 1.2, -(y - CEN[1]) / SC * 1.2);

const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10);
const cortexMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 1, clippingPlanes: [clipPlane] });
const deepMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, clippingPlanes: [clipPlane] });

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setIndex(new THREE.BufferAttribute(cf, 1)); geo.computeVertexNormals();
const colors = new Float32Array(NV * 3); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
const mesh = new THREE.Mesh(geo, cortexMat); mesh.renderOrder = 2; scene.add(mesh);

const dgeo = new THREE.BufferGeometry();
dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
dgeo.setIndex(new THREE.BufferAttribute(df, 1)); dgeo.computeVertexNormals();
const dcolors = new Float32Array(DNV * 3); dgeo.setAttribute('color', new THREE.BufferAttribute(dcolors, 3));
const deep = new THREE.Mesh(dgeo, deepMat); deep.renderOrder = 1; scene.add(deep);

const shade = new Float32Array(NV); for (let i = 0; i < NV; i++) shade[i] = 1 - sulc[i] / 255 * 0.42;
$('[data-ba-loading]') && $('[data-ba-loading]').remove();

/* ---------- state ---------- */
let mode = 'regions', selected = [], hovered = 0, insideCut = false, glass = 1;
const isSel = id => selected.indexOf(id) > -1;

/* ---------- colouring ---------- */
const BONE = new THREE.Color('#EADFC6'), DEEPBASE = new THREE.Color('#D9CBB0');
const RC = {}; REGIONS.forEach(r => RC[r.id] = new THREE.Color(r.colour));
const NC = {}; NETWORKS.forEach(n => NC[n.id] = new THREE.Color(n.colour));
const tmp = new THREE.Color();
function paint() {
  const any = selected.length > 0;
  for (let i = 0; i < NV; i++) {
    const r = regionOf[i], n = netOf[i]; let c = BONE, k = 0;
    if (mode === 'networks' && NC[n]) { c = NC[n]; k = any ? (isSel(n) ? 0.95 : 0.25) : 0.85; }
    else if (mode === 'practices') { k = 0; }
    else if (mode === 'regions' && RC[r]) { c = RC[r]; k = any ? (isSel(r) ? 0.95 : 0.1) : (r === hovered ? 0.95 : 0.7); }
    tmp.copy(BONE).lerp(c, k).multiplyScalar(shade[i]);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.attributes.color.needsUpdate = true;
  for (let i = 0; i < DNV; i++) {
    const r = deepOf[i]; const c = RC[r] || DEEPBASE;
    const k = mode !== 'regions' ? 0.15 : (any ? (isSel(r) ? 1 : 0.15) : (r === hovered ? 1 : 0.8));
    tmp.copy(DEEPBASE).lerp(c, k);
    dcolors[i * 3] = tmp.r; dcolors[i * 3 + 1] = tmp.g; dcolors[i * 3 + 2] = tmp.b;
  }
  dgeo.attributes.color.needsUpdate = true;
}

/* practice maps: one ball per reported cluster, same volume as the cluster */
const pracGroup = new THREE.Group(); scene.add(pracGroup);
const UP = new THREE.Color('#E0702A'), DOWN = new THREE.Color('#2E7FA8');
const ballGeo = new THREE.SphereGeometry(1, 28, 20);
function showPractice(p) {
  while (pracGroup.children.length) { const m = pracGroup.children.pop(); m.material.dispose(); }
  if (!p) return;
  (p.clusters || []).forEach(cl => {
    const rmm = Math.cbrt(3 * cl.vol / (4 * Math.PI));
    const col = cl.up ? UP : DOWN;
    const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.4, clippingPlanes: [clipPlane] }));
    ball.position.copy(mni(cl.at[0], cl.at[1], cl.at[2])); ball.scale.setScalar(rmm / SC * 1.2);
    ball.userData = cl; ball.renderOrder = 1; pracGroup.add(ball);
    const halo = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false, clippingPlanes: [clipPlane] }));
    halo.position.copy(ball.position); halo.scale.setScalar(rmm / SC * 1.2 * 1.9); halo.userData = cl; halo.renderOrder = 1; pracGroup.add(halo);
  });
}

/* glass: cortex opacity */
const glassIn = $('[data-ba-glass]');
function setGlass(v) {
  glass = v; cortexMat.opacity = v; cortexMat.depthWrite = v > 0.97;
  mesh.visible = v > 0.02; if (glassIn && +glassIn.value !== Math.round(v * 100)) glassIn.value = Math.round(v * 100);
}
glassIn && glassIn.addEventListener('input', () => setGlass(+glassIn.value / 100));

/* slicing */
let sliceAxis = 'none';
const sliceIn = $('[data-ba-slice]');
function applySlice() {
  const t = sliceIn ? +sliceIn.value / 100 : 1;
  if (sliceAxis === 'none') { clipPlane.set(new THREE.Vector3(-1, 0, 0), 10); return; }
  const n = { sagittal: [-1, 0, 0], coronal: [0, 0, 1], horizontal: [0, -1, 0] }[sliceAxis];
  clipPlane.normal.set(n[0], n[1], n[2]);
  clipPlane.constant = -1.25 + 2.5 * t;
}
document.querySelectorAll('[data-ba-cut]').forEach(b => b.addEventListener('click', () => {
  sliceAxis = sliceAxis === b.dataset.baCut ? 'none' : b.dataset.baCut;
  document.querySelectorAll('[data-ba-cut]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.baCut === sliceAxis)));
  if (sliceIn) { sliceIn.disabled = sliceAxis === 'none'; if (sliceAxis !== 'none') sliceIn.value = 50; }
  applySlice();
}));
sliceIn && sliceIn.addEventListener('input', applySlice);

/* inside view */
const fullIndex = cf, half = NV / 2;
const rightOnly = (() => { const out = []; for (let f = 0; f < fullIndex.length; f += 3) if (fullIndex[f] >= half) out.push(fullIndex[f], fullIndex[f + 1], fullIndex[f + 2]); return new Uint32Array(out); })();
function setInside(on) { if (on === insideCut) return; insideCut = on; geo.setIndex(new THREE.BufferAttribute(on ? rightOnly : fullIndex, 1)); }

/* camera moves */
let anim = null;
function animateTo(to) {
  const from = camera.position.clone(), t0 = performance.now(), dur = reduce ? 1 : 800, d0 = from.length(), d1 = to.length();
  anim = t => { const k = Math.min(1, (t - t0) / dur), e = k * k * (3 - 2 * k);
    camera.position.copy(from).lerp(to, e).setLength(d0 + (d1 - d0) * e); if (k >= 1) anim = null; };
}
function goView(name) {
  controls.autoRotate = false; setInside(name === 'inside');
  const d = camera.position.length();
  const v = { left: [-1, 0.15, 0], right: [1, 0.15, 0], top: [0.001, 1, 0.08], front: [0, 0.15, -1], back: [0, 0.15, 1], inside: [-1, 0.25, 0.1] }[name];
  animateTo(new THREE.Vector3(v[0], v[1], v[2]).setLength(d));
}
function faceRegion(id) {
  const r = REGIONS.find(x => x.id === id); if (!r) return;
  const c = new THREE.Vector3(); let n = 0;
  if (r.deep) {
    if (id === 16) { if (glass < 0.5) setGlass(1); } else
    for (let i = 0; i < DNV; i++) if (deepOf[i] === id && dpos[i * 3] > 0) { c.x += dpos[i * 3]; c.y += dpos[i * 3 + 1]; c.z += dpos[i * 3 + 2]; n++; }
    if (id !== 16 && glass > 0.45) setGlass(0.25);
    setInside(false);
  } else {
    for (let i = half; i < NV; i++) if (regionOf[i] === id) { c.x += pos[i * 3]; c.y += pos[i * 3 + 1]; c.z += pos[i * 3 + 2]; n++; }
  }
  if (!n) return; c.divideScalar(n);
  controls.autoRotate = false;
  const d = camera.position.length();
  if (!r.deep && c.x < 0.3) { setInside(true); animateTo(new THREE.Vector3(-d, 0.25 * d, 0.1 * d).setLength(d)); return; }
  if (!r.deep) setInside(false);
  const dir = r.deep ? new THREE.Vector3(1, 0.35, c.z * 0.6) : new THREE.Vector3(c.x * 2.2, c.y * 0.8 + 0.25, c.z);
  animateTo(dir.normalize().multiplyScalar(d));
}

/* ---------- picking ---------- */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pick(ev) {
  const b = canvas.getBoundingClientRect();
  ptr.x = ((ev.clientX - b.left) / b.width) * 2 - 1; ptr.y = -((ev.clientY - b.top) / b.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  if (mode === 'practices') { const h = ray.intersectObjects(pracGroup.children)[0]; return h ? h.object.userData : 0; }
  const targets = glass < 0.6 && mode === 'regions' ? [deep, mesh] : [mesh, deep];
  for (const t of targets) {
    if (!t.visible) continue;
    const hits = ray.intersectObject(t).filter(h => sliceAxis === 'none' || clipPlane.distanceToPoint(h.point) >= 0);
    const h = hits[0]; if (!h) continue;
    if (t === deep) return mode === 'regions' ? deepOf[h.face.a] : 0;
    const v = h.face.a, id = mode === 'networks' ? netOf[v] : regionOf[v];
    if (id || t === targets[targets.length - 1]) return id;
  }
  return 0;
}
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; controls.autoRotate = false; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const id = pick(e); if (mode === 'practices') return; stopTour(); select(id ? [id] : []);
});
const nameOf = id => mode === 'networks' ? ((NETWORKS.find(n => n.id === id) || {}).name || '') + ' network' : (REGIONS.find(r => r.id === id) || {}).name || '';
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const id = pick(e);
  if (mode === 'practices') {
    canvas.style.cursor = 'grab';
    if (id) { tip.hidden = false; tip.textContent = `${id.name} (${id.hemi === 'M' ? 'midline' : id.hemi === 'L' ? 'left' : 'right'}): ${id.up ? 'more active' : 'less active'}`; const b = canvas.getBoundingClientRect(); tip.style.left = (e.clientX - b.left + 14) + 'px'; tip.style.top = (e.clientY - b.top + 14) + 'px'; }
    else tip.hidden = true;
    return;
  }
  canvas.style.cursor = id ? 'pointer' : 'grab';
  if (id) { tip.hidden = false; tip.textContent = nameOf(id); const b = canvas.getBoundingClientRect(); tip.style.left = (e.clientX - b.left + 14) + 'px'; tip.style.top = (e.clientY - b.top + 14) + 'px'; }
  else tip.hidden = true;
  if (mode === 'regions' && !selected.length && id !== hovered) { hovered = id; paint(); }
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; if (hovered) { hovered = 0; paint(); } });

/* ---------- panel ---------- */
const startHTML = card.innerHTML;
function refsHTML(keys) {
  return '<p class="ba-refs">' + (keys || []).map(k => REFS[k] ? `<a href="${esc(REFS[k].url)}" target="_blank" rel="noopener">${esc(REFS[k].label)} ↗</a>` : '').join('') + '</p>';
}
function gradeHTML(g) { return `<p class="ba-grade ba-g-${esc(g)}"><i></i>How sure is this? <b>${GRADE[g] || g}</b></p>`; }
function bindBack() { const b = $('[data-ba-back]', card); b && b.addEventListener('click', () => { stopTour(); select([]); }); }
function select(ids, opts) {
  selected = ids; hovered = 0; paint();
  document.querySelectorAll('[data-ba-chip]').forEach(b => b.setAttribute('aria-pressed', String(isSel(+b.dataset.baChip))));
  if (opts && opts.keepCard) return;
  if (!ids.length) {
    if (mode === 'practices') {
      showPractice(null);
      card.innerHTML = `<p class="ba-kicker">Practice maps</p><h2>Different practices, different brain patterns</h2><p>${esc(PR.intro || '')}</p>
        <p class="ba-legend"><span><i class="ba-dot" style="background:#E0702A"></i>More active</span><span><i class="ba-dot" style="background:#2E7FA8"></i>Less active</span></p>
        ${gradeHTML(PR.grade)}${refsHTML(PR.refs)}<p class="ba-hint">Choose a practice below.</p>`;
      setHash(''); return;
    }
    card.innerHTML = startHTML; bindStart(); setHash(''); return;
  }
  const id = ids[0];
  if (mode === 'practices') {
    const p = PR.list.find(x => x.id === id); if (!p) return;
    showPractice(p);
    const row = cl => `<li><i class="ba-dot" style="background:${cl.up ? '#E0702A' : '#2E7FA8'}"></i>${esc(cl.name)} <span>${cl.hemi === 'M' ? 'midline' : cl.hemi === 'L' ? 'left' : 'right'}</span></li>`;
    const up = p.clusters.filter(c => c.up), down = p.clusters.filter(c => !c.up);
    card.innerHTML = `<p class="ba-kicker"><i class="ba-dot" style="background:${esc(p.colour)}"></i>Practice map</p><h2>${esc(p.name)}</h2>
      <p>${esc(p.does)}</p>
      <h3>More active during this practice</h3><ul class="ba-clusters">${up.map(row).join('')}</ul>
      <h3>Less active</h3>${down.length ? `<ul class="ba-clusters">${down.map(row).join('')}</ul>` : '<p>No area reached significance.</p>'}
      <div class="ba-claim"><p>Pooled from ${p.studies} studies of this practice. ${esc(PR.caveat || '')}</p>${gradeHTML(PR.grade)}${refsHTML(PR.refs)}</div>
      <button type="button" class="ba-back" data-ba-back>← All practices</button>`;
    setHash('practice-' + slug(p.name)); bindBack();
    if (innerWidth < 900) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  if (mode === 'networks') {
    const n = NETWORKS.find(x => x.id === id); if (!n) return;
    card.innerHTML = `<p class="ba-kicker"><i class="ba-dot" style="background:${esc(n.colour)}"></i>Brain network</p><h2>${esc(n.name)} network</h2><p>${esc(n.does)}</p>
      <p class="ba-hint">Switch to <b>Regions</b> to see what meditation research shows for the parts of this network.</p><button type="button" class="ba-back" data-ba-back>← Back to the overview</button>`;
  } else {
    const r = REGIONS.find(x => x.id === id); if (!r) return;
    card.innerHTML = `<p class="ba-kicker"><i class="ba-dot" style="background:${esc(r.colour)}"></i>${esc(r.network)}</p><h2>${esc(r.name)}</h2>
      <h3>What it does</h3><p>${esc(r.does)}</p>
      <h3>What meditation research shows</h3>
      ${(r.claims || []).map(c => `<div class="ba-claim"><p>${esc(c.text)}</p>${gradeHTML(c.grade)}${refsHTML(c.refs)}</div>`).join('')}
      ${r.related ? `<h3>Read and try</h3><p class="ba-related">${r.related.map(x => `<a href="${esc(x.url)}">${esc(x.label)} →</a>`).join('')}</p>` : ''}
      <button type="button" class="ba-back" data-ba-back>← Back to the overview</button>`;
    setHash(slug(r.name));
  }
  bindBack();
  if (innerWidth < 900) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
const slug = s => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
function setHash(h) { try { history.replaceState(null, '', h ? '#' + h : location.pathname); } catch (e) {} }

function chips() {
  const box = $('[data-ba-chips]');
  const list = mode === 'networks' ? NETWORKS : mode === 'practices' ? PR.list : REGIONS;
  $('.ba-list-h').textContent = mode === 'networks' ? 'Networks' : mode === 'practices' ? 'Practices' : 'Regions';
  const groups = mode !== 'regions' ? [['', list]] : [['On the surface', list.filter(r => !r.deep)], ['Deep inside', list.filter(r => r.deep)]];
  box.innerHTML = groups.map(([h, l]) => (h ? `<p class="ba-sub">${h}</p>` : '') + l.map(x => `<button type="button" data-ba-chip="${x.id}" aria-pressed="false"><i style="background:${esc(x.colour)}"></i>${esc(x.name)}</button>`).join('')).join('');
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    stopTour(); const id = +b.dataset.baChip;
    if (isSel(id)) { select([]); return; }
    select([id]); if (mode === 'regions') faceRegion(id);
  }));
}

/* search */
const qIn = $('[data-ba-q]'), hits = $('[data-ba-hits]');
const ALIASES = { 1: 'mpfc prefrontal default self', 2: 'pcc precuneus cingulate posterior default', 3: 'insula insular interoception body', 4: 'acc cingulate anterior attention', 5: 'dlpfc prefrontal frontal lateral frontopolar control executive', 6: 'ofc orbitofrontal emotion', 7: 'motor sensory somatosensory touch', 8: 'visual occipital vision', 9: 'hippocampus memory', 10: 'amygdala fear threat stress emotion', 11: 'thalamus relay', 12: 'caudate putamen striatum basal ganglia habit', 13: 'accumbens nacc reward ventral striatum', 14: 'globus pallidus basal ganglia', 15: 'brainstem brain stem medulla pons midbrain breathing breath rhythm prebotzinger', 16: 'cerebellum balance coordination' };
qIn.addEventListener('input', () => {
  const v = qIn.value.trim().toLowerCase();
  if (!v) { hits.hidden = true; return; }
  const m = REGIONS.filter(r => (r.name + ' ' + r.network + ' ' + (ALIASES[r.id] || '')).toLowerCase().includes(v));
  hits.innerHTML = m.length ? m.map(r => `<li><button type="button" data-hit="${r.id}"><i style="background:${esc(r.colour)}"></i>${esc(r.name)}</button></li>`).join('') : '<li class="ba-none">Not on this map yet</li>';
  hits.hidden = false;
  hits.querySelectorAll('[data-hit]').forEach(b => b.addEventListener('click', () => {
    if (mode !== 'regions') setMode('regions');
    hits.hidden = true; qIn.value = ''; stopTour(); select([+b.dataset.hit]); faceRegion(+b.dataset.hit);
  }));
});
document.addEventListener('click', e => { if (!e.target.closest('.ba-search')) hits.hidden = true; });

/* ---------- guided tour ---------- */
let tourAt = -1;
function bindStart() { card.querySelectorAll('[data-ba-tour]').forEach(t => t.addEventListener('click', () => startTour(t.dataset.baTour))); }
function startTour(tid) { TOUR = TOURS.find(t => t.id === tid) || TOURS[0]; if (mode !== 'regions') setMode('regions'); setGlass(1); tourStep(0); }
function stopTour() { tourAt = -1; }
function tourStep(i) {
  if (!TOUR) return; tourAt = i;
  const s = TOUR.steps[i], last = i === TOUR.steps.length - 1;
  select(s.regions, { keepCard: true }); goView(s.view || 'right'); setGlass(s.glass != null ? s.glass : 1);
  card.innerHTML = `<p class="ba-kicker">Guided tour · ${i + 1} of ${TOUR.steps.length}</p><h2>${esc(TOUR.title)}</h2>
    ${i === 0 ? `<p>${esc(TOUR.intro)}</p>` : ''}
    <div class="ba-step"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${s.grade ? gradeHTML(s.grade) + refsHTML(s.refs) : ''}</div>
    <p class="ba-dots">${TOUR.steps.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('')}</p>
    <div class="ba-tour-nav">${i > 0 ? '<button type="button" class="ba-back" data-t="-1">← Back</button>' : ''}<button type="button" class="ba-next" data-t="1">${last ? 'Finish' : 'Next →'}</button></div>
    ${last && TOUR.grade ? gradeHTML(TOUR.grade) + refsHTML(TOUR.refs) : ''}`;
  card.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
    const k = i + (+b.dataset.t);
    if (k >= TOUR.steps.length) { stopTour(); select([]); return; }
    tourStep(k);
  }));
}

/* ---------- tools ---------- */
function setMode(m) {
  mode = m; selected = []; hovered = 0;
  document.querySelectorAll('[data-ba-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.baMode === m)));
  if (m === 'networks') setGlass(1);
  if (m === 'practices') { setGlass(0.25); setInside(false); }
  if (m !== 'practices') showPractice(null);
  chips(); select([]);
}
document.querySelectorAll('[data-ba-mode]').forEach(b => b.addEventListener('click', () => { stopTour(); setMode(b.dataset.baMode); }));
document.querySelectorAll('[data-ba-view]').forEach(b => b.addEventListener('click', () => goView(b.dataset.baView)));
document.querySelectorAll('[data-ba-zoom]').forEach(b => b.addEventListener('click', () => {
  const d = camera.position.length() * (b.dataset.baZoom === '1' ? 0.82 : 1.22);
  camera.position.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, d)));
}));
const shot = $('[data-ba-shot]');
shot && shot.addEventListener('click', () => {
  renderer.render(scene, camera);
  const src = renderer.domElement, c = document.createElement('canvas');
  c.width = src.width; c.height = src.height + 70 * (window.devicePixelRatio || 1);
  const g = c.getContext('2d'); g.fillStyle = '#F4EDDC'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0);
  const s = window.devicePixelRatio || 1; g.fillStyle = '#1B4332'; g.font = `600 ${16 * s}px Fraunces, Georgia, serif`;
  g.fillText('The Meditation Brain Atlas · neuroscienceofmeditation.in/brain-atlas', 20 * s, src.height + 42 * s);
  const a = document.createElement('a'); a.download = 'meditation-brain-atlas.png'; a.href = c.toDataURL('image/png'); a.click();
});

/* keyboard: arrow keys turn the brain, Escape clears */
canvas.tabIndex = 0;
canvas.addEventListener('keydown', e => {
  const k = { ArrowLeft: 0.2, ArrowRight: -0.2 }[e.key];
  if (k) { e.preventDefault(); controls.autoRotate = false; camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), k); }
  if (e.key === 'Escape') { stopTour(); select([]); }
});

chips(); paint(); size(); bindStart(); applySlice();
/* open a region from the address, e.g. brain-atlas.html#insula */
const H = location.hash.slice(1);
const fromHash = REGIONS.find(r => slug(r.name) === H);
const pracHash = PR.list.find(p => 'practice-' + slug(p.name) === H);
if (fromHash) { select([fromHash.id]); faceRegion(fromHash.id); }
else if (pracHash) { setMode('practices'); select([pracHash.id]); }
else if (H === 'practices') setMode('practices');
else if (H === 'breath-tour' || H === 'tour') startTour(H === 'tour' ? 'sitting' : 'breath');
renderer.setAnimationLoop(t => { if (anim) anim(t); controls.update(); renderer.render(scene, camera); });
window.__atlas = { select, setMode, goView, setGlass, startTour, faceRegion };
