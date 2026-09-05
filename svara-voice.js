/* ============================================================================
   svara-voice.js
   Spoken guidance using the browser's built-in speech synthesis.

   No API key, no audio files, no network request. Works on a static host.

   The awkward parts of the Web Speech API, all handled here so the rest of
   the code can just call say():

     - getVoices() is empty on first call in Chrome and fills in later, so we
       wait on the voiceschanged event.
     - iOS Safari refuses to speak unless the first utterance originates in a
       user gesture, so prime() is called from the toggle.
     - Chrome silently stops speaking after roughly 15 seconds, so a keep-alive
       pause/resume ping runs while speech is active.
     - Utterances queue by default, which is wrong for a breathing pacer where
       a late "breathe in" must not stack behind a stale one. say() interrupts
       by default; queue: true opts out.
   ============================================================================ */

(function (root) {
  'use strict';

  var synth = root.speechSynthesis;
  var supported = !!synth && typeof root.SpeechSynthesisUtterance === 'function';

  var PREF_KEY = 'nom.svara.voice.v1';

  var state = {
    enabled: false,
    voiceURI: null,
    rate: 0.92,          // a shade under natural; these are instructions
    pitch: 1,
    volume: 1,
    primed: false
  };

  var voices = [];
  var listeners = [];
  var keepAlive = null;
  var seqToken = 0;      // invalidates an in-flight sequence when a new one starts

  /* --- preferences ---------------------------------------------------------- */

  function load() {
    try {
      var raw = root.localStorage.getItem(PREF_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (typeof p.enabled === 'boolean') state.enabled = p.enabled;
        if (p.voiceURI) state.voiceURI = p.voiceURI;
        if (p.rate) state.rate = p.rate;
      }
    } catch (e) { /* storage blocked; defaults are fine */ }
  }

  function save() {
    try {
      root.localStorage.setItem(PREF_KEY, JSON.stringify({
        enabled: state.enabled, voiceURI: state.voiceURI, rate: state.rate
      }));
    } catch (e) { /* ignore */ }
  }

  /* --- voices --------------------------------------------------------------- */

  function refreshVoices() {
    if (!supported) return;
    var all = synth.getVoices() || [];
    // English first, then anything else; local voices before network ones.
    voices = all.filter(function (v) {
      return /^en|^hi/i.test(v.lang);
    });
    if (!voices.length) voices = all;

    voices.sort(function (a, b) {
      if (a.localService !== b.localService) return a.localService ? -1 : 1;
      return a.lang.localeCompare(b.lang);
    });

    listeners.forEach(function (fn) { fn(voices); });
  }

  if (supported) {
    refreshVoices();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', refreshVoices);
    } else {
      synth.onvoiceschanged = refreshVoices;
    }
  }

  function currentVoice() {
    if (!voices.length) return null;
    if (state.voiceURI) {
      var found = voices.filter(function (v) { return v.voiceURI === state.voiceURI; })[0];
      if (found) return found;
    }
    // Prefer a local English voice as the default.
    return voices.filter(function (v) {
      return v.localService && /^en/i.test(v.lang);
    })[0] || voices[0];
  }

  /* --- keep-alive ----------------------------------------------------------- */

  function startKeepAlive() {
    if (keepAlive) return;
    keepAlive = setInterval(function () {
      if (!synth.speaking) { stopKeepAlive(); return; }
      // Chrome drops long utterances without this. Harmless elsewhere.
      try { synth.pause(); synth.resume(); } catch (e) { /* ignore */ }
    }, 9000);
  }

  function stopKeepAlive() {
    if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
  }

  /* --- speaking ------------------------------------------------------------- */

  /**
   * Screen text and speech want different things. Dashes are read as pauses or
   * skipped inconsistently, bracketed grade markers get spelled out, and IAST
   * diacritics make most voices stumble. Normalise before speaking.
   */
  function forSpeech(text) {
    return String(text)
      .replace(/\s*[\u2014\u2013]\s*/g, ', ')          // em and en dash to a pause
      .replace(/\[(E|S|X)(, negative)?\]/g, '')  // grade markers
      .replace(/[śṣ]/g, 'sh').replace(/ñ/g, 'ny')
      .replace(/[ṅṇ]/g, 'n').replace(/ṭ/g, 't').replace(/ḍ/g, 'd')
      .replace(/ṃ/g, 'm').replace(/ḥ/g, '').replace(/ṛ/g, 'ri')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*,\s*,/g, ',')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Speak one line.
   * @param {String} text
   * @param {Object} opts  { queue, rate, onEnd, force }
   */
  function say(text, opts) {
    opts = opts || {};
    if (!supported || (!state.enabled && !opts.force) || !text) {
      if (opts.onEnd) opts.onEnd();
      return null;
    }

    if (!opts.queue) cancel();

    var clean = forSpeech(text);
    if (!clean) { if (opts.onEnd) opts.onEnd(); return null; }

    var u = new root.SpeechSynthesisUtterance(clean);
    var v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = opts.rate || state.rate;
    u.pitch = state.pitch;
    u.volume = state.volume;

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      stopKeepAlive();
      if (opts.onEnd) opts.onEnd();
    }
    u.onend = finish;
    u.onerror = finish;

    try {
      synth.speak(u);
      startKeepAlive();
    } catch (e) {
      finish();
    }
    return u;
  }

  /**
   * Speak lines one after another with a gap between them.
   * Returns a cancel function. A new sequence supersedes the previous one.
   */
  function sequence(lines, opts) {
    opts = opts || {};
    var gap = opts.gap == null ? 700 : opts.gap;
    var token = ++seqToken;
    var i = 0;
    var timer = null;

    if (!supported || !state.enabled) {
      if (opts.onDone) opts.onDone();
      return function () {};
    }

    cancel();

    function next() {
      if (token !== seqToken) return;
      if (i >= lines.length) {
        if (opts.onDone) opts.onDone();
        return;
      }
      var line = lines[i++];
      if (opts.onLine) opts.onLine(line, i - 1);
      say(line, {
        queue: true,
        onEnd: function () {
          if (token !== seqToken) return;
          timer = setTimeout(next, gap);
        }
      });
    }

    next();

    return function () {
      if (token === seqToken) seqToken++;
      if (timer) clearTimeout(timer);
      cancel();
    };
  }

  function cancel() {
    if (!supported) return;
    stopKeepAlive();
    try { synth.cancel(); } catch (e) { /* ignore */ }
  }

  /**
   * iOS will not speak later unless the first utterance came from a gesture.
   * Called from the toggle, which is always a real tap.
   */
  function prime() {
    if (!supported || state.primed) return;
    state.primed = true;
    var u = new root.SpeechSynthesisUtterance(' ');
    u.volume = 0;
    try { synth.speak(u); } catch (e) { /* ignore */ }
  }

  /* --- control -------------------------------------------------------------- */

  function setEnabled(on) {
    state.enabled = !!on;
    if (state.enabled) prime(); else cancel();
    save();
    return state.enabled;
  }

  function setVoice(uri) { state.voiceURI = uri; save(); }
  function setRate(r) { state.rate = Math.min(1.4, Math.max(0.6, Number(r) || 0.92)); save(); }

  load();

  if (root.addEventListener) {
    root.addEventListener('pagehide', cancel);
    // Stop talking if the tab goes to the background.
    if (root.document) {
      root.document.addEventListener('visibilitychange', function () {
        if (root.document.hidden) cancel();
      });
    }
  }

  /* ========================================================================== */

  root.SvaraVoice = {
    supported: supported,
    say: say,
    sequence: sequence,
    forSpeech: forSpeech,
    cancel: cancel,
    prime: prime,
    setEnabled: setEnabled,
    setVoice: setVoice,
    setRate: setRate,
    isEnabled: function () { return state.enabled; },
    getRate: function () { return state.rate; },
    getVoices: function () { return voices.slice(); },
    currentVoice: currentVoice,
    onVoices: function (fn) { listeners.push(fn); if (voices.length) fn(voices); },
    version: '1.0.0'
  };

}(typeof window !== 'undefined' ? window : globalThis));
