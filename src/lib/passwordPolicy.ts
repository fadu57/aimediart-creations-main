/** Politique MDP : minimum 8 caractères ; lettres, chiffres et signes autorisés (aucune obligation combinée). */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordPolicyIssue = "too_short" | null;

export function getPasswordPolicyIssue(password: string): PasswordPolicyIssue {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  return null;
}

export function isPasswordPolicyOk(password: string): boolean {
  return getPasswordPolicyIssue(password) === null;
}

/** Traduit les messages anglais renvoyés par Supabase Auth. */
export function mapSupabasePasswordError(
  message: string | null | undefined,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  const raw = (message || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return translate("recovery.toast_update_failed");

  if (lower.includes("at least") && lower.includes("character")) {
    const m = raw.match(/at least\s+(\d+)\s+character/i);
    const min = m ? Number(m[1]) : PASSWORD_MIN_LENGTH;
    return translate("recovery.toast_min_length", { min });
  }
  if (lower.includes("contain at least one character of each") || lower.includes("abcdefghijklmnopqrstuvwxyz")) {
    return translate("recovery.error_password_charset");
  }
  if (lower.includes("pwned") || lower.includes("known to be weak") || lower.includes("easy to guess")) {
    return translate("recovery.error_password_weak");
  }
  if (lower.includes("weak") || /^password\b/i.test(raw)) {
    return translate("recovery.error_password_charset");
  }
  return translate("recovery.toast_update_failed");
}
