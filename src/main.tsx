// i18next doit être initialisé avant le premier rendu React
import "./i18n/config";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "flag-icons/css/flag-icons.min.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
