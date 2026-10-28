/* Sadhu ji: the guide beside the Svara tool.
   He doesn't speak aloud. He "talks" through the text box, and his words
   follow whatever the visitor is doing in the tool (tab, step, choice).
   Edit his lines in LINES below. */
(function () {
  var box = document.querySelector('[data-sg]');
  var root = document.getElementById('svara');
  if (!box || !root) return;
  var textEl = box.querySelector('[data-sg-text]');
  var vid = box.querySelector('video');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce && vid) { vid.removeAttribute('autoplay'); vid.pause(); }

  var LINES = {
    'observe': 'Namaste. Before we change the breath, let us first come to know it. Sit comfortably and breathe normally. Follow the circle for a few breaths, and let the breath settle by itself.',
    'report': 'Now hold the back of your hand just under your nose. Which side feels a little stronger? Go by what you feel, not by what you expect.',
    'report-ida': 'The left side. Ida, the moon channel. It is said to be cooling and steadying. Press continue when you are ready.',
    'report-pingala': 'The right side. Pingala, the sun channel. It is said to be warming and active. Press continue when you are ready.',
    'report-sushumna': 'Both sides, or changing. Sushumna. The texts say this is the moment for stillness and meditation, not for worldly work.',
    'context': 'The Svarodaya counts the breath from sunrise. Tell me roughly where you are, and the time. The nearest city is close enough.',
    'result': 'Here is what you noticed, next to what the text expects at this hour. Read it slowly. If they differ, that is not a mistake, it is simply information.',
    'practice': 'Now we gently invite the other side. Follow the circle, breathe softly through the nose, and never force. If you feel dizzy, stop and breathe normally.',
    'tattva': 'The text says each breath carries one of five elements. Four things you can check yourself, like the length of the breath on your hand. Shall I walk you through them? Press "Talk me through the measurements".',
    'tattva-guided': 'Do this one slowly with me: ',
    'pranayama': 'Every practice here comes from the text itself, with its verse beside it. Choose the one your body needs today: to settle, to cool, to warm, or to switch sides.',
    'pranayama-run': 'Sit tall and soft. Follow the circle with your breath. No holding, no forcing. Begin when you are ready: ',
    'ask': 'Ask me anything about the breath and the Svarodaya. I will answer only from the text, with the verse. If the book does not speak of it, I will tell you so.',
    'ask-answer': 'This is what the text says. Read the verse and its grade, and see how it sits with your own experience.'
  };

  function state() {
    var pane = root.querySelector('.sv-pane.on');
    var p = pane ? pane.getAttribute('data-pane') : 'observe';
    if (p === 'observe') {
      var st = root.querySelector('.sv-step.on');
      var s = st ? st.getAttribute('data-step') : 'observe';
      if (s === 'report') {
        var ch = root.querySelector('.sv-choice[aria-pressed="true"]');
        return ch ? 'report-' + ch.getAttribute('data-s') : 'report';
      }
      return s;
    }
    if (p === 'tattva') {
      var g = root.querySelector('[data-guided]');
      if (g && !g.hidden) {
        var t = (root.querySelector('[data-guided-title]') || {}).textContent || '';
        return 'tattva-guided|' + t.trim();
      }
      return 'tattva';
    }
    if (p === 'practice') {
      var r = root.querySelector('[data-runner]');
      if (r && !r.hidden) {
        var rt = (root.querySelector('[data-runner-title]') || {}).textContent || '';
        return 'pranayama-run|' + rt.trim();
      }
      return 'pranayama';
    }
    if (p === 'ask') {
      var a = root.querySelector('[data-ask-result]');
      return a && a.textContent.trim() ? 'ask-answer|' + a.textContent.trim().slice(0, 40) : 'ask';
    }
    return 'observe';
  }

  function lineFor(key) {
    var parts = key.split('|');
    var base = LINES[parts[0]] || LINES.observe;
    if (parts[1]) base += parts[1].replace(/\.$/, '') + '.';
    return base;
  }

  var timer, last = '';
  function say(msg) {
    clearInterval(timer);
    box.classList.remove('is-new'); void box.offsetWidth; box.classList.add('is-new');
    if (reduce) { textEl.textContent = msg; return; }
    var i = 0; textEl.textContent = ''; box.classList.add('is-talking');
    timer = setInterval(function () {
      i += 2; textEl.textContent = msg.slice(0, i);
      if (i >= msg.length) { clearInterval(timer); box.classList.remove('is-talking'); }
    }, 28);
  }

  function update() {
    var k = state();
    if (k === last) return;
    last = k; say(lineFor(k));
  }

  var pending;
  new MutationObserver(function () { clearTimeout(pending); pending = setTimeout(update, 160); })
    .observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-pressed'] });

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
