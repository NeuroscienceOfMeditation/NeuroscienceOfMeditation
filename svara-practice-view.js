/* ==========================================================================
   svara-practice-view.js
   Full-screen guided practice for shifting the svara, per the text.

   - Written steps for the method the person chose, the current one highlighted
   - Natural spoken guidance (svara-voice.js), with subtitles on screen
   - Camera as a mirror: shown on this device only. No frame is read,
     recorded, stored or sent anywhere.
   - A gentle timer after the instructions, then "Observe again"

   Opens in the same page on purpose: browsers silence speech in background
   tabs and often block new tabs on phones.

   window.SvaraPracticeView.open({ method, target, onObserveAgain })
   ========================================================================== */
(function () {
  'use strict';

  var V = window.SvaraVoice;
  var PREF = 'nom.svara.view.v1';
  var prefs = { camera: true, captions: true };
  try { var saved = JSON.parse(localStorage.getItem(PREF) || 'null'); if (saved) prefs = Object.assign(prefs, saved); } catch (e) {}
  function savePrefs() { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) {} }

  var SIDE = { ida: 'left', pingala: 'right', sushumna: 'both sides' };
  var ORDINAL = ['First', 'Next', 'Then', 'After that', 'Now', 'Next'];

  var dlg, el = {}, stream = null, opener = null;
  var run = null;   // current session state

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  /* ------------------------------------------------------------------ DOM */
  function build() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'pv';
    dlg.setAttribute('aria-labelledby', 'pv-title');
    dlg.setAttribute('aria-describedby', 'pv-safety');
    dlg.innerHTML =
      '<div class="pv-shell">' +
        '<header class="pv-top">' +
          '<div class="pv-heading">' +
            '<p class="pv-kicker">Guided adjustment</p>' +
            '<h2 id="pv-title" data-pv-title>Practice</h2>' +
            '<p class="pv-target" data-pv-target></p>' +
          '</div>' +
          '<div class="pv-tools" role="toolbar" aria-label="Practice settings">' +
            '<button type="button" class="pv-tool" data-pv-voice aria-pressed="true"><span class="pv-ico" aria-hidden="true">' + ICON.voice + '</span><span data-pv-voice-label>Voice on</span></button>' +
            '<button type="button" class="pv-tool" data-pv-cc aria-pressed="true"><span class="pv-ico" aria-hidden="true">' + ICON.cc + '</span><span data-pv-cc-label>Subtitles on</span></button>' +
            '<button type="button" class="pv-tool" data-pv-cam aria-pressed="false"><span class="pv-ico" aria-hidden="true">' + ICON.cam + '</span><span data-pv-cam-label>Camera off</span></button>' +
            '<button type="button" class="pv-close" data-pv-close aria-label="End practice and close">' + ICON.close + '</button>' +
          '</div>' +
        '</header>' +

        '<div class="pv-main">' +
          '<section class="pv-stage" aria-label="Mirror and subtitles">' +
            '<video class="pv-video" playsinline muted aria-label="Your camera, shown only on this screen"></video>' +
            '<div class="pv-camoff" data-pv-camoff>' +
              '<div class="pv-camoff-glyph" aria-hidden="true">' + ICON.nose + '</div>' +
              '<p data-pv-camoff-text>The camera works as a mirror, to help you check your position. It stays on this device.</p>' +
              '<button type="button" class="pv-btn ghost" data-pv-cam-inline>Turn on camera</button>' +
            '</div>' +
            '<div class="pv-ring" data-pv-ring hidden>' +
              '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="pv-ring-bg"/><circle cx="60" cy="60" r="52" class="pv-ring-fg" data-pv-ring-fg/></svg>' +
              '<div class="pv-ring-text"><b data-pv-clock>0:00</b><span>remaining</span></div>' +
            '</div>' +
            '<p class="pv-caption" data-pv-caption role="status" aria-live="polite"></p>' +
          '</section>' +

          '<aside class="pv-side">' +
            '<h3 class="pv-side-h">Steps</h3>' +
            '<ol class="pv-steps" data-pv-steps></ol>' +
            '<p class="pv-note" data-pv-note></p>' +
            '<div class="pv-controls">' +
              '<button type="button" class="pv-btn primary" data-pv-start>Start guidance</button>' +
              '<button type="button" class="pv-btn" data-pv-pause hidden aria-pressed="false">Pause</button>' +
              '<button type="button" class="pv-btn" data-pv-repeat hidden>Repeat step</button>' +
              '<button type="button" class="pv-btn primary" data-pv-again hidden>Observe again</button>' +
            '</div>' +
            '<p class="pv-status" data-pv-status aria-live="polite"></p>' +
          '</aside>' +
        '</div>' +

        '<footer class="pv-foot" id="pv-safety">Go gently. Stop and breathe normally if you feel dizzy, breathless or unwell. ' +
          'Nothing from your camera is recorded or sent anywhere.</footer>' +
      '</div>';
    document.body.appendChild(dlg);

    ['title', 'target', 'steps', 'note', 'caption', 'ring', 'clock', 'camoff', 'status'].forEach(function (k) {
      el[k] = dlg.querySelector('[data-pv-' + k + ']');
    });
    el.ringFg = dlg.querySelector('[data-pv-ring-fg]');
    el.camoffText = dlg.querySelector('[data-pv-camoff-text]');
    el.video = dlg.querySelector('.pv-video');
    el.start = dlg.querySelector('[data-pv-start]');
    el.pause = dlg.querySelector('[data-pv-pause]');
    el.repeat = dlg.querySelector('[data-pv-repeat]');
    el.again = dlg.querySelector('[data-pv-again]');
    el.voice = dlg.querySelector('[data-pv-voice]');
    el.cc = dlg.querySelector('[data-pv-cc]');
    el.cam = dlg.querySelector('[data-pv-cam]');

    el.start.addEventListener('click', start);
    el.pause.addEventListener('click', togglePause);
    el.repeat.addEventListener('click', repeatStep);
    el.again.addEventListener('click', observeAgain);
    el.voice.addEventListener('click', toggleVoice);
    el.cc.addEventListener('click', toggleCaptions);
    el.cam.addEventListener('click', function () { stream ? stopCamera() : startCamera(); });
    dlg.querySelector('[data-pv-cam-inline]').addEventListener('click', startCamera);
    dlg.querySelector('[data-pv-close]').addEventListener('click', close);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });   // Esc
  }

  /* ----------------------------------------------------------------- open */
  function open(o) {
    if (!o || !o.method) return;
    build();
    opener = document.activeElement;
    var m = o.method, t = o.target || {};
    run = {
      method: m, target: t, onObserveAgain: o.onObserveAgain,
      script: [], idx: -1, paused: false, phase: 'ready',
      timers: [], left: Math.max(30, Math.round((m.minutes || 3) * 60)), total: 0, cues: {}
    };
    run.total = run.left;

    el.title.textContent = m.name;
    el.target.innerHTML = t.label
      ? 'Aiming for <b style="--pv-dot:' + esc(t.colour || '#C6A15B') + '">' + esc(t.label) + '</b> · about ' + esc(m.minutes) + ' min'
      : 'About ' + esc(m.minutes) + ' min';
    el.steps.innerHTML = (m.steps || []).map(function (s, i) {
      return '<li data-i="' + i + '"><span class="pv-num" aria-hidden="true">' + (i + 1) + '</span><span>' + esc(s) + '</span></li>';
    }).join('');
    el.note.textContent = m.note || '';
    el.caption.textContent = '';
    el.caption.hidden = !prefs.captions;
    el.status.textContent = '';
    el.ring.hidden = true;
    el.start.hidden = false; el.start.disabled = false; el.start.textContent = 'Start guidance';
    el.pause.hidden = true; el.repeat.hidden = true; el.again.hidden = true;
    syncVoiceBtn(); syncCcBtn(); syncCamBtn();

    run.script = buildScript(m, t);
    setCaption('When you’re settled, press Start guidance. Each step will appear here as it’s spoken.', true);

    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.documentElement.classList.add('pv-lock');
    el.start.focus();
    if (prefs.camera) startCamera();
  }

  function buildScript(m, t) {
    var side = SIDE[t.key] || 'the other side';
    var lines = [];
    lines.push({ say: 'Let’s guide the breath towards the ' + side + ', using ' + m.name + '.', show: 'Guiding the breath towards the ' + side + '.', step: -1 });
    lines.push({ say: 'It takes about ' + m.minutes + ' minutes. Go at your own pace, and if anything feels uncomfortable, simply stop and breathe normally.', show: 'About ' + m.minutes + ' minutes. Stop if anything feels uncomfortable.', step: -1 });
    (m.steps || []).forEach(function (s, i) {
      var lead = i === (m.steps.length - 1) && m.steps.length > 1 ? 'Finally' : ORDINAL[Math.min(i, ORDINAL.length - 1)];
      var plain = s.replace(/\.$/, '');
      lines.push({ say: lead + ', ' + plain.charAt(0).toLowerCase() + plain.slice(1) + '.', show: s, step: i });
    });
    lines.push({ say: 'Now stay here, and breathe at your own natural pace. I’ll keep time for you.', show: 'Stay here and breathe naturally. The timer has started.', step: -2 });
    return lines;
  }

  /* ---------------------------------------------------------- guidance run */
  function start() {
    if (!run) return;
    if (V && V.isEnabled()) V.prime();
    run.phase = 'guiding';
    el.start.hidden = true;
    el.pause.hidden = false; el.repeat.hidden = false;
    el.pause.focus();
    nextLine();
  }

  function later(fn, ms) { var id = setTimeout(fn, ms); run.timers.push(id); return id; }
  function clearRunTimers() { if (!run) return; run.timers.forEach(clearTimeout); run.timers.forEach(clearInterval); run.timers = []; }

  function nextLine() {
    if (!run || run.paused) return;
    run.idx++;
    if (run.idx >= run.script.length) { beginTimer(); return; }
    speakLine(run.script[run.idx], function () { later(nextLine, 700); });
  }

  function speakLine(line, done) {
    highlight(line.step);
    setCaption(line.show);
    var voiceOn = V && V.supported && V.isEnabled();
    if (voiceOn) {
      V.say(line.say, { caption: false, onEnd: function () { if (run && !run.paused) done(); } });
    } else {
      // No voice: give people time to read, then move on.
      later(function () { if (run && !run.paused) done(); }, V ? V.estimateMs(line.show, 0.8) : 4000);
    }
  }

  function highlight(stepIndex) {
    Array.prototype.forEach.call(el.steps.children, function (li) {
      var i = +li.dataset.i;
      li.classList.toggle('now', i === stepIndex);
      li.classList.toggle('done', stepIndex >= 0 ? i < stepIndex : stepIndex === -2);
      if (i === stepIndex) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    var now = el.steps.querySelector('.now');
    if (now && now.scrollIntoView) now.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  function beginTimer() {
    run.phase = 'timing';
    el.repeat.hidden = true;
    el.ring.hidden = false;
    tick();
    var id = setInterval(function () {
      if (!run || run.paused) return;
      run.left--;
      tick();
      var half = Math.floor(run.total / 2);
      if (run.total >= 120 && run.left === half && !run.cues.half) { run.cues.half = 1; cue('You’re halfway there. Keep breathing at your own natural pace.', 'Halfway. Keep breathing naturally.'); }
      if (run.total > 90 && run.left === 60 && !run.cues.min) { run.cues.min = 1; cue('About a minute to go.', 'About a minute to go.'); }
      if (run.left === 15 && !run.cues.last) { run.cues.last = 1; cue('Fifteen more seconds.', '15 seconds.'); }
      if (run.left <= 0) { clearInterval(id); finish(); }
    }, 1000);
    run.timers.push(id);
  }

  function tick() {
    var m = Math.floor(run.left / 60), s = run.left % 60;
    el.clock.textContent = m + ':' + String(s).padStart(2, '0');
    var c = 2 * Math.PI * 52;
    el.ringFg.style.strokeDasharray = c;
    el.ringFg.style.strokeDashoffset = c * (1 - run.left / run.total);
  }

  function cue(sayText, showText) {
    setCaption(showText);
    if (V && V.isEnabled()) V.say(sayText, { caption: false });
  }

  function finish() {
    run.phase = 'done';
    highlight(-2);
    el.pause.hidden = true; el.repeat.hidden = true;
    el.again.hidden = false;
    el.clock.textContent = '0:00';
    var msg = 'That’s it. Gently come back to sitting. When you’re ready, choose Observe again, and notice which side is flowing now.';
    setCaption('Done. When you’re ready, choose Observe again and notice which side is flowing now.');
    el.status.textContent = 'Practice complete.';
    if (V && V.isEnabled()) V.say(msg, { caption: false });
    el.again.focus();
  }

  function togglePause() {
    if (!run) return;
    run.paused = !run.paused;
    el.pause.textContent = run.paused ? 'Resume' : 'Pause';
    el.pause.setAttribute('aria-pressed', String(run.paused));
    el.status.textContent = run.paused ? 'Paused.' : '';
    if (run.paused) {
      if (V) V.cancel();
      run.timers.forEach(clearTimeout);   // keep the interval; it checks run.paused
    } else if (run.phase === 'guiding') {
      run.idx--;          // restart the line that was interrupted
      nextLine();
    }
  }

  function repeatStep() {
    if (!run || run.phase !== 'guiding') return;
    if (V) V.cancel();
    run.timers.forEach(clearTimeout);
    run.paused = false; el.pause.textContent = 'Pause'; el.pause.setAttribute('aria-pressed', 'false');
    run.idx = Math.max(-1, run.idx - 1);
    nextLine();
  }

  function setCaption(text, force) {
    el.caption.textContent = text || '';
    el.caption.classList.toggle('empty', !text);
    el.caption.hidden = !(prefs.captions || force) || !text;
  }

  /* ---------------------------------------------------------------- tools */
  function toggleVoice() {
    if (!V || !V.supported) { el.status.textContent = 'Spoken guidance isn’t available in this browser. Subtitles still show each step.'; return; }
    var on = V.setEnabled(!V.isEnabled());
    syncVoiceBtn();
    el.status.textContent = on ? 'Voice on.' : 'Voice off. Subtitles will still guide you.';
    if (!on && run && run.phase === 'guiding') { run.timers.forEach(clearTimeout); run.idx--; nextLine(); }
  }
  function syncVoiceBtn() {
    var on = !!(V && V.supported && V.isEnabled());
    el.voice.setAttribute('aria-pressed', String(on));
    dlg.querySelector('[data-pv-voice-label]').textContent = on ? 'Voice on' : 'Voice off';
  }
  function toggleCaptions() {
    prefs.captions = !prefs.captions; savePrefs(); syncCcBtn();
    el.caption.hidden = !prefs.captions || !el.caption.textContent;
  }
  function syncCcBtn() {
    el.cc.setAttribute('aria-pressed', String(prefs.captions));
    dlg.querySelector('[data-pv-cc-label]').textContent = prefs.captions ? 'Subtitles on' : 'Subtitles off';
  }
  function syncCamBtn() {
    el.cam.setAttribute('aria-pressed', String(!!stream));
    dlg.querySelector('[data-pv-cam-label]').textContent = stream ? 'Camera on' : 'Camera off';
    el.camoff.hidden = !!stream;
    dlg.classList.toggle('pv-live', !!stream);
  }

  function startCamera() {
    if (stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      el.camoffText.textContent = 'This browser doesn’t offer camera access. The guidance works the same without it.';
      return;
    }
    el.camoffText.textContent = 'Asking for camera permission…';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(function (s) {
      if (!dlg.open) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s;
      el.video.srcObject = s;
      var p = el.video.play(); if (p && p.catch) p.catch(function () {});
      prefs.camera = true; savePrefs();
      syncCamBtn();
    }).catch(function () {
      el.camoffText.textContent = 'No camera, no problem. Follow the steps and subtitles; everything works the same.';
      syncCamBtn();
    });
  }
  function stopCamera(keepPref) {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    el.video.srcObject = null;
    if (!keepPref) { prefs.camera = false; savePrefs(); }
    el.camoffText.textContent = 'Camera is off. It works as a mirror only, and stays on this device.';
    syncCamBtn();
  }

  /* ----------------------------------------------------------------- exit */
  function teardown() {
    clearRunTimers();
    if (V) V.cancel();
    stopCamera(true);
    document.documentElement.classList.remove('pv-lock');
    if (dlg.open) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); }
  }
  function close() {
    if (!dlg) return;
    teardown();
    run = null;
    if (opener && opener.focus) opener.focus();
  }
  function observeAgain() {
    var cb = run && run.onObserveAgain;
    teardown();
    run = null;
    if (cb) cb();
  }

  window.addEventListener('pagehide', function () { if (dlg && dlg.open) teardown(); });

  var ICON = {
    voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/><path d="m15 10.5 6-3.5v10l-6-3.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    nose: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="32" cy="30" rx="16" ry="21"/><path d="M32 18v16"/><circle cx="27.5" cy="37" r="2.2" stroke="#2E7FA8"/><circle cx="36.5" cy="37" r="2.2" stroke="#E4744F"/></svg>'
  };

  window.SvaraPracticeView = { open: open, close: close };
}());
