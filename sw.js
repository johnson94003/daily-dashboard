// service worker：殼用 network-first（線上一定拿到最新，離線才用快取）
const CACHE = 'dash-v2';
const SHELL = [
  './', './index.html', './css/style.css',
  './js/app.js', './js/config.js', './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Apps Script 的請求一律走網路，不快取
  if (url.hostname.includes('script.google')) return;
  // network-first：線上拿最新並更新快取，離線才退回快取
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
