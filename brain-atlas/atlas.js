/* The Meditation Brain Atlas: a real cortical surface (fsaverage5) coloured by
   regions grouped from the Schaefer 2018 map. Data: brain.bin (built from
   nilearn's fsaverage5 + CBIG's Schaefer annotation). Text: _data/brain_atlas.yml */
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const A = window.BRAIN_ATLAS || {};
const REGIONS = A.regions || [], NETWORKS = A.networks || [], REFS = A.refs || {};
const $ = (s, r = document) => r.querySelector(s);
const canvas = $('[data-ba-canvas]'), card = $('[data-ba-card]'), tip = $('[data-ba-tip]');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GRADE = { E: 'Established', S: 'Suggestive', X: 'Speculative', C: 'Contradicted' };

/* ---------- scene ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
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

function size() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (camera.aspect < 1 && !size.done) { camera.position.setLength(7.6 / Math.max(0.55, camera.aspect)); size.done = true; }
}
new ResizeObserver(size).observe(canvas);

/* views (brain coordinates: x = right, y = front, z = up) */
const VIEWS = {
  left: [-4, 0, 0.4], right: [4, 0, 0.4], top: [0, -0.3, 4], front: [0, 4, 0.5], inside: [4, 0, 0.4]
};
let mesh, geo, regionOf, netOf, shade, colors, mode = 'regions', selected = 0, hovered = 0, insideCut = false;

/* ---------- load the surface ---------- */
const buf = await fetch(new URL('./brain.bin', import.meta.url)).then(r => r.arrayBuffer());
const dv = new DataView(buf);
const NV = dv.getUint32(4, true), NF = dv.getUint32(8, true);
let o = 16;
const q = new Int16Array(buf, o, NV * 3); o += NV * 6;
const faces = new Uint32Array(buf.slice(o, o + NF * 12)); o += NF * 12;
regionOf = new Uint8Array(buf, o, NV); o += NV;
netOf = new Uint8Array(buf, o, NV); o += NV;
const sulc = new Uint8Array(buf, o, NV);

const pos = new Float32Array(NV * 3);
for (let i = 0; i < NV; i++) {          // brain RAS -> three.js (y up): x, z, -y
  pos[i * 3] = q[i * 3] / 32767 * 1.2; pos[i * 3 + 1] = q[i * 3 + 2] / 32767 * 1.2; pos[i * 3 + 2] = -q[i * 3 + 1] / 32767 * 1.2;
}
geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setIndex(new THREE.BufferAttribute(faces, 1));
geo.computeVertexNormals();
colors = new Float32Array(NV * 3);
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
shade = new Float32Array(NV); for (let i = 0; i < NV; i++) shade[i] = 1 - sulc[i] / 255 * 0.42;   // sulci darker
mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }));
scene.add(mesh);
$('[data-ba-loading]').remove();

