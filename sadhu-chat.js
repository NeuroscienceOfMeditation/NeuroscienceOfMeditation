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
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- memory (this browser only) ---------- */
  var MEM_KEY = 'sadhu-chat';
  var mem = {};
  try { mem = JSON.parse(localStorage.getItem(MEM_KEY) || '{}') || {}; } catch (e) {}
  function remember(k, v) { mem[k] = v; try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) {} }

  /* ---------- rendering ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }   // **bold** only
  function scrollDown() { log.scrollTo({ top: log.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }); }

  var lastWasBot = false;
  function row(who, inner) {
    var r = document.createElement('div');
    r.className = 'cm ' + who + (who === 'bot' && lastWasBot ? ' cont' : '');
    if (who === 'bot') r.innerHTML = '<img class="cm-face" src="' + FACE + '" alt="" aria-hidden="true">';
    var b = document.createElement('div'); b.className = 'cm-b';
    if (typeof inner === 'string') b.innerHTML = inner; else b.appendChild(inner);
    r.appendChild(b); log.appendChild(r);
    lastWasBot = who === 'bot';
    scrollDown();
    return b;
  }

  // Everything Sadhu ji says goes through one queue, so messages arrive in
  // order with a "typing" pause, like a person talking.
  var Q = Promise.resolve();
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); }); }
  function typing(ms) {
    var t = document.createElement('div');
    t.className = 'cm bot typing' + (lastWasBot ? ' cont' : '');
    t.innerHTML = '<img class="cm-face" src="' + FACE + '" alt="" aria-hidden="true"><div class="cm-b"><i></i><i></i><i></i></div>';
    log.appendChild(t); scrollDown();
    return wait(ms).then(function () { t.remove(); });
  }
  function say(text, opt) {
    opt = opt || {};
    Q = Q.then(function () {
      var plain = String(text).replace(/<[^>]+>/g, '');
      return typing(Math.min(1500, 380 + plain.length * 12)).then(function () {
        var b = row('bot', opt.html ? text : md(text));
        if (opt.cls) b.classList.add(opt.cls);
      });
    });
    return Q;
  }
  function list(items, title) {
    Q = Q.then(function () {
      return typing(450).then(function () {
        row('bot', (title ? '<b>' + md(title) + '</b>' : '') +
          '<ol class="cm-list">' + items.map(function (x) { return '<li>' + md(x) + '</li>'; }).join('') + '</ol>');
      });
    });
    return Q;
  }
  function widget(build) {
    Q = Q.then(function () { return new Promise(function (done) { var el = build(done); row('bot', el); }); });
    return Q;
  }
  function me(text) { row('me', esc(text)); }

  // Reply buttons. Each option: [label, handler, isPrimary]
  function ask(opts) {
    Q = Q.then(function () {
      chipsEl.innerHTML = '';
      opts.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'chip' + (o[2] ? ' p' : '');
        b.textContent = o[0];
        b.addEventListener('click', function () {
          chipsEl.innerHTML = '';
          if (!o[3]) me(o[0]);       // o[3] = don't echo
          o[1]();
        });
        chipsEl.appendChild(b);
      });
      scrollDown();
    });
  }
  function clearChips() { chipsEl.innerHTML = ''; }

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
      ['Morning reminder', reminder]
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
    say('Breathe normally and rest your eyes on this circle for fifteen seconds. Don’t change anything. Just notice.');
    widget(function (done) { return orb(15, done); });
    say('Good.');
    say('Now hold the back of your hand just under your nose and breathe out gently, two or three times. **Which side feels stronger?**');
    sideChips(function (side) {
      remember('lastSide', side); remember('lastTime', Date.now());
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
    if (r.alignment === 'aligned') say('And you noticed ' + obs.name + '. Your breath and the text agree right now.');
    else if (r.alignment === 'sushumna' || side === 'sushumna') say('You noticed both sides, Sushumna, the moment of turning. The text says to sit quietly in it, not to begin worldly work.');
    else say('You noticed ' + obs.name + '. They differ. That is not a mistake, it is information. Here we are testing the text, not you.');
    var pv = (r.provenance || []).slice(0, 2);
    if (pv.length) say('<div class="cm-src">' + pv.map(function (p) {
      return '<span><b>' + esc(p.title) + '</b> · verse ' + esc(p.verse) + ' · ' + esc(gradeText(r, p.grade)) + '</span>';
    }).join('') + '</div>', { html: true, cls: 'src' });
    if (r.expectedTattva && E.TATTVAS[r.expectedTattva]) {
      var t = E.TATTVAS[r.expectedTattva];
      say('The text would also say the **' + t.name + '** element, ' + t.english.toLowerCase() + ', is running now. That one you can check with your own breath, if you like.');
    }
    afterResult(r, side);
  }

  function afterResult(r, side) {
    say('What would you like to do now?');
    var opts = [];
    if (r && r.correctivePractice) opts.push(['Help me shift the breath', function () { shift(r, side); }, true]);
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
          ['Guide me through it', function () { guide({ name: m.name, steps: m.steps, minutes: m.minutes, note: m.note }, { label: tgt.label, colour: tgt.colour }, function () { observeAgain(side); }); }, true],
          ['I’ll do it myself', function () { say('Take your time. Tell me when you have finished.'); ask([['I’ve finished', function () { observeAgain(side); }, true]]); }],
          ['Choose another way', function () { shift(r, side); }]
        ]);
      }];
    }));
  }

  // The full-screen practice view (svara-practice-view.js)
  function guide(method, target, after) {
    var finished = false;
    function done() { if (finished) return; finished = true; clearChips(); after(); }
    if (window.SvaraPracticeView) {
      say('I will guide you on the full screen. Come back here when you are done.');
      Q = Q.then(function () { window.SvaraPracticeView.open({ method: method, target: target || {}, onObserveAgain: function () { me('I’ve finished'); done(); } }); });
      ask([['I’ve finished', done, true]]);
    } else {
      list(method.steps, method.name);
      ask([['I’ve finished', done, true]]);
    }
  }

  function observeAgain(prev) {
    say('Welcome back. Now let us look again, the same way as before. Breathe out onto your hand. **Which side is stronger now?**');
    sideChips(function (side) {
      remember('lastSide', side); remember('lastTime', Date.now());
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
    if (s.points && s.points.length) list(s.points);
    var last = i === LESSONS.length - 1;
    var opts = [[last ? 'Finish' : 'Next →', function () {
      if (last) { remember('lesson', LESSONS.length); say('You have walked the whole path. Observe each morning at daybreak, and come back whenever you need me.'); menu(); }
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
      ['Calmer', function () { say('Good. Remember this feeling. It is always one slow breath away.'); menu('Where next?'); }],
      ['About the same', function () { say('That is fine. The effect is often quiet, and it grows with practice, day after day.'); menu('Where next?'); }],
      ['Uneasy', function () { say('Then stop, and breathe normally. Not every practice suits every body on every day. If dizziness or discomfort continues, please see a doctor.'); menu('Where next?'); }]
    ]);
  }

  /* ---------- 5. Ask the text ---------- */
  var SUGGEST = ['How do I switch which nostril is flowing?', 'What is Sushumna?', 'What does the text say about sleep?', 'Why is there no breath retention here?'];
  function askPrompt() {
    say('Ask me anything about the breath and the Svarodaya. Type it below. I answer only from the text, with the verse, and if the book does not speak of it, I will tell you so.');
    ask(SUGGEST.map(function (q) { return [q, function () { answer(q); }]; }).concat([['Back', function () { menu('Of course.'); }]]));
    Q = Q.then(function () { input.focus({ preventScroll: true }); });
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
    more();
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
    a.addEventListener('click', function (e) { e.preventDefault(); chat.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); setTimeout(function () { input.focus({ preventScroll: true }); }, 500); });
  });
  var restart = $('[data-chat-restart]', chat);
  restart && restart.addEventListener('click', function () { clearChips(); log.innerHTML = ''; lastWasBot = false; Q = Promise.resolve(); hello(); });

  /* ---------- typing a message ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim(); if (!q) return;
    input.value = ''; clearChips(); me(q);
    var l = q.toLowerCase();
    if (/^(hi|hello|hey|namaste|namaskar|pranam)\b/.test(l)) { say('Namaste.'); menu('What would you like to do?'); }
    else if (/^(menu|start|help)$/.test(l)) menu('Here is what we can do together.');
    else if (/^(check|check my breath|my breath)$/.test(l)) checkBreath();
    else answer(q);
  });

  /* ---------- hello ---------- */
  function hello() {
    if (!E || !K) { say('Namaste. Something did not load properly. Please refresh the page.'); return; }
    if (mem.met) {
      say('Namaste. Welcome back.');
      if (mem.lastSide && E.SVARAS[mem.lastSide]) {
        var days = Math.round((Date.now() - (mem.lastTime || 0)) / 86400000);
        say('Last time' + (days >= 1 ? ', ' + (days === 1 ? 'yesterday' : days + ' days ago') : '') + ', your ' + E.SVARAS[mem.lastSide].side + (mem.lastSide === 'sushumna' ? ' sides were' : ' side was') + ' flowing. Shall we see what it is doing now?');
      }
      menu('What would you like to do?');
    } else {
      remember('met', 1);
      say('Namaste. I am Sadhu ji.');
      say('Your breath is changing sides even now, and most people never notice it. I can help you watch it, understand it, and work with it, gently.');
      say('Everything I tell you comes from the Shiva Svarodaya and The Respiratory Codex, with the verse, and with an honest word on what science says.');
      menu('Where shall we begin?');
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
