/* ============================================================================
   svara-ui.js
   Presentation layer for the svara observation tool.
   Depends on svara-engine.js. All state is local; nothing is transmitted.
   ============================================================================ */

(function () {
  'use strict';

  var root = document.getElementById('svara');
  if (!root || !window.SvaraEngine) return;

  var E = window.SvaraEngine;

  /* --- state --------------------------------------------------------------- */

  var state = {
    step: 'observe',
    round: 1,               // 1 = first observation, 2 = after practice
    observed: null,
    firstObserved: null,
    lat: null,
    lon: null,
    manualTime: null,       // Date, if the user overrode the clock
    result: null,
    stream: null,
    timers: []
  };

  var LOG_KEY = 'nom.svara.log.v1';

  /* --- tiny helpers -------------------------------------------------------- */

  function $(sel, ctx) { return (ctx || root).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || root).querySelectorAll(sel)); }

  function clearTimers() {
    if (window.SvaraVoice) window.SvaraVoice.cancel();
    state.timers.forEach(clearTimeout);
    state.timers.forEach(clearInterval);
    state.timers = [];
  }
  function later(fn, ms) { var id = setTimeout(fn, ms); state.timers.push(id); return id; }
  function every(fn, ms) { var id = setInterval(fn, ms); state.timers.push(id); return id; }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function now() { return state.manualTime ? new Date(state.manualTime) : new Date(); }

  /** Not every environment implements it, and it is never essential. */
  function scrollTo(el, block) {
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: block || 'nearest' });
    }
  }

  function reduceMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* --- glyphs -------------------------------------------------------------- */

  var GLYPH = {
    moon: '<svg class="sv-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M20 14.2A8.4 8.4 0 1 1 10.4 4a6.6 6.6 0 0 0 9.6 10.2Z" ' +
          'stroke="#2E7FA8" stroke-width="1.6" stroke-linejoin="round"/></svg>',

    sun:  '<svg class="sv-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="4.4" stroke="#E4744F" stroke-width="1.6"/>' +
          '<g stroke="#E4744F" stroke-width="1.6" stroke-linecap="round">' +
          '<path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2"/>' +
          '<path d="M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/>' +
          '</g></svg>',

    both: '<svg class="sv-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="8.4" stroke="#C6A15B" stroke-width="1.6"/>' +
          '<path d="M12 3.6a8.4 8.4 0 0 1 0 16.8Z" fill="#C6A15B" opacity=".55"/></svg>'
  };

  /* --- step routing -------------------------------------------------------- */

  // opts.boot: the first render on page load. Focus stays where the visitor
  // is, and the settling timer waits until the tool is actually on screen.
  function go(step, opts) {
    var boot = opts && opts.boot;
    clearTimers();
    stopSeenWatch();
    state.step = step;
    $$('.sv-step').forEach(function (el) {
      el.classList.toggle('on', el.dataset.step === step);
    });
    showProgress(step);
    var panel = $('.sv-step.on');
    if (panel && !boot) {
      var h = panel.querySelector('.sv-h');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    if (step === 'observe') { if (boot) startWhenSeen(); else startObservation(); }
    if (step === 'practice') startPractice();
  }

  // Step 1-4 indicator above the panels. The correction step counts as part of
  // the result, since it always leads back to observing again.
  var PROGRESS = { observe: 0, report: 1, context: 2, result: 3, practice: 3 };
  function showProgress(step) {
    var at = PROGRESS[step];
    $$('[data-progress] li').forEach(function (li, i) {
      li.classList.toggle('done', i < at);
      if (i === at) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  /* ==========================================================================
     CAMERA
     Local only. No frame is read, stored, uploaded or analysed.
     ========================================================================== */

  var camBtn = $('[data-cam-toggle]');
  var camBox = $('.sv-cam');
  var video = $('.sv-cam video');

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { t.stop(); });
      state.stream = null;
    }
    if (video) video.srcObject = null;
    if (camBox) camBox.classList.remove('live');
    if (camBtn) {
      camBtn.textContent = 'Turn on camera';
      camBtn.setAttribute('aria-pressed', 'false');
    }
  }

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('[data-cam-note]').textContent =
        'This browser does not offer camera access. You can continue without it — ' +
        'the camera only helps you sit and look, it measures nothing.';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(function (s) {
        state.stream = s;
        video.srcObject = s;
        video.play();
        camBox.classList.add('live');
        camBtn.textContent = 'Turn off camera';
        camBtn.setAttribute('aria-pressed', 'true');
      })
      .catch(function () {
        $('[data-cam-note]').textContent =
          'No problem. You can continue without the camera — everything below ' +
          'works the same way.';
      });
  }

  if (camBtn) {
    camBtn.addEventListener('click', function () {
      if (state.stream) stopCamera(); else startCamera();
    });
  }

  window.addEventListener('pagehide', stopCamera);

  /* ==========================================================================
     OBSERVATION — breathing guide and a settling period
     ========================================================================== */

  var CUES = [
    'Sit comfortably and breathe normally.',
    'Bring your attention to the flow through your nostrils.',
    'Notice which nostril feels more open.'
  ];

  // What the voice says: warmer and more natural than the on-screen cues.
  var SPOKEN_CUES = [
    'Let’s begin. Sit comfortably, let your shoulders soften, and breathe normally through your nose.',
    'Bring your attention to the tip of your nose. Just notice the air moving in, and moving out.',
    'Now notice which side feels more open. Don’t change anything. Simply observe.',
    'Whenever you’re ready, tell me which side is flowing.'
  ];

  function startObservation() {
    var orb = $('[data-orb]');
    var cue = $('[data-cue]');
    var count = $('[data-count]');
    var next = $('[data-observe-done]');
    if (!orb) return;

    var seconds = 15;
    var i = 0;

    cue.textContent = CUES[0];
    sayLines(SPOKEN_CUES, { gap: 1800 });
    count.textContent = seconds + ' seconds — there is no rush, take longer if you like.';
    next.disabled = true;

    // Breathing rhythm for settling: 4 in, 6 out. Not a prescription.
    var wide = false;
    function swing() {
      wide = !wide;
      orb.classList.toggle('wide', wide);
      orb.querySelector('b').textContent = wide ? 'in' : 'out';
      later(swing, wide ? 4000 : 6000);
    }
    orb.querySelector('b').textContent = 'in';
    swing();

    every(function () {
      seconds--;
      if (seconds % 5 === 0 && i < CUES.length - 1) {
        i++; cue.textContent = CUES[i];
      }
      if (seconds > 0) {
        count.textContent = seconds + ' seconds — there is no rush, take longer if you like.';
      } else {
        count.textContent = 'Take as long as you need.';
        if (!next.disabled) { /* already announced */ } else {
          /* the spoken cues already end with this prompt */
        }
        next.disabled = false;
      }
    }, 1000);
  }

  // On page load the tool is usually below the fold. Starting the fifteen
  // seconds then meant they had run out before anyone scrolled down to sit.
  var seenWatch = null;
  function startWhenSeen() {
    var orb = $('[data-orb]');
    if (!orb || !('IntersectionObserver' in window)) { startObservation(); return; }
    seenWatch = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      stopSeenWatch();
      if (state.step === 'observe') startObservation();
    }, { threshold: 0.6 });
    seenWatch.observe(orb);
  }
  function stopSeenWatch() {
    if (seenWatch) { seenWatch.disconnect(); seenWatch = null; }
  }

  $$('[data-observe-done]').forEach(function (b) {
    b.addEventListener('click', function () { go('report'); });
  });

  /* ==========================================================================
     REPORT
     ========================================================================== */

  $$('.sv-choice').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.observed = btn.dataset.s;
      $$('.sv-choice').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      $('[data-report-done]').disabled = false;
    });
  });

  $('[data-report-done]').addEventListener('click', function () {
    if (!state.observed) return;
    if (state.round === 1) state.firstObserved = state.observed;
    go('context');
    fillContext();
  });

  /* ==========================================================================
     CONTEXT — date, time, location
     ========================================================================== */

  function pad(n) { return String(n).padStart(2, '0'); }

  /* --- period selector, verses 72 and 73-74 ------------------------------- */
  (function buildPeriods() {
    var sel = $('[data-f-period]');
    if (!sel) return;
    var opts = E.RULES.alternation.options;
    sel.innerHTML = opts.map(function (o) {
      return '<option value="' + o.minutes + '">' + o.label +
             '  [' + (E.GRADES[o.grade] || {}).key + ']</option>';
    }).join('');
    function note() {
      var o = opts.filter(function (x) { return x.minutes === +sel.value; })[0];
      $('[data-period-note]').textContent = o
        ? 'Verse ' + o.verse + ', graded ' + (E.GRADES[o.grade] || {}).key + '. ' + o.note
        : '';
      E.setPeriod(+sel.value);
    }
    sel.addEventListener('change', note);
    sel.value = String(E.RULES.alternation.periodMinutes);
    note();
  }());

  function fillContext() {
    var d = now();
    $('[data-f-date]').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    $('[data-f-time]').value = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('[data-f-tz]').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
    if (state.lat == null) {
      var saved = savedPlace();
      if (saved) {
        state.lat = saved.lat; state.lon = saved.lon;
        $('[data-f-city]').value = saved.city || '';
        $('[data-loc-note]').textContent = 'Using your place from last time. Change it any time.';
      }
    }
    updateLocField();
    placeReady();
  }

  function updateLocField() {
    var f = $('[data-f-loc]');
    f.value = (state.lat == null)
      ? ''
      : state.lat.toFixed(3) + ', ' + state.lon.toFixed(3);
  }

  /* --- where: a city, the browser's location, or typed coordinates.
     Remembered in this browser (to about 1 km), since the practice is daily. */
  var PLACE_KEY = 'svara-place';

  function savedPlace() {
    try {
      var v = JSON.parse(localStorage.getItem(PLACE_KEY));
      return v && typeof v.lat === 'number' && typeof v.lon === 'number' ? v : null;
    } catch (e) { return null; }
  }

  function rememberPlace(city) {
    try {
      localStorage.setItem(PLACE_KEY, JSON.stringify({
        lat: Math.round(state.lat * 100) / 100,
        lon: Math.round(state.lon * 100) / 100,
        city: city || ''
      }));
    } catch (e) {}
  }

  function forgetPlace() {
    try { localStorage.removeItem(PLACE_KEY); } catch (e) {}
  }

  // The assessment button waits for a place; the hint says why.
  function placeReady() {
    var ok = state.lat != null;
    $('[data-context-done]').disabled = !ok;
    $('[data-context-hint]').hidden = ok;
  }

  $('[data-f-city]').addEventListener('change', function () {
    if (!this.value) return;
    var m = this.value.split(',');
    state.lat = parseFloat(m[0]); state.lon = parseFloat(m[1]);
    updateLocField();
    placeReady();
    rememberPlace(this.value);
    $('[data-loc-note]').textContent = 'Set to ' + this.options[this.selectedIndex].text +
      '. Remembered in this browser for next time.';
  });

  $('[data-locate]').addEventListener('click', function () {
    var btn = this;
    var note = $('[data-loc-note]');
    if (!navigator.geolocation) {
      note.textContent = 'This browser cannot share a location. Choose the nearest city instead.';
      return;
    }
    btn.disabled = true;
    note.textContent = 'Asking your browser…';
    navigator.geolocation.getCurrentPosition(
      function (p) {
        state.lat = p.coords.latitude;
        state.lon = p.coords.longitude;
        updateLocField();
        placeReady();
        $('[data-f-city]').value = '';
        rememberPlace('');
        note.textContent = 'Location set, and remembered in this browser for next time.';
        btn.disabled = false;
      },
      function () {
        note.textContent = 'Location was not shared. Choose the nearest city instead, ' +
                           'or skip the comparison.';
        btn.disabled = false;
      },
      { timeout: 10000, maximumAge: 600000 }
    );
  });

  $('[data-f-loc]').addEventListener('input', function () {
    var m = this.value.split(',');
    var la = parseFloat(m[0]), lo = parseFloat(m[1]);
    if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
      state.lat = la; state.lon = lo;
      $('[data-f-city]').value = '';
      rememberPlace('');
      $('[data-loc-note]').textContent = 'Coordinates accepted.';
    } else {
      state.lat = state.lon = null;
      if (!this.value.trim()) forgetPlace();
    }
    placeReady();
  });

  $('[data-context-done]').addEventListener('click', function () {
    var dv = $('[data-f-date]').value, tv = $('[data-f-time]').value;
    var parsed = new Date(dv + 'T' + (tv || '00:00'));
    if (isNaN(parsed.getTime())) {
      $('[data-loc-note]').textContent = 'That date or time could not be read. Check the fields and try again.';
      return;
    }
    state.manualTime = parsed;
    runAssessment();
  });

  $('[data-context-skip]').addEventListener('click', function () {
    state.lat = state.lon = null;
    runAssessment();
  });

  /* ==========================================================================
     ASSESSMENT AND RESULT
     ========================================================================== */

  function runAssessment() {
    state.result = E.assess({
      date: now(),
      lat: state.lat,
      lon: state.lon,
      observedSvara: state.observed
    });
    renderResult(state.result);
    saveLog(state.result);
    go('result');
    // Let svara-record.js (the open record) know an observation was completed.
    try { window.dispatchEvent(new CustomEvent('svara:assessed', { detail: state.result })); } catch (e) {}
  }

  function svaraGlyph(s) { return s ? GLYPH[s.glyph] : ''; }

  function renderResult(r) {
    var box = $('[data-result]');
    var obs = r.observedSvara;
    var exp = r.expectedSvara;

    /* --- trail --- */
    $('[data-trail]').innerHTML = state.round === 1
      ? '<b class="now">Observation 1</b>'
      : '<b class="done">Observation 1</b> <span>→</span> ' +
        '<b class="done">Guided practice</b> <span>→</span> ' +
        '<b class="now">Observation 2</b>';

    /* --- headline --- */
    var head, pill, pillClass;
    if (r.alignment === 'aligned') {
      head = 'Your observed svara matches the traditional timing rule.';
      pill = 'Aligned'; pillClass = 'ok';
    } else if (r.alignment === 'misaligned') {
      head = 'Your observed svara does not match the selected traditional timing rule.';
      pill = 'Not aligned'; pillClass = 'off';
    } else if (r.alignment === 'sushumna') {
      head = 'You reported Sushumna — the turning state.';
      pill = 'Sushumna'; pillClass = 'neutral';
    } else {
      head = 'Your observation is recorded. The traditional comparison needs a location.';
      pill = 'No comparison'; pillClass = 'neutral';
    }

    var html = '';

    html += '<div class="sv-verdict"><h3>' + esc(head) + '</h3>' +
            '<span class="sv-pill ' + pillClass + '">' + esc(pill) + '</span></div>';

    /* --- second observation: what changed --- */
    if (state.round === 2 && state.firstObserved && obs) {
      var before = E.SVARAS[state.firstObserved];
      var changed = state.firstObserved !== obs.key;
      html += '<div class="sv-flag" style="border-left-color:' + obs.colour + '">' +
        'Before the practice you observed <strong>' + esc(before.name) + '</strong>. ' +
        'You now observe <strong>' + esc(obs.name) + '</strong>. ' +
        (r.alignment === 'aligned'
          ? 'Your self-observed svara now matches the traditional target.'
          : changed
            ? 'The side you report has changed, though it still differs from the ' +
              'traditional target.'
            : 'The side you report is unchanged.') +
        ' This is a record of what you observed, not evidence of a physiological ' +
        'change — nothing here measured your breath.' +
      '</div>';
    }

    /* --- one compact line; the detail lives in the Why panel --- */
    if (r.weakestGrade === 'EN') {
      html += '<p class="sv-note">Verse 65, which this comparison rests on, is ' +
        'graded <strong>E-negative</strong> — the evidence does not support a ' +
        'lunar effect on the nasal cycle. A disagreement below is the expected ' +
        'result, not a fault in you. <a href="#" data-open-why>Why?</a></p>';
    }

    /* --- flags --- */
    r.flags.forEach(function (f) {
      html += '<div class="sv-flag ' + (f.level === 'blocking' ? 'blocking' : '') + '">' +
              esc(f.text) + '</div>';
    });

    /* --- observed vs expected --- */
    html += '<div class="sv-pair">' +
      '<div class="sv-slot"><small>Your observation</small>' +
        (obs ? svaraGlyph(obs) : '') +
        '<strong>' + esc(obs ? obs.name : '—') + '</strong>' +
        '<em>' + esc(obs ? obs.luminary : '') + '</em></div>' +
      '<div class="sv-vs">compared with</div>' +
      '<div class="sv-slot"><small>Traditional expectation</small>' +
        (exp ? svaraGlyph(exp) : '') +
        '<strong>' + esc(exp ? exp.name : 'Not available') + '</strong>' +
        '<em>' + esc(exp ? exp.luminary : '') + '</em></div>' +
    '</div>';

    /* --- dial --- */
    if (exp && r.tattvaTimeline.length) {
      html += renderDial(r);
    }

    /* --- three kinds of statement --- */
    html += '<div class="sv-kinds">' +
      '<div class="sv-kind"><h3>Your observation</h3><p>' +
        esc(obs ? obs.label : 'Not reported') + ', as you reported it.</p></div>' +
      '<div class="sv-kind"><h3>Traditional expectation</h3><p>' +
        esc(exp ? exp.label : 'Not available') +
        (r.expectedTattva ? ', with ' + esc(r.expectedTattva.name) + ' tattva' : '') +
        ', from the rule set below.</p></div>' +
      '<div class="sv-kind void"><h3>Physiological measurement</h3><p>' +
        'None. Nothing on this page measures nasal airflow. That would need a ' +
        'bilateral flow sensor.</p></div>' +
    '</div>';

    /* --- why --- */
    html += '<details class="sv-why"><summary>Why am I seeing this?</summary>';
    html += '<ol>' + r.explanation.map(function (e) {
      return '<li>' + esc(e) + '</li>';
    }).join('') + '</ol>';

    html += '<h3 class="sv-subhead">The rules this result was built from</h3>';

    html += r.provenance.map(function (p) {
      return '<div class="sv-rule"><header>' +
        '<h3>' + esc(p.title) + '</h3>' + gradeBadge(p.grade) +
        '</header>' +
        (p.sanskrit ? '<p class="sv-sans">' + esc(p.sanskrit) + '</p>' : '') +
        (p.translation ? '<p class="sv-trans">' + esc(p.translation) + '</p>' : '') +
        '<p>' + esc(p.detail) + '</p>' +
        (p.commentary ? '<div class="warn">' + esc(p.commentary) + '</div>' : '') +
        '<p class="sv-src" style="margin-top:8px">' + verseRef(p.verse) + ' · ' +
        esc(p.source) + '</p></div>';
    }).join('');

    /* rules the text states that this tool refuses to act on */
    if (r.notApplied && r.notApplied.length) {
      html += '<h3 class="sv-subhead">What the text also says, and why this tool ' +
              'does not act on it</h3>';
      html += r.notApplied.map(function (n) {
        return '<div class="sv-rule off"><header>' +
          '<h3>' + esc(n.section) + '</h3>' + gradeBadge(n.grade) +
          '<span class="sv-pill neutral">Not applied</span>' +
          '</header>' +
          (n.translation ? '<p class="sv-trans">' + esc(n.translation) + '</p>' : '') +
          '<div class="warn">' + esc(n.reason) + '</div>' +
          '<p class="sv-src" style="margin-top:8px">' + verseRef(n.verse) + '</p>' +
          '</div>';
      }).join('');
    }

    /* the recension disagreeing with itself */
    if (r.contradictions && r.contradictions.length) {
      html += '<h3 class="sv-subhead">Where the text disagrees with itself</h3>';
      html += r.contradictions.map(function (c) {
        return '<div class="sv-rule"><header><h3>' + esc(c.title) + '</h3></header>' +
          '<p>' + esc(c.detail) + '</p>' +
          '<div class="warn">' + esc(c.resolution) + '</div></div>';
      }).join('');
    }

    html += '<p class="sv-fine" style="margin-top:14px">' +
      'Sunrise ' + esc(E.formatTime(r.context.sunrise)) +
      ' · lunar day ' + esc(r.context.tithi.displayName) +
      ', ' + esc(r.context.tithi.paksha === 'shukla' ? 'Shukla' : 'Krishna') + ' Paksha' +
      ' · ' + esc(r.context.weekday) +
      ' · ' + esc(r.context.timezone) + '</p>';

    html += '</details>';

    box.innerHTML = html;

    /* --- what to do next --- */
    var actions = $('[data-result-actions]');
    if (r.alignment === 'misaligned') {
      actions.innerHTML =
        '<button class="sv-btn primary" data-begin-practice>Begin guided adjustment</button>' +
        '<button class="sv-btn quiet" data-restart>Observe again</button>';
    } else {
      actions.innerHTML =
        '<button class="sv-btn quiet" data-restart>Observe again</button>';
    }
    // Spoken verdict: what you found, what the rule expected, what follows.
    if (obs) {
      var spoken = [];
      if (r.alignment === 'aligned') {
        spoken.push('You observed ' + obs.name + ', and the rule expected ' +
                    obs.name + '. They agree.');
      } else if (r.alignment === 'misaligned') {
        spoken.push('You observed ' + obs.name + '. The rule expected ' +
                    exp.name + '. They disagree.');
      } else if (r.alignment === 'sushumna') {
        spoken.push('You reported Sushumna, the changeover. That is recorded ' +
                    'rather than scored.');
      }
      if (r.expectedTattva) {
        spoken.push('The expected phase is ' + r.expectedTattva.name + ', ' +
                    r.expectedTattva.english + '.');
      }
      if (r.alignment === 'misaligned') {
        spoken.push('If you want to shift toward ' + exp.name +
                    ', choose a method below.');
      }
      sayLines(spoken, { gap: 500 });
    }

    var openWhy = $('[data-open-why]');
    if (openWhy) {
      openWhy.addEventListener('click', function (ev) {
        ev.preventDefault();
        var d = $('.sv-step.on .sv-why');
        if (d) { d.open = true; scrollTo(d); }
      });
    }

    bindActions();
  }

  var GRADE_CLASS = { E: 'g-e', S: 'g-s', X: 'g-x', EN: 'g-en' };

  function gradeBadge(g) {
    var meta = E.GRADES[g] || { key: g, label: g };
    return '<span class="sv-grade ' + (GRADE_CLASS[g] || '') + '" title="' +
      esc(meta.note || '') + '">' + esc(meta.key) + ' · ' + esc(meta.label) +
      '</span>';
  }

  function verseRef(v) {
    return v ? 'Verse ' + esc(String(v)) : 'verse not given';
  }

  // Corpus entries that are not verses: the introduction, the conclusion and
  // the cautions appendix carry ids like INTRO-nasal, CONCL-works, APPX-cautions.
  function isVerseRec(rec) { return /^\d/.test(String(rec.v || '')); }
  function sourceLabel(rec) {
    var v = String(rec.v || '');
    if (v.indexOf('CONCL') === 0) return 'Conclusion';
    if (v.indexOf('APPX') === 0) return 'Appendix A';
    return isVerseRec(rec) ? verseRef(rec.v) : 'Introduction';
  }

  /* --- the dial ------------------------------------------------------------ */

  function renderDial(r) {
    var size = 300, c = size / 2, rOuter = 116, rInner = 84;
    var total = r.periodMinutes;
    var segs = '';
    var legend = '';

    r.tattvaTimeline.forEach(function (seg) {
      var a0 = (seg.from / total) * 360 - 90;
      var a1 = (seg.to / total) * 360 - 90;
      segs += arc(c, c, rInner, rOuter, a0, a1,
                  seg.tattva.colour, seg.active ? 0.92 : 0.22);
      legend += '<span class="' + (seg.active ? 'now' : '') + '">' +
                '<i style="background:' + seg.tattva.colour + '"></i>' +
                esc(seg.tattva.name) + ' · ' + esc(seg.tattva.english) + '</span>';
    });

    var handAngle = (r.minutesIntoSvara / total) * 360;
    var mins = Math.max(0, Math.round(r.tattvaCurrent.minutesRemaining || 0));

    return '<div style="margin-bottom:6px">' +
      '<svg class="sv-dial" viewBox="0 0 ' + size + ' ' + size + '" role="img" ' +
      'aria-label="Expected tattva now: ' + esc(r.expectedTattva.name) + '">' +
      segs +
      '<g class="hand" style="transform:rotate(' + handAngle + 'deg);transform-origin:' + c + 'px ' + c + 'px">' +
        '<line x1="' + c + '" y1="' + (c - rOuter - 8) + '" x2="' + c + '" y2="' + (c - rInner + 6) + '" ' +
        'stroke="#17231F" stroke-width="2.4" stroke-linecap="round"/>' +
      '</g>' +
      '<text x="' + c + '" y="' + (c - 8) + '" text-anchor="middle" ' +
        'font-size="15" fill="#5E6F68">Tattva now</text>' +
      '<text x="' + c + '" y="' + (c + 18) + '" text-anchor="middle" ' +
        'font-size="24" font-weight="600" fill="#17231F">' + esc(r.expectedTattva.name) + '</text>' +
      '<text x="' + c + '" y="' + (c + 40) + '" text-anchor="middle" ' +
        'font-size="13" fill="#5E6F68">' + mins + ' min remaining</text>' +
      '</svg>' +
      '<div class="sv-legend">' + legend + '</div>' +
      '<p class="sv-fine" style="text-align:center;margin-top:10px">' +
        'Order from verse 71, twelve-minute segments from verse 72. The source ' +
        'grades a rigid equal-duration substructure inside an irregular parent ' +
        'cycle as speculative — treat these as a vocabulary for breath quality, ' +
        'not five real states.' +
      '</p></div>';
  }

  /** Annular sector path. */
  function arc(cx, cy, r1, r2, a0, a1, fill, opacity) {
    var d = Math.PI / 180;
    var x1 = cx + r2 * Math.cos(a0 * d), y1 = cy + r2 * Math.sin(a0 * d);
    var x2 = cx + r2 * Math.cos(a1 * d), y2 = cy + r2 * Math.sin(a1 * d);
    var x3 = cx + r1 * Math.cos(a1 * d), y3 = cy + r1 * Math.sin(a1 * d);
    var x4 = cx + r1 * Math.cos(a0 * d), y4 = cy + r1 * Math.sin(a0 * d);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return '<path d="M' + x1 + ' ' + y1 +
           ' A' + r2 + ' ' + r2 + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 +
           ' L' + x3 + ' ' + y3 +
           ' A' + r1 + ' ' + r1 + ' 0 ' + large + ' 0 ' + x4 + ' ' + y4 +
           ' Z" fill="' + fill + '" opacity="' + opacity + '"/>';
  }

  /* ==========================================================================
     GUIDED PRACTICE
     ========================================================================== */

  function bindActions() {
    var begin = $('[data-begin-practice]');
    if (begin) begin.addEventListener('click', function () { go('practice'); });

    var restart = $('[data-restart]');
    if (restart) restart.addEventListener('click', function () {
      state.round = 1;
      state.observed = null;
      state.firstObserved = null;
      state.manualTime = null;
      resetChoices();
      go('observe');
    });

  }

  // This button is static markup, so it is bound once. Binding it inside
  // bindActions() would stack a new listener on every render.
  $('[data-practice-done]').addEventListener('click', function () {
    // Tell the open record which practice (if any) came before this re-observation.
    try { window.dispatchEvent(new CustomEvent('svara:practice-done', { detail: { practice: state.practiced || null } })); } catch (e) {}
    state.practiced = null;
    state.round = 2;
    state.observed = null;
    state.manualTime = null;
    resetChoices();
    go('observe');
  });

  function resetChoices() {
    $$('.sv-choice').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    $('[data-report-done]').disabled = true;
  }

  var chosenMethod = null;

  function startPractice() {
    var r = state.result;
    if (!r || !r.correctivePractice) { go('result'); return; }
    var pr = r.correctivePractice;
    var target = r.expectedSvara;
    chosenMethod = null;

    $('[data-practice-body]').innerHTML =
      '<div class="sv-target" style="border:1.5px solid ' + target.colour + '33">' +
        '<small>Target channel</small>' + svaraGlyph(target) +
        '<strong style="color:' + target.colour + '">' + esc(target.label) + '</strong>' +
      '</div>' +
      '<p class="sv-p">Verses 66 and 67 hold that dominance is not merely ' +
        'readable but steerable, and the source agrees — this is one of the ' +
        'better-established propositions in the text. Pick a method. To open ' +
        'one nostril you work on the opposite side.</p>' +
      '<p class="sv-sans" style="text-align:center">' + esc(pr.sanskrit) + '</p>' +
      '<div class="sv-methods">' + pr.methods.map(function (m, i) {
        return '<button class="sv-method" data-method="' + i + '" aria-pressed="false">' +
          '<header><b>' + esc(m.name) + '</b>' + gradeBadge(m.grade) + '</header>' +
          '<span class="sv-min">' + m.minutes + ' min · ' + verseRef(m.verse) + '</span>' +
          '<ol>' + m.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
          '<p class="sv-mnote">' + esc(m.note) + '</p>' +
        '</button>';
      }).join('') + '</div>';

    $$('.sv-method').forEach(function (b) {
      b.addEventListener('click', function () {
        chosenMethod = pr.methods[+b.dataset.method];
        $$('.sv-method').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        $('[data-p-run]').disabled = false;
        $('[data-p-count]').textContent =
          chosenMethod.name + ' — ' + chosenMethod.minutes + ' minutes. Start when ready.';
      });
    });

    $('[data-practice-done]').disabled = false;   // never trap the reader here
    $('[data-p-run]').disabled = true;

    var orb = $('[data-p-orb]');
    var cue = $('[data-p-cue]');
    var prog = $('[data-p-count]');
    var runBtn = $('[data-p-run]');

    orb.querySelector('b').textContent = '—';
    orb.querySelector('i').style.background = target.colour;
    cue.textContent = 'Breathe at your own natural rate. The circle is a timer, ' +
                      'not a pace to follow.';
    prog.textContent = 'Choose a method above.';

    $$('.sv-method').forEach(function (b) {
      b.addEventListener('click', function () {
        var m = pr.methods[+b.dataset.method];
        say(m.name + '. ' + m.steps.join(' ') + ' About ' + m.minutes +
            ' minutes. Press start when you are set.');
      });
    });

    runBtn.onclick = function () {
      if (!chosenMethod) return;
      state.practiced = chosenMethod.name;
      // Full-screen guided practice: written steps, voice, subtitles, camera mirror.
      if (window.SvaraPracticeView) {
        hush();
        window.SvaraPracticeView.open({
          method: chosenMethod,
          target: target,
          onObserveAgain: function () { $('[data-practice-done]').click(); }
        });
        return;
      }
      runBtn.disabled = true;
      var left = chosenMethod.minutes * 60;
      var wide = false;
      var spokenHalf = false, spokenLast = false;

      sayLines(['Starting.'].concat(chosenMethod.steps), { gap: 500 });

      // Ambient pulse only — deliberately slower than anyone would breathe,
      // so it cannot be mistaken for a pacing instruction.
      if (!reduceMotion()) {
        (function pulse() {
          wide = !wide;
          orb.classList.toggle('wide', wide);
          later(pulse, 7000);
        }());
      }

      every(function () {
        left--;
        var m = Math.floor(left / 60), sec = left % 60;
        orb.querySelector('b').textContent = m + ':' + String(sec).padStart(2, '0');
        prog.textContent = chosenMethod.name + ' — ' + (m ? m + ' min ' : '') +
                           sec + ' s remaining';

        var total = chosenMethod.minutes * 60;
        if (!spokenHalf && left === Math.floor(total / 2) && total > 120) {
          spokenHalf = true; say('Halfway. Keep the breath easy.');
        }
        if (!spokenLast && left === 15) {
          spokenLast = true; say('Fifteen seconds.');
        }

        if (left <= 0) {
          clearTimers();
          orb.classList.remove('wide');
          orb.querySelector('b').textContent = 'done';
          cue.textContent = 'Now observe your breath again.';
          prog.textContent = 'Finished. Check which side is flowing before you decide it worked.';
          runBtn.disabled = false;
          say('Finished. Now check which side is flowing, before you decide ' +
              'whether it worked.');
        }
      }, 1000);
    };
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function field(label, type, key, val, min, max) {
    return '<div class="sv-field"><label for="sv-' + key + '">' + esc(label) + '</label>' +
      '<input id="sv-' + key + '" data-f-' + key + ' type="' + type + '" value="' + val +
      '" min="' + min + '" max="' + max + '"></div>';
  }

  /* ==========================================================================
     LOG — localStorage only, never transmitted
     ========================================================================== */

  function readLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; }
    catch (e) { return []; }
  }

  // Every completed observation is kept on this device so the "last two
  // weeks" panel can show a pattern and a streak. Nothing here is sent anywhere.
  function saveLog(r) {
    if (!r.observedSvara) { renderLog(); return; }   // skipped the report: nothing observed
    var entries = readLog();
    entries.unshift({
      t: (r.context.date || new Date()).toISOString(),
      obs: r.observedSvara.key,
      exp: r.expectedSvara ? r.expectedSvara.key : null,
      tat: r.expectedTattva ? r.expectedTattva.key : null,
      align: r.alignment
    });
    try { localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, 400))); }
    catch (e) { /* storage full or blocked; the tool still works */ }
    renderLog();
  }

  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  var SIDE_WORD = { ida: 'left', pingala: 'right', sushumna: 'both' };

  function renderLog() {
    var box = $('[data-mornings]');
    if (!box) return;
    var entries = readLog().filter(function (e) { return e && e.obs && SIDE_WORD[e.obs]; });

    // The first check of each day is the one that counts (verse 149: at waking).
    var first = {};
    entries.forEach(function (e) {
      var d = new Date(e.t);
      if (isNaN(d)) return;
      var k = dayKey(d);
      if (!first[k] || new Date(first[k].t) > d) first[k] = e;
    });

    var today = new Date(); today.setHours(12, 0, 0, 0);
    var days = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(today); d.setDate(today.getDate() - i);
      days.push({ date: d, e: first[dayKey(d)] || null });
    }

    // Streak: consecutive days with a check, counting back from today (or from
    // yesterday, so an unchecked morning doesn't read as a broken streak).
    var streak = 0, cursor = new Date(today);
    if (!first[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (first[dayKey(cursor)]) { streak++; cursor.setDate(cursor.getDate() - 1); }
    var checkedToday = !!first[dayKey(today)];
    var inWindow = days.filter(function (x) { return x.e; }).length;

    var msg;
    if (!entries.length) msg = 'Nothing yet. Finish a check and it appears here, one dot a day.';
    else if (checkedToday) msg = streak > 1 ? '<b>' + streak + ' days in a row.</b> Today is done.' : '<b>Today is done.</b> Check again tomorrow to start a run.';
    else if (streak) msg = 'Not checked today yet. <b>' + streak + (streak > 1 ? ' days' : ' day') + ' in a row</b> so far.';
    else msg = 'Not checked today yet. ' + inWindow + ' of the last 14 days recorded.';

    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    $('[data-mornings-status]', box).innerHTML = msg;
    $('[data-mornings-days]', box).innerHTML = days.map(function (x) {
      var label = DOW[x.date.getDay()] + ' ' + x.date.getDate() + ' ' + MON[x.date.getMonth()] + ': ';
      var e = x.e;
      var when = e ? new Date(e.t) : null;
      label += e ? SIDE_WORD[e.obs] + ' side, at ' + pad(when.getHours()) + ':' + pad(when.getMinutes()) : 'no check';
      return '<li class="sv-day ' + (e ? 'is-' + e.obs : 'is-none') + '" title="' + esc(label) + '">' +
        '<span class="sv-dot" aria-hidden="true"></span>' +
        '<span class="sv-vh">' + esc(label) + '</span>' +
        '<span class="sv-dow" aria-hidden="true">' + DOW[x.date.getDay()].charAt(0) + '</span></li>';
    }).join('');
    var clear = $('[data-log-clear]', box);
    if (clear) clear.hidden = !entries.length;
  }

  if ($('[data-log-clear]')) $('[data-log-clear]').addEventListener('click', function () {
    if (!window.confirm('Clear the checks saved on this device? This cannot be undone.')) return;
    try { localStorage.removeItem(LOG_KEY); } catch (e) {}
    renderLog();
  });
  renderLog();

  /* ==========================================================================
     MODE SWITCH
     ========================================================================== */

  $$('.sv-mode').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled) return;
      $$('.sv-mode').forEach(function (x) {
        x.setAttribute('aria-selected', String(x === b));
      });
      E.sourceMode = b.dataset.mode;
    });
  });

  /* ==========================================================================
     BOOT
     ========================================================================== */

  /* ==========================================================================
     TABS
     ========================================================================== */

  $$('.sv-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      $$('.sv-tab').forEach(function (x) {
        x.setAttribute('aria-selected', String(x === t));
      });
      $$('.sv-pane').forEach(function (p) {
        p.classList.toggle('on', p.dataset.pane === t.dataset.tab);
      });
      hush();
      if (t.dataset.tab !== 'observe') stopCamera();
      if (t.dataset.tab === 'tattva') buildTattvaForm();
      if (t.dataset.tab === 'practice') renderPranayama('all');
    });
  });

  // Deep links from other pages: swar-yoga.html#practice, #tattva, #ask
  function openTabFromHash() {
    var want = window.location.hash.slice(1);
    var tab = want && document.querySelector('.sv-tab[data-tab="' + want + '"]');
    if (!tab) return;
    tab.click();
    var tool = document.getElementById('svara');
    if (tool) tool.scrollIntoView();
  }
  window.addEventListener('hashchange', openTabFromHash);

  /* ==========================================================================
     TATTVA — the eightfold scheme, verses 145-147
     ========================================================================== */

  var K = window.SvaraKnowledge;
  var TATTVA_KEYS = ['vayu', 'agni', 'prithvi', 'jala', 'akasha'];

  function buildTattvaForm() {
    var box = $('[data-tattva-form]');
    if (!K || box.dataset.built) return;
    box.dataset.built = '1';

    function group(dims, heading, blurb, cls) {
      return '<div class="sv-dimgroup ' + cls + '">' +
        '<h3 class="sv-subhead">' + esc(heading) + '</h3>' +
        '<p class="sv-fine" style="margin-bottom:14px">' + esc(blurb) + '</p>' +
        dims.map(dimField).join('') + '</div>';
    }

    box.innerHTML =
      group(K.TATTVA_SIGNS.verifiable,
            'What you can measure',
            'These decide the answer. Do as many as you can — one is enough to ' +
            'get a reading, three make it worth something.', 'measured') +
      group(K.TATTVA_SIGNS.reported,
            'What you can only report',
            'Recorded alongside, never scored. If these turn out to track the ' +
            'measured ones over time, that is a finding worth having. If they ' +
            'do not, that is a more important one.', 'reported');
  }

  function dimField(d) {
    var id = 'sv-dim-' + d.key;
    var input;

    if (d.key === 'reach') {
      input = '<input id="' + id + '" data-dim="' + d.key + '" type="number" ' +
              'min="1" max="24" step="1" placeholder="finger-breadths">';
    } else {
      var opts = TATTVA_KEYS.filter(function (k) { return d.values[k] != null; })
        .map(function (k) {
          return '<option value="' + k + '">' + esc(String(d.values[k])) + '</option>';
        }).join('');
      input = '<select id="' + id + '" data-dim="' + d.key + '">' +
              '<option value="">— not observed —</option>' + opts + '</select>';
    }

    return '<div class="sv-dim">' +
      '<header><label for="' + id + '">' + esc(d.name) + '</label>' +
        gradeBadge(d.grade) + '<span class="sv-src">' + verseRef(d.verse) + '</span>' +
      '</header>' +
      '<p class="sv-how">' + esc(d.how) + '</p>' +
      (d.sanskrit ? '<p class="sv-sans">' + esc(d.sanskrit) + '</p>' : '') +
      '<div class="sv-field">' + input + '</div>' +
      '<details class="sv-mini"><summary>What this is actually measuring</summary>' +
        '<p>' + esc(d.why) + '</p>' +
        (d.caution ? '<p class="sv-cautiontext">' + esc(d.caution) + '</p>' : '') +
        (d.safety ? '<p class="sv-cautiontext">' + esc(d.safety) + '</p>' : '') +
      '</details></div>';
  }

  function readTattvaAnswers() {
    var a = {};
    $$('[data-dim]').forEach(function (el) {
      if (el.value !== '') a[el.dataset.dim] = el.value;
    });
    return a;
  }

  var tattvaBtn = $('[data-tattva-run]');
  if (tattvaBtn) tattvaBtn.addEventListener('click', function () {
    var res = K.scoreTattva(readTattvaAnswers());
    var box = $('[data-tattva-result]');

    if (!res.best) {
      box.innerHTML = '<div class="sv-flag">' + esc(res.note ||
        'Nothing matched. Measure the reach of your exhalation or check the ' +
        'direction of the jet — those are the dimensions that count.') + '</div>';
      return;
    }

    var t = E.TATTVAS[res.best.key];
    var html = '<div class="sv-tresult" style="border-color:' + t.colour + '55">' +
      '<small>Indicated phase</small>' +
      '<strong style="color:' + t.colour + '">' + esc(t.name) + ' · ' + esc(t.english) + '</strong>' +
      '<span class="sv-sans">' + esc(t.sanskrit) + '</span>' +
      '<p class="sv-fine">On ' + res.best.score + ' of ' + res.measuredAnswered +
      ' measured dimension' + (res.measuredAnswered === 1 ? '' : 's') + '.</p>' +
    '</div>';

    if (res.tie) {
      html += '<div class="sv-flag">Two phases score equally on what you ' +
              'measured. Add another measured dimension to separate them rather ' +
              'than letting the reported ones break the tie.</div>';
    }

    html += '<h3 class="sv-subhead">What supported it</h3><ul class="sv-support">';
    res.ranked.forEach(function (r) {
      if (!r.support.length) return;
      html += '<li><b>' + esc(E.TATTVAS[r.key].name) + '</b> — ' +
        r.support.map(function (sup) {
          return esc(sup.dimension) + ' <span class="sv-src">(' +
            (sup.verifiable ? 'measured' : 'reported, not scored') + ', ' +
            verseRef(sup.verse).toLowerCase() + ')</span>';
        }).join('; ') + '</li>';
    });
    html += '</ul>';

    html += '<p class="sv-fine">The tattva scheme is graded X — speculative. ' +
      'The source treats the five phases as a vocabulary for describing breath ' +
      'quality rather than as five states shown to exist. Use it to notice ' +
      'things about your breath you would otherwise skip past.</p>';

    box.innerHTML = html;
    scrollTo(box);
  });

  var tattvaReset = $('[data-tattva-reset]');
  if (tattvaReset) tattvaReset.addEventListener('click', function () {
    $$('[data-dim]').forEach(function (el) { el.value = ''; });
    $('[data-tattva-result]').innerHTML = '';
  });

  /* ==========================================================================
     PRANAYAMA LIBRARY
     ========================================================================== */

  function renderPranayama(purpose) {
    var list = $('[data-pranayama-list]');
    if (!K) return;
    var items = purpose === 'all'
      ? K.PRANAYAMA
      : K.PRANAYAMA.filter(function (p) { return p.purpose === purpose; });

    list.innerHTML = items.map(function (p, i) {
      return '<div class="sv-prac">' +
        '<header><b>' + esc(p.name) + '</b>' + gradeBadge(p.grade) +
          '<span class="sv-src">' + verseRef(p.verse) + ' · ' + p.minutes + ' min</span>' +
        '</header>' +
        '<p class="sv-sans">' + esc(p.sanskrit) + '</p>' +
        '<p class="sv-effect">' + esc(p.effect) + '</p>' +
        '<ol>' + p.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
        (p.safety ? '<div class="warn">' + esc(p.safety) + '</div>' : '') +
        '<details class="sv-mini"><summary>What the evidence says</summary><p>' +
          esc(p.note) + '</p></details>' +
        '<div class="sv-row" style="margin-top:12px">' +
          '<button class="sv-btn quiet" data-run-prac="' + esc(p.id) + '">Guide me through it</button>' +
        '</div>' +
      '</div>';
    }).join('');

    $$('[data-run-prac]').forEach(function (b) {
      b.addEventListener('click', function () { openRunner(b.dataset.runPrac, b); });
    });

    var rn = $('[data-retention-note]');
    if (rn && !rn.dataset.built) {
      rn.dataset.built = '1';
      rn.innerHTML = '<p class="sv-p">' + esc(K.RETENTION_NOTE.body) + '</p>' +
        '<p class="sv-fine">' + gradeBadge(K.RETENTION_NOTE.grade) + '</p>';
    }
  }

  $$('.sv-filter').forEach(function (f) {
    f.addEventListener('click', function () {
      $$('.sv-filter').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === f));
      });
      renderPranayama(f.dataset.purpose);
    });
  });

  /* --- the runner: a timer, with an optional pacer where the text warrants it */

  // The runner sits below the whole list; remember which practice opened it
  // so Close can take the visitor back there.
  var runnerOpener = null;

  function openRunner(id, opener) {
    var p = K.PRANAYAMA.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    clearTimers();
    runnerOpener = opener || null;

    var box = $('[data-runner]');
    box.hidden = false;
    $('[data-runner-title]').textContent = p.name;
    $('[data-runner-body]').innerHTML =
      '<p class="sv-effect">' + esc(p.effect) + '</p>' +
      '<ol class="sv-steps">' + p.steps.map(function (x) {
        return '<li>' + esc(x) + '</li>';
      }).join('') + '</ol>' +
      (p.safety ? '<div class="warn">' + esc(p.safety) + '</div>' : '');

    var orb = $('[data-r-orb]');
    var cue = $('[data-r-cue]');
    var cnt = $('[data-r-count]');
    orb.querySelector('b').textContent = '—';
    cue.textContent = p.pacer
      ? 'The circle paces the breath. Follow it only as far as is comfortable.'
      : 'Breathe at your own natural rate. The circle is a timer, not a pace.';
    cnt.textContent = p.minutes + ' minutes. Start when you are settled.';
    scrollTo(box, 'start');

    $('[data-r-run]').onclick = function () {
      clearTimers();
      var left = p.minutes * 60;
      var wide = false;
      var half = false, last = false;

      // Read the steps aloud, then let the pacer take over.
      sayLines(['Starting ' + p.name + '.'].concat(p.steps), { gap: 500 });

      if (!reduceMotion()) {
        (function swing() {
          wide = !wide;
          orb.classList.toggle('wide', wide);
          if (p.pacer) {
            cue.textContent = wide ? 'Breathe in' : 'Breathe out, longer';
            // Only once the spoken steps have finished, so cues don't collide.
            if (left < p.minutes * 60 - 12) {
              say(wide ? 'In' : 'Out', { rate: 0.95 });
            }
          }
          later(swing, (p.pacer ? (wide ? p.inhale : p.exhale) : 7) * 1000);
        }());
      }

      every(function () {
        left--;
        var m = Math.floor(left / 60), sec = left % 60;
        orb.querySelector('b').textContent = m + ':' + String(sec).padStart(2, '0');
        cnt.textContent = p.name + ' — ' + (m ? m + ' min ' : '') + sec + ' s left';

        var total = p.minutes * 60;
        if (!half && left === Math.floor(total / 2) && total > 120 && !p.pacer) {
          half = true; say('Halfway.');
        }
        if (!last && left === 15 && !p.pacer) { last = true; say('Fifteen seconds.'); }

        if (left <= 0) {
          clearTimers();
          orb.classList.remove('wide');
          orb.querySelector('b').textContent = 'done';
          cue.textContent = 'Finished. Check which side is flowing before you decide it worked.';
          cnt.textContent = '';
          say('Finished. Check which side is flowing before you decide whether ' +
              'it worked.');
        }
      }, 1000);
    };
  }

  var rStop = $('[data-r-stop]');
  if (rStop) rStop.addEventListener('click', function () {
    clearTimers();
    hush();
    $('[data-runner]').hidden = true;
    if (runnerOpener && document.body.contains(runnerOpener)) {
      scrollTo(runnerOpener, 'center');
      runnerOpener.focus({ preventScroll: true });
    }
  });

  /* ==========================================================================
     ASK THE TEXT
     ========================================================================== */

  var SUGGESTS = [
    'What actually works?',
    'How do I switch which nostril is flowing?',
    'Is breath retention safe?',
    'What is sushumna?',
    'What did the text get wrong?',
    'What does the text say about sleep?'
  ];

  var suggestBox = $('[data-ask-suggests]');
  if (suggestBox) {
    suggestBox.innerHTML = SUGGESTS.map(function (q) {
      return '<button class="sv-sugg">' + esc(q) + '</button>';
    }).join('');
    $$('.sv-sugg', suggestBox).forEach(function (b) {
      b.addEventListener('click', function () {
        $('[data-ask-input]').value = b.textContent;
        ask();
      });
    });
  }

  var corpusLoading = false;

  function loadCorpus(cb) {
    if (K.isCorpusLoaded()) return cb();
    if (corpusLoading) return;
    corpusLoading = true;
    var sc = document.createElement('script');
    sc.src = 'svara-corpus.js';
    sc.onload = function () { corpusLoading = false; cb(); };
    sc.onerror = function () {
      corpusLoading = false;
      $('[data-ask-result]').innerHTML =
        '<div class="sv-flag blocking">The commentary could not be loaded, so ' +
        'there is nothing to search. Check your connection and try again.</div>';
    };
    document.head.appendChild(sc);
  }

  function ask() {
    var q = $('[data-ask-input]').value.trim();
    var out = $('[data-ask-result]');
    if (!q) return;

    out.innerHTML = '<p class="sv-fine">Searching the commentary…</p>';

    loadCorpus(function () {
      var hits = K.search(q, 4);

      if (!hits || !hits.length) {
        out.innerHTML = '<div class="sv-flag">Nothing in the text addresses ' +
          'that. The Svarodaya covers nasal dominance, its timing, the five ' +
          'phases, the states it assigns to them, and a large body of ' +
          'prognostic material — but it is not a general reference, and a ' +
          'made-up answer would be worse than none.</div>';
        return;
      }

      var lead = hits[0];
      var rest = hits.slice(1);

      // Introduction, conclusion and appendix sections have no verse; their `f`
      // is just the opening of the same prose, so offering to "read the verse"
      // would repeat the answer.
      var isVerse = isVerseRec(lead.rec);

      var answer = K.summarise(lead.rec, lead.matched, 3);
      var practice = lead.rec.m ? K.bestPassage(lead.rec.m, lead.matched, 2) : '';
      var verse = isVerse ? K.clean(lead.rec.f) : '';

      var html = '<div class="sv-lead">';

      html += '<p class="sv-answer-text">' + esc(answer) + '</p>';

      // Where it came from, stated once and quietly.
      html += '<p class="sv-from">' + esc(lead.rec.t) +
        ' · ' + sourceLabel(lead.rec) + '</p>';

      // If the practical section is where the answer already came from, the
      // block would just repeat it back.
      var overlaps = practice && answer &&
        (answer.indexOf(practice.slice(0, 60)) > -1 ||
         practice.indexOf(answer.slice(0, 60)) > -1);

      if (practice && !overlaps) {
        html += '<div class="sv-inpractice"><h3>What to actually do</h3><p>' +
                esc(practice) + '</p></div>';
      }

      if (verse) {
        html += '<details class="sv-mini"><summary>Read the verse itself</summary>' +
          (lead.rec.i ? '<p class="sv-sans">' + esc(lead.rec.i) + '</p>' : '') +
          '<p class="sv-trans">' + esc(verse) + '</p></details>';
      }

      if ((lead.rec.g || []).length) {
        html += '<div class="sv-gradeline"><span>Evidence in this section:</span>' +
          lead.rec.g.map(function (g) {
            return gradeBadge(g === 'E, negative' ? 'EN' : g);
          }).join('') + '</div>';
      }

      html += '</div>';

      // Everything else collapsed to one line each, opened on demand.
      if (rest.length) {
        html += '<h3 class="sv-subhead">Related passages</h3><div class="sv-more">' +
          rest.map(function (h, i) {
            return '<details class="sv-alt"><summary>' +
              '<b>' + esc(h.rec.t) + '</b>' +
              '<span class="sv-src">' + sourceLabel(h.rec) + '</span>' +
              '</summary>' +
              '<p>' + esc(K.summarise(h.rec, h.matched, 3)) + '</p>' +
              (isVerseRec(h.rec) && h.rec.f
                ? '<p class="sv-trans">' + esc(K.clean(h.rec.f)) + '</p>' : '') +
              '</details>';
          }).join('') + '</div>';
      }

      html += '<p class="sv-fine">Passages are quoted from the commentary on the ' +
        'Siva Svarodaya, not generated, so nothing here is invented. Ranking is ' +
        'imperfect — if the answer above misses, the related passages often ' +
        'have it.</p>';

      out.innerHTML = html;

      if (V && V.isEnabled()) say(answer);
    });
  }

  var askGo = $('[data-ask-go]');
  if (askGo) askGo.addEventListener('click', ask);
  var askIn = $('[data-ask-input]');
  if (askIn) askIn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); ask(); }
  });

  /* ==========================================================================
     SPOKEN GUIDANCE
     ========================================================================== */

  var V = window.SvaraVoice;

  /** Safe to call anywhere; does nothing when voice is off or unsupported. */
  function say(text, opts) { if (V) V.say(text, opts); }
  function sayLines(lines, opts) {
    return V ? V.sequence(lines, opts) : (opts && opts.onDone && opts.onDone(), function () {});
  }
  function hush() { if (V) V.cancel(); }

  (function initVoice() {
    var bar = $('[data-voicebar]');
    if (!bar || !V || !V.supported) return;   // no bar at all if unsupported
    bar.hidden = false;

    var toggle = $('[data-voice-toggle]');
    var label = $('[data-voice-label]');
    var opts = $('[data-voice-opts]');
    var pick = $('[data-voice-pick]');
    var rate = $('[data-voice-rate]');

    function paint() {
      var on = V.isEnabled();
      toggle.setAttribute('aria-pressed', String(on));
      label.textContent = on ? 'Spoken guidance on' : 'Spoken guidance off';
      opts.hidden = !on;
    }

    V.onVoices(function (list) {
      var cur = V.currentVoice();
      pick.innerHTML = list.map(function (v) {
        return '<option value="' + esc(v.voiceURI) + '"' +
          (cur && v.voiceURI === cur.voiceURI ? ' selected' : '') + '>' +
          esc(v.name) + ' · ' + esc(v.lang) + '</option>';
      }).join('');
    });

    rate.value = V.getRate();

    toggle.addEventListener('click', function () {
      var on = V.setEnabled(!V.isEnabled());
      paint();
      if (on) say('Spoken guidance is on. I will read each instruction as you go.');
      else hush();
    });

    pick.addEventListener('change', function () {
      V.setVoice(pick.value);
      say('This is the voice that will guide you.');
    });

    rate.addEventListener('change', function () {
      V.setRate(rate.value);
      say('This is the pace.');
    });

    var test = $('[data-voice-test]');
    if (test) test.addEventListener('click', function () {
      say('Breathe in gently. And let it go, a little longer than the in-breath.',
          { force: true });
    });

    paint();
  }());

  /* ==========================================================================
     TATTVA WALKTHROUGH — speaks each measurement, one at a time
     ========================================================================== */

  var guided = { i: 0, dims: [], on: false };

  function guidedDims() {
    // Measured dimensions first, then the reported ones.
    return K.TATTVA_SIGNS.verifiable.concat(K.TATTVA_SIGNS.reported);
  }

  function showGuided() {
    var d = guided.dims[guided.i];
    if (!d) return;

    $('[data-guided-step]').textContent =
      'Step ' + (guided.i + 1) + ' of ' + guided.dims.length + ' · ' +
      (d.verifiable ? 'measured' : 'reported, not scored');
    $('[data-guided-title]').textContent = d.name;
    $('[data-guided-how]').textContent = d.how;

    $('[data-guided-back]').disabled = guided.i === 0;
    $('[data-guided-next]').textContent =
      guided.i === guided.dims.length - 1 ? 'Finish' : 'Next';

    // Highlight and focus the matching field so the answer can go straight in.
    $$('.sv-dim').forEach(function (el) { el.classList.remove('active'); });
    var field = $('#sv-dim-' + d.key);
    if (field) {
      var card = field.closest('.sv-dim');
      if (card) { card.classList.add('active'); scrollTo(card); }
    }

    speakDim(d);
  }

  function speakDim(d) {
    var lines = [d.name + '.', d.how];
    if (d.safety) lines.push('One safety point. ' + d.safety);
    lines.push(d.verifiable
      ? 'Enter what you found, then say next.'
      : 'This one is recorded but not scored. Enter it if you noticed it.');
    sayLines(lines, { gap: 550 });
  }

  var guideBtn = $('[data-tattva-guide]');
  if (guideBtn) guideBtn.addEventListener('click', function () {
    buildTattvaForm();
    guided.dims = guidedDims();
    guided.i = 0;
    guided.on = true;
    $('[data-guided]').hidden = false;

    if (V && V.supported && !V.isEnabled()) {
      V.setEnabled(true);
      var t = $('[data-voice-toggle]');
      if (t) { t.setAttribute('aria-pressed', 'true'); }
      var lb = $('[data-voice-label]');
      if (lb) lb.textContent = 'Spoken guidance on';
      var op = $('[data-voice-opts]');
      if (op) op.hidden = false;
    }
    showGuided();
  });

  function bindGuided(sel, fn) {
    var b = $(sel);
    if (b) b.addEventListener('click', fn);
  }

  bindGuided('[data-guided-next]', function () {
    if (guided.i < guided.dims.length - 1) { guided.i++; showGuided(); }
    else endGuided(true);
  });
  bindGuided('[data-guided-back]', function () {
    if (guided.i > 0) { guided.i--; showGuided(); }
  });
  bindGuided('[data-guided-again]', function () { speakDim(guided.dims[guided.i]); });
  bindGuided('[data-guided-stop]', function () { endGuided(false); });

  function endGuided(finished) {
    guided.on = false;
    hush();
    $('[data-guided]').hidden = true;
    $$('.sv-dim').forEach(function (el) { el.classList.remove('active'); });
    if (finished) {
      say('That is all of them. Reading the phase now.');
      var run = $('[data-tattva-run]');
      if (run) run.click();
    }
  }

  /* ========================================================================== */

  renderLog();
  go('observe', { boot: true });
  openTabFromHash();

}());
