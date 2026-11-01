// Para que Manitu abra sin internet (en un garaje, en una casa sin cobertura…).
// Con internet: coge siempre la versión más nueva y guarda una copia.
// Sin internet: usa la copia guardada.
const CAJA = 'manitu-v1';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'cuentas.js', 'app.js', 'manifest.webmanifest',
  'iconos/manitu-icono.svg', 'iconos/manitu-192.png', 'iconos/manitu-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CAJA).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((cajas) => Promise.all(cajas.filter((k) => k !== CAJA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CAJA).then((c) => c.put(e.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
