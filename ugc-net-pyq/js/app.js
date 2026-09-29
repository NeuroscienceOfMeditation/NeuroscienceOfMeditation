/* Entry point: state, rendering and events. The views are plain functions
   that return HTML strings; this file decides when to call them. */

import { loadBank } from './data.js';
import { DEFAULT_FILTERS, applyFilters, reconcile } from './filters.js';
import { recordAnswer, promote, reviewIds, startSession, answerInSession, sessionDone, emptyProgress } from './srs.js';
import { topicFrequency, summary } from './analytics.js';
import { loadProgress, saveProgress, loadPrefs, savePrefs, loadTheme, saveTheme, storageWorks, sanitizeProgress } from './store.js';
import { esc } from './util.js';
import { sidebarView } from './views/sidebar.js';
import { practiceView, emptyState } from './views/practice.js';
import { reviewHome, reviewSession, reviewDone } from './views/review.js';
import { dashboardView } from './views/dashboard.js';
import { installTooltip } from './views/tooltip.js';

const VIEWS = { practice: 'Practice', review: 'Review mistakes', analytics: 'Analytics' };
const THEMES = ['system', 'light', 'dark'];
const THEME_ICON = {
  system: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3 3l1.4 1.4m7.2 7.2L13 13M3 13l1.4-1.4m7.2-7.2L13 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7Z" fill="currentColor"/></svg>',
};

const state = {
  bank: null,
  byId: new Map(),
  progress: loadProgress(),
  storageOk: storageWorks(),
  filters: { ...DEFAULT_FILTERS },
  view: 'practice',
  theme: loadTheme(),
  // Practice keeps a snapshot of the deck, so a question does not vanish
  // mid-set when answering it changes whether it matches a status filter.
  practice: { deck: [], currentId: null, shuffled: false, answers: {} },
  review: null, // { session, current: { id, choice, submitted }, done }
  drawerOpen: false,
};

const $ = (sel) => document.querySelector(sel);

/* --- derived ---------------------------------------------------------- */

function visible(status = state.filters.status) {
  return applyFilters(state.bank.questions, { ...state.filters, status }, state.progress);
}

