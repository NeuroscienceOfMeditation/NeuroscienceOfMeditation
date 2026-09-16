/* ==========================================================================
   svara-record.js — the Swara open record
   Saves observations to Supabase (only after consent), shows each person
   their own history, lets them download or delete everything, and draws the
   public aggregate chart from real data.

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
  bindEvents();
  loadStats();
  restore();

  /* ------------------------------------------------------ session + consent */
  function restore() {
    db.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) { state.user = null; state.joined = false; render(); return; }
      state.user = session.user;
      return db.from('svara_consents').select('consented_at').limit(1).then(function (r) {
        state.joined = !r.error && r.data && r.data.length > 0;
        render();
        if (state.joined) loadHistory();
      });
    }).catch(function () { render(); });
  }

  function join() {
    if (state.busy) return;
    var adult = $('[data-rec-adult]'), agree = $('[data-rec-agree]');
    if (!adult.checked || !agree.checked) return;
    state.busy = true;
    setStatus('Joining…');

    var signIn = state.user ? Promise.resolve({ data: { user: state.user } })
                            : db.auth.signInAnonymously();
    signIn.then(function (res) {
      if (res.error) throw res.error;
      state.user = res.data.user || (res.data.session && res.data.session.user);
      return db.from('svara_consents').insert({ consent_version: CONSENT_VERSION, is_adult: true });
    }).then(function (res) {
      if (res.error && res.error.code !== '23505') throw res.error; // 23505 = already consented
      state.joined = true;
      state.busy = false;
      render();
      loadHistory();
      toast('You\'ve joined the open record. Your next observation will be added.');
    }).catch(function (err) {
      state.busy = false;
      var msg = (err && err.message) || '';
      if (/anonymous/i.test(msg) && /disabled|not enabled/i.test(msg)) {
        setStatus('Contributions aren\'t switched on yet. Please try again later.');
      } else if (/rate limit/i.test(msg)) {
        setStatus('Too many people joined from this network in the last hour. Please try again later.');
      } else {
        setStatus('Something went wrong joining. Please try again in a moment.');
      }
    });
  }

  /* -------------------------------------------------------------- saving */
  function onAssessed(e) {
    var r = e.detail;
    if (!r || !r.observedSvara) return;
    if (!state.joined) { toastResult('Not added to the open record. <a href="#record">Join below</a> to contribute.', 'neutral'); return; }

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
      loadHistory();
      loadStats();
    });
  }

  /* ------------------------------------------------------ history + rights */
  function loadHistory() {
    if (!state.joined) return;
    db.from('svara_logs')
      .select('observed_at, observed_svara, expected_svara, alignment, mood, energy, calm, practice_key')
      .order('observed_at', { ascending: false }).limit(12)
      .then(function (res) {
        var list = $('[data-rec-history]');
        if (!list) return;
        if (res.error) { list.innerHTML = '<li class="rec-empty">Couldn\'t load your history just now.</li>'; return; }
        if (!res.data.length) {
          list.innerHTML = '<li class="rec-empty">Nothing yet. Complete an observation above and it will appear here.</li>';
          return;
        }
        list.innerHTML = res.data.map(function (e) {
          var d = new Date(e.observed_at);
          var when = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' +
                     d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          var extra = [];
          if (e.practice_key) extra.push('after ' + esc(e.practice_key));
          if (e.mood || e.energy || e.calm) extra.push('check-in ' + [e.mood, e.energy, e.calm].map(function (x) { return x || '–'; }).join('/'));
          return '<li><time>' + esc(when) + '</time><div><b>' + esc(NAMES[e.observed_svara] || e.observed_svara) + '</b>' +
            (e.expected_svara ? ' <span class="rec-dim">· ' + esc(ALIGN[e.alignment] || '') + '</span>' : '') +
            (extra.length ? '<div class="rec-dim">' + extra.join(' · ') + '</div>' : '') + '</div></li>';
        }).join('');
      });
  }

  function download() {
    Promise.all([
      db.from('svara_consents').select('*'),
      db.from('svara_logs').select('*').order('observed_at', { ascending: true })
    ]).then(function (res) {
      var data = {
        exported_at: new Date().toISOString(),
        note: 'Everything the Neuroscience of Meditation open record holds for this browser\'s anonymous account.',
        consent: res[0].data || [],
        observations: res[1].data || []
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my-svara-record.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }

  function removeAll() {
    if (!window.confirm('Delete all your observations and your consent from the open record? This cannot be undone.')) return;
    setStatus('Deleting…');
    db.rpc('delete_my_data').then(function (res) {
      if (res.error) { setStatus('Deletion failed. Please try again, or contact us and we\'ll do it for you.'); return; }
      return db.auth.signOut().catch(function () {}).then(function () {
        state.user = null; state.joined = false;
        render();
        loadStats();
        toast('Deleted. Nothing from this browser remains in the open record.');
      });
    });
  }

  /* ------------------------------------------------------------ rendering */
  function render() {
    if (!panel) return;
    if (!state.joined) {
      panel.innerHTML =
        '<h2 class="sv-h" style="font-size:18px">Add your observations to the open record</h2>' +
        '<p class="sv-p">Each observation you complete above (which side is flowing, when, roughly where, and an optional check-in) ' +
        'joins a shared record that tests the Svarodaya rules against real breath. No name or email needed.</p>' +
        '<label class="rec-tick"><input type="checkbox" data-rec-adult> <span>I am 18 or older.</span></label>' +
        '<label class="rec-tick"><input type="checkbox" data-rec-agree> <span>I agree that my observations are stored and included in public ' +
        '<b>aggregate</b> statistics, as described in the <a href="privacy.html" target="_blank" rel="noopener">privacy notice</a>. ' +
        'I can download or delete everything at any time.</span></label>' +
        '<div class="sv-row" style="margin-top:14px"><button class="sv-btn primary" data-rec-join disabled>Join the open record</button></div>' +
        '<p class="sv-fine rec-status" data-rec-status aria-live="polite"></p>';
      var adult = $('[data-rec-adult]'), agree = $('[data-rec-agree]'), btn = $('[data-rec-join]');
      var sync = function () { btn.disabled = !(adult.checked && agree.checked); };
      adult.addEventListener('change', sync); agree.addEventListener('change', sync);
      btn.addEventListener('click', join);
      return;
    }
    panel.innerHTML =
      '<h2 class="sv-h" style="font-size:18px">You\'re contributing <span class="rec-ok">✓</span></h2>' +
      '<p class="sv-p">Each observation you complete is added to the open record. Your record is linked to this browser: ' +
      'clearing your browser data or using another device starts a new one.</p>' +
      '<h3 class="rec-sub">Your recent observations</h3>' +
      '<ul class="rec-history" data-rec-history><li class="rec-empty">Loading…</li></ul>' +
      '<div class="sv-row" style="margin-top:14px">' +
        '<button class="sv-btn quiet" data-rec-download>Download my data</button>' +
        '<button class="sv-btn quiet" data-rec-delete>Delete all my data</button>' +
      '</div>' +
      '<p class="sv-fine rec-status" data-rec-status aria-live="polite"></p>';
    $('[data-rec-download]').addEventListener('click', download);
    $('[data-rec-delete]').addEventListener('click', removeAll);
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
