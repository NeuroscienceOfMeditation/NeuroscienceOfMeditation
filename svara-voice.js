/* ============================================================================
   svara-voice.js  (v2)
   Spoken guidance using the browser's built-in speech synthesis.
   No API key, no audio files, no network request.

   What v2 adds over v1:
     - Picks the most natural-sounding voice the device offers (neural /
       "Natural" / Online / Google voices, Indian English first), unless the
       listener has chosen one.
     - Speaks sentence by sentence with short breathing pauses, which sounds
       far less robotic than one long utterance and avoids Chrome's cut-off.
     - Pronunciation help for Sanskrit terms most voices mangle
       (Ida, Sushumna, svara, tattva, pranayama ...). Only the SPOKEN text is
       respelled; captions always show the proper spelling.
     - Caption events, so any screen can show subtitles in sync with speech.

   The public API is unchanged from v1, with additions (see bottom).
   ============================================================================ */

(function (root) {
  'use strict';

  var synth = root.speechSynthesis;
  var supported = !!synth && typeof root.SpeechSynthesisUtterance === 'function';
  var PREF_KEY = 'nom.svara.voice.v1';

  var state = { enabled: false, voiceURI: null, rate: 0.9, pitch: 1, volume: 1, primed: false };
  var voices = [];
  var voiceListeners = [];
  var captionListeners = [];
  var seqToken = 0;

  /* --- preferences ---------------------------------------------------------- */
  function load() {
    try {
      var p = JSON.parse(root.localStorage.getItem(PREF_KEY) || 'null');
      if (p) {
        if (typeof p.enabled === 'boolean') state.enabled = p.enabled;
        if (p.voiceURI) state.voiceURI = p.voiceURI;
        if (p.rate) state.rate = p.rate;
      }
    } catch (e) { /* storage blocked: defaults are fine */ }
  }
  function save() {
    try {
      root.localStorage.setItem(PREF_KEY, JSON.stringify({ enabled: state.enabled, voiceURI: state.voiceURI, rate: state.rate }));
    } catch (e) { /* ignore */ }
  }

  /* --- voices: rank by how natural they are likely to sound ------------------ */
  var ROBOTIC = /espeak|compact|novelty|zarvox|bad news|bells|boing|bubbles|cellos|trinoids|albert|jester|organ|superstar|wobble|whisper|fred|junior|ralph|kathy|bahh/i;

  function score(v) {
    var n = (v.name || '').toLowerCase(), l = (v.lang || '').toLowerCase().replace('_', '-');
    var s = 0;
    if (/natural|neural/.test(n)) s += 50;
    if (/online|enhanced|premium|siri/.test(n)) s += 25;
    if (/google/.test(n)) s += 18;
    if (/microsoft/.test(n) && !/online|natural/.test(n)) s -= 5;
    if (l === 'en-in') s += 16;
    else if (l.indexOf('en-gb') === 0) s += 9;
    else if (l.indexOf('en') === 0) s += 6;
    if (ROBOTIC.test(n)) s -= 80;
    return s;
  }

  function refreshVoices() {
    if (!supported) return;
    var all = synth.getVoices() || [];
    voices = all.filter(function (v) { return /^(en|hi)/i.test(v.lang); });
    if (!voices.length) voices = all;
    voices.sort(function (a, b) { return score(b) - score(a); });
    voiceListeners.forEach(function (fn) { fn(voices); });
  }

  if (supported) {
    refreshVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoices);
    else synth.onvoiceschanged = refreshVoices;
  }

  function currentVoice() {
    if (!voices.length) return null;
    if (state.voiceURI) {
      var found = voices.filter(function (v) { return v.voiceURI === state.voiceURI; })[0];
      if (found) return found;
    }
    var english = voices.filter(function (v) { return /^en/i.test(v.lang); });
    return (english.length ? english : voices)[0];
  }

  /* --- text preparation ----------------------------------------------------- */
  var SAY_AS = [
    [/\bShiva Svarodaya\b/gi, 'Shiva Swaro-daya'],
    [/\bSvarodaya\b/gi, 'Swaro-daya'],
    [/\bsvaras\b/gi, 'swaras'],
    [/\bsvara\b/gi, 'swara'],
    [/\bIda\b/g, 'Eeda'],
    [/\bPingala\b/g, 'Ping-ala'],
    [/\bSushumna\b/gi, 'Sushoomna'],
    [/\btattvas?\b/gi, 'tut-va'],
    [/\bpranayama\b/gi, 'praana-yaama'],
    [/\bprana\b/gi, 'praana'],
    [/\bnadis?\b/gi, 'naadi'],
    [/\bSurya\b/g, 'Soorya'],
    [/\bakasha\b/gi, 'aakaasha'],
    [/\bprithvi\b/gi, 'prithvee'],
    [/\bmins?\b/g, 'minutes'],
    [/\bsecs?\b/g, 'seconds'],
    [/\bv\.\s?(\d+)/g, 'verse $1']
  ];

  /** Screen text and speech want different things; normalise before speaking. */
  function forSpeech(text) {
    var t = String(text)
      .replace(/\s*[\u2014\u2013]\s*/g, ', ')
      .replace(/\[(E|S|X)(, negative)?\]/g, '')
      .replace(/·/g, ', ')
      .replace(/[śṣ]/g, 'sh').replace(/ñ/g, 'ny')
      .replace(/[ṅṇ]/g, 'n').replace(/ṭ/g, 't').replace(/ḍ/g, 'd')
      .replace(/ṃ/g, 'm').replace(/ḥ/g, '').replace(/ṛ/g, 'ri')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    SAY_AS.forEach(function (r) { t = t.replace(r[0], r[1]); });
    return t.replace(/\s+([,;.!?])/g, '$1').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  }

  /** Split into sentences so each is spoken (and captioned) on its own. */
  function sentences(text) {
    var parts = String(text).match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [String(text)];
    var out = [];
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if (out.length && p.split(/\s+/).length < 3) out[out.length - 1] += ' ' + p;   // fold tiny fragments
      else out.push(p);
    });
    return out;
  }

  function emitCaption(text) {
    captionListeners.forEach(function (fn) { try { fn(text); } catch (e) { /* ignore */ } });
  }

  /* --- speaking ------------------------------------------------------------- */
  function estimateMs(text, rate) {
    var words = String(text).split(/\s+/).length;
    return Math.max(1800, words * (430 / (rate || state.rate)) + 900);
  }

  /**
   * Speak one line (sentence by sentence).
   * @param {String} text
   * @param {Object} opts { queue, rate, onEnd, force, caption }
   */
  function say(text, opts) {
    opts = opts || {};
    if (!supported || (!state.enabled && !opts.force) || !text) {
      if (opts.onEnd) opts.onEnd();
      return null;
    }
    if (!opts.queue) cancel();
    var token = seqToken;
    var parts = sentences(text);
    var i = 0;
    function next() {
      if (token !== seqToken) return;
      if (i >= parts.length) { if (opts.onEnd) opts.onEnd(); return; }
      var shown = parts[i++];
      speakOne(shown, opts, function () {
        if (token !== seqToken) return;
        setTimeout(next, i < parts.length ? 260 : 0);
      });
    }
    next();
    return true;
  }

  function speakOne(shown, opts, done) {
    var clean = forSpeech(shown);
    if (!clean) { done(); return; }
    var u = new root.SpeechSynthesisUtterance(clean);
    var v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = opts.rate || state.rate;
    u.pitch = state.pitch;
    u.volume = state.volume;

    var finished = false;
    // Safety net: some browsers never fire onend. Never let guidance hang.
    var guard = setTimeout(finish, estimateMs(clean, u.rate) * 2 + 3000);
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      done();
    }
    u.onstart = function () { if (opts.caption !== false) emitCaption(shown); };
    u.onend = finish;
    u.onerror = finish;
    try { synth.speak(u); } catch (e) { finish(); }
  }

  /** Speak lines one after another with a gap. Returns a cancel function. */
  function sequence(lines, opts) {
    opts = opts || {};
    var gap = opts.gap == null ? 650 : opts.gap;
    if (!supported || !state.enabled) { if (opts.onDone) opts.onDone(); return function () {}; }
    cancel();
    var token = seqToken;
    var i = 0, timer = null;
    function next() {
      if (token !== seqToken) return;
      if (i >= lines.length) { if (opts.onDone) opts.onDone(); return; }
      var line = lines[i++];
      if (opts.onLine) opts.onLine(line, i - 1);
      say(line, { queue: true, onEnd: function () { if (token === seqToken) timer = setTimeout(next, gap); } });
    }
    next();
    return function () { if (token === seqToken) cancel(); if (timer) clearTimeout(timer); };
  }

  function cancel() {
    seqToken++;
    if (!supported) return;
    try { synth.cancel(); } catch (e) { /* ignore */ }
    emitCaption(null);
  }

  /** iOS only speaks later if the first utterance came from a real tap. */
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
  function setRate(r) { state.rate = Math.min(1.4, Math.max(0.6, Number(r) || 0.9)); save(); }

  load();

  if (root.addEventListener) {
    root.addEventListener('pagehide', cancel);
    if (root.document) {
      root.document.addEventListener('visibilitychange', function () { if (root.document.hidden) cancel(); });
    }
  }

  root.SvaraVoice = {
    supported: supported,
    say: say,
    sequence: sequence,
    forSpeech: forSpeech,
    sentences: sentences,
    estimateMs: estimateMs,
    cancel: cancel,
    prime: prime,
    setEnabled: setEnabled,
    setVoice: setVoice,
    setRate: setRate,
    isEnabled: function () { return state.enabled; },
    getRate: function () { return state.rate; },
    getVoices: function () { return voices.slice(); },
    currentVoice: currentVoice,
    onVoices: function (fn) { voiceListeners.push(fn); if (voices.length) fn(voices); },
    onCaption: function (fn) { captionListeners.push(fn); },
    version: '2.0.0'
  };
}(typeof window !== 'undefined' ? window : globalThis));
