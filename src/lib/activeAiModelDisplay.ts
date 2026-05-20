import { supabase } from "@/lib/supabase";
import { AI_APP_SETTINGS_KEYS } from "@/lib/settingsKeys";

/**
 * Valeur `app_settings.value` pour selected_ai_model (aligné sur AiModelControlPanel).
 */
export function parseSelectedAiModelSettingValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return "";
    if ((t.startsWith('"') && t.endsWith('"')) || t.startsWith("{")) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (typeof parsed === "string") return parsed.trim();
        if (parsed && typeof parsed === "object") {
          const o = parsed as Record<string, unknown>;
          const id = o.model_id ?? o.id ?? o.modelId ?? o.selected_model ?? o.model;
          if (typeof id === "string" && id.trim()) return id.trim();
        }
      } catch {
        /* chaîne brute */
      }
    }
    return t;
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    const id = o.model_id ?? o.id ?? o.modelId ?? o.selected_model ?? o.model;
    if (typeof id === "string") return id.trim();
  }
  const s = String(raw).trim();
  return s === "[object Object]" ? "" : s;
}

type ModelIdName = { id: string; name: string };

/** Lecture légère du cache (id + nom) sans dépendre du parse complet du panneau. */
function parseModelsCacheLite(raw: unknown): ModelIdName[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      v = JSON.parse(s);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out: ModelIdName[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) continue;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    out.push({ id, name: name || id });
  }
  return out;
}

function resolveDisplayName(models: ModelIdName[], selectedId: string): string {
  const sid = selectedId.trim();
  if (!sid) return "";
  const hit = models.find((m) => m.id.toLowerCase() === sid.toLowerCase());
  if (!hit) return sid;
  if (hit.name && hit.name.toLowerCase() !== hit.id.toLowerCase()) return hit.name;
  return hit.id;
}

/** Libellé affichable du modèle marqué actif dans les paramètres (nom catalogue ou id). */
export async function fetchActiveAiModelDisplayLabel(): Promise<string> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [AI_APP_SETTINGS_KEYS.selectedModel, AI_APP_SETTINGS_KEYS.modelsCache]);
  if (error || !data?.length) return "";
  const rows = data as { key: string; value: unknown }[];
  const selectedRaw = rows.find((r) => r.key === AI_APP_SETTINGS_KEYS.selectedModel)?.value;
  const cacheRaw = rows.find((r) => r.key === AI_APP_SETTINGS_KEYS.modelsCache)?.value;
  const selectedId = parseSelectedAiModelSettingValue(selectedRaw);
  const models = parseModelsCacheLite(cacheRaw);
  return resolveDisplayName(models, selectedId);
}