/* ---------- colouring ---------- */
const BONE = new THREE.Color('#EADFC6');
const RC = {}; REGIONS.forEach(r => RC[r.id] = new THREE.Color(r.colour));
const NC = {}; NETWORKS.forEach(n => NC[n.id] = new THREE.Color(n.colour));
const tmp = new THREE.Color();
function paint() {
  for (let i = 0; i < NV; i++) {
    const r = regionOf[i], n = netOf[i];
    let c = BONE, k = 0;
    if (mode === 'networks' && NC[n]) { c = NC[n]; k = selected ? (n === selected ? 0.95 : 0.25) : 0.85; }
    else if (mode === 'regions' && RC[r]) { c = RC[r]; k = selected ? (r === selected ? 0.95 : 0.12) : (r === hovered ? 0.95 : 0.7); }
    tmp.copy(BONE).lerp(c, k).multiplyScalar(shade[i]);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.attributes.color.needsUpdate = true;
}

/* "Inside" view: hide the left hemisphere so the medial wall of the right shows */
const fullIndex = geo.index.array, rightOnly = (() => {
  const half = NV / 2, out = [];
  for (let f = 0; f < fullIndex.length; f += 3) if (fullIndex[f] >= half) out.push(fullIndex[f], fullIndex[f + 1], fullIndex[f + 2]);
  return new Uint32Array(out);
})();
function setInside(on) {
  if (on === insideCut) return; insideCut = on;
  geo.setIndex(new THREE.BufferAttribute(on ? rightOnly : fullIndex, 1));
}

function goView(name) {
  controls.autoRotate = false;
  setInside(name === 'inside');
  const v = VIEWS[name], d = camera.position.length();
  const to = name === 'inside' ? new THREE.Vector3(-4, 0.4, 0) : new THREE.Vector3(v[0], v[2], -v[1]);
  to.setLength(d);
  if (name === 'top') to.set(0.001, d, 0.3);
  animateTo(to);
}
let anim = null;
function animateTo(to) {
  const from = camera.position.clone(), t0 = performance.now(), dur = reduce ? 1 : 700;
  anim = t => { const k = Math.min(1, (t - t0) / dur), e = k * k * (3 - 2 * k);
    camera.position.copy(from).lerp(to, e).setLength(from.length() + (to.length() - from.length()) * e);
    if (k >= 1) anim = null; };
}
camera.position.set(-5.2, 1.4, 2.6);

/* ---------- picking ---------- */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pick(ev) {
  const b = canvas.getBoundingClientRect();
  ptr.x = ((ev.clientX - b.left) / b.width) * 2 - 1; ptr.y = -((ev.clientY - b.top) / b.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObject(mesh)[0]; if (!hit) return null;
  const v = hit.face.a;
  return mode === 'networks' ? { kind: 'net', id: netOf[v] } : { kind: 'reg', id: regionOf[v] };
}
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; controls.autoRotate = false; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const p = pick(e);
  if (!p || !p.id) { select(0); return; }
  select(p.id);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const p = pick(e), id = p ? p.id : 0;
  const name = id ? (mode === 'networks' ? (NETWORKS.find(n => n.id === id) || {}).name + ' network' : (REGIONS.find(r => r.id === id) || {}).name) : '';
  canvas.style.cursor = id ? 'pointer' : 'grab';
  if (name) { tip.hidden = false; tip.textContent = name; const b = canvas.getBoundingClientRect(); tip.style.left = (e.clientX - b.left + 14) + 'px'; tip.style.top = (e.clientY - b.top + 14) + 'px'; }
  else tip.hidden = true;
  if (mode === 'regions' && !selected && id !== hovered) { hovered = id; paint(); }
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; if (hovered) { hovered = 0; paint(); } });

