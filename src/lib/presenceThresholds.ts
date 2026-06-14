import { supabase } from "@/lib/supabase";
import {
  DEFAULT_PRESENCE_THRESHOLDS,
  parseJsonSetting,
  SETTINGS_KEYS,
  stringifySetting,
  type SettingsPresenceThresholds,
} from "@/lib/settingsKeys";

export type { SettingsPresenceThresholds };

/** Options autorisées — organisateur actif (minutes). */
export const ORGANIZER_ACTIVE_MINUTES_OPTIONS = [30, 60, 120] as const;

/** Options autorisées — organisateur abandonnée (heures). */
export const ORGANIZER_ABANDONED_HOURS_OPTIONS = [4, 12, 24] as const;

/** Options autorisées — visiteur actif (minutes ; 120 = 2 h). */
export const VISITOR_ACTIVE_MINUTES_OPTIONS = [15, 20, 120] as const;

/** Options autorisées — visiteur abandonnée (heures). */
export const VISITOR_ABANDONED_HOURS_OPTIONS = [2, 3, 4] as const;

export type PresenceThresholdsMs = {
  organizer: { activeMs: number; abandonedMs: number };
  visitor: { activeMs: number; abandonedMs: number };
};

export function presenceSettingsToMs(settings: SettingsPresenceThresholds): PresenceThresholdsMs {
  return {
    organizer: {
      activeMs: settings.organizer.activeMinutes * 60 * 1000,
      abandonedMs: settings.organizer.abandonedHours * 60 * 60 * 1000,
    },
    visitor: {
      activeMs: settings.visitor.activeMinutes * 60 * 1000,
      abandonedMs: settings.visitor.abandonedHours * 60 * 60 * 1000,
    },
  };
}

function isOrganizerActiveMinutes(v: number): v is (typeof ORGANIZER_ACTIVE_MINUTES_OPTIONS)[number] {
  return (ORGANIZER_ACTIVE_MINUTES_OPTIONS as readonly number[]).includes(v);
}

function isOrganizerAbandonedHours(v: number): v is (typeof ORGANIZER_ABANDONED_HOURS_OPTIONS)[number] {
  return (ORGANIZER_ABANDONED_HOURS_OPTIONS as readonly number[]).includes(v);
}

function isVisitorActiveMinutes(v: number): v is (typeof VISITOR_ACTIVE_MINUTES_OPTIONS)[number] {
  return (VISITOR_ACTIVE_MINUTES_OPTIONS as readonly number[]).includes(v);
}

function isVisitorAbandonedHours(v: number): v is (typeof VISITOR_ABANDONED_HOURS_OPTIONS)[number] {
  return (VISITOR_ABANDONED_HOURS_OPTIONS as readonly number[]).includes(v);
}

/** Valide et normalise les seuils lus depuis app_settings. */
export function normalizePresenceThresholdSettings(
  raw: SettingsPresenceThresholds,
  fallback: SettingsPresenceThresholds = DEFAULT_PRESENCE_THRESHOLDS,
): SettingsPresenceThresholds {
  const orgActive = Number(raw.organizer?.activeMinutes);
  const orgAbandoned = Number(raw.organizer?.abandonedHours);
  const visActive = Number(raw.visitor?.activeMinutes);
  const visAbandoned = Number(raw.visitor?.abandonedHours);

  return {
    organizer: {
      activeMinutes: isOrganizerActiveMinutes(orgActive) ? orgActive : fallback.organizer.activeMinutes,
      abandonedHours: isOrganizerAbandonedHours(orgAbandoned) ? orgAbandoned : fallback.organizer.abandonedHours,
    },
    visitor: {
      activeMinutes: isVisitorActiveMinutes(visActive) ? visActive : fallback.visitor.activeMinutes,
      abandonedHours: isVisitorAbandonedHours(visAbandoned) ? visAbandoned : fallback.visitor.abandonedHours,
    },
  };
}

export function validatePresenceThresholdSettings(settings: SettingsPresenceThresholds): string | null {
  if (settings.organizer.activeMinutes * 60 >= settings.organizer.abandonedHours * 3600) {
    return "Le seuil actif organisateur doit être inférieur au seuil abandonnée.";
  }
  if (settings.visitor.activeMinutes * 60 >= settings.visitor.abandonedHours * 3600) {
    return "Le seuil actif visiteur doit être inférieur au seuil abandonnée.";
  }
  if (!isOrganizerActiveMinutes(settings.organizer.activeMinutes)) return "Seuil actif organisateur invalide.";
  if (!isOrganizerAbandonedHours(settings.organizer.abandonedHours)) return "Seuil abandonnée organisateur invalide.";
  if (!isVisitorActiveMinutes(settings.visitor.activeMinutes)) return "Seuil actif visiteur invalide.";
  if (!isVisitorAbandonedHours(settings.visitor.abandonedHours)) return "Seuil abandonnée visiteur invalide.";
  return null;
}

let cachedSettings: SettingsPresenceThresholds | null = null;
let cachedMs: PresenceThresholdsMs | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000;

export function invalidatePresenceThresholdsCache(): void {
  cachedSettings = null;
  cachedMs = null;
  cacheExpiresAt = 0;
}

/** Charge les seuils depuis app_settings (cache 60 s). */
export async function fetchPresenceThresholdSettings(): Promise<{
  data: SettingsPresenceThresholds;
  ms: PresenceThresholdsMs;
  error: string | null;
}> {
  const now = Date.now();
  if (cachedSettings && cachedMs && now < cacheExpiresAt) {
    return { data: cachedSettings, ms: cachedMs, error: null };
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.presenceThresholds)
    .maybeSingle();

  if (error) {
    return {
      data: DEFAULT_PRESENCE_THRESHOLDS,
      ms: presenceSettingsToMs(DEFAULT_PRESENCE_THRESHOLDS),
      error: error.message,
    };
  }

  const row = data as { value?: string | null } | null;
  const normalized = normalizePresenceThresholdSettings(
    parseJsonSetting(row?.value, DEFAULT_PRESENCE_THRESHOLDS),
    DEFAULT_PRESENCE_THRESHOLDS,
  );

  cachedSettings = normalized;
  cachedMs = presenceSettingsToMs(normalized);
  cacheExpiresAt = now + CACHE_TTL_MS;

  return { data: normalized, ms: cachedMs, error: null };
}

export async function savePresenceThresholdSettings(
  settings: SettingsPresenceThresholds,
): Promise<{ error: string | null }> {
  const validationError = validatePresenceThresholdSettings(settings);
  if (validationError) return { error: validationError };

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SETTINGS_KEYS.presenceThresholds,
      value: stringifySetting(settings),
    },
    { onConflict: "key" },
  );

  if (error) return { error: error.message };

  invalidatePresenceThresholdsCache();
  return { error: null };
}

/** Libellé durée pour les selects (ex. 120 → « 2 h »). */
export function formatPresenceMinutesLabel(minutes: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    return t("presence_thresholds.hours_short", { count: minutes / 60 });
  }
  return t("presence_thresholds.minutes_short", { count: minutes });
}

export function formatPresenceHoursLabel(hours: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  return t("presence_thresholds.hours_short", { count: hours });
}
