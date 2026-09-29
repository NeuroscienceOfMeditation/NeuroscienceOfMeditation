---
# Jekyll fills in the build time below, so every new version of the site
# gets a fresh cache and the old one is cleared.
---
/* ============================================================================
   sw.js: offline support.

   - Pages: always fetched from the network first, so visitors never see an
     old page while online. The copy is kept, and used if the network fails.
   - Styles, scripts, fonts and images: served from the saved copy and
     refreshed in the background.
   - What gets saved: the offline page, plus whatever a visitor has actually
     loaded. Nothing extra is downloaded in advance.
   ============================================================================ */
var CACHE = 'nom-{{ site.time | date: "%s" }}';
var OFFLINE = '{{ "/offline.html" | relative_url }}';

function sameOrigin(url) {
  try { return new URL(url, self.location.href).origin === self.location.origin; }
  catch (e) { return false; }
}

// The offline page and the files it needs (its stylesheet, fonts, logo).
function saveOfflinePage(cache) {
  return fetch(OFFLINE, { cache: 'no-cache' }).then(function (res) {
    if (!res.ok) return;
    var copy = res.clone();
    return res.text().then(function (html) {
      var urls = [];
      html.replace(/(?:src|href)="([^"#]+)"/g, function (m, u) {
        if (/\.(css|js|woff2|webp|png|jpg)(\?|$)/.test(u) && sameOrigin(u)) urls.push(new URL(u, self.location.href).href);
      });
      return cache.put(OFFLINE, copy).then(function () {
        return Promise.all(urls.map(function (u) { return cache.add(u).catch(function () {}); }));
      });
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(saveOfflinePage).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('nom-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// A page that loaded before this worker took charge sends the list of files
// it used, so they are saved too and the page works offline next time.
self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type !== 'save' || !Array.isArray(data.urls)) return;
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(data.urls.filter(sameOrigin).map(function (u) {
      return cache.match(u).then(function (hit) { return hit || cache.add(u).catch(function () {}); });
    }));
  }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || !sameOrigin(req.url)) return;
  if (new URL(req.url).pathname === '{{ "/sw.js" | relative_url }}') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match(OFFLINE);
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        var fresh = fetch(req).then(function (res) {
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        });
        if (hit) { fresh.catch(function () {}); return hit; }
        return fresh;
      });
    })
  );
});
