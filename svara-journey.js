/* Sadhu ji's guided journey + scrolling companion (swar-yoga.html).
   Lessons come from _data/sadhu_journey.yml via window.SADHU_JOURNEY. */
(function () {
  var J = window.SADHU_JOURNEY; if (!J || !J.steps) return;
  var STEPS = J.steps, CH = J.chapters || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var ov = $('[data-sj]'), sc = $('[data-sc]'); if (!ov || !sc) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var K_STEP = 'sadhu-step', K_SEEN = 'sadhu-seen', K_MIN = 'sadhu-min', K_DONE = 'sadhu-done';

  /* ---------- typing ---------- */
  function typer(el, onDone) {
    var t = null, full = '';
    return {
      say: function (msg) {
        clearInterval(t); full = msg;
        if (reduce) { el.textContent = msg; onDone && onDone(); return; }
        var i = 0; el.textContent = ''; el.classList.add('typing');
        t = setInterval(function () {
          i += 2; el.textContent = msg.slice(0, i);
          if (i >= msg.length) this.finish(); 
        }.bind(this), 22);
      },
      finish: function () {
        if (t === null && el.textContent === full) return false;
        clearInterval(t); t = null; el.textContent = full; el.classList.remove('typing'); onDone && onDone(); return true;
      },
      busy: function () { return t !== null; }
    };
  }

  /* ---------- the journey ---------- */
  var idx = Math.min(parseInt(store.get(K_STEP) || '0', 10) || 0, STEPS.length - 1);
  var vid = $('video', ov), bar = $('[data-sj-bar]', ov), dots = $('[data-sj-dots]', ov);
  var pts = $('[data-sj-points]', ov), tryBtn = $('[data-sj-try]', ov);
  var nextBtn = $('[data-sj-next]', ov), backBtn = $('[data-sj-back]', ov);
  var T = typer($('[data-sj-say]', ov), function () { pts.classList.add('show'); });
  var lastFocus = null;

  STEPS.forEach(function () { dots.appendChild(document.createElement('i')); });

  function render() {
    var s = STEPS[idx];
    $('[data-sj-chap]', ov).textContent = 'Chapter ' + s.chapter + (CH[s.chapter - 1] ? ' · ' + CH[s.chapter - 1] : '');
    $('[data-sj-count]', ov).textContent = 'Step ' + (idx + 1) + ' of ' + STEPS.length;
    $('[data-sj-title]', ov).textContent = s.title;
    bar.style.width = ((idx + 1) / STEPS.length * 100) + '%';
    [].forEach.call(dots.children, function (d, i) { d.className = i < idx ? 'done' : i === idx ? 'on' : ''; });
    pts.classList.remove('show'); pts.innerHTML = '';
    (s.points || []).forEach(function (p, i) {
      var li = document.createElement('li'); li.textContent = p; li.style.transitionDelay = (i * 0.12) + 's'; pts.appendChild(li);
    });
    if (s.action) { tryBtn.hidden = false; tryBtn.textContent = s.action.label + ' →'; } else tryBtn.hidden = true;
    backBtn.disabled = idx === 0;
    nextBtn.textContent = idx === STEPS.length - 1 ? 'Finish' : 'Next →';
    var card = $('.sj-card', ov); card.classList.remove('turn'); void card.offsetWidth; card.classList.add('turn');
    $('.sj-talk', ov).scrollTop = 0;
    T.say(s.say);
    store.set(K_STEP, String(idx));
  }

  function open(at) {
    if (typeof at === 'number') idx = Math.max(0, Math.min(at, STEPS.length - 1));
    lastFocus = document.activeElement;
    ov.hidden = false; document.documentElement.classList.add('sj-lock');
    store.set(K_SEEN, '1'); hideCompanion();
    if (!reduce) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); }
    render(); nextBtn.focus({ preventScroll: true });
  }
  function close(mode) {
    ov.hidden = true; document.documentElement.classList.remove('sj-lock'); vid.pause();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (mode === 'paused') companionPaused();
    else { paused = false; companionFor(current, true); }
  }
  function next() {
    if (T.finish()) return;                     // first tap finishes his sentence
    if (idx < STEPS.length - 1) { idx++; render(); }
    else { store.set(K_DONE, '1'); store.set(K_STEP, '0'); idx = 0; close(); companionSay(LINES.done, [act('Start again', function () { open(0); })]); }
  }
  function back() { if (idx > 0) { idx--; render(); } }

  nextBtn.addEventListener('click', next);
  backBtn.addEventListener('click', back);
  $('[data-sj-close]', ov).addEventListener('click', function () { close(); });
  $('[data-sj-bubble]', ov).addEventListener('click', function () { T.finish(); });
  tryBtn.addEventListener('click', function () { var a = STEPS[idx].action; close('paused'); go(a.go); });
  document.addEventListener('keydown', function (e) {
    if (ov.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') back();
    else if (e.key === 'Tab') {                 // keep focus inside the journey
      var f = ov.querySelectorAll('button:not([disabled]):not([hidden])');
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- "Try it now": jump into the page ---------- */
  function tab(name) { var b = $('.sv-tab[data-tab="' + name + '"]'); if (b && b.getAttribute('aria-selected') !== 'true') b.click(); }
  function scrollTo(el) { if (!el) return; var y = el.getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }); }
  function go(where) {
    if (where === 'tool:observe') { tab('observe'); scrollTo($('#svara .sv-tabs')); }
    else if (where === 'tool:remind') { tab('observe'); var r = $('[data-remind-time]'); scrollTo(r && r.closest('.sv-panel')); }
    else if (where === 'tool:tattva') { tab('tattva'); var g = $('[data-guided]'); if (g && g.hidden) { var gb = $('[data-tattva-guide]'); gb && gb.click(); } scrollTo($('#svara .sv-tabs')); }
    else if (where === 'tool:practice') { tab('practice'); scrollTo($('#svara .sv-tabs')); }
    else if (where === 'tool:ask') { tab('ask'); scrollTo($('#svara .sv-tabs')); setTimeout(function () { var q = $('[data-ask-input]'); q && q.focus({ preventScroll: true }); }, 600); }
    else if (where && where.charAt(0) === '#') scrollTo($(where));
  }

  /* ---------- the corner companion ---------- */
  var scVid = $('video', sc), bubble = $('[data-sc-bubble]', sc), acts = $('[data-sc-acts]', sc);
  var CT = typer($('[data-sc-say]', sc));
  var paused = false, current = 'hero', inTool = false;
  var LINES = {
    hero: 'Namaste. Your breath is changing sides even now. Shall I walk you through Swar Yoga, step by step?',
    back: 'Welcome back. Shall we continue where we stopped?',
    green: 'One minute each morning, before you get up. That is all the record asks. Verse 149 calls it the most important practice in the book.',
    method: 'These are the traditional uses of each side. Read them as a hypothesis, not a rule. Below, the book says honestly what holds up and what does not.',
    safety: 'Please read this part before you try any practice. If you feel dizzy or breathless, stop and breathe normally.',
    record: 'This is what everyone\'s observations show so far. Only the totals are shown, never anyone\'s own logs.',
    data: 'Your data stays yours. We collect the least we can, and we never sell it.',
    done: 'You have walked the whole path. Observe each morning at daybreak, and come back whenever you need me.'
  };
  function act(label, fn, primary) { return { label: label, fn: fn, primary: primary }; }
  function companionSay(text, actions) {
    sc.hidden = false; sc.classList.remove('min');
    acts.innerHTML = '';
    (actions || []).forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'btn ' + (a.primary ? 'p' : 's'); b.textContent = a.label;
      b.addEventListener('click', a.fn); acts.appendChild(b);
    });
    CT.say(text); flag();
    if (!reduce) { var p = scVid.play(); if (p && p.catch) p.catch(function () {}); }
  }
  function hideCompanion() { sc.hidden = true; scVid.pause(); flag(); }
  function minimise() { sc.classList.add('min'); store.set(K_MIN, '1'); flag(); }
  function flag() { document.documentElement.classList.toggle('sc-open', !sc.hidden && !sc.classList.contains('min')); }
  function stepAt() { return parseInt(store.get(K_STEP) || '0', 10) || 0; }

  function companionPaused() {
    paused = true;
    var n = stepAt(), s = STEPS[Math.min(n + 1, STEPS.length - 1)];
    var last = n >= STEPS.length - 1;
    companionSay(last ? 'Take your time. When you are ready, we will finish together.'
                      : 'Take your time and try it. When you are ready, we continue with step ' + (n + 2) + ': ' + s.title + '.',
      [act('Continue with Sadhu ji →', function () { paused = false; open(last ? n : n + 1); }, true)]);
  }

  function companionFor(key, force) {
    if (paused || !ov.hidden) return;
    if (!force && key === current && !sc.hidden) return;
    current = key;
    if (inTool) { hideCompanion(); return; }      // the tool has Sadhu ji inline already
    if (store.get(K_MIN) === '1' && !force) { sc.hidden = false; sc.classList.add('min'); flag(); return; }
    if (key === 'hero') {
      var started = stepAt() > 0 && store.get(K_DONE) !== '1';
      companionSay(started ? LINES.back : LINES.hero, started
        ? [act('Continue', function () { open(stepAt()); }, true), act('Start over', function () { open(0); })]
        : [act('Yes, guide me', function () { open(0); }, true), act('I\'ll explore', function () { store.set(K_SEEN, '1'); minimise(); })]);
    } else companionSay(LINES[key] || LINES.hero, [act('Walk me through', function () { open(stepAt()); })]);
  }

  $('[data-sc-min]', sc).addEventListener('click', minimise);
  $('[data-sc-face]', sc).addEventListener('click', function () {
    if (sc.classList.contains('min')) { sc.classList.remove('min'); store.set(K_MIN, '0'); if (!paused) companionFor(current, true); }
    else if (!paused) open(stepAt());
  });

  // Which section is on screen?
  var SECTIONS = [
    ['hero', document.querySelector('main > section')],
    ['tool', document.getElementById('svara')],
    ['green', document.querySelector('section.green')],
    ['method', document.getElementById('method')],
    ['safety', document.getElementById('safety')],
    ['record', document.getElementById('open-record')],
    ['data', document.querySelector('section.deep')]
  ].filter(function (p) { return p[1]; });
  var visible = {};
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { var k = e.target.getAttribute('data-sc-key'); visible[k] = e.isIntersecting ? e.intersectionRatio : 0; });
      var toolNow = (visible.tool || 0) > 0.15;
      if (toolNow !== inTool) { inTool = toolNow; if (inTool && !paused) hideCompanion(); }
      if (paused) return;
      var best = null, r = 0;
      SECTIONS.forEach(function (p) { if (p[0] !== 'tool' && (visible[p[0]] || 0) > r) { r = visible[p[0]]; best = p[0]; } });
      if (inTool) return;
      if (best && (best !== current || sc.hidden)) companionFor(best);
    }, { threshold: [0, 0.15, 0.3, 0.5] });
    SECTIONS.forEach(function (p) { p[1].setAttribute('data-sc-key', p[0]); io.observe(p[1]); });
  }

  // Buttons anywhere on the page that start the journey
  document.querySelectorAll('[data-sj-start]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); open(store.get(K_DONE) === '1' ? 0 : stepAt()); });
  });

  // First visit: greet after a moment. Link ?guide opens the journey directly.
  if (/[?&]guide\b/.test(location.search)) setTimeout(function () { open(0); }, 400);
  else setTimeout(function () { if (ov.hidden && !paused) companionFor(current, store.get(K_SEEN) !== '1'); }, 1400);
})();
