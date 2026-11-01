/* Homepage breath band: drawn on a canvas, driven by scroll. See _includes/breath-band.html */
(function () {
  var box = document.querySelector('[data-bb]'); if (!box) return;
  var cv = box.querySelector('[data-bb-canvas]'), g = cv.getContext('2d');
  var follow = box.querySelector('[data-bb-follow]'), l1 = box.querySelector('[data-bb-l1]'), l2 = box.querySelector('[data-bb-l2]');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // design space: the region of the drawing that is shown
  var VX = 230, VY = 70, VW = 1010, VH = 560;
  var F = '#1B4332', S = '#C2611F', NOSE = { x: 388, y: 412 }, LY = 430;
  function rnd(i) { var x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function seg(p, a, b) { return ease((p - a) / (b - a)); }
  function face() {
    g.strokeStyle = F; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    g.moveTo(250, 90); g.bezierCurveTo(300, 120, 318, 190, 312, 240); g.bezierCurveTo(310, 262, 330, 270, 334, 285);
    g.bezierCurveTo(352, 330, 392, 372, 404, 392); g.bezierCurveTo(412, 406, 398, 414, 384, 410);
    g.bezierCurveTo(374, 407, 366, 412, 362, 418); g.bezierCurveTo(372, 428, 378, 438, 374, 448);
    g.bezierCurveTo(370, 456, 362, 458, 366, 466); g.bezierCurveTo(374, 476, 372, 488, 362, 494);
    g.bezierCurveTo(352, 500, 356, 520, 358, 540); g.bezierCurveTo(360, 566, 330, 580, 300, 586);
    g.bezierCurveTo(290, 610, 290, 650, 292, 700); g.stroke();
    g.beginPath(); g.moveTo(300, 282); g.quadraticCurveTo(314, 292, 326, 284); g.stroke();
  }
  function mist(p) {
    var a = seg(p, 0.05, 0.35), m = seg(p, 0.28, 0.48), fade = 1 - seg(p, 0.44, 0.56);
    if (a <= 0 || fade <= 0) return;
    for (var i = 0; i < 160; i++) {
      var t = ((rnd(i) + p * 1.7) % 1) * a, x = NOSE.x + 10 + t * 260, sp = (1 - m) * (18 + t * 70);
      var y = NOSE.y + 8 + (rnd(i + 9) - .5) * sp + t * (LY - NOSE.y - 8) * m, r = (1 - m) * (1.5 + rnd(i + 3) * 2.5) + m * 1.2;
      g.fillStyle = 'rgba(194,97,31,' + (0.55 * (1 - t * 0.6) * fade) + ')'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }
  function breath(p) {
    var k = seg(p, 0.38, 0.66); if (k <= 0) return;
    var x0 = 420, x1 = 420 + 400 * k; g.strokeStyle = S; g.lineWidth = 3; g.beginPath();
    for (var x = x0; x <= x1; x += 2) { var amp = Math.min(1, (x - x0) / 60) * 34; g.lineTo(x, LY - Math.sin((x - x0) / 170 * Math.PI * 2) * amp); }
    g.stroke();
  }
  function heart(p) {
    var k = seg(p, 0.64, 0.9); if (k <= 0) return;
    var x0 = 820, x1 = 820 + 400 * k, x = x0; g.strokeStyle = F; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, LY);
    while (x < x1) {
      var gap = Math.sin(((x - 420) / 170 % 1) * Math.PI * 2) > 0 ? 22 : 58, bx = x + gap * 0.55;
      if (bx + 14 > x1) { g.lineTo(x1, LY); break; }
      g.lineTo(bx - 6, LY); g.lineTo(bx - 2, LY + 8); g.lineTo(bx + 2, LY - 44); g.lineTo(bx + 6, LY + 14); g.lineTo(bx + 10, LY);
      x += gap; g.lineTo(Math.min(x, x1), LY);
    }
    g.stroke();
  }
  var last = -1;
  function draw(p) {
    var d = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
    var s = Math.min(cv.width / VW, cv.height / VH);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(s, 0, 0, s, (cv.width - VW * s) / 2 - VX * s, (cv.height - VH * s) / 2 - VY * s);
    face(); mist(p); breath(p); heart(p);
    l1.classList.toggle('on', p > 0.55); l2.classList.toggle('on', p > 0.82); follow.classList.toggle('on', p > 0.9);
  }
  function progress() {
    if (reduce) return 1;
    var r = box.getBoundingClientRect(), vh = window.innerHeight;
    // 0 when the band's top reaches 85% down the screen, 1 when it has risen to 10%
    return Math.max(0, Math.min(1, (vh * 0.85 - r.top) / (vh * 0.75)));
  }
  var raf = 0;
  function tick() { raf = 0; var p = progress(); if (Math.abs(p - last) > 0.001) { last = p; draw(p); } }
  function req() { if (!raf) raf = requestAnimationFrame(tick); }
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', function () { last = -1; req(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { last = -1; req(); });
  req();
})();