function subjectOf(q) {
  return state.bank.syllabus.subjects.find((s) => s.id === q.subject);
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rebuildDeck(keepId = state.practice.currentId) {
  const ids = visible().map((q) => q.id);
  const deck = state.practice.shuffled ? shuffle(ids) : ids;
  state.practice.deck = deck;
  state.practice.currentId = deck.includes(keepId) ? keepId : (deck[0] ?? null);
}

/* --- persistence and the address bar ---------------------------------- */

function commitProgress(next) {
  state.progress = next;
  saveProgress(next);
}

function writeHash() {
  const p = new URLSearchParams();
  p.set('view', state.view);
  for (const [k, v] of Object.entries(state.filters)) {
    if (v !== DEFAULT_FILTERS[k]) p.set(k === 'q' ? 'search' : k, v);
  }
  if (state.view === 'practice' && state.practice.currentId) p.set('id', state.practice.currentId);
  history.replaceState(null, '', '#' + p.toString());
  savePrefs({ view: state.view, filters: state.filters });
  document.title = `${VIEWS[state.view]} · UGC NET PYQ Analytics`;
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const prefs = loadPrefs();
  const fromHash = [...p.keys()].length > 0;
  const src = fromHash ? Object.fromEntries(p) : { view: prefs.view, ...(prefs.filters || {}), search: prefs.filters?.q };

  state.view = Object.hasOwn(VIEWS, src.view) ? src.view : 'practice';
  const f = { ...DEFAULT_FILTERS };
  for (const k of Object.keys(DEFAULT_FILTERS)) {
    const v = src[k === 'q' ? 'search' : k];
    if (typeof v === 'string' && v !== '') f[k] = v;
  }
  state.filters = reconcile(f, state.bank.questions);

  const id = fromHash ? p.get('id') : null;
  if (id && state.byId.has(id) && !visible().some((q) => q.id === id)) {
    // A shared link to one question: show it even if saved filters would hide it.
    state.filters = { ...DEFAULT_FILTERS };
  }
  rebuildDeck(id || null);
}

/* --- rendering --------------------------------------------------------- */

function renderTabs() {
  const due = summary(state.bank.questions, state.progress, Date.now()).due;
  $('#tabs').innerHTML = Object.entries(VIEWS).map(([key, label]) => `
    <button type="button" class="tab" data-action="goto" data-view="${key}"${state.view === key ? ' aria-current="page"' : ''}>
      ${label}${key === 'review' && due ? `<span class="badge" aria-label="${due} due">${due}</span>` : ''}
    </button>`).join('');
  const label = `Theme: ${state.theme}`;
  const btn = $('#theme-btn');
  btn.innerHTML = `${THEME_ICON[state.theme]}<span class="hidden sm:inline">${label}</span>`;
  btn.setAttribute('aria-label', `${label}. Change theme`);
}

function renderSidebar() {
  const active = document.activeElement;
  const refocus = active && active.dataset && active.dataset.filter ? active.dataset.filter : null;
  $('#sidebar-body').innerHTML = sidebarView({
    bank: state.bank,
    filters: state.filters,
    matchCount: visible().length,
    stats: summary(state.bank.questions, state.progress, Date.now()),
    storageOk: state.storageOk,
  });
  if (refocus) {
    const el = $(`#sidebar-body [data-filter="${refocus}"]${refocus === 'subject' ? ':checked' : ''}`);
    if (el) el.focus();
  }
}

function practiceHtml() {
  const { deck, currentId, shuffled, answers } = state.practice;
  if (!state.bank.questions.length) return emptyState('No valid questions are loaded. See the data check in the sidebar.', false);
  if (!deck.length) return practiceView({ deck });
  const q = state.byId.get(currentId);
  return practiceView({
    deck,
    index: deck.indexOf(currentId),
    q,
    subject: subjectOf(q),
    st: answers[q.id] || { choice: null, submitted: false },
    freq: topicFrequency(state.bank.questions, q),
    shuffled,
    inBook: Boolean(state.progress.srs[q.id]),
  });
}

function reviewHtml() {
  const now = Date.now();
  const r = state.review;
  if (r && r.done) return reviewDone({ session: r.session, progress: state.progress, byId: state.byId });
  if (r) {
    const q = state.byId.get(r.current.id);
    return reviewSession({
      session: r.session,
      q,
      subject: subjectOf(q),
      st: r.current,
      freq: topicFrequency(state.bank.questions, q),
      card: state.progress.srs[q.id],
    });
  }
  const visibleIds = visible('all').map((q) => q.id);
  const allInBook = state.bank.questions.filter((q) => state.progress.srs[q.id]).length;
  const shownInBook = visibleIds.filter((id) => state.progress.srs[id]).length;
  return reviewHome({ progress: state.progress, visibleIds, hiddenCount: allInBook - shownInBook, byId: state.byId, now });
}

function analyticsHtml() {
  return dashboardView({
    bank: state.bank,
    questions: visible('all'),
    progress: state.progress,
    subject: state.filters.subject,
    now: Date.now(),
  });
}

function renderMain() {
  const html = state.view === 'practice' ? practiceHtml() : state.view === 'review' ? reviewHtml() : analyticsHtml();
  $('#view').innerHTML = html;
}

function render() {
  renderTabs();
  renderSidebar();
  renderMain();
  writeHash();
}

function focusQuestion() {
  const h = $('#view .q-stem');
  if (h) {
    h.focus({ preventScroll: true });
    const top = $('#view').getBoundingClientRect().top + window.scrollY - 80;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }
}

function focusFeedback() {
  const fb = $('#view .feedback');
  if (fb) {
    fb.focus({ preventScroll: true });
    fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* --- actions ----------------------------------------------------------- */

function setFilters(next) {
  state.filters = reconcile(next, state.bank.questions);
  rebuildDeck();
  render();
}

function goto(view) {
  state.view = view;
  closeDrawer();
  render();
  window.scrollTo({ top: 0 });
}

function currentCard() {
  if (state.view === 'practice' && state.practice.currentId) {
    const id = state.practice.currentId;
    state.practice.answers[id] = state.practice.answers[id] || { choice: null, submitted: false };
    return { id, st: state.practice.answers[id] };
  }
  if (state.view === 'review' && state.review && !state.review.done) {
    return { id: state.review.current.id, st: state.review.current };
  }
  return null;
}

function choose(n) {
  const card = currentCard();
  if (!card || card.st.submitted) return;
  const q = state.byId.get(card.id);
  if (n < 1 || n > q.options.length) return;
  card.st.choice = n;
  const radio = $(`#view input[data-action="choose"][value="${n}"]`);
  if (radio) radio.checked = true;
  const submit = $('#view form[data-action="submit-form"] button[type="submit"]');
  if (submit) submit.disabled = false;
}

function submitAnswer() {
  const card = currentCard();
  if (!card || card.st.submitted || !card.st.choice) return;
  const q = state.byId.get(card.id);
  const correct = card.st.choice === q.correct_answer;
  const now = Date.now();
  let next = recordAnswer(state.progress, q.id, correct, now);
  if (state.view === 'review') {
    if (correct) next = promote(next, q.id, now);
    state.review.session = answerInSession(state.review.session, correct);
  }
  commitProgress(next);
  card.st.submitted = true;
  renderTabs();
  renderSidebar();
  renderMain();
  focusFeedback();
}

function step(delta) {
  const { deck, currentId } = state.practice;
  const i = deck.indexOf(currentId) + delta;
  if (i < 0 || i >= deck.length) return;
  state.practice.currentId = deck[i];
  renderMain();
  writeHash();
  focusQuestion();
}

function startReview(includeAll) {
  const ids = reviewIds(state.progress, visible('all').map((q) => q.id), Date.now(), includeAll);
  if (!ids.length) return;
  const session = startSession(ids);
  state.review = { session, current: { id: session.queue[0], choice: null, submitted: false }, done: false };
  renderMain();
  focusQuestion();
}

function reviewNext() {
  const r = state.review;
  if (!r) return;
  if (sessionDone(r.session)) {
    r.done = true;
  } else {
    r.current = { id: r.session.queue[0], choice: null, submitted: false };
  }
  renderTabs();
  renderMain();
  focusQuestion();
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ugc-net-pyq-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = sanitizeProgress(JSON.parse(reader.result));
    } catch (e) {
      alert('That file is not a progress export from this app.');
      return;
    }
    const n = Object.keys(data.attempts).length;
    if (!confirm(`Replace your current progress with this file (${n} answered questions)?`)) return;
    commitProgress(data);
    state.review = null;
    render();
  };
  reader.readAsText(file);
}

function openDrawer() {
  state.drawerOpen = true;
  $('#sidebar').dataset.open = 'true';
  $('#filters-btn').setAttribute('aria-expanded', 'true');
  const first = $('#sidebar input, #sidebar select, #sidebar button');
  if (first) first.focus();
}

function closeDrawer() {
  if (!state.drawerOpen) return;
  state.drawerOpen = false;
  $('#sidebar').dataset.open = 'false';
  $('#filters-btn').setAttribute('aria-expanded', 'false');
}

function applyTheme() {
  if (state.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
}

const ACTIONS = {
  goto: (el) => goto(el.dataset.view),
  next: () => step(1),
  prev: () => step(-1),
  retry: () => {
    state.practice.answers[state.practice.currentId] = { choice: null, submitted: false };
    renderMain();
    focusQuestion();
  },
  shuffle: () => {
    state.practice.shuffled = !state.practice.shuffled;
    rebuildDeck(state.practice.shuffled ? null : state.practice.currentId);
    renderMain();
    writeHash();
  },
  'reset-filters': () => setFilters({ ...DEFAULT_FILTERS }),
  'drill-topic': (el) => {
    state.view = 'practice';
    state.review = null;
    setFilters({ ...DEFAULT_FILTERS, subject: el.dataset.subject, topic: el.dataset.topic });
    window.scrollTo({ top: 0 });
  },
  'start-review': (el) => startReview(el.dataset.all === '1'),
  'review-next': () => reviewNext(),
  'end-review': () => {
    state.review = null;
    render();
  },
  'export-progress': () => exportProgress(),
  'reset-progress': () => {
    if (!confirm('Delete all your answers and your mistake book in this browser? This cannot be undone.')) return;
    commitProgress(emptyProgress());
    state.practice.answers = {};
    state.review = null;
    render();
  },
  'toggle-theme': () => {
    state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
    saveTheme(state.theme);
    applyTheme();
    renderTabs();
  },
  'open-filters': () => openDrawer(),
  'close-filters': () => closeDrawer(),
};

/* --- events ------------------------------------------------------------ */

let searchTimer = null;

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT' || el.tagName === 'FORM') return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el);
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.action === 'choose') return choose(Number(el.value));
    if (el.dataset.action === 'import-progress' && el.files && el.files[0]) {
      importProgress(el.files[0]);
      el.value = '';
      return;
    }
    const key = el.dataset.filter;
    if (key && key !== 'q') setFilters({ ...state.filters, [key]: el.value });
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset.filter !== 'q') return;
    const value = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters = { ...state.filters, q: value };
      rebuildDeck();
      // Re-rendering the sidebar would reset the caret, so only the count and main view update.
      const count = $('#sidebar-body [aria-live] strong');
      if (count) count.textContent = String(visible().length);
      renderMain();
      writeHash();
    }, 150);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.dataset.action !== 'submit-form') return;
    e.preventDefault();
    submitAnswer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.drawerOpen) {
      closeDrawer();
      $('#filters-btn').focus();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t.matches && t.matches('input[type="search"], input[type="text"], select, textarea');
    if (typing) return;
    const card = currentCard();
    if (/^[1-9]$/.test(e.key) && card && !card.st.submitted) {
      e.preventDefault();
      choose(Number(e.key));
      return;
    }
    const onControl = t.matches && t.matches('button, a, input, summary, label');
    if (e.key === 'Enter' && !onControl && card) {
      e.preventDefault();
      if (!card.st.submitted) submitAnswer();
      else if (state.view === 'practice') step(1);
      else reviewNext();
      return;
    }
    if (state.view === 'practice' && !onControl && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  window.addEventListener('hashchange', () => {
    readHash();
    render();
  });
}

/* --- start ------------------------------------------------------------- */

async function start() {
  applyTheme();
  bindEvents();
  installTooltip(document.body);
  try {
    state.bank = await loadBank('data/');
  } catch (err) {
    $('#view').innerHTML = `<div class="card p-8">
      <p class="text-lg font-semibold">The question bank could not be loaded.</p>
      <p class="mt-2 text-ink-2">${esc(err.message)}</p>
      <p class="mt-2 text-sm text-ink-2">If you just edited a file in <code>data/</code>, check it for a missing comma or quote (a JSON validator will point to the line).</p>
    </div>`;
    $('#sidebar-body').innerHTML = '';
    return;
  }
  state.byId = new Map(state.bank.questions.map((q) => [q.id, q]));
  readHash();
  render();
  document.documentElement.dataset.ready = 'true';
}

start();
