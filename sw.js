const CACHE = 'unite-tracker-v90';

// オフラインで動作させるために必要なアプリシェル一式（ローカル資産）。
// JS/CSS は index.html と同じ ?v=版数 付きURLで持つ（版数は CACHE の数字と同じ。更新のたびに両方を上げる）。
// Supabase / Chart.js は CDN から vendor/ に同梱済みなのでここでキャッシュする。
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=90',
  './manifest.json',
  './lab_data.js?v=90',
  './ratio.js?v=90',
  './ratio-labels.js?v=90',
  './js/constants.js?v=90',
  './js/utils.js?v=90',
  './js/lab-core.js?v=90',
  './js/usage-analytics.js?v=90',
  './images/pokemon/25.png',
  './images/app-icon-192.png',
  './images/app-icon-512.png',
  './images/app-icon-maskable-512.png',
  './images/apple-touch-icon.png',
  './images/brand-mark.svg',
  './vendor/supabase.min.js?v=90',
  './vendor/chart.umd.min.js?v=90',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' でブラウザのHTTPキャッシュを使わず、必ずサーバーから最新を取る（古いCSSを取り込まない）
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
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
      // 裏での取り直しはHTTPキャッシュを再検証させる（max-age中の古い内容を掴まない）
      const network = fetch(req, { cache: 'no-cache' })
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
