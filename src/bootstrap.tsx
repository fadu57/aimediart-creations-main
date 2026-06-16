/**
 * Point d’entrée React — chargé uniquement si VITE_SUPABASE_* est défini (voir main.tsx).
 */
import { initI18nForPath } from "./i18n/bootstrapI18n";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Élément #root introuvable");
}

async function mountApp(): Promise<void> {
  await initI18nForPath(window.location.pathname);

  const [{ createRoot, hydrateRoot }, { default: App }] = await Promise.all([
    import("react-dom/client"),
    import("./App.tsx"),
  ]);

  const app = <App />;

  if (rootEl.hasChildNodes()) {
    hydrateRoot(rootEl, app);
  } else {
    createRoot(rootEl).render(app);
  }
}

void mountApp().catch((err: unknown) => {
  console.error("[bootstrap] échec initialisation", err);
  rootEl.innerHTML = `
    <div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:1.5rem;color:#eee;background:#1a1a1a;border-radius:8px;">
      <h1 style="font-size:1.25rem;margin:0 0 1rem;">Chargement interrompu</h1>
      <p style="margin:0;line-height:1.5;">Impossible d'initialiser l'application. Rechargez la page.</p>
    </div>`;
});
