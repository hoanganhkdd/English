/* Service worker — offline cache for the English app */
const CACHE = "en-app-v2";
const CDN_CACHE = "en-cdn-v1";           // OCR/PDF libs + traineddata/wasm (cross-origin)
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./appdata.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"
];
// Các host chứa thư viện tải theo yêu cầu (Tesseract.js, pdf.js, traineddata, wasm)
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

  // 1) Thư viện CDN (OCR/PDF): cache-first → offline sau lần đầu chạy
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        // cache cả opaque response (no-cors) để dùng lại offline
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CDN_CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match(e.request)))
    );
    return;
  }

  // 2) Same-origin: cache-first, fallback index.html khi offline
  if (url.origin !== location.origin) return; // YouTube/Youglish/Translate → mạng
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
