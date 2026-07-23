import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "aimediart:chunk-reload";

/**
 * lazy() avec 1 retry + reload unique si le chunk reste inaccessible
 * (coupure réseau ERR_NETWORK_CHANGED, ou hash obsolète après déploiement).
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        /* ignore */
      }
      return mod;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const mod = await factory();
        try {
          sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        } catch {
          /* ignore */
        }
        return mod;
      } catch (err) {
        try {
          if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
            sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
            window.location.reload();
            // Suspend jusqu’au reload.
            return await new Promise<{ default: T }>(() => undefined);
          }
          sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        } catch {
          /* ignore */
        }
        throw err;
      }
    }
  });
}
