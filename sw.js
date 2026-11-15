/*
  서비스 워커: 앱 파일을 기기에 저장해 두고, 인터넷이 없을 때 꺼내 씁니다.
  저장해 둔 파일을 먼저 보여주고, 인터넷이 되면 뒤에서 새 파일로 바꿔 둡니다.
  그래서 파일을 고친 뒤에는 앱을 두 번 열어야 바뀐 내용이 보입니다.
*/
const CACHE = 'hanmunjang-v6';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'recommend.js',
  'quotes.json',
  'manifest.webmanifest',
  'fonts/NotoSerifKR-subset.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
