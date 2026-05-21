/**
 * Entrée minimale : vérifie la config Supabase AVANT tout import applicatif
 * (évite le crash createClient au chargement du bundle).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Élément #root introuvable");
}

if (!supabaseUrl || !supabaseAnonKey) {
  rootEl.innerHTML = `
    <div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:1.5rem;color:#eee;background:#1a1a1a;border-radius:8px;">
      <h1 style="font-size:1.25rem;margin:0 0 1rem;">Configuration manquante</h1>
      <p style="margin:0 0 0.75rem;line-height:1.5;">
        Les variables <code style="color:#f8a;">VITE_SUPABASE_URL</code> et
        <code style="color:#f8a;">VITE_SUPABASE_ANON_KEY</code> ne sont pas définies pour ce déploiement.
      </p>
      <p style="margin:0;font-size:0.9rem;color:#aaa;line-height:1.5;">
        Vercel → Settings → Environment Variables (Production), puis <strong>Redeploy</strong>.
      </p>
    </div>`;
} else {
  const loadApp = (attempt = 1): void => {
    void import("./bootstrap.tsx").catch((err: unknown) => {
      console.error("[bootstrap] échec chargement module", err);
      if (attempt < 3) {
        window.setTimeout(() => loadApp(attempt + 1), 800 * attempt);
        return;
      }
      rootEl.innerHTML = `
    <div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:1.5rem;color:#eee;background:#1a1a1a;border-radius:8px;">
      <h1 style="font-size:1.25rem;margin:0 0 1rem;">Chargement interrompu</h1>
      <p style="margin:0 0 0.75rem;line-height:1.5;">
        Le navigateur n'a pas pu charger l'application (réseau instable ou serveur Vite arrêté).
      </p>
      <p style="margin:0;font-size:0.9rem;color:#aaa;line-height:1.5;">
        Rechargez avec <strong>Ctrl+Shift+R</strong> ou relancez <code style="color:#f8a;">npm run dev</code> puis rouvrez
        <code style="color:#f8a;">http://localhost:8080</code>.
      </p>
    </div>`;
    });
  };
  loadApp();
}
