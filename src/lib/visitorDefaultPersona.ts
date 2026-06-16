import { loadOrCreateFingerprintJsId } from "@/lib/fingerprintConsent";
import { registerAnonymousVisitorSession } from "@/lib/registerAnonymousVisitorSession";
import { getOrCreateVisitorUuid, getStoredVisitorUuid } from "@/lib/visitorIdentity";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "visitor_default_prompt_style_id";

function cacheVisitorDefaultPromptStyleId(promptStyleId: string | null): void {
  if (typeof window === "undefined") return;
  const id = promptStyleId?.trim();
  if (!id) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, id);
}

/** Lecture synchrone du cache navigateur. */
export function getVisitorDefaultPromptStyleId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY)?.trim();
  return raw || null;
}

/** Met à jour le cache local puis persiste côté serveur (visitors.persona_defaut). */
export function setVisitorDefaultPromptStyleId(promptStyleId: string | null): void {
  cacheVisitorDefaultPromptStyleId(promptStyleId);
  void persistVisitorDefaultPersonaToServer(promptStyleId);
}

/** Synchronise depuis visitors.persona_defaut (cross-exposition / autre appareil). */
export async function loadVisitorDefaultPromptStyleFromServer(): Promise<string | null> {
  const visitorUuid = getStoredVisitorUuid();
  const fingerprint = (await loadOrCreateFingerprintJsId())?.trim() || null;

  if (!visitorUuid && !fingerprint) {
    return getVisitorDefaultPromptStyleId();
  }

  const { data, error } = await supabase.rpc("get_visitor_persona_defaut", {
    p_visitor_client_id: visitorUuid,
    p_fingerprint: fingerprint,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[visitor] get_visitor_persona_defaut :", error.message);
    }
    return getVisitorDefaultPromptStyleId();
  }

  const remoteId = typeof data === "string" ? data.trim() : "";
  if (remoteId) {
    cacheVisitorDefaultPromptStyleId(remoteId);
    return remoteId;
  }

  return getVisitorDefaultPromptStyleId();
}

/** Applique persona_defaut renvoyée par get_anonymous_visitor_profile. */
export function applyVisitorPersonaDefautFromProfile(personaDefaut: string | null | undefined): void {
  const id = personaDefaut?.trim();
  if (!id) return;
  cacheVisitorDefaultPromptStyleId(id);
}

async function persistVisitorDefaultPersonaToServer(promptStyleId: string | null): Promise<void> {
  try {
    const visitorUuid = getOrCreateVisitorUuid();
    if (!visitorUuid) return;

    await registerAnonymousVisitorSession();

    const { error } = await supabase.rpc("set_visitor_persona_defaut", {
      p_visitor_client_id: visitorUuid,
      p_persona_defaut: promptStyleId?.trim() || null,
    });

    if (error && import.meta.env.DEV) {
      console.warn("[visitor] set_visitor_persona_defaut :", error.message);
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[visitor] persist persona_defaut :", message);
    }
  }
}
