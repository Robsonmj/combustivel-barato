// Service worker: permite instalar o app e abrir sem internet (com os últimos dados).
// Estratégia "rede primeiro": sempre busca a versão nova; usa a cópia só se estiver sem internet.
// Por isso o app instalado se atualiza sozinho.
const CACHE = 'abastecer-v8';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(
    // no-cache: confere com o site a cada abertura, para não ficar até 10 minutos com a versão antiga
    fetch(req, { cache: 'no-cache' })
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  );
});
