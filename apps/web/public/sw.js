/**
 * BOB — Service Worker
 *
 * Responsável por:
 *   1. Cache offline de assets estáticos (Shell da aplicação)
 *   2. Receber e exibir Push Notifications enviadas pelo servidor
 *   3. Tratar cliques nas notificações (abrir app + URL alvo)
 *
 * Estratégia de cache: Cache First para assets, Network First para API.
 *
 * Para ativar push no cliente, a página deve chamar:
 *   navigator.serviceWorker.ready → pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
 *
 * O VAPID_PUBLIC_KEY fica em NEXT_PUBLIC_VAPID_PUBLIC_KEY no .env.
 */

const CACHE_NAME    = "bob-shell-v1";
const SHELL_ASSETS  = [
  "/dashboard",
  "/investimento-retorno",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  // Ativa imediatamente sem esperar tab fechar
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch — Network First para navegação, Cache First para assets ────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições de outras origens
  if (url.origin !== self.location.origin) return;
  // Ignora API routes — nunca cachear
  if (url.pathname.startsWith("/api/")) return;

  // Assets estáticos: Cache First
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request))
    );
    return;
  }

  // Navegação: Network First com fallback ao cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  }
});

// ─── Push Notification ────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "BOB", body: event.data.text(), url: "/dashboard" };
  }

  const title   = payload.title ?? "BOB — Big Odds Brasileirão";
  const options = {
    body:  payload.body  ?? "Nova análise disponível.",
    icon:  "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag:   payload.tag   ?? "bob-notification",
    data:  { url: payload.url ?? "/dashboard" },
    // Ação única: abrir o app
    actions: [{ action: "open", title: "Abrir" }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ───────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Se o app já está aberto, focar e navegar
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Senão abrir nova janela
        return self.clients.openWindow(targetUrl);
      })
  );
});
