/**
 * URL de redirection après « Mot de passe oublié » (à déclarer dans Supabase : Authentication → URL Configuration).
 * Utilise `VITE_PUBLIC_SITE_URL` si défini, sinon `window.location.origin`.
 */
export function getPasswordResetRedirectUrl(): string {
  const base =
    import.meta.env.VITE_PUBLIC_SITE_URL?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/reset-password`;
}
