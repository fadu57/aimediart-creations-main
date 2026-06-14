import { Navigate } from "react-router-dom";

/** Redirection legacy → accordéon Paramètres. */
export default function SettingsPresenceThresholds() {
  return <Navigate to="/settings?section=presence-seuils" replace />;
}
