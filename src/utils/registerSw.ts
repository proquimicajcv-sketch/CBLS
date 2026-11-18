export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const collectRuntimeAssetUrls = (): string[] => {
    const urls = new Set<string>(['/', '/index.html', '/manifest.json']);
    document.querySelectorAll('script[src], link[href], img[src]').forEach((el) => {
      const attr =
        el.getAttribute('src') || el.getAttribute('href') || '';
      if (!attr) return;
      try {
        const parsed = new URL(attr, window.location.origin);
        if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/')) {
          urls.add(parsed.pathname);
        }
      } catch {
        // ignore invalid urls
      }
    });
    return Array.from(urls);
  };

  const warmServiceWorkerCache = (registration: ServiceWorkerRegistration) => {
    const target = registration.active || navigator.serviceWorker.controller;
    if (!target) return;
    target.postMessage({
      type: 'CACHE_URLS',
      urls: collectRuntimeAssetUrls(),
    });
  };

  const register = () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) {
        reloaded = true;
        window.location.reload();
      }
    });

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        warmServiceWorkerCache(registration);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
            if (installing.state === 'activated') {
              warmServiceWorkerCache(registration);
            }
          });
        });

        window.addEventListener('online', () => {
          void registration.update().catch(() => undefined);
          warmServiceWorkerCache(registration);
        });
      })
      .catch((err) => {
        console.warn('No se pudo registrar el Service Worker CBLS:', err);
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
