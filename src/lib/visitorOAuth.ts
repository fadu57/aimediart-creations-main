import type { Provider, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export const VISITOR_REGISTER_OAUTH_FLAG = "visitor_register_oauth";
export const VISITOR_DIARY_OAUTH_FLAG = "visitor_diary_oauth";

export function getDiaryOAuthRedirectUrl(): string {
  const base =
    import.meta.env.VITE_PUBLIC_SITE_URL?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  if (typeof window === "undefined") return `${base.replace(/\/$/, "")}/scan`;
  const url = new URL(window.location.href);
  url.searchParams.set("diary_oauth", "1");
  return url.toString();
}

export function getRegisterOAuthRedirectUrl(expoId?: string, agencyId?: string): string {
  const base =
    import.meta.env.VITE_PUBLIC_SITE_URL?.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const url = new URL(`${base.replace(/\/$/, "")}/register`);
  if (expoId) url.searchParams.set("expo_id", expoId);
  if (agencyId) url.searchParams.set("agency_id", agencyId);
  url.searchParams.set("oauth", "1");
  return url.toString();
}

export function hasVisitorRegistrationMetadata(user: User | null | undefined): boolean {
  if (!user) return false;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const prenom = typeof meta?.prenom === "string" ? meta.prenom.trim() : "";
  const nom = typeof meta?.nom === "string" ? meta.nom.trim() : "";
  return Boolean(prenom && nom);
}

export function readOAuthNameParts(user: User): { prenom: string; nom: string } {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const given = typeof meta?.given_name === "string" ? meta.given_name.trim() : "";
  const family = typeof meta?.family_name === "string" ? meta.family_name.trim() : "";
  if (given || family) {
    return { prenom: given, nom: family };
  }

  const full = typeof meta?.full_name === "string" ? meta.full_name.trim() : typeof meta?.name === "string" ? meta.name.trim() : "";
  if (!full) return { prenom: "", nom: "" };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { prenom: parts[0], nom: "" };
  return { prenom: parts[0], nom: parts.slice(1).join(" ") };
}

export async function startVisitorOAuthSignIn(
  provider: Provider,
  expoId?: string,
  agencyId?: string,
): Promise<{ error: Error | null }> {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(VISITOR_REGISTER_OAUTH_FLAG, "1");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getRegisterOAuthRedirectUrl(expoId, agencyId),
      ...(provider === "google"
        ? {
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          }
        : {}),
    },
  });

  if (error && typeof window !== "undefined") {
    sessionStorage.removeItem(VISITOR_REGISTER_OAUTH_FLAG);
    return { error };
  }

  return { error: null };
}

export async function startDiaryRegistrationOAuth(): Promise<{ error: Error | null }> {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(VISITOR_DIARY_OAUTH_FLAG, "1");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getDiaryOAuthRedirectUrl(),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error && typeof window !== "undefined") {
    sessionStorage.removeItem(VISITOR_DIARY_OAUTH_FLAG);
    return { error };
  }

  return { error: null };
}
