/**
 * Point d’entrée React — chargé uniquement si VITE_SUPABASE_* est défini (voir main.tsx).
 */
import "./i18n/config";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "flag-icons/css/flag-icons.min.css";
import "leaflet/dist/leaflet.css";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Élément #root introuvable");
}

createRoot(rootEl).render(<App />);
