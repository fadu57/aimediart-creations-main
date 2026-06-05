import { supabase } from "@/lib/supabase";
import type { VisitorAnonymousProfile } from "@/lib/visitorAnonymousProfile";
import { setVisitorAnonymousProfile } from "@/lib/visitorAnonymousProfile";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";
import { profileFromRpc } from "@/lib/registerAnonymousVisitorSession";

const RECOVERY_CODE_STORAGE_KEY = "visitor_link_recovery_code";

export type VisitorRecoveryCodeResult =
  | { ok: true; code: string; display: string }
  | { ok: false; error: string };

type RecoveryRpcProfile = {
  ok?: boolean;
  error?: string;
  is_returning?: boolean;
  visitor_pseudo?: string | null;
  avatar_url?: string | null;
  avatar_object_path?: string | null;
  selfie_url?: string | null;
  selfie_object_path?: string | null;
};

type GenerateRecoveryRpc = {
  ok?: boolean;
  error?: string;
  recovery_code?: string;
  recovery_code_display?: string;
};

/** Normalise la saisie utilisateur (8 caractères alphanumériques, sans ambiguïté 0/O). */
export function normalizeVisitorRecoveryCodeInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
}

export function formatVisitorRecoveryCodeDisplay(code: string): string {
  const n = normalizeVisitorRecoveryCodeInput(code);
  if (n.length <= 4) return n;
  return `${n.slice(0, 4)}-${n.slice(4)}`;
}

export function getStoredVisitorRecoveryCode(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(RECOVERY_CODE_STORAGE_KEY)?.trim() ?? "";
  const n = normalizeVisitorRecoveryCodeInput(v);
  return n.length === 8 ? n : null;
}

export function setStoredVisitorRecoveryCode(code: string | null): void {
  if (typeof window === "undefined") return;
  const n = code ? normalizeVisitorRecoveryCodeInput(code) : "";
  if (n.length === 8) {
    window.localStorage.setItem(RECOVERY_CODE_STORAGE_KEY, n);
  } else {
    window.localStorage.removeItem(RECOVERY_CODE_STORAGE_KEY);
  }
}

/** Génère un code de liaison pour le profil courant (affiché une seule fois côté serveur si déjà créé). */
export async function generateVisitorRecoveryCode(
  regenerate = false,
): Promise<VisitorRecoveryCodeResult> {
  const visitorUuid = getOrCreateVisitorUuid();
  if (!visitorUuid) {
    return { ok: false, error: "missing_client_id" };
  }

  const { data, error } = await supabase.rpc("generate_visitor_recovery_code", {
    p_visitor_client_id: visitorUuid,
    p_regenerate: regenerate,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const payload = (data ?? {}) as GenerateRecoveryRpc;
  if (!payload.ok) {
    return { ok: false, error: payload.error ?? "already_set" };
  }

  const code = payload.recovery_code?.trim() ?? "";
  if (code.length !== 8) {
    return { ok: false, error: "invalid_response" };
  }

  setStoredVisitorRecoveryCode(code);
  const display = payload.recovery_code_display?.trim() || formatVisitorRecoveryCodeDisplay(code);
  return { ok: true, code, display };
}

/** Rattache le profil anonyme existant à ce navigateur via le code de liaison. */
export async function linkVisitorProfileByRecoveryCode(
  rawCode: string,
): Promise<{ ok: true; profile: VisitorAnonymousProfile } | { ok: false; error: string }> {
  const code = normalizeVisitorRecoveryCodeInput(rawCode);
  if (code.length !== 8) {
    return { ok: false, error: "invalid_code_format" };
  }

  const visitorUuid = getOrCreateVisitorUuid();
  if (!visitorUuid) {
    return { ok: false, error: "missing_client_id" };
  }

  const { data, error } = await supabase.rpc("link_visitor_profile_by_recovery_code", {
    p_recovery_code: code,
    p_visitor_client_id: visitorUuid,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const payload = (data ?? {}) as RecoveryRpcProfile;
  if (!payload.ok) {
    return { ok: false, error: payload.error ?? "code_not_found" };
  }

  const profile = profileFromRpc(payload);
  if (!profile) {
    return { ok: false, error: "profile_incomplete" };
  }

  setVisitorAnonymousProfile(profile);
  return { ok: true, profile };
}
