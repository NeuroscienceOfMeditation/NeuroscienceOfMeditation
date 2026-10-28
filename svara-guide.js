/* Sadhu ji leads the breath tool, step by step.
   He doesn't speak aloud: he "talks" through his text box. For every stage of
   the tool he says one thing, lists exactly what to do, and lights up the
   control to press next. Edit his words in STATES below. */
(function () {
  var box = document.querySelector('[data-sg]');
  var root = document.getElementById('svara');
  if (!box || !root) return;
  var $ = function (s) { return root.querySelector(s); };
  var tagEl = box.querySelector('[data-sg-tag]');
  var textEl = box.querySelector('[data-sg-text]');
  var todoEl = box.querySelector('[data-sg-todo]');
  var showBtn = box.querySelector('[data-sg-show]');
  var vid = box.querySelector('video');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce && vid) { vid.removeAttribute('autoplay'); vid.pause(); }

  // tag: the little heading; say: his sentence; todo: the steps; hl: what to light up
  var STATES = {
    'observe': {
      tag: 'Svara · Step 1 of 4 · Settle',
      say: 'Namaste. Before we change the breath, let us first come to know it. Sit with me for a moment.',
      todo: ['Sit comfortably. Let the shoulders soften.', 'Breathe normally through the nose and follow the circle as it grows and shrinks.', 'When the time is up, press “I’m ready to report”.'],
      hl: '[data-orb]'
    },
    'observe-ready': {
      tag: 'Svara · Step 1 of 4 · Settle',
      say: 'Good. The breath has settled. Now we look at it.',
      todo: ['Press “I’m ready to report”.'],
      hl: '[data-observe-done]'
    },
    'report': {
      tag: 'Svara · Step 2 of 4 · Your side',
      say: 'Which side is flowing more freely right now? Go by what you feel, not by what you expect.',
      todo: ['Hold the back of your hand just under your nose.', 'Breathe out gently, two or three times.', 'Notice which side feels stronger, then tap Left, Right or Both.'],
      hl: '.sv-choices'
    },
    'report-ida': {
      tag: 'Svara · Step 2 of 4 · Your side',
      say: 'The left side. Ida, the moon channel. The texts call it cooling and steadying.',
      todo: ['Press Continue.'], hl: '[data-report-done]'
    },
    'report-pingala': {
      tag: 'Svara · Step 2 of 4 · Your side',
      say: 'The right side. Pingala, the sun channel. The texts call it warming and active.',
      todo: ['Press Continue.'], hl: '[data-report-done]'
    },
    'report-sushumna': {
      tag: 'Svara · Step 2 of 4 · Your side',
      say: 'Both sides, or changing. Sushumna, the turning point. The texts keep this moment for sitting quietly.',
      todo: ['Press Continue.'], hl: '[data-report-done]'
    },
    'context': {
      tag: 'Svara · Step 3 of 4 · Time & place',
      say: 'The Svarodaya counts the cycle from sunrise, so tell me roughly where you are.',
      todo: ['Choose your nearest city, or press “Use my location”.', 'If you are observing now, leave the date and time as they are.', 'Then press “See the assessment”.'],
      hl: '[data-f-city]'
    },
    'context-ready': {
      tag: 'Svara · Step 3 of 4 · Time & place',
      say: 'Good, I know your sunrise now.',
      todo: ['Press “See the assessment”.'],
      hl: '[data-context-done]'
    },
    'result': {
      tag: 'Svara · Step 4 of 4 · Result',
      say: 'Here is what you noticed, beside what the text expected at this hour. If they differ, that is not a mistake. It is information.',
      todo: ['Read your observation and the text’s expectation.', 'Each rule shows its verse and how strong the evidence is.', 'If you wish to shift the breath, choose an option below.'],
      hl: '[data-result-actions]'
    },
    'practice': {
      tag: 'Svara · Guided correction',
      say: 'Now we gently invite the other side. Softly, never forcing.',
      todo: ['Read the practice above the circle.', 'Press Start and breathe with the circle.', 'Stop if you feel dizzy or breathless.'],
      hl: '[data-p-run]'
    },
    'practice-done': {
      tag: 'Svara · Guided correction',
      say: 'Well done. Now let us see whether the breath has moved.',
      todo: ['Press “Observe again”.', 'Check your side once more, the same way as before.'],
      hl: '[data-practice-done]'
    },
    'tattva': {
      tag: 'Tattva · Read the element',
      say: 'The text says each breath carries one of five elements. Four things you can measure yourself. I will take you through them one at a time.',
      todo: ['Press “Talk me through the measurements”.', 'Enter what you measure in the form.', 'Press “Read the phase”.'],
      hl: '[data-tattva-guide]'
    },
    'tattva-guided': {
      tag: 'Tattva · Measurement',
      say: 'Do this one slowly with me: ',
      todo: ['Read the instruction in the box below and try it.', 'Press “Say it again” to repeat it.', 'Press Next when you are done.'],
      hl: '[data-guided-next]'
    },
    'tattva-result': {
      tag: 'Tattva · Result',
      say: 'This is the phase your measurements point to. Only what you measured decided it.',
      todo: ['Read the result below.', 'Press Clear to measure again later.'],
      hl: '[data-tattva-result]'
    },
    'pranayama': {
      tag: 'Practice · Choose',
      say: 'Every practice here comes from the text itself, with its verse beside it. Choose what your body needs today.',
      todo: ['Use the filters: Settle, Cool, Warm or Switch sides.', 'Read a practice and its safety note.', 'Press “Guide me through it”.'],
      hl: '.sv-filters'
    },
    'pranayama-run': {
      tag: 'Practice · With me',
      say: 'Sit tall and soft. No holding, no forcing. We begin: ',
      todo: ['Press Start.', 'Breathe with the circle and read the cue under it.', 'Press Close when you are finished.'],
      hl: '[data-r-run]'
    },
    'ask': {
      tag: 'Ask the text',
      say: 'Ask me anything about the breath and the Svarodaya. I answer only from the text, with the verse. If the book does not speak of it, I will tell you so.',
      todo: ['Type your question, or tap a suggestion.', 'Press Ask.'],
      hl: '[data-ask-input]'
    },
    'ask-answer': {
      tag: 'Ask the text',
      say: 'This is what the text says. See how it sits with your own experience.',
      todo: ['Read the passage, its verse and its grade.', 'Ask another question whenever you like.'],
      hl: '[data-ask-result]'
    }
  };

  function filled(sel) { var e = $(sel); return e && e.textContent.trim().length > 0; }
  function enabled(sel) { var e = $(sel); return e && !e.disabled; }

  function state() {
    var pane = root.querySelector('.sv-pane.on');
    var p = pane ? pane.getAttribute('data-pane') : 'observe';
    if (p === 'observe') {
      var st = root.querySelector('.sv-step.on');
      var s = st ? st.getAttribute('data-step') : 'observe';
      if (s === 'observe') return enabled('[data-observe-done]') ? 'observe-ready' : 'observe';
      if (s === 'report') { var ch = root.querySelector('.sv-choice[aria-pressed="true"]'); return ch ? 'report-' + ch.getAttribute('data-s') : 'report'; }
      if (s === 'context') return enabled('[data-context-done]') ? 'context-ready' : 'context';
      if (s === 'practice') return enabled('[data-practice-done]') ? 'practice-done' : 'practice';
      return s;
    }
    if (p === 'tattva') {
      var g = $('[data-guided]');
      if (g && !g.hidden) return 'tattva-guided|' + (($('[data-guided-title]') || {}).textContent || '').trim();
      return filled('[data-tattva-result]') ? 'tattva-result' : 'tattva';
    }
    if (p === 'practice') {
      var r = $('[data-runner]');
      if (r && !r.hidden) return 'pranayama-run|' + (($('[data-runner-title]') || {}).textContent || '').trim();
      return 'pranayama';
    }
    if (p === 'ask') return filled('[data-ask-result]') ? 'ask-answer|' + $('[data-ask-result]').textContent.trim().slice(0, 40) : 'ask';
    return 'observe';
  }

  var hlEl = null;
  function light(sel) {
    if (hlEl) hlEl.classList.remove('sg-hl');
    hlEl = sel ? $(sel) : null;
    if (hlEl && hlEl.offsetParent !== null) hlEl.classList.add('sg-hl'); else hlEl = null;
    showBtn.hidden = !hlEl;
  }

  var timer, last = '';
  function say(st, extra) {
    clearInterval(timer);
    var msg = st.say + (extra ? extra.replace(/\.$/, '') + '.' : '');
    tagEl.textContent = st.tag;
    todoEl.classList.remove('show'); todoEl.innerHTML = '';
    st.todo.forEach(function (t, i) { var li = document.createElement('li'); li.textContent = t; li.style.transitionDelay = (i * 0.12) + 's'; todoEl.appendChild(li); });
    box.classList.remove('is-new'); void box.offsetWidth; box.classList.add('is-new');
    light(st.hl);
    function done() { box.classList.remove('is-talking'); todoEl.classList.add('show'); }
    if (reduce) { textEl.textContent = msg; done(); return; }
    var i = 0; textEl.textContent = ''; box.classList.add('is-talking');
    timer = setInterval(function () {
      i += 2; textEl.textContent = msg.slice(0, i);
      if (i >= msg.length) { clearInterval(timer); done(); }
    }, 24);
  }

  function update() {
    var k = state();
    if (k === last) { if (hlEl && !document.contains(hlEl)) light(STATES[k.split('|')[0]].hl); return; }
    var prevStep = last.split('|')[0].split('-')[0];
    last = k;
    var parts = k.split('|');
    // New step (not just a choice inside it): bring Sadhu ji back into view.
    if (prevStep && parts[0].split('-')[0] !== prevStep) {
      var top = box.getBoundingClientRect().top;
      if (top < 70 || top > window.innerHeight * 0.45)
        window.scrollTo({ top: Math.max(0, top + window.scrollY - 90), behavior: reduce ? 'auto' : 'smooth' });
    }
    say(STATES[parts[0]] || STATES.observe, parts[1]);
  }

  showBtn.addEventListener('click', function () {
    if (!hlEl) return;
    var y = hlEl.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + 40;
    window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
    hlEl.classList.remove('sg-hl'); void hlEl.offsetWidth; hlEl.classList.add('sg-hl');
    var f = hlEl.matches('button,input,select') ? hlEl : hlEl.querySelector('button:not([disabled]),input,select');
    if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 500);
  });
  box.querySelector('[data-sg-text]').addEventListener('click', function () {
    if (!box.classList.contains('is-talking')) return;
    var parts = last.split('|'), st = STATES[parts[0]];
    clearInterval(timer); textEl.textContent = st.say + (parts[1] ? parts[1].replace(/\.$/, '') + '.' : '');
    box.classList.remove('is-talking'); todoEl.classList.add('show');
  });

  var pending;
  new MutationObserver(function () { clearTimeout(pending); pending = setTimeout(update, 160); })
    .observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-pressed', 'disabled'] });
  root.addEventListener('change', function () { clearTimeout(pending); pending = setTimeout(update, 160); });

  // Start talking when he first comes into view.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { io.disconnect(); update(); }
    }, { threshold: 0.4 });
    io.observe(box);
  } else update();

  // Pause the video when he is off screen, to save battery.
  if (vid && !reduce && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); } else vid.pause();
    }).observe(vid);
  }
})();
