/*
  Aṇūṭṭara reader: lays one issue out as a book and turns its pages.

  The issue's pieces arrive inside <template id="mag-src"> (inert, so nothing
  loads twice). This script cuts them into pages the size of the screen, then
  hands the pages to StPageFlip (/vendor/page-flip.browser.js) for the turning.
  The page layout is redone when the window changes size, keeping your place.
*/
(function () {
  'use strict';

  var tpl = document.getElementById('mag-src');
  var stage = document.getElementById('mag-stage');
  var bar = document.getElementById('mag-bar');
  var counter = document.getElementById('mag-count');
  var prevBtn = document.getElementById('mag-prev');
  var nextBtn = document.getElementById('mag-next');
  var tocBtn = document.getElementById('mag-toc');
  var M = JSON.parse(document.getElementById('mag-meta').textContent);
  if (!tpl || !stage || !window.St) return;

  var pf = null, total = 0, tocAt = 2, current = 0, size = null;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---- Page size ---------------------------------------------------------
  function measureSize() {
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight - bar.offsetHeight - 24;
    var ratio = 0.7, w, h, spread = vw >= 860;
    if (spread) {
      h = Math.min(vh, 920);
      w = Math.round(h * ratio);
      if (w * 2 > vw - 56) { w = Math.floor((vw - 56) / 2); h = Math.round(w / ratio); }
    } else {
      w = Math.min(vw - 16, 560);
      h = Math.min(vh, Math.round(w / 0.56));
    }
    w = Math.max(w, 240); h = Math.max(h, 340);
    return { w: w, h: h, spread: spread, fs: Math.max(13, Math.min(17, w / 29)) };
  }

  // ---- Pages ---------------------------------------------------------------
  function makePage(opts) {
    opts = opts || {};
    var p = el('div', 'pg' + (opts.cls ? ' ' + opts.cls : ''));
    p.style.width = size.w + 'px';
    p.style.height = size.h + 'px';
    if (opts.hard) p.setAttribute('data-density', 'hard');
    var inner = el('div', 'pg-in');
    p.appendChild(inner);
    if (opts.head) {
      var rh = el('div', 'rh');
      rh.appendChild(el('span', '', opts.head[0]));
      rh.appendChild(el('span', '', opts.head[1] || ''));
      inner.appendChild(rh);
    }
    p._body = el('div', 'pg-body');
    inner.appendChild(p._body);
    if (!opts.hard) inner.appendChild(el('div', 'folio'));
    return p;
  }

  function fits(body) { return body.scrollHeight <= body.clientHeight + 1; }
  function isHeading(n) { return !!n && /^H[1-6]$/.test(n.tagName); }

  // Largest run of words from the start of `elm` that still fits, as [head, tail].
  function splitWords(elm, parent, body) {
    var bounds = [], walker = document.createTreeWalker(elm, NodeFilter.SHOW_TEXT), n, m;
    while ((n = walker.nextNode())) {
      var re = /\s+/g;
      while ((m = re.exec(n.data))) { if (m.index > 0) bounds.push([n, m.index]); }
    }
    if (!bounds.length) return null;
    function headAt(k) {
      var r = document.createRange();
      r.setStart(elm, 0); r.setEnd(bounds[k][0], bounds[k][1]);
      var c = elm.cloneNode(false); c.removeAttribute('id');
      c.appendChild(r.cloneContents());
      return c;
    }
    var lo = 0, hi = bounds.length - 1, best = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, c = headAt(mid);
      parent.appendChild(c);
      var ok = fits(body);
      parent.removeChild(c);
      if (ok) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (best < 0) return null;
    var head = headAt(best);
    head.classList.add('brk');
    var r = document.createRange();
    r.setStart(bounds[best][0], bounds[best][1]); r.setEnd(elm, elm.childNodes.length);
    var tail = elm.cloneNode(false); tail.removeAttribute('id');
    tail.appendChild(r.cloneContents());
    tail.classList.add('cont');
    var f = tail.firstChild;
    while (f && f.nodeType === 3 && !f.data.trim()) { tail.removeChild(f); f = tail.firstChild; }
    if (f && f.nodeType === 3) f.data = f.data.replace(/^\s+/, '');
    return [head, tail];
  }

  // Lists, study cards, verses, quotes: move children across one by one.
  function splitChildren(box, body) {
    var shell = box.cloneNode(false); shell.removeAttribute('id');
    body.appendChild(shell);
    var moved = 0, liCount = 0;
    while (box.firstChild) {
      var c = box.firstChild;
      if (c.nodeType !== 1) { if (c.nodeType === 3 && c.data.trim()) { shell.appendChild(c); } else { box.removeChild(c); } continue; }
      shell.appendChild(c);
      if (fits(body)) { moved++; if (c.tagName === 'LI') liCount++; continue; }
      shell.removeChild(c);
      var parts = /^(P|LI)$/.test(c.tagName) ? splitWords(c, shell, body) : null;
      if (parts) { shell.appendChild(parts[0]); box.insertBefore(parts[1], box.firstChild); moved++; }
      else box.insertBefore(c, box.firstChild);
      break;
    }
    body.removeChild(shell);
    if (!moved || !box.firstElementChild) return null;
    if (box.tagName === 'OL') box.setAttribute('start', (parseInt(box.getAttribute('start') || '1', 10) + liCount));
    box.classList.add('cont');
    shell.classList.add('brk');
    return [shell, box];
  }

  function splitTable(table, body) {
    var tb = table.tBodies[0];
    if (!tb || tb.rows.length < 2) return null;
    var shell = table.cloneNode(false); shell.removeAttribute('id');
    if (table.tHead) shell.appendChild(table.tHead.cloneNode(true));
    var nb = document.createElement('tbody');
    shell.appendChild(nb);
    body.appendChild(shell);
    var moved = 0;
    while (tb.rows.length > 1) {
      nb.appendChild(tb.rows[0]);
      if (fits(body)) { moved++; continue; }
      tb.insertBefore(nb.lastChild, tb.firstChild);
      break;
    }
    body.removeChild(shell);
    if (!moved) { while (nb.rows.length) tb.insertBefore(nb.rows[nb.rows.length - 1], tb.firstChild); return null; }
    return [shell, table];
  }

  function split(b, body) {
    var t = b.tagName;
    if (t === 'P') return splitWords(b, body, body);
    if (t === 'UL' || t === 'OL' || t === 'BLOCKQUOTE') return splitChildren(b, body);
    if (t === 'DIV' && (b.classList.contains('study') || b.classList.contains('verse'))) return splitChildren(b, body);
    if (t === 'TABLE') return splitTable(b, body);
    return null;
  }

  // Something that cannot be split and is taller than a whole page.
  function squeeze(b, body) {
    b.classList.add('squeeze');
    for (var s = 0.92; s >= 0.6 && !fits(body); s -= 0.08) {
      b.style.fontSize = s + 'em';
      var media = b.querySelectorAll('img,svg,iframe');
      for (var i = 0; i < media.length; i++) media[i].style.maxHeight = Math.round(size.h * 0.5 * s) + 'px';
    }
  }

  function paginate(blocks, pageFor, holder) {
    var pages = [], cur = null, fresh = true, q = blocks.slice(), guard = 0;
    function next() {
      var keep = null;
      if (cur) {
        var last = cur._body.lastElementChild;
        if (isHeading(last) && cur._body.children.length > 1) keep = last;
      }
      cur = pageFor(pages.length === 0);
      holder.appendChild(cur);
      pages.push(cur);
      if (keep) cur._body.appendChild(keep);
      fresh = false;
    }
    while (q.length && guard++ < 50000) {
      if (fresh) next();
      var b = q.shift(), body = cur._body;
      body.appendChild(b);
      if (fits(body)) continue;
      body.removeChild(b);
      var parts = split(b, body);
      if (parts) { body.appendChild(parts[0]); q.unshift(parts[1]); fresh = true; continue; }
      if (!body.children.length) { body.appendChild(b); squeeze(b, body); fresh = true; continue; }
      q.unshift(b); fresh = true;
    }
    return pages;
  }

  // ---- The issue's own pages -------------------------------------------------
  var SIG = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="52" r="30"/><path d="M60 20 L88 74 H32 Z"/><path d="M32 92h56M36 98h48"/><g class="dots"><circle cx="60" cy="14" r="2"/><circle cx="84" cy="22" r="2"/><circle cx="98" cy="44" r="2"/><circle cx="94" cy="68" r="2"/><circle cx="26" cy="68" r="2"/><circle cx="22" cy="44" r="2"/><circle cx="36" cy="22" r="2"/></g></svg>';
  var MAG = 'Aṇūṭṭara · Issue ' + M.no;

  function coverPage() {
    var p = makePage({ hard: true, cls: 'pg-cover' });
    p._body.innerHTML =
      '<div class="cv-top"><span>' + M.date + '</span><span>Issue ' + M.no + '</span></div>' +
      '<p class="cv-t">Aṇūṭṭara</p>' +
      '<div class="cv-sig">' + SIG + '</div>' +
      '<p class="cv-foot">' + M.coverLine + '</p>';
    return p;
  }

  function backPage() {
    var p = makePage({ hard: true, cls: 'pg-cover pg-back' });
    p._body.innerHTML =
      '<div class="cv-sig small">' + SIG + '</div>' +
      '<p class="bk-t">Aṇūṭṭara</p>' +
      '<p class="bk-s">A yoga research magazine from Neuroscience of Meditation</p>' +
      '<p class="bk-l"><a href="' + M.newsletter + '">Get the next issue by email</a></p>' +
      '<p class="bk-l"><a href="' + M.home + '">All issues</a></p>';
    return p;
  }

  function insidePage() {
    var p = makePage({ cls: 'pg-inside' });
    p._body.innerHTML =
      '<p class="in-k">Issue ' + M.no + ' · ' + M.date + '</p>' +
      '<h1 class="in-t">' + M.title + '</h1>' +
      '<p class="in-d">' + M.description + '</p>' +
      '<p class="in-how">Turn the page by clicking or dragging its corner, by swiping, or with the arrow keys.</p>';
    return p;
  }

  function build(keepFraction) {
    size = measureSize();
    var root = document.documentElement;
    root.style.setProperty('--pw', size.w + 'px');
    root.style.setProperty('--ph', size.h + 'px');
    root.style.setProperty('--fs', size.fs.toFixed(2) + 'px');

    var holder = el('div'); holder.id = 'mag-measure';
    document.body.appendChild(holder);

    var frag = document.importNode(tpl.content, true);
    frag.querySelectorAll('script, noscript').forEach(function (s) { s.remove(); });
    // Embedded questionnaires only work on the web page; link to them instead.
    frag.querySelectorAll('iframe[data-tally-src]').forEach(function (f) {
      var url = (f.getAttribute('data-tally-src') || '').replace('/embed/', '/r/').split('?')[0];
      var box = f.parentElement;
      if (!box || box.classList.contains('flow') || box.children.length > 1) box = f;
      var link = el('p', 'note', 'This piece includes a short questionnaire. <a href="' + url + '" target="_blank" rel="noopener">Open it in a new tab</a>.');
      box.replaceWith(link);
    });
    frag.querySelectorAll('img').forEach(function (i) { i.loading = 'eager'; });

    var pieces = Array.prototype.slice.call(frag.querySelectorAll('section.piece'));
    var pages = [coverPage(), insidePage()];

    // Contents, filled with page numbers once the pieces are laid out.
    var rows = pieces.map(function (s, i) {
      var a = el('a', 'toc-row', '<span class="toc-k"></span><span class="toc-t"></span><span class="toc-n"></span>');
      a.href = s.getAttribute('data-url');
      a.querySelector('.toc-k').textContent = s.getAttribute('data-section');
      a.querySelector('.toc-t').textContent = s.getAttribute('data-title');
      a.setAttribute('data-piece', i);
      return a;
    });
    var tocHead = el('h2', 'toc-h', 'Contents');
    var tocPages = paginate([tocHead].concat(rows), function () { return makePage({ head: [MAG, 'Contents'] }); }, holder);
    tocAt = pages.length;
    pages = pages.concat(tocPages);

    var starts = [];
    pieces.forEach(function (s) {
      var section = s.getAttribute('data-section');
      var flow = s.querySelector('.flow');
      var blocks = [s.querySelector('.opener')].concat(Array.prototype.slice.call(flow.children));
      starts.push(pages.length);
      var made = paginate(blocks, function (first) {
        return first ? makePage({ cls: 'pg-open' }) : makePage({ head: [MAG, section] });
      }, holder);
      pages = pages.concat(made);
    });

    // An even count keeps the back cover on its own, like a real magazine.
    if ((pages.length + 1) % 2) pages.push(makePage({ cls: 'pg-blank' }));
    pages.push(backPage());
    total = pages.length;

    pages.forEach(function (p, i) {
      var f = p.querySelector('.folio');
      if (f) f.textContent = i;
      p.classList.add(i % 2 ? 'pg-l' : 'pg-r');
    });
    rows.forEach(function (a, i) {
      a.querySelector('.toc-n').textContent = starts[i];
      a.setAttribute('data-goto', starts[i]);
    });

    holder.remove();
    if (pf) { try { pf.destroy(); } catch (e) { /* already gone */ } }
    stage.innerHTML = '';
    var book = el('div', 'mag-book' + (size.spread ? ' is-spread' : ''));
    book.style.width = (size.spread ? size.w * 2 : size.w) + 'px';
    book.style.height = size.h + 'px';
    stage.appendChild(book);

    var start = 0;
    var hash = /^#p(\d+)$/.exec(location.hash);
    if (keepFraction != null) start = Math.round(keepFraction * (total - 1));
    else if (hash) start = Math.min(parseInt(hash[1], 10), total - 1);

    pf = new St.PageFlip(book, {
      width: size.w, height: size.h, size: 'fixed',
      showCover: true, usePortrait: true, startPage: start,
      maxShadowOpacity: 0.35, flippingTime: 750, drawShadow: true,
      mobileScrollSupport: false, showPageCorners: true, autoSize: false
    });
    pf.loadFromHTML(pages);
    if (start > 0) pf.turnToPage(start);
    current = start;
    pf.on('flip', function (e) { current = e.data; update(); });
    update();
  }

  function update() {
    var portrait = !pf || pf.getOrientation() === 'portrait';
    // Matches the page numbers printed at the foot of each page.
    var label, last = total - 2;
    if (current === 0) label = 'Cover';
    else if (current === total - 1) label = 'Back cover';
    else if (portrait) label = current + ' of ' + last;
    else {
      var l = current % 2 ? current : current - 1;
      label = l + '–' + Math.min(l + 1, last) + ' of ' + last;
    }
    counter.textContent = label;
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
    if (history.replaceState) history.replaceState(null, '', current ? '#p' + current : location.pathname + location.search);
  }

  function go(n) {
    if (!pf) return;
    n = Math.max(0, Math.min(total - 1, n));
    if (Math.abs(n - current) <= 2) pf.flip(n); else pf.turnToPage(n);
    current = n; update();
  }

  prevBtn.addEventListener('click', function () { pf && pf.flipPrev(); });
  nextBtn.addEventListener('click', function () { pf && pf.flipNext(); });
  tocBtn.addEventListener('click', function () { go(tocAt); });
  stage.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-goto]');
    if (a) { e.preventDefault(); go(parseInt(a.getAttribute('data-goto'), 10)); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); pf && pf.flipNext(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); pf && pf.flipPrev(); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(total - 1); }
  });

  var timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var s = measureSize();
      if (!size || Math.abs(s.w - size.w) > 10 || Math.abs(s.h - size.h) > 10 || s.spread !== size.spread) {
        build(total > 1 ? current / (total - 1) : 0);
      }
    }, 300);
  });

  // Fonts and pictures change line breaks, so wait for them before cutting pages.
  function ready() {
    var fonts = document.fonts ? Promise.all([
      document.fonts.load('400 16px Fraunces'), document.fonts.load('italic 400 16px Fraunces'),
      document.fonts.load('700 16px Fraunces'), document.fonts.load('600 16px Archivo')
    ]).then(function () { return document.fonts.ready; }) : Promise.resolve();
    var imgs = Array.prototype.slice.call(tpl.content.querySelectorAll('img')).map(function (i) {
      return new Promise(function (res) {
        var im = new Image(); im.onload = im.onerror = res; im.src = i.getAttribute('src');
      });
    });
    var timeout = new Promise(function (res) { setTimeout(res, 5000); });
    return Promise.race([Promise.all([fonts].concat(imgs)), timeout]);
  }

  ready().then(function () {
    build(null);
    document.body.classList.add('mag-ready');
  });
})();
