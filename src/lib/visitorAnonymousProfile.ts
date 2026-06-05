/** Profil visite rapide (anonyme) — stockage local navigateur uniquement. */

const PSEUDO_KEY = "visitor_anon_pseudo";
const AVATAR_URL_KEY = "visitor_anon_avatar_url";
const AVATAR_PATH_KEY = "visitor_anon_avatar_path";
const SELFIE_URL_KEY = "visitor_anon_selfie_url";
const SELFIE_PATH_KEY = "visitor_anon_selfie_path";

export type VisitorAnonymousProfile = {
  pseudo: string;
  avatarUrl: string;
  avatarObjectPath: string;
  selfieUrl?: string;
  selfieObjectPath?: string;
};

export function getVisitorAnonymousProfile(): VisitorAnonymousProfile | null {
  if (typeof window === "undefined") return null;
  const pseudo = window.localStorage.getItem(PSEUDO_KEY)?.trim() ?? "";
  const avatarUrl = window.localStorage.getItem(AVATAR_URL_KEY)?.trim() ?? "";
  const avatarObjectPath = window.localStorage.getItem(AVATAR_PATH_KEY)?.trim() ?? "";
  const selfieUrl = window.localStorage.getItem(SELFIE_URL_KEY)?.trim() ?? "";
  const selfieObjectPath = window.localStorage.getItem(SELFIE_PATH_KEY)?.trim() ?? "";
  if (!pseudo && !avatarUrl) return null;
  return { pseudo, avatarUrl, avatarObjectPath, selfieUrl, selfieObjectPath };
}

export function getVisitorAnonymousPseudo(): string | null {
  const p = getVisitorAnonymousProfile()?.pseudo?.trim();
  return p || null;
}

export function setVisitorAnonymousProfile(profile: VisitorAnonymousProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PSEUDO_KEY, profile.pseudo.trim());
  window.localStorage.setItem(AVATAR_URL_KEY, profile.avatarUrl.trim());
  window.localStorage.setItem(AVATAR_PATH_KEY, profile.avatarObjectPath.trim());
  window.localStorage.setItem(SELFIE_URL_KEY, profile.selfieUrl?.trim() ?? "");
  window.localStorage.setItem(SELFIE_PATH_KEY, profile.selfieObjectPath?.trim() ?? "");
}

export function clearVisitorAnonymousProfile(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PSEUDO_KEY);
  window.localStorage.removeItem(AVATAR_URL_KEY);
  window.localStorage.removeItem(AVATAR_PATH_KEY);
  window.localStorage.removeItem(SELFIE_URL_KEY);
  window.localStorage.removeItem(SELFIE_PATH_KEY);
}
