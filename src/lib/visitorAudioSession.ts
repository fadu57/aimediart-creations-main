/**
 * Client API — présence visiteur audio + statut de bannissement (Edge Function).
 */

import { supabase } from "@/lib/supabase";

export type VisitorAudioPresenceRow = {
  id: string;
  visitor_client_id: string;
  visitor_pseudo?: string | null;
  expo_id: string | null;
  artwork_id: string | null;
  artwork_title: string | null;
  page_url: string | null;
  headphones_detected: boolean | null;
  audio_consent_acknowledged: boolean | null;
  banned_at: string | null;
  last_seen_at: string;
  created_at: string;
};

type HeartbeatPayload = {
  action: "heartbeat";
  visitor_client_id: string;
  expo_id?: string | null;
  artwork_id?: string | null;
  artwork_title?: string | null;
  page_url?: string | null;
  headphones_detected?: boolean | null;
  audio_consent_acknowledged?: boolean | null;
};

type BanStatusPayload = {
  action: "ban_status";
  visitor_client_id: string;
};

type ListPayload = {
  action: "list";
  expo_id: string;
};

type BanPayload = {
  action: "ban";
  session_id: string;
  reason?: string | null;
};

type UnbanPayload = {
  action: "unban";
  session_id: string;
};

async function invokeVisitorAudioSession<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("visitor-audio-session", { body });
  if (error) {
    throw new Error(error.message || "Appel visitor-audio-session échoué.");
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

/** Heartbeat : position du visiteur pour l'admin (œuvre / expo scannée). */
export async function sendVisitorAudioHeartbeat(payload: Omit<HeartbeatPayload, "action">): Promise<string | null> {
  const result = await invokeVisitorAudioSession<{ session_id?: string | null }>({
    action: "heartbeat",
    ...payload,
  });
  return result?.session_id ?? null;
}

/** Vérifie si la session visiteur est bannie (polling ~10 s côté hook). */
export async function fetchVisitorAudioBanStatus(visitorClientId: string): Promise<{
  banned: boolean;
  session_id: string | null;
  banned_at: string | null;
}> {
  const result = await invokeVisitorAudioSession<{
    banned?: boolean;
    session_id?: string | null;
    banned_at?: string | null;
  }>({
    action: "ban_status",
    visitor_client_id: visitorClientId,
  });
  return {
    banned: Boolean(result?.banned),
    session_id: result?.session_id ?? null,
    banned_at: result?.banned_at ?? null,
  };
}

/** Liste des visiteurs actifs sur une expo (admin). */
export async function listVisitorAudioPresence(expoId: string): Promise<VisitorAudioPresenceRow[]> {
  const result = await invokeVisitorAudioSession<{ rows?: VisitorAudioPresenceRow[] }>({
    action: "list",
    expo_id: expoId,
  });
  return result?.rows ?? [];
}

export async function banVisitorAudioSession(sessionId: string, reason?: string): Promise<void> {
  await invokeVisitorAudioSession({
    action: "ban",
    session_id: sessionId,
    reason: reason ?? null,
  });
}

export async function unbanVisitorAudioSession(sessionId: string): Promise<void> {
  await invokeVisitorAudioSession({
    action: "unban",
    session_id: sessionId,
  });
}