/* ---------- the panel ---------- */
const startHTML = card.innerHTML;
function refsHTML(keys) {
  return '<p class="ba-refs">' + (keys || []).map(k => REFS[k] ? `<a href="${esc(REFS[k].url)}" target="_blank" rel="noopener">${esc(REFS[k].label)} ↗</a>` : '').join('') + '</p>';
}
function select(id) {
  selected = id; hovered = 0; paint();
  document.querySelectorAll('[data-ba-chip]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.baChip === id)));
  if (!id) { card.innerHTML = startHTML; return; }
  if (mode === 'networks') {
    const n = NETWORKS.find(x => x.id === id); if (!n) return;
    card.innerHTML = `<p class="ba-kicker"><i class="ba-dot" style="background:${esc(n.colour)}"></i>Brain network</p><h2>${esc(n.name)} network</h2><p>${esc(n.does)}</p>
      <p class="ba-hint">Switch to <b>Regions</b> to see what meditation research shows for the parts of this network.</p><button type="button" class="ba-back" data-ba-back>← Back to the overview</button>`;
  } else {
    const r = REGIONS.find(x => x.id === id); if (!r) return;
    card.innerHTML = `<p class="ba-kicker"><i class="ba-dot" style="background:${esc(r.colour)}"></i>${esc(r.network)}</p><h2>${esc(r.name)}</h2>
      <h3>What it does</h3><p>${esc(r.does)}</p>
      <h3>What meditation research shows</h3>
      ${(r.claims || []).map(c => `<div class="ba-claim"><p>${esc(c.text)}</p><p class="ba-grade ba-g-${esc(c.grade)}"><i></i>How sure is this? <b>${GRADE[c.grade] || c.grade}</b></p>${refsHTML(c.refs)}</div>`).join('')}
      <button type="button" class="ba-back" data-ba-back>← Back to the overview</button>`;
  }
  const back = $('[data-ba-back]', card); back && back.addEventListener('click', () => select(0));
  if (innerWidth < 900) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function chips() {
  const box = $('[data-ba-chips]'), list = mode === 'networks' ? NETWORKS : REGIONS;
  $('.ba-list-h').textContent = mode === 'networks' ? 'Networks' : 'Regions';
  box.innerHTML = list.map(x => `<button type="button" data-ba-chip="${x.id}" aria-pressed="false"><i style="background:${esc(x.colour)}"></i>${esc(x.name)}</button>`).join('');
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const id = +b.dataset.baChip; select(selected === id ? 0 : id);
    if (mode === 'regions' && selected) faceRegion(id);
  }));
}
/* turn the brain so the chosen region faces the viewer */
function faceRegion(id) {
  const c = new THREE.Vector3(); let n = 0;
  const half = NV / 2;
  // use the right hemisphere only, so the two halves don't cancel out
  for (let i = half; i < NV; i++) if (regionOf[i] === id) { c.x += pos[i * 3]; c.y += pos[i * 3 + 1]; c.z += pos[i * 3 + 2]; n++; }
  if (!n) return; c.divideScalar(n);
  controls.autoRotate = false;
  const d = camera.position.length();
  if (c.x < 0.3) {                       // on the inner (medial) wall: hide the left half and look at it
    setInside(true); animateTo(new THREE.Vector3(-d, 0.25 * d, 0.1 * d).setLength(d)); return;
  }
  setInside(false);
  const dir = new THREE.Vector3(c.x * 2.2, c.y * 0.8 + 0.25, c.z);   // lean outward so it faces the viewer
  animateTo(dir.normalize().multiplyScalar(d));
}

/* search */
const qIn = $('[data-ba-q]'), hits = $('[data-ba-hits]');
const ALIASES = { 1: 'mpfc prefrontal default self', 2: 'pcc precuneus cingulate posterior default', 3: 'insula insular interoception body', 4: 'acc cingulate anterior attention', 5: 'dlpfc prefrontal frontal lateral frontopolar control', 6: 'ofc orbitofrontal emotion', 7: 'motor sensory somatosensory touch', 8: 'visual occipital vision' };
qIn.addEventListener('input', () => {
  const v = qIn.value.trim().toLowerCase();
  if (!v) { hits.hidden = true; return; }
  const m = REGIONS.filter(r => (r.name + ' ' + r.network + ' ' + (ALIASES[r.id] || '')).toLowerCase().includes(v));
  hits.innerHTML = m.length ? m.map(r => `<li><button type="button" data-hit="${r.id}"><i style="background:${esc(r.colour)}"></i>${esc(r.name)}</button></li>`).join('') : '<li class="ba-none">Not on this map yet</li>';
  hits.hidden = false;
  hits.querySelectorAll('[data-hit]').forEach(b => b.addEventListener('click', () => {
    if (mode !== 'regions') setMode('regions');
    hits.hidden = true; qIn.value = ''; select(+b.dataset.hit); faceRegion(+b.dataset.hit);
  }));
});
document.addEventListener('click', e => { if (!e.target.closest('.ba-search')) hits.hidden = true; });

/* tools */
function setMode(m) {
  mode = m; selected = 0; hovered = 0;
  document.querySelectorAll('[data-ba-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.baMode === m)));
  chips(); select(0);
}
document.querySelectorAll('[data-ba-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.baMode)));
document.querySelectorAll('[data-ba-view]').forEach(b => b.addEventListener('click', () => goView(b.dataset.baView)));
document.querySelectorAll('[data-ba-zoom]').forEach(b => b.addEventListener('click', () => {
  const d = camera.position.length() * (b.dataset.baZoom === '1' ? 0.82 : 1.22);
  camera.position.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, d)));
}));

chips(); paint(); size();
renderer.setAnimationLoop(t => { if (anim) anim(t); controls.update(); renderer.render(scene, camera); });
window.__atlas = { select, setMode, goView };   // for testing
