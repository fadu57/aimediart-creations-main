import { loadOrCreateFingerprintJsId } from "@/lib/fingerprintConsent";
import { buildDeviceFingerprint } from "@/lib/visitorDeviceFingerprint";
import { getOrCreateVisitorUuid, getStoredVisitorUuid, getVisitorLocaleMetadata } from "@/lib/visitorIdentity";
import {
  getVisitorAnonymousProfile,
  setVisitorAnonymousProfile,
  type VisitorAnonymousProfile,
} from "@/lib/visitorAnonymousProfile";
import { supabase } from "@/lib/supabase";
import { localizeVisitorPoolPseudo } from "@/lib/visitorAvatarPool";
import {
  buildPhotoObjectPath,
  extensionFromFileName,
  uploadVisitorSelfiePhoto,
} from "@/lib/storagePaths";

type EdgeIpResponse = {
  ip_address?: string | null;
};

type AnonymousVisitorProfileRpc = {
  is_returning?: boolean;
  visitor_pseudo?: string | null;
  avatar_url?: string | null;
  avatar_object_path?: string | null;
  selfie_url?: string | null;
  selfie_object_path?: string | null;
};

export type VisitorAvatarSelfiePayload = {
  avatarUrl?: string | null;
  avatarObjectPath?: string | null;
  selfieUrl?: string | null;
  selfieObjectPath?: string | null;
};

export function profileFromRpc(data: AnonymousVisitorProfileRpc): VisitorAnonymousProfile | null {
  const pseudo = data.visitor_pseudo?.trim() ?? "";
  const avatarUrl = data.avatar_url?.trim() ?? "";
  const avatarObjectPath = data.avatar_object_path?.trim() ?? "";
  if (!pseudo || !avatarUrl) return null;
  return {
    pseudo,
    avatarUrl,
    avatarObjectPath,
    selfieUrl: data.selfie_url?.trim() ?? "",
    selfieObjectPath: data.selfie_object_path?.trim() ?? "",
  };
}

/** Adapte le pseudo visiteur à la langue UI (catalogue avatars + suffixe numérique). */
export async function localizeVisitorAnonymousProfile(
  profile: VisitorAnonymousProfile,
  locale: string,
): Promise<VisitorAnonymousProfile> {
  const objectPath = profile.avatarObjectPath?.trim() ?? "";
  if (!objectPath) return profile;

  const pseudo = await localizeVisitorPoolPseudo(objectPath, profile.pseudo, locale);
  return { ...profile, pseudo };
}

/** Cherche un visiteur anonyme déjà connu (FingerprintJS visitorId, UUID navigateur ou cache local). */
export async function resolveReturningAnonymousVisitor(): Promise<VisitorAnonymousProfile | null> {
  const visitorUuid = getStoredVisitorUuid();
  const fingerprint = (await loadOrCreateFingerprintJsId())?.trim() || null;

  if (visitorUuid || fingerprint) {
    const { data, error } = await supabase.rpc("get_anonymous_visitor_profile", {
      p_visitor_client_id: visitorUuid,
      p_fingerprint: fingerprint,
    });

    if (!error && data && typeof data === "object") {
      const rpcProfile = profileFromRpc(data as AnonymousVisitorProfileRpc);
      if (rpcProfile) {
        setVisitorAnonymousProfile(rpcProfile);
        return rpcProfile;
      }
    }
  }

  const local = getVisitorAnonymousProfile();
  if (local?.pseudo?.trim() && local.avatarUrl?.trim()) {
    return local;
  }

  return null;
}

export type AnonymousVisitorSession = {
  visitorClientId: string;
  /** PK `public.visitors.id` retournée par la RPC (null si non disponible). */
  visitorDbId: string | null;
};

