import { getStoredVisitorUuid } from "@/lib/visitorIdentity";
import { supabase } from "@/lib/supabase";

type EdgeIpResponse = {
  ip_address?: string | null;
};

const STORAGE_KEY_PREFIX = "aimediart_ip_sync_at:";
const RPC_UNAVAILABLE_KEY = "aimediart_ip_rpc_unavailable";
/** Évite d'appeler l'edge function à chaque navigation. */
const THROTTLE_MS = 60 * 60 * 1000;

function shouldSync(userId: string, force?: boolean): boolean {
  if (force) return true;
  if (typeof sessionStorage === "undefined") return true;
  if (sessionStorage.getItem(RPC_UNAVAILABLE_KEY) === "1") return false;
  const raw = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
  if (!raw) return true;
  const at = Number.parseInt(raw, 10);
  return !Number.isFinite(at) || Date.now() - at >= THROTTLE_MS;
}

function markSynced(userId: string): void {
  try {
    sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, String(Date.now()));
  } catch {
    /* quota / navigation privée */
  }
}

function markRpcUnavailable(): void {
  try {
    sessionStorage.setItem(RPC_UNAVAILABLE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function isMissingRpcError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const msg = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
  return msg.includes("sync_auth_user_ip_on_login") || msg.includes("404") || msg.includes("not found");
}

/**
 * Enregistre l'IP publique sur `profiles` et sur la ligne `visitors` liée.
 * Silencieux si la migration RPC n'est pas encore déployée.
 */
export async function persistUserIpOnLogin(
  authUserId: string,
  opts?: { visitorClientId?: string | null; force?: boolean },
): Promise<void> {
  const uid = authUserId?.trim();
  if (!uid || !shouldSync(uid, opts?.force)) return;

  let rawIp: string | null = null;
  try {
    const { data: ipData } = await supabase.functions.invoke<EdgeIpResponse>("get-client-ip", {
      body: {},
    });
    const s = typeof ipData?.ip_address === "string" ? ipData.ip_address.trim() : "";
    rawIp = s || null;
  } catch {
    return;
  }
  if (!rawIp) return;

  const visitorClientId = opts?.visitorClientId?.trim() || getStoredVisitorUuid()?.trim() || null;

  const { error } = await supabase.rpc("sync_auth_user_ip_on_login", {
    p_ip_address: rawIp,
    p_visitor_client_id: visitorClientId,
  });

  if (isMissingRpcError(error)) {
    markRpcUnavailable();
    markSynced(uid);
    return;
  }

  if (!error) markSynced(uid);
}
