/* Service worker — offline cache cho app tiếng Anh
   App files: NETWORK-FIRST (luôn lấy bản mới khi online, fallback cache khi offline)
   CDN libs (OCR/PDF): CACHE-FIRST (offline sau lần đầu) */
const CACHE = "en-app-v3";
const CDN_CACHE = "en-cdn-v1";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./appdata.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"
];
const CDN_HOSTS = ["cdn.jsdelivr.net", "unpkg.com", "tessdata.projectnaptha.com", "raw.githubusercontent.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k !== CACHE && k !== CDN_CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // 1) Thư viện CDN (OCR/PDF): cache-first → offline sau lần đầu
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CDN_CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match(e.request)))
    );
    return;
  }

  // 2) Nguồn khác (YouTube/Youglish/Translate…) → mạng, không can thiệp
  if (url.origin !== location.origin) return;

  // 3) App cùng nguồn: NETWORK-FIRST → luôn có bản mới khi online, offline thì dùng cache
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
  );
});
