/* ==========================================================================
   sadhu-chat.js — the Swar Yoga page as a conversation with Sadhu ji.

   Sadhu ji asks, the visitor taps a reply or types. Everything he says about
   the visitor's own breath comes from the real tool:
     SvaraEngine.assess   sunrise, the timing rule, verse and grade
     SvaraKnowledge       tattva signs and scoring, the practices, text search
     SvaraPracticeView    the full-screen guided practice
   Checks are also passed to the (hidden) breath tool so they land in the
   visitor's 14-day log and, if they joined, the open record.

   Lessons come from _data/sadhu_journey.yml (window.SADHU_JOURNEY).
   ========================================================================== */
(function () {
  'use strict';
  var chat = document.querySelector('[data-chat]');
  if (!chat) return;
  var E = window.SvaraEngine, K = window.SvaraKnowledge;
  var LESSONS = (window.SADHU_JOURNEY && window.SADHU_JOURNEY.steps) || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var log = $('[data-chat-log]', chat), chipsEl = $('[data-chat-chips]', chat);
  var form = $('[data-chat-form]', chat), input = $('[data-chat-input]', chat);
  var FACE = chat.getAttribute('data-face');
  var NAME = chat.getAttribute('data-name') || 'Sadhu ji';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- memory (this browser only) ---------- */
  var MEM_KEY = 'sadhu-chat';
  var mem = {};
  try { mem = JSON.parse(localStorage.getItem(MEM_KEY) || '{}') || {}; } catch (e) {}
  function remember(k, v) { mem[k] = v; try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) {} }

  // Every check is kept in this browser only, so he can remember your pattern.
  function logSide(side) {
    var h = (mem.hist || []).concat([{ t: Date.now(), s: side }]);
    remember('hist', h.slice(-200)); remember('lastSide', side); remember('lastTime', Date.now());
  }
  function weekly() {
    var since = Date.now() - 7 * 864e5;
    var h = (mem.hist || []).filter(function (x) { return x.t > since; });
    var morn = h.filter(function (x) { var hr = new Date(x.t).getHours(); return hr >= 4 && hr < 11; });
    var set = morn.length >= 3 ? morn : h;
    if (set.length < 3) return null;
    var c = { ida: 0, pingala: 0, sushumna: 0 };
    set.forEach(function (x) { c[x.s] = (c[x.s] || 0) + 1; });
    var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
    return { n: set.length, c: c, top: c[top] > set.length / 2 ? top : null, mornings: set === morn };
  }

  // Anonymous step counts (no name, no ID, nothing about the visitor):
  // a row like "check_result" in the sadhu_steps table. See supabase-sadhu-steps.sql.
  var DB = { url: 'https://neinmntlyiszfmkeeyoo.supabase.co', key: 'sb_publishable_xqK97lVzGEzvTEItzC9REQ_QIp9U-Nl' };
  var counted = {};
  function count(step) {
    if (counted[step] || navigator.doNotTrack === '1') return; counted[step] = 1;
    try {
      fetch(DB.url + '/rest/v1/sadhu_steps', { method: 'POST', keepalive: true,
        headers: { apikey: DB.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ step: step }) }).catch(function () {});
    } catch (e) {}
  }
  // The open record's totals (the same numbers shown on the full page)
  var recordStats = null;
  try {
    fetch(DB.url + '/rest/v1/rpc/open_record_stats', { method: 'POST', headers: { apikey: DB.key, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { recordStats = d; }).catch(function () {});
  } catch (e) {}

  /* ---------- rendering: one scene at a time ----------
     A scene is what Sadhu ji says (lines appear one by one) plus the choices
     for what to do next. Choosing opens the next scene. Back restores the
     previous one exactly as it was. */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }   // **bold** only
  var crumbEl = $('[data-crumb]', chat), sceneEl = $('[data-scene]', chat);
  var backBtn = $('[data-back]', chat), homeBtn = $('[data-home]', chat);
  var token = 0, hist = [], curOpts = null;
  var Q = Promise.resolve();
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); }); }

  function row(who, inner) {
    if (who === 'me') return null;
    var d = document.createElement('div'); d.className = 'ch-line';
    if (typeof inner === 'string') d.innerHTML = inner; else d.appendChild(inner);
    log.appendChild(d);
    return d;
  }
  function typing(ms) {
    var my = token;
    var t = document.createElement('div'); t.className = 'ch-line ch-dots'; t.innerHTML = '<i></i><i></i><i></i>';
    log.appendChild(t);
    return wait(ms).then(function () { t.remove(); if (my !== token) throw new Error('stale'); });
  }
  function enqueue(fn) {
    var my = token;
    Q = Q.then(function () { if (my === token) return fn(); }).catch(function () {});
    return Q;
  }
  function say(text, opt) {
    opt = opt || {};
    return enqueue(function () {
      var plain = String(text).replace(/<[^>]+>/g, '');
      if (!locked) setMood(opt.mood || 'explain');
      return typing(Math.min(1300, 300 + plain.length * 10)).then(function () {
        var b = row('bot', opt.html ? text : md(text));
        if (opt.cls) b.classList.add(opt.cls);
      });
    });
  }
  function list(items, title) {
    return enqueue(function () {
      return typing(380).then(function () {
        row('bot', (title ? '<b class="ch-lt">' + md(title) + '</b>' : '') +
          '<ol class="cm-list">' + items.map(function (x) { return '<li>' + md(x) + '</li>'; }).join('') + '</ol>').classList.add('list');
      });
    });
  }
  function widget(build) {
    return enqueue(function () { return new Promise(function (done) { row('bot', build(done)).classList.add('wide'); }); });
  }
  function me() {}

  function renderChoices(opts) {
    curOpts = opts; chipsEl.innerHTML = '';
    opts.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (o[2] ? ' p' : '');
      b.innerHTML = '<span>' + esc(o[0]) + '</span><i aria-hidden="true">→</i>';
      b.style.animationDelay = (reduce ? 0 : i * 0.05) + 's';
      b.addEventListener('click', function () { go(o[1], o[3] ? '' : o[0]); });
      chipsEl.appendChild(b);
    });
    backBtn.disabled = hist.length === 0;
  }
  function ask(opts) { enqueue(function () { renderChoices(opts); if (!locked) setTimeout(function () { if (!locked && curOpts === opts) setMood('listen'); }, 900); }); }
  function clearChips() { chipsEl.innerHTML = ''; }

  function newScene() {
    token++; Q = Promise.resolve();
    log.innerHTML = ''; chipsEl.innerHTML = ''; form.hidden = true; curOpts = null;
    sceneEl.classList.remove('turn'); void sceneEl.offsetWidth; sceneEl.classList.add('turn');
    var top = chat.getBoundingClientRect().top;
    if (top < -40) window.scrollTo({ top: window.scrollY + top - 10, behavior: reduce ? 'auto' : 'smooth' });
  }
  function setCrumb(t) { crumbEl.hidden = !t; crumbEl.textContent = t ? 'You chose: ' + t : ''; }
  function snapshot() { return { html: log.innerHTML, opts: curOpts, crumb: crumbEl.hidden ? '' : crumbEl.textContent, form: !form.hidden }; }
  // Move to the next scene
  function go(fn, crumb) {
    hist.push(snapshot()); if (hist.length > 40) hist.shift();
    newScene(); setCrumb(crumb); fn();
  }
  backBtn.addEventListener('click', function () {
    var s = hist.pop(); if (!s) return;
    newScene();
    log.innerHTML = s.html; crumbEl.hidden = !s.crumb; crumbEl.textContent = s.crumb; form.hidden = !s.form;
    if (s.opts) renderChoices(s.opts);
    backBtn.disabled = hist.length === 0;
  });
  homeBtn.addEventListener('click', function () { go(function () { menu('Where shall we go?'); }, ''); });

  /* ---------- "How sure is this?" ----------
     A small chip on a claim. Tap it for two lines on the evidence and, where
     we have checked one, a study link. Grades as in The Respiratory Codex. */
  var GRADE = {
    E: ['Established', 'Supported by replicated human studies, physiological measurement or anatomy.'],
    S: ['Suggestive', 'Some human evidence, often small studies. Promising, not settled.'],
    X: ['Speculative', 'Little or no direct evidence either way.'],
    C: ['Contradicted', 'The evidence goes against this claim.'],
    T: ['Tradition', 'Stated by the text. Not tested yet.']
  };
  function gradeKey(g) { g = String(g || ''); return g === 'EN' || g.indexOf('negative') > -1 ? 'C' : (GRADE[g] ? g : 'X'); }
  var EVID = (window.SADHU_JOURNEY && window.SADHU_JOURNEY.evidence) || {};
  function evChip(g, about, note, refs) {
    var G = GRADE[g] || GRADE.X;
    var w = document.createElement('div'); w.className = 'ev';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ev-chip ev-' + g;
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<i aria-hidden="true"></i>How sure is this? <b>' + G[0] + '</b>' + (about ? '<span>· ' + esc(about) + '</span>' : '');
    var d = document.createElement('div'); d.className = 'ev-more'; d.hidden = true;
    d.innerHTML = '<p>' + esc(note || G[1]) + '</p>' +
      (refs && refs.length ? '<p class="ev-refs">' + refs.map(function (r) { return '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.label) + ' ↗</a>'; }).join('') + '</p>' : '') +
      '<p class="ev-scale">' + esc(G[0]) + ': ' + esc(G[1]) + '</p>';
    b.addEventListener('click', function () { d.hidden = !d.hidden; b.setAttribute('aria-expanded', String(!d.hidden)); count('evidence_open'); });
    w.appendChild(b); w.appendChild(d);
    return w;
  }
  function evidenceFor(keys) {
    [].concat(keys || []).forEach(function (k) {
      var e = EVID[k]; if (!e) return;
      enqueue(function () { row('bot', evChip(gradeKey(e.grade), null, e.note, e.refs)).classList.add('ev-line'); });
    });
  }

  /* ---------- diagrams in the lessons (simplified, and labelled so) ---------- */
  var DIAGRAMS = {
    'nasal-cycle':
      '<figure class="dg dg-nasal"><svg viewBox="0 0 320 170" role="img" aria-label="The two nostrils take turns: as one opens the other narrows">' +
      '<path d="M160 18 C150 60 120 100 112 128 C108 142 122 150 136 146 L160 140 L184 146 C198 150 212 142 208 128 C200 100 170 60 160 18Z" fill="#F3E6C8" stroke="#C2611F" stroke-width="2"/>' +
      '<ellipse class="nL" cx="138" cy="134" rx="13" ry="7" fill="#2E7FA8"/><ellipse class="nR" cx="182" cy="134" rx="13" ry="7" fill="#E4744F"/>' +
      '<g class="fL"><path d="M138 142 v18" stroke="#2E7FA8" stroke-width="3" stroke-linecap="round"/><path d="M130 150 v10 M146 150 v10" stroke="#2E7FA8" stroke-width="2" stroke-linecap="round" opacity=".6"/></g>' +
      '<g class="fR"><path d="M182 142 v18" stroke="#E4744F" stroke-width="3" stroke-linecap="round"/><path d="M174 150 v10 M190 150 v10" stroke="#E4744F" stroke-width="2" stroke-linecap="round" opacity=".6"/></g>' +
      '<text x="70" y="70" class="t">left · Ida</text><text x="208" y="70" class="t">right · Pingala</text></svg>' +
      '<figcaption>Drawn from your own point of view. One side opens while the other narrows, then they swap. Simplified: in real life a swap takes about 2 hours on average, and is irregular for most people.</figcaption></figure>',
    'sunrise-clock':
      '<figure class="dg dg-clock"><svg viewBox="0 0 320 200" role="img" aria-label="The text predicts a switch every hour from sunrise; measured cycles are longer and irregular">' +
      '<g transform="translate(160 100)">' + (function () {
        var out = '', n = 12, r1 = 62, r2 = 82;
        for (var i = 0; i < n; i++) {
          var a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
          var p = function (r, a) { return (r * Math.cos(a)).toFixed(1) + ' ' + (r * Math.sin(a)).toFixed(1); };
          out += '<path d="M' + p(r1, a0) + ' L' + p(r2, a0) + ' A' + r2 + ' ' + r2 + ' 0 0 1 ' + p(r2, a1) + ' L' + p(r1, a1) + ' A' + r1 + ' ' + r1 + ' 0 0 0 ' + p(r1, a0) + 'Z" fill="' + (i % 2 ? '#E4744F' : '#2E7FA8') + '" opacity=".85" stroke="#FBF7EC" stroke-width="2"/>';
        }
        return out;
      }()) +
      '<circle r="56" fill="#FBF7EC"/><g class="hand"><path d="M0 0 L0 -54" stroke="#1B4332" stroke-width="3" stroke-linecap="round"/></g><circle r="5" fill="#1B4332"/>' +
      '<g transform="translate(0 -96)"><circle r="9" fill="#F2B544"/><path d="M-16 0 h-6 M16 0 h6 M0 -14 v-4" stroke="#F2B544" stroke-width="2"/></g></g>' +
      '<text x="12" y="30" class="t">sunrise ↑</text><text x="214" y="186" class="t">1 hour each?</text></svg>' +
      '<figcaption>What the text predicts: counted from sunrise, the sides take turns about every hour. What measurement shows: turns average about 2 hours and are irregular. That gap is what the open record is testing.</figcaption></figure>',
    'tattvas':
      '<figure class="dg dg-tattva"><svg viewBox="0 0 340 120" role="img" aria-label="The five tattvas as their traditional symbols">' +
      '<g class="tv" style="--d:0s"><rect x="14" y="26" width="44" height="44" fill="#E2B33C"/><text x="36" y="96" class="t">Earth</text></g>' +
      '<g class="tv" style="--d:.5s"><path d="M86 30 a24 24 0 1 0 48 0 a24 18 0 1 1 -48 0Z" fill="#9FB8C8"/><text x="110" y="96" class="t">Water</text></g>' +
      '<g class="tv" style="--d:1s"><path d="M182 24 L206 70 H158Z" fill="#D9472B"/><text x="182" y="96" class="t">Fire</text></g>' +
      '<g class="tv" style="--d:1.5s"><circle cx="252" cy="48" r="23" fill="#7FA88C"/><text x="252" y="96" class="t">Air</text></g>' +
      '<g class="tv" style="--d:2s"><circle cx="314" cy="48" r="6" fill="#5B4E86"/><circle cx="314" cy="48" r="20" fill="none" stroke="#5B4E86" stroke-dasharray="3 4"/><text x="314" y="96" class="t">Space</text></g>' +
      '</svg><figcaption>The traditional symbols of the five elements. They are symbols, not measurements.</figcaption></figure>'
  };
  function diagram(name) { var h = DIAGRAMS[name]; if (h) enqueue(function () { row('bot', h).classList.add('wide', 'dg-line'); }); }

  /* ---------- his video: moods, and breathing with you ----------
     Moods are extra loops set in SVARA_GUIDE.moods (meditate, listen,
     explain, smile). Until a clip exists, the main loop is used. */
  var gv = $('.ch-video video', chat);
  var MOODS = {}; (function (m) { for (var k in m) if (m[k]) MOODS[k] = m[k]; }((window.SVARA_GUIDE && window.SVARA_GUIDE.moods) || {}));
  var mood = 'base';
  var moodClip = null;   // the mood clip playing now, or null for his normal loop
  function setMoodNow(m) { setMood(m, true); }
  function setMood(m, force) {
    if (!gv || m === mood || (locked && !force)) return;
    var want = m === 'base' ? null : (MOODS[m] || null);
    mood = m;
    if (want === moodClip) return;                 // nothing to change (e.g. no clip for this mood yet)
    var rate = gv.playbackRate;
    gv.classList.add('swap');
    setTimeout(function () {
      var base = window.SVARA_GUIDE || {};
      gv.innerHTML = want ? '<source src="' + want.replace(/\.mp4$/, '.webm') + '" type="video/webm"><source src="' + want + '" type="video/mp4">'
        : (base.webm ? '<source src="' + base.webm + '" type="video/webm">' : '') + '<source src="' + base.mp4 + '" type="video/mp4">';
      moodClip = want;
      gv.load(); gv.playbackRate = locked ? 0.75 : rate;
      var p = gv.play(); if (p && p.catch) p.catch(function () {});
      gv.classList.remove('swap');
    }, 250);
  }
  var locked = false;   // true while he meditates with you
  function breatheWith(on) { locked = !!on; if (gv) gv.playbackRate = on ? 0.75 : 1; chat.classList.toggle('settling', !!on); }

  /* ---------- the main menu ---------- */
  function lessonLabel() {
    var i = mem.lesson || 0;
    return i > 0 && i < LESSONS.length ? 'Continue my lessons (' + (i + 1) + ' of ' + LESSONS.length + ')' : 'Teach me Swar Yoga';
  }
  function menu(prompt) {
    if (prompt) say(prompt);
    ask([
      ['Check my breath now', checkBreath, true],
      [lessonLabel(), function () { lesson(mem.lesson && mem.lesson < LESSONS.length ? mem.lesson : 0); }],
      ['Find my tattva', tattva],
      ['A practice for today', practiceMenu],
      ['Ask the text', askPrompt],
      ['Morning reminder', reminder],
      ['What everyone’s breath shows', recordStory],
      ['The latest research, live', research]
    ]);
  }
  function more() {
    ask([
      ['Check my breath', checkBreath], ['Lessons', function () { lesson(mem.lesson && mem.lesson < LESSONS.length ? mem.lesson : 0); }],
      ['Tattva', tattva], ['A practice', practiceMenu], ['Ask the text', askPrompt]
    ]);
  }

  /* ---------- 1. Check my breath (the Svara tool) ---------- */
  var SIDES = {
    ida: 'The left side. **Ida**, the moon channel, Chandra svara. The texts call it cooling and steadying.',
    pingala: 'The right side. **Pingala**, the sun channel, Surya svara. The texts call it warming and active.',
    sushumna: 'Both sides, or changing. **Sushumna**, the turning point. It is brief, often only minutes, and the texts keep it for sitting quietly.'
  };
  function sideChips(then) {
    ask([
      ['Left', function () { then('ida'); }],
      ['Right', function () { then('pingala'); }],
      ['Both, or I can’t tell', function () { then('sushumna'); }],
      ['How do I tell?', function () {
        say('Breathe out onto a cool mirror, or the back of your hand, just below the nostrils. Compare the two patches of mist. The larger one marks the open side.');
        say('This mirror is verse 153, the only instrument in the whole treatise. Go by what you feel, not by what you expect.');
        say('Which side is stronger?');
        sideChips(then);
      }]
    ]);
  }

  function checkBreath() {
    count('check_start');
    say('Good. First, let the breath settle.');
    say('Sit comfortably with the mouth closed. Let the shoulders soften. Nothing to do yet.');
    ask([['I’m sitting comfortably', settle, true]]);
  }

  function orb(seconds, done) {
    var w = document.createElement('div'); w.className = 'cm-orb';
    w.innerHTML = '<div class="orb"><i></i><b>' + seconds + '</b></div><p>Breathe normally. The circle is a timer, not a pace.</p>';
    var n = seconds, b = w.querySelector('b');
    var t = setInterval(function () {
      n--; b.textContent = n > 0 ? n : '✓';
      if (n <= 0) { clearInterval(t); w.classList.add('done'); done(); }
    }, 1000);
    return w;
  }

  function settle() {
    count('check_settle');
    say('Breathe normally and rest your eyes on this circle for fifteen seconds. Don’t change anything. Just notice. I will breathe with you.');
    enqueue(function () { breatheWith(true); mood = ''; moodClip = '__'; setMoodNow('meditate'); });
    widget(function (done) { return orb(15, done); });
    enqueue(function () { breatheWith(false); });
    say('Good' + (mem.name ? ', ' + mem.name : '') + '.');
    say('Now hold the back of your hand just under your nose and breathe out gently, two or three times. **Which side feels stronger?**');
    enqueue(function () { setMood('listen'); });
    sideChips(function (side) {
      logSide(side); count('check_side');
      say(SIDES[side]);
      askPlace(function (place) { result(side, place); });
    });
  }

  var CITIES = (function () {
    var sel = document.querySelector('[data-f-city]'); var out = [];
    if (sel) [].forEach.call(sel.options, function (o) { if (o.value) out.push({ label: o.text, value: o.value }); });
    return out;
  }());
  function parseLL(v) { var m = String(v).split(','); return { lat: parseFloat(m[0]), lon: parseFloat(m[1]) }; }

  function askPlace(then) {
    if (mem.place) {
      say('The Svarodaya counts the cycle from sunrise. Are you still near **' + mem.place.label + '**?');
      ask([
        ['Yes', function () { then(mem.place); }, true],
        ['Somewhere else', function () { chooseCity(then); }],
        ['Skip the comparison', function () { then(null); }]
      ]);
      return;
    }
    say('The Svarodaya counts the cycle from sunrise, so tell me roughly where you are. The nearest city is close enough.');
    chooseCity(then);
  }
  function chooseCity(then) {
    var top = ['Delhi', 'Mumbai', 'Bengaluru', 'Kolkata', 'Chennai', 'Varanasi', 'Rishikesh', 'London', 'New York'];
    function pick(c) { var p = { label: c.label, value: c.value }; var ll = parseLL(c.value); p.lat = ll.lat; p.lon = ll.lon; remember('place', p); then(p); }
    var opts = CITIES.filter(function (c) { return top.indexOf(c.label) > -1; }).map(function (c) { return [c.label, function () { pick(c); }]; });
    opts.push(['Use my location', function () {
      if (!navigator.geolocation) { say('This browser cannot share a location. Choose the nearest city instead.'); chooseCity(then); return; }
      say('Asking your browser…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var p = { label: 'your location', lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 };
        p.value = p.lat + ', ' + p.lon; remember('place', p); then(p);
      }, function () { say('I could not get your location. Choose the nearest city instead.'); chooseCity(then); }, { timeout: 10000, maximumAge: 600000 });
    }]);
    opts.push(['Another city…', function () {
      say('Which is nearest?');
      ask(CITIES.filter(function (c) { return top.indexOf(c.label) < 0; }).map(function (c) { return [c.label, function () { pick(c); }]; })
        .concat([['Skip the comparison', function () { then(null); }]]));
    }]);
    opts.push(['Skip the comparison', function () { then(null); }]);
    ask(opts);
  }

  function gradeText(r, g) {
    var G = r && r.grades && r.grades[g];
    var label = G && (G.label || G.name || G.short);
    return label ? 'evidence: ' + String(label).toLowerCase() : 'grade ' + g;
  }

  function result(side, place) {
    var obs = E.SVARAS[side];
    if (!place) {
      say('Then here is simply what you noticed: **' + obs.label + '**. ' + 'Without your sunrise I cannot compare it with the text, and that is fine.');
      logToTool(side, null);
      afterResult(null, side);
      return;
    }
    var r;
    try { r = E.assess({ date: new Date(), lat: place.lat, lon: place.lon, observedSvara: side }); } catch (e) { r = null; }
    logToTool(side, place);
    if (!r || r.alignment === 'unavailable' || !r.expectedSvara) {
      say((r && r.flags && r.flags[0] && r.flags[0].text) || 'I could not work out the sunrise there, so I cannot compare today.');
      afterResult(r, side); return;
    }
    var exp = r.expectedSvara;
    say('Sunrise near ' + place.label + ' was at **' + E.formatTime(r.context.sunrise) + '**. By the text’s timing rule, **' + exp.name + '** (the ' + exp.side + (exp.side === 'both' ? ' sides' : ' side') + ') should be flowing now.');
    if (r.alignment === 'aligned') say('And you noticed ' + obs.name + '. Your breath and the text agree right now.', { mood: 'smile' });
    else if (r.alignment === 'sushumna' || side === 'sushumna') say('You noticed both sides, Sushumna, the moment of turning. The text says to sit quietly in it, not to begin worldly work.');
    else say('You noticed ' + obs.name + '. They differ. That is not a mistake, it is information. Here we are testing the text, not you.');
    say('What measurement shows: the switch takes about two hours on average and is irregular in most people, so the text’s hourly rule often misses.');
    var pv = (r.provenance || []).slice(0, 2);
    pv.forEach(function (p) {
      var G = r.grades && r.grades[p.grade];
      enqueue(function () { row('bot', evChip(gradeKey(p.grade), p.title + ' · verse ' + p.verse, G && G.note, null)).classList.add('ev-line'); });
    });
    if (r.expectedTattva && E.TATTVAS[r.expectedTattva]) {
      var t = E.TATTVAS[r.expectedTattva];
      say('The text would also say the **' + t.name + '** element, ' + t.english.toLowerCase() + ', is running now. That one you can check with your own breath, if you like.');
    }
    afterResult(r, side);
  }

  function afterResult(r, side) {
    count('check_result');
    lastCheck = { side: side, r: r, place: mem.place && r ? mem.place : null, t: new Date() };
    say('What would you like to do now?');
    var opts = [['Make my breath card', function () { breathCard(lastCheck); }, true]];
    if (r && r.correctivePractice) opts.push(['Help me shift the breath', function () { shift(r, side); }]);
    opts.push(['Find my tattva', tattva]);
    opts.push(['Remind me each morning', reminder]);
    opts.push(['Something else', function () { menu('Of course. Where shall we go?'); }]);
    ask(opts);
  }

  function shift(r, side) {
    var pr = r.correctivePractice, tgt = E.SVARAS[pr.target] || {};
    say('**' + pr.title + '.** The text gives these ways. Choose one.');
    ask(pr.methods.map(function (m) {
      return [m.name + ' · ' + m.minutes + ' min', function () {
        list(m.steps, m.name);
        if (m.note) say(m.note);
        say('Gently. Stop if you feel dizzy or breathless.');
        ask([
          ['Guide me through it', function () { guide({ name: m.name, steps: m.steps, minutes: m.minutes, note: m.note }, { key: pr.target, label: tgt.label, colour: tgt.colour }, function () { observeAgain(side); }); }, true],
          ['I’ll do it myself', function () { say('Take your time. Tell me when you have finished.'); ask([['I’ve finished', function () { observeAgain(side); }, true]]); }],
          ['Choose another way', function () { shift(r, side); }]
        ]);
      }];
    }));
  }

  // The full-screen practice view (svara-practice-view.js)
  function guide(method, target, after) {
    var finished = false;
    function done() { if (finished) return; finished = true; go(after, 'I’ve finished'); }
    if (window.SvaraPracticeView) {
      say('I will guide you on the full screen. Come back here when you are done.');
      Q = Q.then(function () { window.SvaraPracticeView.open({ method: method, target: target || {}, onObserveAgain: function () { done(); } }); });
      ask([['I’ve finished', function () { finished = true; after(); }, true, true]]);
    } else {
      list(method.steps, method.name);
      ask([['I’ve finished', function () { finished = true; after(); }, true]]);
    }
  }

  function observeAgain(prev) {
    say('Welcome back. Now let us look again, the same way as before. Breathe out onto your hand. **Which side is stronger now?**');
    sideChips(function (side) {
      logSide(side);
      var s = E.SVARAS[side];
      if (side === prev) say('It stayed ' + s.name + '. That happens often, and it is worth recording too. The body is not a switch.');
      else say('It moved to **' + s.name + '**. You have just seen the cycle with your own breath.');
      try { window.dispatchEvent(new CustomEvent('svara:practice-done', { detail: { before: prev, after: side } })); } catch (e) {}
      menu('Where shall we go next?');
    });
  }

  // Pass the check to the hidden breath tool, so it is logged like any other.
  function logToTool(side, place) {
    var full = document.getElementById('full-page');
    if (!full || !full.hidden) return;              // visible: the visitor uses the tool directly
    var root = document.getElementById('svara'); if (!root) return;
    try {
      var tab = root.querySelector('.sv-tab[data-tab="observe"]'); tab && tab.click();
      var od = root.querySelector('[data-observe-done]'); if (od) { od.disabled = false; od.click(); }
      var ch = root.querySelector('.sv-choice[data-s="' + side + '"]'); ch && ch.click();
      var rd = root.querySelector('[data-report-done]'); if (rd) { rd.disabled = false; rd.click(); }
      setTimeout(function () {
        if (!place) { var sk = root.querySelector('[data-context-skip]'); sk && sk.click(); return; }
        var sel = root.querySelector('[data-f-city]');
        var opt = sel && [].filter.call(sel.options, function (o) { return o.value === place.value; })[0];
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        else {
          var loc = root.querySelector('[data-f-loc]');
          if (loc) { loc.value = place.value; loc.dispatchEvent(new Event('input', { bubbles: true })); loc.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        setTimeout(function () { var cd = root.querySelector('[data-context-done]'); if (cd && !cd.disabled) cd.click(); }, 250);
      }, 250);
    } catch (e) {}
  }

  /* ---------- 2. Lessons ---------- */
  function lesson(i) {
    var s = LESSONS[i]; if (!s) { menu(); return; }
    remember('lesson', i);
    say('<span class="cm-tag">Lesson ' + (i + 1) + ' of ' + LESSONS.length + '</span><b>' + esc(s.title) + '</b><br>' + md(s.say), { html: true });
    if (s.diagram) diagram(s.diagram);
    if (s.points && s.points.length) list(s.points);
    if (s.evidence) evidenceFor(s.evidence);
    count('lesson_' + (i + 1));
    var last = i === LESSONS.length - 1;
    var opts = [[last ? 'Finish' : 'Next →', function () {
      if (last) { remember('lesson', LESSONS.length); count('lessons_done'); say('You have walked the whole path. Observe each morning at daybreak, and come back whenever you need me.'); offerEmail(function () { menu(); }); }
      else lesson(i + 1);
    }, true]];
    if (s.action) opts.push([s.action.label, function () { remember('lesson', i + 1); doAction(s.action.go); }]);
    if (i > 0) opts.push(['← Back', function () { lesson(i - 1); }]);
    opts.push(['Pause the lessons', function () { remember('lesson', i + 1); menu('We will continue whenever you like. What now?'); }]);
    ask(opts);
  }
  function doAction(go) {
    if (go === 'tool:observe') checkBreath();
    else if (go === 'tool:remind') reminder();
    else if (go === 'tool:tattva') tattva();
    else if (go === 'tool:practice') practiceMenu();
    else if (go === 'tool:ask') askPrompt();
    else if (go && go.charAt(0) === '#') { say('I have opened that part of the page for you, below our conversation.'); Q = Q.then(function () { openFull(go); }); more(); }
  }

  /* ---------- 3. Tattva ---------- */
  function tattva() {
    count('tattva_start');
    var dims = K.DIMENSIONS.filter(function (d) { return d.verifiable; }).sort(function (a, b) { return a.order - b.order; });
    var answers = {};
    say('The text says each breath carries one of five elements, the tattvas. There are four signs you can check yourself. We will take them one at a time.');
    say('Answer only what you actually notice. If you are not sure, say so. That is a good answer too.');
    function step(i) {
      if (i >= dims.length) return finish();
      var d = dims[i];
      say('<span class="cm-tag">' + (i + 1) + ' of ' + dims.length + ' · verse ' + esc(d.verse) + '</span><b>' + esc(d.name) + '</b><br>' + md(d.how), { html: true });
      var opts = [];
      if (d.key === 'reach') {
        [4, 8, 12, 16].forEach(function (n) { opts.push([n + ' finger-breadths', function () { answers.reach = n; step(i + 1); }]); });
      } else {
        Object.keys(d.values).forEach(function (k) {
          var v = d.values[k]; if (v == null) return;
          opts.push([String(v).charAt(0).toUpperCase() + String(v).slice(1), function () { answers[d.key] = k; step(i + 1); }]);
        });
        if (d.key === 'dominance') opts.push(['One patch clearly bigger', function () { step(i + 1); }]);
      }
      opts.push(['Not sure, skip', function () { step(i + 1); }]);
      ask(opts);
    }
    function finish() {
      count('tattva_done');
      var res = K.scoreTattva(answers);
      if (!res.best) {
        say(res.note || 'Nothing matched clearly this time. Try the reach of the out-breath and the direction of the jet: those are the signs that count.');
      } else {
        var t = E.TATTVAS[res.best.key];
        say('Your measurements point to **' + t.name + '**, ' + t.english.toLowerCase() + ' (' + t.sanskrit + '). It matched on ' + res.best.score + ' of the ' + res.measuredAnswered + ' signs you measured.');
        if (res.tie) say('But another element scored the same, so this reading is uncertain. That is honest, not a failure.');
      }
      say('Remember, these signs are partly set by your own anatomy, your septum and nasal valve. Compare yourself with yourself, over many mornings, never with someone else.');
      more();
    }
    step(0);
  }

  /* ---------- 4. Practices ---------- */
  var PURPOSE = [['To settle', 'settle'], ['To cool', 'cool'], ['To warm', 'warm'], ['To switch sides', 'switch'], ['Just to observe', 'observe']];
  function practiceMenu() {
    say('Every practice I teach comes from the text itself, with its verse. What does your body need today?');
    ask(PURPOSE.map(function (p) { return [p[0], function () { practiceList(p[1]); }]; }));
  }
  function practiceList(purpose) {
    var ps = K.PRANAYAMA.filter(function (p) { return p.purpose === purpose; });
    if (!ps.length) ps = K.PRANAYAMA;
    say(ps.length === 1 ? 'There is one for that:' : 'These suit that. Choose one:');
    ask(ps.map(function (p) { return [p.name, function () { practice(p, purpose); }]; }).concat([['Something else', practiceMenu]]));
  }
  function practice(p, purpose) {
    count('practice_view');
    say('<span class="cm-tag">' + esc(p.sanskrit || '') + ' · verse ' + esc(p.verse) + ' · grade ' + esc(p.grade) + '</span><b>' + esc(p.name) + '</b><br>' + md(p.effect), { html: true });
    list(p.steps, 'How to do it · about ' + p.minutes + ' min');
    if (p.safety) say('**Please note:** ' + p.safety, { cls: 'warn' });
    ask([
      ['Guide me through it', function () { guide({ name: p.name, steps: p.steps, minutes: p.minutes, note: p.note }, null, feel); }, true],
      ['Why does it work?', function () { say(p.note || 'The text gives it, and the commentary grades it ' + p.grade + '.'); ask([['Guide me through it', function () { guide({ name: p.name, steps: p.steps, minutes: p.minutes, note: p.note }, null, feel); }, true], ['Another practice', function () { practiceList(purpose); }]]); }],
      ['Another practice', function () { practiceList(purpose); }]
    ]);
  }
  function feel() {
    say('How do you feel now?');
    ask([
      ['Calmer', function () { say('Good. Remember this feeling. It is always one slow breath away.', { mood: 'smile' }); offerEmail(function () { menu('Where next?'); }); }],
      ['About the same', function () { say('That is fine. The effect is often quiet, and it grows with practice, day after day.'); menu('Where next?'); }],
      ['Uneasy', function () { say('Then stop, and breathe normally. Not every practice suits every body on every day. If dizziness or discomfort continues, please see a doctor.'); menu('Where next?'); }]
    ]);
  }

  /* ---------- 5. Ask the text ---------- */
  var SUGGEST = ['How do I switch which nostril is flowing?', 'What is Sushumna?', 'What does the text say about sleep?', 'Why is there no breath retention here?'];
  function askPrompt() {
    say('Ask me anything about the breath and the Svarodaya. Type it below. I answer only from the text, with the verse, and if the book does not speak of it, I will tell you so.');
    ask(SUGGEST.map(function (q) { return [q, function () { answer(q); }]; }).concat([['Back', function () { menu('Of course.'); }]]));
    askInput('ask', 'Type your question…', null);
  }
  var corpusP = null;
  function corpus() {
    if (K.isCorpusLoaded()) return Promise.resolve();
    if (!corpusP) corpusP = new Promise(function (ok, fail) {
      var sc = document.createElement('script'); sc.src = chat.getAttribute('data-corpus') || 'svara-corpus.js';
      sc.onload = ok; sc.onerror = function () { corpusP = null; fail(); };
      document.head.appendChild(sc);
    });
    return corpusP;
  }
  function sourceLabel(rec) {
    var v = String(rec.v || '');
    if (v.indexOf('CONCL') === 0) return 'Conclusion';
    if (v.indexOf('APPX') === 0) return 'Appendix A';
    return /^\d/.test(v) ? 'Verse ' + v : 'Introduction';
  }
  function answer(q) {
    Q = Q.then(function () {
      var t = typing(900);
      return Promise.all([t, corpus().catch(function () { return 'fail'; })]).then(function (r) {
        if (r[1] === 'fail') { row('bot', md('I could not open the commentary just now. Check your connection, and ask me again.')); return; }
        var hits = K.search(q, 4);
        if (hits && hits.length && typeof hits[0].score === 'number' && hits[0].score < 11) hits = [];   // too weak to count as an answer
        if (!hits || !hits.length) {
          row('bot', md('The text does not speak of that. The Svarodaya covers the nasal cycle, its timing, the five elements and the practices, but it is not a general reference, and a made-up answer would be worse than none.'));
          return;
        }
        var lead = hits[0];
        var ans = K.summarise(lead.rec, lead.matched, 3);
        row('bot', '<p class="cm-ans">' + esc(ans) + '</p><p class="cm-from">' + esc(lead.rec.t) + ' · ' + esc(sourceLabel(lead.rec)) + '</p>');
        if (lead.rec.m) {
          var pr = K.bestPassage(lead.rec.m, lead.matched, 2);
          var same = pr && (ans.indexOf(pr.slice(0, 60)) > -1 || pr.indexOf(ans.slice(0, 60)) > -1);
          if (pr && !same) row('bot', '<span class="cm-tag">For practice</span>' + esc(pr));
        }
      });
    });
    say('Ask me something else, or choose below.');
    askInput('ask', 'Ask another question…', null);
    ask([['What does new research say?', function () { researchFor(q); }, true], ['Check my breath', checkBreath], ['Lessons', function () { lesson(mem.lesson && mem.lesson < LESSONS.length ? mem.lesson : 0); }], ['Back to the start', function () { menu('Where shall we go?'); }]]);
  }

  /* ---------- 6. Morning reminder ---------- */
  function reminder() {
    say('The text calls the morning check its most important practice: verse 149. One minute, before you rise and before you touch any device.');
    list(['Which side is flowing', 'How fast and deep the breath is', 'One word for your state'], 'Each morning, notice:');
    say('Thirty mornings make a baseline. Sixty show a pattern. **What time do you usually wake?**');
    ask(['05:30', '06:00', '06:30', '07:00', '07:30'].map(function (t) { return [t, function () { calendar(t); }]; }));
  }
  function calendar(t) {
    var box = document.querySelector('[data-remind]');
    var te = box && box.querySelector('[data-remind-time]');
    if (te) { te.value = t; te.dispatchEvent(new Event('input', { bubbles: true })); te.dispatchEvent(new Event('change', { bubbles: true })); }
    say('Which calendar do you use?');
    ask([
      ['Google Calendar', function () { var g = box && box.querySelector('[data-remind-google]'); if (g) window.open(g.href, '_blank', 'noopener'); say('I have opened Google Calendar with the reminder filled in. Just press Save there.'); done(); }, true],
      ['Apple or Outlook', function () { var b = box && box.querySelector('[data-remind-ics]'); b && b.click(); say('I have made a calendar file. Open it and it will add a repeating reminder.'); done(); }]
    ]);
    function done() { say('Nothing is sent to us. I will be here when you wake.'); menu('Anything else for now?'); }
  }

  /* ---------- the full page ---------- */
  function openFull(sel) {
    var full = document.getElementById('full-page'); if (!full) return;
    full.hidden = false;
    var t = sel ? document.querySelector(sel) : full;
    setTimeout(function () { (t || full).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }, 60);
  }
  document.querySelectorAll('[data-open-full]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); openFull(a.getAttribute('href') !== '#full-page' ? a.getAttribute('href') : null); });
  });
  if (location.hash && location.hash !== '#main' && document.querySelector(location.hash) && document.getElementById('full-page').contains(document.querySelector(location.hash))) openFull(location.hash);
  document.querySelectorAll('[data-chat-back]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); chat.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); });
  });

  /* ---------- the text box: a question, his name for you, or an email ---------- */
  var formMode = 'ask', formCb = null;
  function askInput(mode, placeholder, cb) {
    formMode = mode; formCb = cb;
    enqueue(function () {
      input.value = ''; input.placeholder = placeholder;
      input.type = mode === 'email' ? 'email' : 'text';
      input.setAttribute('autocomplete', mode === 'email' ? 'email' : mode === 'name' ? 'given-name' : 'off');
      form.querySelector('button').textContent = mode === 'ask' ? 'Ask' : 'Continue';
      form.hidden = false; input.focus({ preventScroll: true });
    });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim(); if (!q) return;
    input.value = '';
    if (formMode === 'ask') {
      hist.push(snapshot()); newScene(); crumbEl.hidden = false; crumbEl.textContent = 'You asked: ' + q;
      count('ask'); answer(q);
    } else {
      var cb = formCb; formMode = 'ask'; form.hidden = true;
      go(function () { cb(q); }, '');
    }
  });

  /* ---------- your name, asked once ---------- */
  function askName(then) {
    say('Before we begin, what may I call you?');
    askInput('name', 'Your first name', function (n) {
      n = n.replace(/[^\p{L}\p{M} .'-]/gu, '').trim().slice(0, 24);
      if (n) { remember('name', n); say('Namaste, ' + n + '. I will remember it, here in your browser only.', { mood: 'smile' }); }
      then();
    });
    ask([['I’d rather not say', function () { remember('name', ''); formMode = 'ask'; then(); }]]);
  }

  /* ---------- time of day ---------- */
  function timeLine() {
    var now = new Date(), hr = now.getHours(), st = null;
    if (mem.place && E.astro && E.astro.sunTimes) { try { st = E.astro.sunTimes(now, mem.place.lat, mem.place.lon); } catch (e) {} }
    if (st && st.sunrise && st.sunset) {
      var afterRise = (now - st.sunrise) / 6e4, toSet = (st.sunset - now) / 6e4;
      if (afterRise >= -45 && afterRise <= 120) return 'You are up with the sun. Daybreak is the text’s chosen time for watching the breath, verse 149.';
      if (Math.abs(toSet) <= 40) return 'The sun is setting. In Indian tradition this is sandhya, the joining of day and night, a time for sitting quietly.';
    } else {
      if (hr >= 4 && hr < 7) return 'You are up early. Daybreak is the text’s chosen time for watching the breath, verse 149.';
    }
    if (hr >= 22 || hr < 4) return 'It is late. Let us keep it short and gentle, and then rest.';
    return null;
  }

  /* ---------- the breath card (an image to keep or share) ---------- */
  var lastCheck = null;
  function breathCard(c) {
    if (!c) { menu(); return; }
    count('card_made');
    say('Here is your breath card. Keep it, or share it.');
    enqueue(function () {
      return drawCard(c).then(function (canvas) {
        var img = new Image(); img.src = canvas.toDataURL('image/png'); img.alt = 'Your breath card'; img.className = 'card-img';
        row('bot', img).classList.add('wide');
        c.png = canvas;
      });
    });
    var canShare = !!(navigator.canShare && window.File);
    ask([
      [canShare ? 'Share it' : 'Download it', function () { shareCard(c, canShare); }, true],
      ['Back to the start', function () { offerEmail(function () { menu('Where shall we go next?'); }); }]
    ]);
  }
  function shareCard(c, canShare) {
    var canvas = c.png; if (!canvas) return;
    count('card_shared');
    canvas.toBlob(function (blob) {
      var file = new File([blob], 'my-breath-card.png', { type: 'image/png' });
      if (canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'My breath today', text: 'Which nostril is flowing? Check yours: https://neuroscienceofmeditation.in/swar-yoga.html' }).catch(function () {});
      } else {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-breath-card.png';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }
      say('Done.');
      offerEmail(function () { menu('Where shall we go next?'); });
    }, 'image/png');
  }
  function loadImg(src) { return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; }); }
  function wrap(ctx, text, x, y, maxW, lh) {
    var words = String(text).split(' '), line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t; });
    if (line) ctx.fillText(line, x, y); return y + lh;
  }
  function drawCard(c) {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d'), sv = E.SVARAS[c.side], serif = 'Fraunces, Georgia, serif', sans = 'Archivo, Arial, sans-serif';
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return Promise.all([ready, loadImg((window.SVARA_GUIDE || {}).poster || '')]).then(function (r) {
      var face = r[1];
      g.fillStyle = '#F4EDDC'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#FBF7EC'; g.beginPath(); g.roundRect ? g.roundRect(60, 60, W - 120, H - 120, 48) : g.rect(60, 60, W - 120, H - 120); g.fill();
      g.fillStyle = '#C2611F'; g.fillRect(60, 60, 14, H - 120);
      g.fillStyle = '#C2611F'; g.font = '600 30px ' + sans; g.fillText((mem.name ? mem.name.toUpperCase() + '’S ' : 'MY ') + 'BREATH', 130, 170);
      g.fillStyle = '#1B4332'; g.font = '600 96px ' + serif; g.fillText(sv.name, 130, 290);
      g.fillStyle = sv.colour; g.font = '500 44px ' + sans;
      g.fillText(sv.side === 'both' ? 'both nostrils open' : sv.side + ' nostril flowing', 130, 360);
      g.fillStyle = '#5a5a4a'; g.font = '400 34px ' + sans;
      var when = c.t.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + ' · ' + c.t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      g.fillText(when + (c.place && c.place.label !== 'your location' ? ' · ' + c.place.label : ''), 130, 420);
      if (face) { g.save(); g.beginPath(); g.arc(W - 250, 270, 130, 0, Math.PI * 2); g.closePath(); g.clip();
        var s = Math.max(260 / face.width, 260 / face.height); g.drawImage(face, W - 250 - face.width * s / 2, 270 - face.height * s * 0.38, face.width * s, face.height * s); g.restore();
        g.strokeStyle = '#C2611F'; g.lineWidth = 8; g.beginPath(); g.arc(W - 250, 270, 130, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = '#1B4332'; g.font = '400 40px ' + serif; var y = 560;
      var trad = { ida: 'In the Shiva Svarodaya, the left is Ida, the moon channel: cooling, kept for quiet work.', pingala: 'In the Shiva Svarodaya, the right is Pingala, the sun channel: warming, kept for active work.', sushumna: 'In the Shiva Svarodaya, both open is Sushumna, the turning point, kept for sitting quietly.' }[c.side];
      y = wrap(g, trad, 130, y, W - 260, 56) + 20;
      if (c.r && c.r.expectedSvara) {
        g.font = '400 34px ' + sans; g.fillStyle = '#5a5a4a';
        var ruleG = gradeKey(((c.r.provenance || [])[0] || {}).grade);
        y = wrap(g, 'The text’s timing rule expected ' + c.r.expectedSvara.name + (c.r.alignment === 'aligned' ? ', and it matched today' : ', and it did not match today') +
          (ruleG === 'C' ? '. Measurement does not support that rule, so a match is chance, not proof.' : '.'), 130, y, W - 260, 48) + 10;
      }
      g.font = '400 30px ' + sans; g.fillStyle = '#8a6a4f';
      y = wrap(g, 'Science: the nasal cycle is real, controlled by the autonomic nervous system. A switch takes about 2 hours on average, and varies a lot (Kahana-Zweig et al., 2016).', 130, y + 10, W - 260, 44);
      g.fillStyle = '#1B4332'; g.fillRect(60, H - 230, W - 120, 170);
      g.fillStyle = '#F4F0E2'; g.font = '600 38px ' + serif; g.fillText('Which side is yours right now?', 130, H - 150);
      g.fillStyle = '#D6F53B'; g.font = '500 32px ' + sans; g.fillText('neuroscienceofmeditation.in/swar-yoga', 130, H - 98);
      return cv;
    });
  }

  /* ---------- a gentle offer: lessons and articles by email (Kit, once) ---------- */
  function offerEmail(next) {
    if (mem.emailAsked) { next(); return; }
    remember('emailAsked', 1); count('email_offer');
    go(function () {
      say('One small thing' + (mem.name ? ', ' + mem.name : '') + '. Would you like breath lessons and new evidence-checked articles by email? No spam, and you can leave any time.');
      ask([
        ['Yes, send them', function () {
          say('Wonderful. Which email should I use?');
          askInput('email', 'Your email address', function (em) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { say('That doesn’t look like an email address. Let us leave it for now.'); next(); return; }
            var body = new URLSearchParams(); body.append('email_address', em); if (mem.name) body.append('fields[first_name]', mem.name);
            fetch('https://app.kit.com/forms/9927031/subscriptions', { method: 'POST', mode: 'no-cors', body: body }).catch(function () {});
            remember('emailGiven', 1); count('email_given');
            say('Thank you. Please click the confirmation link in the email from Kit, so the lessons can reach you.', { mood: 'smile' });
            next();
          });
        }, true],
        ['Not now', function () { next(); }]
      ]);
    }, '');
  }

  /* ---------- live research (Europe PMC) ----------
     Real papers, fetched at the moment you ask, newest first. Listed, not
     endorsed: a single new study is a clue, reviews weigh many studies. */
  var EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
  var TOPICS = [
    ['The nasal cycle', '"nasal cycle"'],
    ['Slow breathing and calm', '("slow breathing" OR "slow-paced breathing" OR "resonance breathing") AND (anxiety OR stress OR "heart rate variability")'],
    ['One-nostril and alternate-nostril breathing', '("alternate nostril breathing" OR "unilateral nostril breathing" OR "nadi shodhana" OR "forced nostril breathing")'],
    ['Nasal breathing and the brain', '("nasal breathing" OR "nasal respiration") AND (brain OR memory OR cognition OR "neural oscillations")'],
    ['Breath and meditation', '("breath-focused" OR "breath awareness" OR "breath counting") AND meditation']
  ];
  function research() {
    count('research_open');
    say('Here is what scientists are publishing now. I look it up live, at this moment, from Europe PMC, a public library of medical research.');
    say('Which topic?');
    ask(TOPICS.map(function (t) { return [t[0], function () { papers(t[0], t[1], false); }]; }).concat([['Back', function () { menu('Where shall we go?'); }]]));
  }
  function isReview(p) { return /review|meta-analysis/i.test((p.pubType || '') + ' ' + (p.title || '')); }
  function paperHtml(p) {
    var link = p.doi ? 'https://doi.org/' + p.doi : (p.pmid ? 'https://europepmc.org/article/MED/' + p.pmid : 'https://europepmc.org/article/' + p.source + '/' + p.id);
    var kind = isReview(p) ? 'Review' : (/trial/i.test(p.pubType || '') ? 'Trial' : 'Study');
    var who = String(p.authorString || '').split(',')[0];
    return '<a class="pp" href="' + esc(link) + '" target="_blank" rel="noopener">' +
      '<span class="pp-kind pp-' + kind.toLowerCase() + '">' + kind + '</span>' +
      '<b>' + esc(String(p.title || '').replace(/<[^>]+>/g, '').replace(/\.$/, '')) + '</b>' +
      '<small>' + esc((who ? who + (String(p.authorString || '').indexOf(',') > -1 ? ' et al.' : '') + ' · ' : '') + (p.journalTitle || p.bookOrReportDetails && p.bookOrReportDetails.publisher || '') + ' · ' + (p.firstPublicationDate || p.pubYear || '')) + '</small></a>';
  }
  function papers(label, q, reviewsOnly) {
    count(reviewsOnly ? 'research_reviews' : 'research_newest');
    var query = '(' + q + ') AND SRC:MED' + (reviewsOnly ? ' AND (PUB_TYPE:"review" OR PUB_TYPE:"systematic-review" OR PUB_TYPE:"meta-analysis")' : '');
    var url = EPMC + '?format=json&resultType=core&pageSize=5&sort=' + encodeURIComponent('P_PDATE_D desc') + '&query=' + encodeURIComponent(query);
    var web = 'https://europepmc.org/search?query=' + encodeURIComponent(q);
    enqueue(function () {
      return typing(700).then(function () {
        return fetch(url).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
          var list = (d && d.resultList && d.resultList.result) || [];
          if (!list.length) { row('bot', md('I found nothing new on that just now.')); return; }
          row('bot', '<span class="cm-tag">' + (reviewsOnly ? 'Latest reviews' : 'Newest papers') + ' · ' + esc(label) + ' · ' + fmtN(d.hitCount) + ' in total</span>' + list.map(paperHtml).join('')).classList.add('wide');
        }).catch(function () {
          row('bot', 'I could not reach the research library just now. You can <a href="' + esc(web) + '" target="_blank" rel="noopener">search Europe PMC directly ↗</a>.');
        });
      });
    });
    say(reviewsOnly ? 'Reviews weigh many studies together, so they are the safer place to start.' : 'These are listed live, not checked by me. A single new study is a clue, not a conclusion. Reviews, which weigh many studies, are steadier.', { mood: 'explain' });
    ask([
      [reviewsOnly ? 'Show the newest studies' : 'Show reviews only', function () { papers(label, q, !reviewsOnly); }, true],
      ['Another topic', research],
      ['Back to the start', function () { menu('Where shall we go?'); }]
    ]);
  }
  // From "Ask the text": the same question, in live research
  var STOP = /\b(what|which|who|whom|how|why|when|where|does|do|did|is|are|was|were|the|a|an|of|to|in|on|for|and|or|my|me|i|you|your|it|this|that|about|say|says|text|can|should|with|be|there|here|reduce|reduces|help|helps|work|works|make|makes|good|bad|really|true|best|better|any|really|effect|effects|affect|affects|improve|improves)\b/gi;
  function researchFor(question) {
    var words = question.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(STOP, ' ').split(/\s+/).filter(function (w) { return w.length > 2; }).slice(0, 3);
    if (!words.length) { research(); return; }
    papers('your question', words.map(function (w) { return '"' + w + '"'; }).join(' AND ') + ' AND (breathing OR breath OR nasal OR respiration)', false);
  }


  function fmtN(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function recordStory() {
    count('record_story');
    var s = recordStats;
    if (!s) { say('I could not reach the open record just now. You can see it on the full page.'); more(); return; }
    say('This is what people like you have logged, observing their own breath.');
    say('So far, **' + fmtN(s.logs_total) + '** observations are in the open record, **' + fmtN(s.logs_last_7_days) + '** of them this week' + (s.contributors_30d ? ', from **' + fmtN(s.contributors_30d) + '** people in the last 30 days' : '') + '.');
    if (s.enough_data && s.by_hour_30d && s.by_hour_30d.length) {
      var t = { ida: 0, pingala: 0, sushumna: 0, n: 0 };
      s.by_hour_30d.forEach(function (b) { t.ida += b.ida; t.pingala += b.pingala; t.sushumna += b.sushumna; t.n += b.n; });
      var pc = function (x) { return Math.round(x / t.n * 100); };
      say('Across the day: left ' + pc(t.ida) + '%, right ' + pc(t.pingala) + '%, both ' + pc(t.sushumna) + '%.');
      say('These are self-reports from people who chose to take part, not a random sample, so they are a first look, not a verdict.');
    } else {
      say('It is too early to say anything. The chart appears once at least five people have contributed, so no one can be picked out.');
    }
    say('Every morning check you add makes the answer clearer, even when it disagrees with the text.');
    ask([['Check my breath now', checkBreath, true], ['See the chart', function () { say('I have opened it below.'); enqueue(function () { openFull('#open-record'); }); more(); }], ['Back', function () { menu('Where shall we go?'); }]]);
  }

  /* ---------- his sound (the audio from his video, looped) ----------
     Browsers only allow sound after the visitor does something, so it starts
     on their first choice or tap, unless they have turned it off. */
  var amb = $('[data-ambient]', chat), sndBtn = $('[data-sound]', chat), sndLabel = $('[data-sound-label]', chat);
  var SND_KEY = 'sadhu-sound', LOUD = 0.55, QUIET = 0.12;
  var soundOn = (function () { try { return localStorage.getItem(SND_KEY) !== 'off'; } catch (e) { return true; } }());
  var target = LOUD, fadeT = null, wantPlay = false;
  function fadeTo(v, ms) {
    if (!amb) return; clearInterval(fadeT);
    var from = amb.volume, steps = Math.max(1, Math.round((ms || 600) / 40)), i = 0;
    fadeT = setInterval(function () { i++; amb.volume = Math.max(0, Math.min(1, from + (v - from) * i / steps)); if (i >= steps) clearInterval(fadeT); }, 40);
  }
  function syncSnd() {
    if (!sndBtn) return;
    sndBtn.setAttribute('aria-pressed', String(soundOn));
    sndLabel.textContent = soundOn ? 'Sound on' : 'Sound off';
  }
  function startSound() {
    if (!amb || !soundOn) return;
    wantPlay = true;
    if (!amb.paused) return;
    amb.volume = 0; var p = amb.play();
    if (p && p.then) p.then(function () { fadeTo(target, 1200); }).catch(function () {});
  }
  function stopSound() { wantPlay = false; if (!amb) return; fadeTo(0, 400); setTimeout(function () { if (!wantPlay) amb.pause(); }, 450); }
  if (amb) {
    syncSnd();
    chat.addEventListener('pointerdown', function first(e) {
      if (e.target.closest('[data-sound]')) return;
      startSound();
    });
    chat.addEventListener('keydown', function () { startSound(); });
    sndBtn.addEventListener('click', function () {
      soundOn = !soundOn; try { localStorage.setItem(SND_KEY, soundOn ? 'on' : 'off'); } catch (e) {}
      syncSnd(); if (soundOn) startSound(); else stopSound();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (!amb.paused) { amb.pause(); amb.dataset.resume = '1'; } }
      else if (amb.dataset.resume === '1' && soundOn) { amb.dataset.resume = ''; amb.play().catch(function () {}); }
    });
  } else syncSnd();
  // The guided adjustment lowers it while it speaks, and restores it after.
  // Music: an original tanpura drone, its own on/off.
  var mus = $('[data-music]', chat), musBtn = $('[data-music-btn]', chat), musLabel = $('[data-music-label]', chat);
  var MUS_KEY = 'sadhu-music', M_LOUD = 0.32, M_QUIET = 0.08, mTarget = M_LOUD, mFade = null;
  var musicOn = (function () { try { return localStorage.getItem(MUS_KEY) !== 'off'; } catch (e) { return true; } }());
  function mFadeTo(v, ms) {
    if (!mus) return; clearInterval(mFade);
    var from = mus.volume, steps = Math.max(1, Math.round((ms || 600) / 40)), i = 0;
    mFade = setInterval(function () { i++; mus.volume = Math.max(0, Math.min(1, from + (v - from) * i / steps)); if (i >= steps) clearInterval(mFade); }, 40);
  }
  function syncMus() { if (!musBtn) return; musBtn.setAttribute('aria-pressed', String(musicOn)); musLabel.textContent = musicOn ? 'Music on' : 'Music off'; }
  function startMusic() {
    if (!mus || !musicOn || !mus.paused) return;
    mus.volume = 0; var p = mus.play(); if (p && p.then) p.then(function () { mFadeTo(mTarget, 2500); }).catch(function () {});
  }
  if (mus) {
    syncMus();
    chat.addEventListener('pointerdown', function (e) { if (!e.target.closest('[data-music-btn]')) startMusic(); });
    chat.addEventListener('keydown', startMusic);
    musBtn.addEventListener('click', function () {
      musicOn = !musicOn; try { localStorage.setItem(MUS_KEY, musicOn ? 'on' : 'off'); } catch (e) {}
      syncMus(); count(musicOn ? 'music_on' : 'music_off');
      if (musicOn) startMusic(); else { mFadeTo(0, 400); setTimeout(function () { if (!musicOn) mus.pause(); }, 450); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (!mus.paused) { mus.pause(); mus.dataset.resume = '1'; } }
      else if (mus.dataset.resume === '1' && musicOn) { mus.dataset.resume = ''; mus.play().catch(function () {}); }
    });
  }
  window.SadhuAmbient = { duck: function (on) {
    target = on ? QUIET : LOUD; mTarget = on ? M_QUIET : M_LOUD;
    if (amb && !amb.paused) fadeTo(target, 700); if (mus && !mus.paused) mFadeTo(mTarget, 700);
  } };

  /* ---------- hello ---------- */
  function hello() {
    newScene(); setCrumb(''); backBtn.disabled = true;
    if (!E || !K) { say('Namaste. Something did not load properly. Please refresh the page.'); return; }
    count('hello');
    var tl = timeLine();
    if (mem.met) {
      say('Namaste' + (mem.name ? ', ' + mem.name : '') + '. Welcome back.', { mood: 'smile' });
      if (tl) say(tl);
      var w = weekly();
      if (w && w.top) {
        say('This past week, your ' + (w.mornings ? 'mornings were' : 'checks were') + ' mostly **' + E.SVARAS[w.top].name + '**, the ' + E.SVARAS[w.top].side + (w.top === 'sushumna' ? ' sides' : ' side') + ' (' + w.c[w.top] + ' of ' + w.n + '). Shall we see if today is different?');
      } else if (w) {
        say('This past week your ' + (w.mornings ? 'mornings' : 'checks') + ' were mixed: ' + w.c.ida + ' left, ' + w.c.pingala + ' right, ' + w.c.sushumna + ' both. That is what the science would expect.');
      } else if (mem.lastSide && E.SVARAS[mem.lastSide]) {
        var days = Math.round((Date.now() - (mem.lastTime || 0)) / 864e5);
        say('Last time' + (days >= 1 ? ', ' + (days === 1 ? 'yesterday' : days + ' days ago') : '') + ', your ' + E.SVARAS[mem.lastSide].side + (mem.lastSide === 'sushumna' ? ' sides were' : ' side was') + ' flowing. Shall we see what it is doing now?');
      }
      menu('What would you like to do?');
    } else {
      remember('met', 1);
      say('Namaste. I am ' + NAME + '.', { mood: 'smile' });
      if (tl) say(tl);
      say('Your breath is changing sides even now, and most people never notice it. I can help you watch it, understand it, and work with it, gently.');
      say('Everything I tell you comes from the Shiva Svarodaya and The Respiratory Codex, with the verse, and with an honest word on what science says.');
      askName(function () { menu('Where shall we begin' + (mem.name ? ', ' + mem.name : '') + '?'); });
    }
  }

  // Start when the chat is on screen
  if ('IntersectionObserver' in window) {
    var started = false;
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting && !started) { started = true; io.disconnect(); hello(); } }, { threshold: 0.2 });
    io.observe(chat);
  } else hello();

  // Sadhu ji's video: play only while visible
  var v = $('video', chat);
  if (v) {
    if (reduce) { v.removeAttribute('autoplay'); v.pause(); }
    else if ('IntersectionObserver' in window) new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
    }).observe(v);
  }
})();
