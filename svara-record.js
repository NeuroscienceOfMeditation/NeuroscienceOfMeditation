/* ==========================================================================
   svara-record.js — the Swara open record
   Asks for consent in a pop-up before the first observation continues,
   saves observations to Supabase (only after consent), gives each person a
   record code for emailed data requests, and draws the public aggregate
   chart from real data. Individual logs are never shown on screen.

   Load order: supabase.js → svara-engine → svara-knowledge → svara-voice →
   svara-ui → svara-record.

   The key below is the PUBLISHABLE key. It is meant to be public; access is
   controlled by the row-level security rules in supabase-setup.sql.
   Never put the secret / service_role key in this file.
   ========================================================================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://neinmntlyiszfmkeeyoo.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xqK97lVzGEzvTEItzC9REQ_QIp9U-Nl';
  var CONSENT_VERSION = 'v1-2026-09';
  var DATA_EMAIL = 'adiyogistudios@gmail.com';     // where data requests go
  var DECLINED_KEY = 'nom.svara.record.declined';  // per visit: "continue without saving"
  var PRACTICE_WINDOW_MS = 45 * 60 * 1000; // a practice counts for the next observation within 45 min

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var NAMES = { ida: 'Ida · left', pingala: 'Pingala · right', sushumna: 'Sushumna · both' };
  var ALIGN = { aligned: 'matched the rule', misaligned: 'did not match', sushumna: 'sushumna', unreported: 'no comparison', unavailable: 'no comparison' };

  var state = {
    client: null,
    user: null,
    joined: false,
    checkin: { mood: null, energy: null, calm: null },
    practice: null,        // { name, at }
    busy: false
  };
  var consent = { dlg: null, then: null };   // the consent pop-up

  /* ---------------------------------------------------------------- setup */
  var panel = $('[data-record]');
  if (!window.supabase || !window.supabase.createClient) {
    if (panel) panel.innerHTML = '<p class="sv-fine">The open record could not load right now. ' +
      'The tool above still works, and your log below stays in this browser.</p>';
    renderStatsUnavailable();
    return;
  }
  try {
    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  } catch (e) {
    renderStatsUnavailable();
    return;
  }
  var db = state.client;

  injectCheckin();
  buildConsent();
  interceptContinue();
  bindEvents();
  loadStats();
  restore();

  /* ------------------------------------------------------ session + consent */
  function restore() {
    db.auth.getSession().then(function (res) {
      state.ready = true;
      var session = res && res.data && res.data.session;
      if (!session) { state.user = null; state.joined = false; render(); return; }
      state.user = session.user;
      return db.from('svara_consents').select('consented_at').limit(1).then(function (r) {
        state.joined = !r.error && r.data && r.data.length > 0;
        render();
      });
    }).catch(function () { state.ready = true; render(); });
  }

  function join(then) {
    if (state.busy) return;
    state.busy = true;
    consentStatus('Joining…');
    var signIn = state.user ? Promise.resolve({ data: { user: state.user } })
                            : db.auth.signInAnonymously();
    signIn.then(function (res) {
      if (res.error) throw res.error;
      state.user = res.data.user || (res.data.session && res.data.session.user);
      return db.from('svara_consents').insert({ consent_version: CONSENT_VERSION, is_adult: true });
    }).then(function (res) {
      if (res.error && res.error.code !== '23505') throw res.error;   // 23505 = already consented
      state.joined = true;
      state.busy = false;
      closeConsent();
      render();
      if (then) then();
    }).catch(function (err) {
      state.busy = false;
      var msg = (err && err.message) || '';
      if (/anonymous/i.test(msg) && /disabled|not enabled/i.test(msg)) consentStatus('Contributions aren’t switched on yet. You can continue without saving.');
      else if (/rate limit/i.test(msg)) consentStatus('Too many people joined from this network recently. You can continue without saving and join later.');
      else consentStatus('We couldn’t connect just now. You can continue without saving and try again later.');
    });
  }

  /* ------------------------------------------------------- consent dialog */
  function buildConsent() {
    var d = document.createElement('dialog');
    d.className = 'rc-dialog';
    d.setAttribute('aria-labelledby', 'rc-title');
    d.setAttribute('aria-describedby', 'rc-desc');
    d.innerHTML =
      '<form method="dialog" class="rc-card" novalidate>' +
        '<p class="rc-kicker">Before you continue</p>' +
        '<h2 id="rc-title">Add this observation to the open record?</h2>' +
        '<p id="rc-desc">The open record is a shared, anonymous dataset testing what the Svarodaya texts say about the breath. No name or email is needed.</p>' +
        '<ul class="rc-list" aria-label="What is saved">' +
          '<li>Which side is flowing, and the time</li>' +
          '<li>Your location rounded to about 11 km, only if you share one</li>' +
          '<li>Any mood, energy or calm score you choose to add</li>' +
        '</ul>' +
        '<label class="rc-tick"><input type="checkbox" data-rc-adult> <span>I am 18 or older.</span></label>' +
        '<label class="rc-tick"><input type="checkbox" data-rc-agree> <span>I agree to my observations being stored and included in public <b>aggregate</b> statistics, as set out in the <a href="privacy.html" target="_blank" rel="noopener">privacy notice</a>.</span></label>' +
        '<div class="rc-actions">' +
          '<button type="button" class="rc-btn primary" data-rc-join disabled>Agree and continue</button>' +
          '<button type="button" class="rc-btn" data-rc-skip>Continue without saving</button>' +
        '</div>' +
        '<p class="rc-status" data-rc-status role="status" aria-live="polite"></p>' +
        '<p class="rc-fine">Under 18? Choose “Continue without saving”. The tool works exactly the same. To see or delete your data later, email ' + esc(DATA_EMAIL) + ' with the record code you’ll be shown.</p>' +
      '</form>';
    document.body.appendChild(d);
    consent.dlg = d;
    var adult = d.querySelector('[data-rc-adult]'), agree = d.querySelector('[data-rc-agree]'), btn = d.querySelector('[data-rc-join]');
    function sync() { btn.disabled = !(adult.checked && agree.checked); }
    adult.addEventListener('change', sync);
    agree.addEventListener('change', sync);
    btn.addEventListener('click', function () { if (!btn.disabled) join(consent.then); });
    d.querySelector('[data-rc-skip]').addEventListener('click', function () {
      try { sessionStorage.setItem(DECLINED_KEY, '1'); } catch (e) {}
      var then = consent.then;
      closeConsent();
      render();
      if (then) then();
    });
    d.addEventListener('cancel', function (e) { e.preventDefault(); d.querySelector('[data-rc-skip]').click(); });
  }

  function openConsent(then) {
    var d = consent.dlg;
    consent.then = then || null;
    d.querySelector('[data-rc-adult]').checked = false;
    d.querySelector('[data-rc-agree]').checked = false;
    d.querySelector('[data-rc-join]').disabled = true;
    consentStatus('');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    d.querySelector('[data-rc-adult]').focus();
  }
  function closeConsent() {
    var d = consent.dlg; consent.then = null;
    if (d && d.open) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }
  }
  function consentStatus(t) { var e = consent.dlg && consent.dlg.querySelector('[data-rc-status]'); if (e) e.textContent = t; }

  function declined() { try { return sessionStorage.getItem(DECLINED_KEY) === '1'; } catch (e) { return false; } }

  /** Ask once per visit, at the moment someone first tries to continue. */
  function interceptContinue() {
    var bypass = false;
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-observe-done]');
      if (!btn || bypass || btn.disabled) return;
      if (state.joined || declined() || !state.ready) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openConsent(function () { bypass = true; btn.click(); bypass = false; });
    }, true);
  }

  /* -------------------------------------------------------------- saving */
  function onAssessed(e) {
    var r = e.detail;
    if (!r || !r.observedSvara) return;
    if (!state.joined) { toastResult('Not added to the open record. <a href="#record">Join the open record</a> to contribute.', 'neutral'); return; }

    var ctx = r.context || {};
    var mins = ctx.minutesSinceSunrise;
    var tithi = ctx.tithi && typeof ctx.tithi.index === 'number' ? ctx.tithi.index : null;
    var period = [60, 120, 150].indexOf(r.periodMinutes) >= 0 ? r.periodMinutes : null;
    var practice = state.practice && (Date.now() - state.practice.at) < PRACTICE_WINDOW_MS ? state.practice.name : null;

    var row = {
      observed_at: (ctx.date instanceof Date ? ctx.date : new Date()).toISOString(),
      observed_svara: r.observedSvara.key,
      expected_svara: r.expectedSvara ? r.expectedSvara.key : null,
      alignment: ALIGN.hasOwnProperty(r.alignment) ? r.alignment : 'unreported',
      expected_tattva: r.expectedTattva ? r.expectedTattva.key : null,
      minutes_since_sunrise: (typeof mins === 'number' && isFinite(mins)) ? Math.max(0, Math.min(1440, Math.round(mins))) : null,
      tithi_index: (tithi != null && tithi >= 0 && tithi <= 29) ? tithi : null,
      period_minutes: period,
      lat_rounded: typeof ctx.lat === 'number' ? Math.round(ctx.lat * 10) / 10 : null,
      lon_rounded: typeof ctx.lon === 'number' ? Math.round(ctx.lon * 10) / 10 : null,
      mood: state.checkin.mood,
      energy: state.checkin.energy,
      calm: state.checkin.calm,
      practice_key: practice ? practice.slice(0, 40) : null
    };

    toastResult('Saving to the open record…', 'neutral');
    db.from('svara_logs').insert(row).then(function (res) {
      if (res.error) {
        var m = res.error.message || '';
        if (/2 days old/.test(m)) toastResult('Not saved: the record only accepts observations from the last two days.', 'off');
        else if (/future/.test(m)) toastResult('Not saved: the time is set in the future. Check the date and time.', 'off');
        else if (/daily log limit/.test(m)) toastResult('Not saved: that\'s the daily limit for one person. Thank you for being thorough.', 'off');
        else if (/security policy/.test(m)) { state.joined = false; render(); toastResult('Not saved: please join the open record again below.', 'off'); }
        else toastResult('Not saved: the open record couldn\'t be reached. Your browser log still has it.', 'off');
        return;
      }
      toastResult('Added to the open record' + (practice ? ', noted as after “' + esc(practice) + '”' : '') + '. Thank you.', 'ok');
      state.practice = null;
      resetCheckin();
      loadStats();
    });
  }

  /* ------------------------------------------------------------ rendering */
  function recordCode() {
    return state.user && state.user.id ? state.user.id.replace(/-/g, '').slice(0, 8).toUpperCase() : '';
  }

  function mailto(code) {
    var subject = 'Swara open record: data request (' + code + ')';
    var body = 'Hello,\n\nMy record code is: ' + code + '\n\nI would like to:\n[ ] receive a copy of my data\n[ ] have all my data deleted\n\nThank you.';
    return 'mailto:' + DATA_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function render() {
    if (!panel) return;
    if (!state.joined) {
      panel.innerHTML =
        '<h2 class="sv-h" style="font-size:18px">The open record</h2>' +
        '<p class="sv-p">Add your observations to a shared, anonymous record that tests the Svarodaya rules against real breath. No name or email needed.</p>' +
        '<div class="rec-actions"><button class="sv-btn primary" data-rec-open>Join the open record</button></div>' +
        '<p class="sv-fine rec-status" data-rec-status aria-live="polite"></p>';
      panel.querySelector('[data-rec-open]').addEventListener('click', function () {
        try { sessionStorage.removeItem(DECLINED_KEY); } catch (e) {}
        openConsent(null);
      });
      return;
    }
    var code = recordCode();
    panel.innerHTML =
      '<h2 class="sv-h" style="font-size:18px">You’re contributing <span class="rec-ok" aria-hidden="true">✓</span></h2>' +
      '<p class="sv-p">Each observation you complete is added to the open record, anonymously.</p>' +
      '<div class="rec-code"><div><small id="rec-code-label">Your record code</small><b aria-labelledby="rec-code-label">' + esc(code) + '</b></div>' +
        '<button class="sv-btn quiet" data-rec-copy>Copy</button></div>' +
      '<p class="sv-p" style="margin-bottom:0">Want a copy of your data, or to have it deleted? Email us with this code and we’ll take care of it.</p>' +
      '<div class="rec-actions">' +
        '<a class="sv-btn primary" href="' + esc(mailto(code)) + '" style="text-decoration:none">Email a data request</a>' +
        '<button class="sv-btn quiet" data-rec-stop>Stop contributing</button>' +
      '</div>' +
      '<p class="sv-fine rec-status" data-rec-status aria-live="polite"></p>';
    panel.querySelector('[data-rec-copy]').addEventListener('click', function () {
      var done = function () { setStatus('Code copied.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () { setStatus('Your code is ' + code + '.'); });
      else setStatus('Your code is ' + code + '.');
    });
    panel.querySelector('[data-rec-stop]').addEventListener('click', function () {
      if (!window.confirm('Stop adding observations from this browser? Anything already saved stays in the record unless you email us to delete it, so note your code first: ' + code)) return;
      db.auth.signOut().catch(function () {}).then(function () {
        state.user = null; state.joined = false;
        try { sessionStorage.setItem(DECLINED_KEY, '1'); } catch (e) {}
        render();
        setStatus('Stopped. New observations from this browser won’t be saved.');
      });
    });
  }

  function setStatus(t) { var s = $('[data-rec-status]'); if (s) s.textContent = t; }
  function toast(t) { setStatus(t); }

  function toastResult(html, tone) {
    var host = $('[data-step="result"]');
    if (!host) return;
    var el = $('[data-rec-toast]', host);
    if (!el) {
      el = document.createElement('p');
      el.setAttribute('data-rec-toast', '');
      el.setAttribute('aria-live', 'polite');
      host.appendChild(el);
    }
    el.className = 'rec-toast ' + (tone || 'neutral');
    el.innerHTML = html;
  }

  /* -------------------------------------------------------------- check-in */
  function injectCheckin() {
    var report = $('[data-step="report"]');
    if (!report || $('[data-rec-checkin]', report)) return;
    var row = $('.sv-row', report);
    var box = document.createElement('div');
    box.className = 'rec-checkin';
    box.setAttribute('data-rec-checkin', '');
    var scales = [
      ['mood', 'Mood', 'low', 'good'],
      ['energy', 'Energy', 'drained', 'lively'],
      ['calm', 'Calm', 'restless', 'settled']
    ];
    box.innerHTML = '<p class="rec-checkin-title">How are you right now? <span>Optional, and only saved if you\'ve joined the open record.</span></p>' +
      scales.map(function (s) {
        return '<div class="rec-scale" role="group" aria-label="' + s[1] + ', 1 to 5">' +
          '<span class="rec-scale-name">' + s[1] + '</span><span class="rec-scale-end">' + s[2] + '</span>' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<button type="button" class="rec-dot" data-scale="' + s[0] + '" data-v="' + n + '" aria-pressed="false" aria-label="' + s[1] + ' ' + n + '">' + n + '</button>';
          }).join('') +
          '<span class="rec-scale-end">' + s[3] + '</span></div>';
      }).join('');
    report.insertBefore(box, row);
    $$('.rec-dot', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.scale, v = +b.dataset.v;
        state.checkin[k] = state.checkin[k] === v ? null : v;
        $$('.rec-dot[data-scale="' + k + '"]', box).forEach(function (x) {
          x.setAttribute('aria-pressed', String(+x.dataset.v === state.checkin[k]));
        });
      });
    });
  }
  function resetCheckin() {
    state.checkin = { mood: null, energy: null, calm: null };
    $$('.rec-dot').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
  }

  /* ---------------------------------------------------------------- stats */
  function loadStats() {
    db.rpc('open_record_stats').then(function (res) {
      if (res.error || !res.data) { renderStatsUnavailable(); return; }
      renderStats(res.data);
    }).catch(renderStatsUnavailable);
  }

  function fmt(n) { return (n == null) ? '—' : Number(n).toLocaleString('en-IN'); }

  function renderStats(s) {
    $$('[data-rec-week]').forEach(function (el) { el.textContent = fmt(s.logs_last_7_days); });
    $$('[data-rec-total]').forEach(function (el) { el.textContent = fmt(s.logs_total); });
    var cap = $('[data-rec-cap]');
    var bars = $('#wbars');
    if (!bars) return;
    bars.innerHTML = '';
    if (!s.enough_data || !s.by_hour_30d || !s.by_hour_30d.length) {
      if (cap) cap.textContent = 'The record is just starting · ' + fmt(s.logs_total) + (s.logs_total === 1 ? ' log' : ' logs') + ' so far';
      bars.classList.add('rec-bars-empty');
      bars.innerHTML = '<p>The chart appears once at least five people have contributed, so no one\'s individual pattern can be picked out. ' +
        'Hours with fewer than five logs stay hidden too.</p>';
      return;
    }
    bars.classList.remove('rec-bars-empty');
    var n = s.by_hour_30d.reduce(function (a, b) { return a + b.n; }, 0);
    if (cap) cap.textContent = fmt(s.contributors_30d) + ' contributors, last 30 days, n = ' + fmt(n) + ' logs';
    var byHour = {};
    s.by_hour_30d.forEach(function (b) { byHour[b.hour] = b; });
    for (var h = 0; h < 24; h++) {
      var b = byHour[h];
      var bar = document.createElement('i');
      if (!b) {
        bar.className = 'rec-bar-gap';
        bar.title = 'Hour ' + (h + 1) + ' after sunrise: not enough logs yet';
      } else {
        var pi = b.ida / b.n * 100, ps = b.sushumna / b.n * 100;
        bar.style.background = 'linear-gradient(to top,#2E7FA8 0%,#2E7FA8 ' + pi + '%,#C6A15B ' + pi + '%,#C6A15B ' + (pi + ps) + '%,#E4744F ' + (pi + ps) + '%,#E4744F 100%)';
        bar.title = 'Hour ' + (h + 1) + ' after sunrise: ' + b.ida + ' left, ' + b.pingala + ' right, ' + b.sushumna + ' both (n=' + b.n + ')';
      }
      bars.appendChild(bar);
    }
  }

  function renderStatsUnavailable() {
    $$('[data-rec-week],[data-rec-total]').forEach(function (el) { el.textContent = '—'; });
    var cap = $('[data-rec-cap]'); if (cap) cap.textContent = 'The live record couldn\'t be reached just now';
    var bars = $('#wbars');
    if (bars) { bars.classList.add('rec-bars-empty'); bars.innerHTML = '<p>Please check back shortly.</p>'; }
  }

  /* ---------------------------------------------------------------- events */
  function bindEvents() {
    window.addEventListener('svara:assessed', onAssessed);
    window.addEventListener('svara:practice-done', function (e) {
      var name = e.detail && e.detail.practice;
      state.practice = name ? { name: name, at: Date.now() } : null;
    });
  }
}());
