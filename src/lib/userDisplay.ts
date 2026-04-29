import type { User } from "@supabase/supabase-js";

/**
 * Prénom affiché dans l’UI : métadonnées Auth puis repli sur l’identifiant de l’e-mail.
 */
export function getUserPrenom(user: User | null): string | null {
  if (!user) return null;
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const candidates = [m?.prenom, m?.first_name, m?.given_name];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const full = m?.full_name;
  if (typeof full === "string" && full.trim()) {
    const first = full.trim().split(/\s+/)[0];
    if (first) return first;
  }
  const email = user.email;
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }
  return null;
}
