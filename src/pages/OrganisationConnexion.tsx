import { Navigate } from "react-router-dom";

/** Ancienne URL dédiée : redirige vers la section Connectivité de la vitrine. */
export default function OrganisationConnexion() {
  return <Navigate to="/organisation#connectivite" replace />;
}
