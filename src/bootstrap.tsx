/**
 * Point d’entrée React — chargé uniquement si VITE_SUPABASE_* est défini (voir main.tsx).
 */
import "./i18n/config";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App.tsx";
import "flag-icons/css/flag-icons.min.css";
import "leaflet/dist/leaflet.css";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Élément #root introuvable");
}

const app = <App />;

// Hydratation si HTML prérendu (dist/organisation/index.html)
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, app);
} else {
  createRoot(rootEl).render(app);
}