/** Enregistre ou met à jour la ligne `visitors` pour l’UUID navigateur courant. */
export async function registerAnonymousVisitorSession(): Promise<AnonymousVisitorSession> {
  const visitorUuid = getOrCreateVisitorUuid();
  if (!visitorUuid) {
    throw new Error("Identifiant visiteur indisponible.");
  }

  const fpIdRaw = (await loadOrCreateFingerprintJsId())?.trim() || null;
  const { language, timezone } = getVisitorLocaleMetadata();

  let rawIp: string | null = null;
  try {
    const { data: ipData } = await supabase.functions.invoke<EdgeIpResponse>("get-client-ip", {
      body: { visitor_uuid: visitorUuid },
    });
    const s = typeof ipData?.ip_address === "string" ? ipData.ip_address.trim() : "";
    rawIp = s ? s.slice(0, 256) : null;
  } catch {
    rawIp = null;
  }

  const deviceFp = buildDeviceFingerprint() || null;

  const { data: visitorDbId, error: regError } = await supabase.rpc("register_anonymous_visitor", {
    p_visitor_client_id:  visitorUuid,
    p_fingerprint:        fpIdRaw,
    p_fingerprint_source: fpIdRaw ? "fingerprintjs_visitor_id" : null,
    p_user_agent:         null,
    p_client_locale:      language,
    p_client_timezone:    timezone,
    p_screen_resolution:  null,
    p_ip_address:         rawIp,
    p_browser_name:       null,
    p_device_type:        null,
    p_country:            null,
    p_city:               null,
    p_device_fingerprint: deviceFp,
  });

  if (regError) {
    throw new Error(regError.message);
  }

  const dbId = typeof visitorDbId === "string" ? visitorDbId.trim() : null;
  return { visitorClientId: visitorUuid, visitorDbId: dbId || null };
}

/** Persiste le pseudo choisi côté serveur (SECURITY DEFINER). */
export async function confirmAnonymousVisitorPseudo(
  pseudo: string,
  payload?: VisitorAvatarSelfiePayload,
): Promise<void> {
  const visitorUuid = getOrCreateVisitorUuid();
  const trimmed = pseudo.trim();
  if (!visitorUuid || !trimmed) {
    throw new Error("Pseudo ou identifiant visiteur manquant.");
  }

  const avatarUrl = payload?.avatarUrl?.trim() || null;
  const avatarObjectPath = payload?.avatarObjectPath?.trim() || null;
  const selfieUrl = payload?.selfieUrl?.trim() || null;
  const selfieObjectPath = payload?.selfieObjectPath?.trim() || null;

  const { error } = await supabase.rpc("confirm_visitor_pseudo_from_client", {
    p_visitor_client_id: visitorUuid,
    p_pseudo: trimmed,
    p_avatar_url: avatarUrl,
    p_avatar_object_path: avatarObjectPath,
    p_selfie_url: selfieUrl,
    p_selfie_object_path: selfieObjectPath,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/** Upload selfie + mise à jour `visitors` (avatar pool et selfie conservés séparément). */
export async function persistAnonymousVisitorIdentity(input: {
  pseudo: string;
  avatarUrl?: string | null;
  avatarObjectPath?: string | null;
  selfieFile?: File | null;
  keepSelfieUrl?: string | null;
  keepSelfieObjectPath?: string | null;
}): Promise<VisitorAnonymousProfile> {
  const trimmedPseudo = input.pseudo.trim();
  if (!trimmedPseudo) {
    throw new Error("Pseudo visiteur manquant.");
  }

  const { visitorClientId: visitorUuid } = await registerAnonymousVisitorSession();

  let selfieUrl = input.keepSelfieUrl?.trim() || null;
  let selfieObjectPath = input.keepSelfieObjectPath?.trim() || null;

  if (input.selfieFile) {
    selfieUrl = await uploadVisitorSelfiePhoto(visitorUuid, input.selfieFile, input.selfieFile.name);
    const ext = extensionFromFileName(input.selfieFile.name);
    selfieObjectPath = buildPhotoObjectPath("visitors", visitorUuid, ext);
  }

  const avatarUrl = input.avatarUrl?.trim() ?? "";
  const avatarObjectPath = input.avatarObjectPath?.trim() ?? "";

  await confirmAnonymousVisitorPseudo(trimmedPseudo, {
    avatarUrl: avatarUrl || null,
    avatarObjectPath: avatarObjectPath || null,
    selfieUrl,
    selfieObjectPath,
  });

  const profile: VisitorAnonymousProfile = {
    pseudo: trimmedPseudo,
    avatarUrl,
    avatarObjectPath,
    selfieUrl: selfieUrl ?? "",
    selfieObjectPath: selfieObjectPath ?? "",
  };
  setVisitorAnonymousProfile(profile);
  return profile;
}
