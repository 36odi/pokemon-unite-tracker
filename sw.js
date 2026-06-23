const CACHE = 'unite-tracker-v27';

// オフラインで動作させるために必要なアプリシェル一式（ローカル資産）。
// Supabase / Chart.js は CDN から vendor/ に同梱済みなのでここでキャッシュする。
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './lab_data.js',
  './js/constants.js',
  './js/utils.js',
  './vendor/supabase.min.js',
  './vendor/chart.umd.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // 書き込み系（Supabase POST等）は素通し

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 別オリジン（Supabase API / GoatCounter / アイコン等）はネットワーク優先、失敗時のみキャッシュ。
  if (!sameOrigin) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 同一オリジンの資産は stale-while-revalidate:
  // まずキャッシュを即返し、裏で取得して次回に備える。オフラインでもキャッシュから起動できる。
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
