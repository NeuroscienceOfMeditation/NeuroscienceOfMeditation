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

    html += '<h6 class="sv-subhead">The rules this result was built from</h6>';

    html += r.provenance.map(function (p) {
      return '<div class="sv-rule"><header>' +
        '<h6>' + esc(p.title) + '</h6>' + gradeBadge(p.grade) +
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
      html += '<h6 class="sv-subhead">What the text also says, and why this tool ' +
              'does not act on it</h6>';
      html += r.notApplied.map(function (n) {
        return '<div class="sv-rule off"><header>' +
          '<h6>' + esc(n.section) + '</h6>' + gradeBadge(n.grade) +
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
      html += '<h6 class="sv-subhead">Where the text disagrees with itself</h6>';
      html += r.contradictions.map(function (c) {
        return '<div class="sv-rule"><header><h6>' + esc(c.title) + '</h6></header>' +
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

    runBtn.onclick = function () {
      if (!chosenMethod) return;
      runBtn.disabled = true;
      var left = chosenMethod.minutes * 60;
      var wide = false;

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
        if (left <= 0) {
          clearTimers();
          orb.classList.remove('wide');
          orb.querySelector('b').textContent = 'done';
          cue.textContent = 'Now observe your breath again.';
          prog.textContent = 'Finished. Check which side is flowing before you decide it worked.';
          runBtn.disabled = false;
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
      if (t.dataset.tab !== 'observe') stopCamera();
      if (t.dataset.tab === 'tattva') buildTattvaForm();
      if (t.dataset.tab === 'practice') renderPranayama('all');
    });
  });

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
        '<h6 class="sv-subhead">' + esc(heading) + '</h6>' +
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

    html += '<h6 class="sv-subhead">What supported it</h6><ul class="sv-support">';
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
      b.addEventListener('click', function () { openRunner(b.dataset.runPrac); });
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

  function openRunner(id) {
    var p = K.PRANAYAMA.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    clearTimers();

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

      if (!reduceMotion()) {
        (function swing() {
          wide = !wide;
          orb.classList.toggle('wide', wide);
          if (p.pacer) cue.textContent = wide ? 'Breathe in' : 'Breathe out, longer';
          later(swing, (p.pacer ? (wide ? p.inhale : p.exhale) : 7) * 1000);
        }());
      }

      every(function () {
        left--;
        var m = Math.floor(left / 60), sec = left % 60;
        orb.querySelector('b').textContent = m + ':' + String(sec).padStart(2, '0');
        cnt.textContent = p.name + ' — ' + (m ? m + ' min ' : '') + sec + ' s left';
        if (left <= 0) {
          clearTimers();
          orb.classList.remove('wide');
          orb.querySelector('b').textContent = 'done';
          cue.textContent = 'Finished. Check which side is flowing before you decide it worked.';
          cnt.textContent = '';
        }
      }, 1000);
    };
  }

  var rStop = $('[data-r-stop]');
  if (rStop) rStop.addEventListener('click', function () {
    clearTimers();
    $('[data-runner]').hidden = true;
  });

  /* ==========================================================================
     ASK THE TEXT
     ========================================================================== */

  var SUGGESTS = [
    'How do I switch which nostril is flowing?',
    'What is sushumna?',
    'Is breath retention safe?',
    'Does the day of the week matter?',
    'How do I measure my breath?',
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

      out.innerHTML = '<h6 class="sv-subhead">From the commentary</h6>' +
        hits.map(function (h, i) {
          var r = h.rec;
          var practical = K.bestPassage(r.m, h.matched, i === 0 ? 4 : 2);
          var analytic = K.bestPassage(r.a, h.matched, i === 0 ? 3 : 1);
          return '<div class="sv-answer' + (i === 0 ? ' lead' : '') + '">' +
            '<header><h6>' + esc(r.t) + '</h6>' +
              (r.g || []).map(function (g) {
                return gradeBadge(g === 'E, negative' ? 'EN' : g);
              }).join('') +
            '</header>' +
            '<p class="sv-src">' + verseRef(r.v) + ' · ' + esc(r.p) + '</p>' +
            '<p class="sv-trans">' + esc(K.clean(r.f)) + '</p>' +
            (analytic ? '<p>' + esc(analytic) + '</p>' : '') +
            (practical ? '<div class="warn"><strong>In practice.</strong> ' +
              esc(practical) + '</div>' : '') +
          '</div>';
        }).join('') +
        '<p class="sv-fine">Retrieved from the commentary on the Siva ' +
        'Svarodaya, ranked by relevance. Passages are quoted, not generated, ' +
        'so nothing here is invented — but ranking is imperfect, and the ' +
        'first result is not always the best one. Read more than one.</p>';
    });
  }

  var askGo = $('[data-ask-go]');
  if (askGo) askGo.addEventListener('click', ask);
  var askIn = $('[data-ask-input]');
  if (askIn) askIn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); ask(); }
  });

  /* ========================================================================== */

  renderLog();
  go('observe');

}());
