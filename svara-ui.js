/* ============================================================================
   svara-ui.js
   Presentation layer for the svara diagnostic tool.
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

  function go(step) {
    clearTimers();
    state.step = step;
    $$('.sv-step').forEach(function (el) {
      el.classList.toggle('on', el.dataset.step === step);
    });
    var panel = $('.sv-step.on');
    if (panel) {
      var h = panel.querySelector('.sv-h');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    if (step === 'observe') startObservation();
    if (step === 'practice') startPractice();
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
      $('.sv-camoff').textContent =
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
        $('.sv-camoff').textContent =
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

  function startObservation() {
    var orb = $('[data-orb]');
    var cue = $('[data-cue]');
    var count = $('[data-count]');
    var next = $('[data-observe-done]');
    if (!orb) return;

    var seconds = 15;
    var i = 0;

    cue.textContent = CUES[0];
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
      if (seconds % 5 === 0 && i < CUES.length - 1) { i++; cue.textContent = CUES[i]; }
      if (seconds > 0) {
        count.textContent = seconds + ' seconds — there is no rush, take longer if you like.';
      } else {
        count.textContent = 'Take as long as you need.';
        next.disabled = false;
      }
    }, 1000);
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

  function fillContext() {
    var d = now();
    $('[data-f-date]').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    $('[data-f-time]').value = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('[data-f-tz]').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
    updateLocField();
  }

  function updateLocField() {
    var f = $('[data-f-loc]');
    f.value = (state.lat == null)
      ? ''
      : state.lat.toFixed(3) + ', ' + state.lon.toFixed(3);
  }

  $('[data-locate]').addEventListener('click', function () {
    var btn = this;
    var note = $('[data-loc-note]');
    if (!navigator.geolocation) {
      note.textContent = 'This browser cannot share a location. Enter coordinates by hand instead.';
      return;
    }
    btn.disabled = true;
    note.textContent = 'Asking your browser…';
    navigator.geolocation.getCurrentPosition(
      function (p) {
        state.lat = p.coords.latitude;
        state.lon = p.coords.longitude;
        updateLocField();
        note.textContent = 'Location set. It stays in this browser and is used only to work out your sunrise.';
        btn.disabled = false;
        $('[data-context-done]').disabled = false;
      },
      function () {
        note.textContent = 'Location was not shared. Type your coordinates below, or the tool ' +
                           'can still show your observation without the traditional comparison.';
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
      $('[data-context-done]').disabled = false;
      $('[data-loc-note]').textContent = 'Coordinates accepted.';
    } else {
      $('[data-context-done]').disabled = true;
    }
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
      '<div class="sv-kind"><h6>Your observation</h6><p>' +
        esc(obs ? obs.label : 'Not reported') + ', as you reported it.</p></div>' +
      '<div class="sv-kind"><h6>Traditional expectation</h6><p>' +
        esc(exp ? exp.label : 'Not available') +
        (r.expectedTattva ? ', with ' + esc(r.expectedTattva.name) + ' tattva' : '') +
        ', from the rule set below.</p></div>' +
      '<div class="sv-kind void"><h6>Physiological measurement</h6><p>' +
        'None. Nothing on this page measures nasal airflow. That would need a ' +
        'bilateral flow sensor.</p></div>' +
    '</div>';

    /* --- why --- */
    html += '<details class="sv-why"><summary>Why am I seeing this?</summary>';
    html += '<ol>' + r.explanation.map(function (e) {
      return '<li>' + esc(e) + '</li>';
    }).join('') + '</ol>';

    html += r.provenance.map(function (p) {
      return '<div class="sv-rule"><header>' +
        '<h6>' + esc(p.title) + '</h6>' +
        '<span class="sv-tag ' + esc(p.status) + '">' + esc(statusWord(p.status)) + '</span>' +
        '</header>' +
        '<p>' + esc(p.detail) + '</p>' +
        (p.warning ? '<div class="warn">' + esc(p.warning) + '</div>' : '') +
        '<p class="sv-src" style="margin-top:8px">Rule ' + esc(p.ruleId) + ' · ' +
        esc(p.source || 'source not supplied') + ' · ' +
        (p.verse ? 'verse ' + esc(p.verse) : 'verse reference not yet supplied') +
        '</p></div>';
    }).join('');

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
    bindActions();
  }

  function statusWord(s) {
    return {
      confirmed: 'In your source',
      unverified: 'Needs checking',
      partial: 'Partly sourced',
      missing: 'Not in source'
    }[s] || s;
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
        'Segment boundaries are an equal division of the svara period. ' +
        'The source supplies the order, not the durations.' +
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

  function startPractice() {
    var r = state.result;
    if (!r || !r.correctivePractice) { go('result'); return; }
    var p = r.correctivePractice;
    var target = r.expectedSvara;

    $('[data-practice-body]').innerHTML =
      '<div class="sv-target" style="border:1.5px solid ' + target.colour + '33">' +
        '<small>Target svara</small>' + svaraGlyph(target) +
        '<strong style="color:' + target.colour + '">' + esc(target.label) + '</strong>' +
      '</div>' +
      '<p class="sv-p">According to the selected Svara Yoga framework, a different ' +
        'nadi is prescribed at this time. The steps below are a gentle way to ' +
        'settle toward it.</p>' +
      '<ol class="sv-steps">' + p.steps.map(function (s) {
        return '<li>' + esc(s) + '</li>';
      }).join('') + '</ol>' +
      '<div class="sv-flag"><strong>' + esc(p.attribution) + '</strong> ' +
        esc(p.ratioNote) + '</div>' +
      '<div class="sv-ratio">' +
        field('Inhale, seconds', 'number', 'p-in', p.inhale, 2, 10) +
        field('Exhale, seconds', 'number', 'p-out', p.exhale, 2, 12) +
        field('Cycles', 'number', 'p-cycles', p.cycles, 1, 20) +
      '</div>';

    $('[data-practice-done]').disabled = true;

    var orb = $('[data-p-orb]');
    var cue = $('[data-p-cue]');
    var prog = $('[data-p-count]');
    var runBtn = $('[data-p-run]');

    orb.querySelector('b').textContent = 'ready';
    orb.querySelector('i').style.background = target.colour;
    cue.textContent = 'Guided visualisation — not a sensor measurement.';
    prog.textContent = 'Press start when you are settled.';

    runBtn.onclick = function () {
      runBtn.disabled = true;
      var inS = clamp(+$('[data-f-p-in]').value || p.inhale, 2, 10);
      var outS = clamp(+$('[data-f-p-out]').value || p.exhale, 2, 12);
      var cycles = clamp(+$('[data-f-p-cycles]').value || p.cycles, 1, 20);
      var n = 0;

      (function phase(isIn) {
        if (n >= cycles) {
          orb.classList.remove('wide');
          orb.querySelector('b').textContent = 'done';
          cue.textContent = 'Now observe your breath again.';
          prog.textContent = 'Practice complete.';
          $('[data-practice-done]').disabled = false;
          runBtn.disabled = false;
          return;
        }
        orb.classList.toggle('wide', isIn);
        orb.querySelector('b').textContent = isIn ? 'in' : 'out';
        cue.textContent = isIn
          ? 'Breathe in softly through the ' + target.side + ' nostril.'
          : 'Let it go, a little longer than the in-breath.';
        prog.textContent = 'Cycle ' + (n + 1) + ' of ' + cycles;
        if (!isIn) n++;
        later(function () { phase(!isIn); }, (isIn ? inS : outS) * 1000);
      }(true));
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

  function saveLog(r) {
    if (!$('[data-log-opt]').checked) return;
    var entries = readLog();
    entries.unshift({
      t: (r.context.date || new Date()).toISOString(),
      obs: r.observedSvara ? r.observedSvara.key : null,
      exp: r.expectedSvara ? r.expectedSvara.key : null,
      tat: r.expectedTattva ? r.expectedTattva.key : null,
      align: r.alignment
    });
    try { localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, 200))); }
    catch (e) { /* storage full or blocked; the tool still works */ }
    renderLog();
  }

  function renderLog() {
    var list = $('[data-log]');
    var entries = readLog();
    if (!entries.length) {
      list.innerHTML = '<li style="grid-template-columns:1fr"><div class="sv-empty">' +
        'Nothing logged yet. Tick the box above and complete an observation — ' +
        'entries stay in this browser and are never sent anywhere.</div></li>';
      $('[data-log-clear]').disabled = true;
      return;
    }
    $('[data-log-clear]').disabled = false;
    list.innerHTML = entries.slice(0, 12).map(function (e) {
      var d = new Date(e.t);
      var S = E.SVARAS, T = E.TATTVAS;
      return '<li><time>' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</time>' +
        '<div class="sv-logmain">' +
          (e.obs ? esc(S[e.obs].name) : '—') +
          ' <em>observed</em>' +
          (e.exp ? ' · ' + esc(S[e.exp].name) + ' <em>expected</em>' : '') +
          (e.tat ? ' · ' + esc(T[e.tat].name) : '') +
        '</div>' +
        '<span class="sv-logtag sv-pill ' +
          (e.align === 'aligned' ? 'ok' : e.align === 'misaligned' ? 'off' : 'neutral') +
          '">' + esc(e.align === 'aligned' ? 'aligned'
                   : e.align === 'misaligned' ? 'not aligned'
                   : e.align === 'sushumna' ? 'sushumna' : 'no comparison') +
        '</span></li>';
    }).join('');
  }

  $('[data-log-clear]').addEventListener('click', function () {
    try { localStorage.removeItem(LOG_KEY); } catch (e) {}
    renderLog();
  });

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

  renderLog();
  go('observe');

}());
