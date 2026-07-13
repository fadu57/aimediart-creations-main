import { supabase } from "@/lib/supabase";
import {
  DEFAULT_FOREST_CANOPY,
  parseJsonSetting,
  SETTINGS_KEYS,
  stringifySetting,
  type SettingsForestCanopy,
} from "@/lib/settingsKeys";

export type { SettingsForestCanopy };
export { DEFAULT_FOREST_CANOPY } from "@/lib/settingsKeys";

/** Config aplatie consommée par le sketch p5. */
export type ResolvedForestCanopyConfig = {
  canvasHeight: number;
  stripMaxWidth: number;
  stripMinWidth: number;
  numParticles: number;
  overlaySpawnIntervalMs: number;
  overlayWordChance: number;
  overlayBurstStripMin: number;
  overlayBurstStripMax: number;
  overlayBurstFullscreenMin: number;
  overlayBurstFullscreenMax: number;
  backgroundR: number;
  backgroundG: number;
  backgroundB: number;
  backgroundA: number;
  pulseAmplitude: number;
  pulseSpeed: number;
  leafSizeMin: number;
  leafSizeMax: number;
  leafRMin: number;
  leafRMax: number;
  leafGMin: number;
  leafGMax: number;
  leafBMin: number;
  leafBMax: number;
  leafAlpha: number;
  wordVyMin: number;
  wordVyMax: number;
  heartVyMin: number;
  heartVyMax: number;
  wordFadePerSec: number;
  heartFadePerSec: number;
  wordFontMin: number;
  wordFontMax: number;
  heartFontMin: number;
  heartFontMax: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(clamp(n, min, max));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function mergeForestCanopy(partial: Partial<SettingsForestCanopy>): SettingsForestCanopy {
  const d = DEFAULT_FOREST_CANOPY;
  return {
    strip: { ...d.strip, ...partial.strip },
    particles: { ...d.particles, ...partial.particles },
    overlay: { ...d.overlay, ...partial.overlay },
    animation: { ...d.animation, ...partial.animation },
  };
}

/** Valide et borne les réglages lus depuis app_settings. */
export function normalizeForestCanopySettings(
  raw: SettingsForestCanopy,
  fallback: SettingsForestCanopy = DEFAULT_FOREST_CANOPY,
): SettingsForestCanopy {
  const base = mergeForestCanopy(raw);
  const burstStripMin = clampInt(base.overlay.burst_strip_min, 1, 8, fallback.overlay.burst_strip_min);
  const burstStripMax = clampInt(
    base.overlay.burst_strip_max,
    burstStripMin,
    12,
    Math.max(burstStripMin, fallback.overlay.burst_strip_max),
  );
  const burstFsMin = clampInt(base.overlay.burst_fullscreen_min, 1, 12, fallback.overlay.burst_fullscreen_min);
  const burstFsMax = clampInt(
    base.overlay.burst_fullscreen_max,
    burstFsMin,
    16,
    Math.max(burstFsMin, fallback.overlay.burst_fullscreen_max),
  );
  const sizeMin = clampInt(base.particles.size_min, 4, 120, fallback.particles.size_min);
  const sizeMax = clampInt(
    base.particles.size_max,
    sizeMin,
    160,
    Math.max(sizeMin, fallback.particles.size_max),
  );
  const wordFontMin = clampInt(base.overlay.word_font_min, 10, 80, fallback.overlay.word_font_min);
  const wordFontMax = clampInt(
    base.overlay.word_font_max,
    wordFontMin,
    120,
    Math.max(wordFontMin, fallback.overlay.word_font_max),
  );
  const heartFontMin = clampInt(base.overlay.heart_font_min, 10, 90, fallback.overlay.heart_font_min);
  const heartFontMax = clampInt(
    base.overlay.heart_font_max,
    heartFontMin,
    120,
    Math.max(heartFontMin, fallback.overlay.heart_font_max),
  );

  return {
    strip: {
      canvas_height: clampInt(base.strip.canvas_height, 80, 400, fallback.strip.canvas_height),
      max_width: clampInt(base.strip.max_width, 320, 2560, fallback.strip.max_width),
      min_width: clampInt(base.strip.min_width, 240, 1200, fallback.strip.min_width),
    },
    particles: {
      count: clampInt(base.particles.count, 50, 3000, fallback.particles.count),
      size_min: sizeMin,
      size_max: sizeMax,
      color_r_min: clampInt(base.particles.color_r_min, 0, 255, fallback.particles.color_r_min),
      color_r_max: clampInt(base.particles.color_r_max, 0, 255, fallback.particles.color_r_max),
      color_g_min: clampInt(base.particles.color_g_min, 0, 255, fallback.particles.color_g_min),
      color_g_max: clampInt(base.particles.color_g_max, 0, 255, fallback.particles.color_g_max),
      color_b_min: clampInt(base.particles.color_b_min, 0, 255, fallback.particles.color_b_min),
      color_b_max: clampInt(base.particles.color_b_max, 0, 255, fallback.particles.color_b_max),
      alpha: clampInt(base.particles.alpha, 0, 255, fallback.particles.alpha),
    },
    overlay: {
      spawn_interval_ms: clampInt(base.overlay.spawn_interval_ms, 200, 10000, fallback.overlay.spawn_interval_ms),
      word_chance: clampFloat(base.overlay.word_chance, 0, 1, fallback.overlay.word_chance),
      burst_strip_min: burstStripMin,
      burst_strip_max: burstStripMax,
      burst_fullscreen_min: burstFsMin,
      burst_fullscreen_max: burstFsMax,
      word_speed_min: clampFloat(base.overlay.word_speed_min, 1, 80, fallback.overlay.word_speed_min),
      word_speed_max: clampFloat(
        base.overlay.word_speed_max,
        base.overlay.word_speed_min,
        120,
        Math.max(base.overlay.word_speed_min, fallback.overlay.word_speed_max),
      ),
      heart_speed_min: clampFloat(base.overlay.heart_speed_min, 1, 80, fallback.overlay.heart_speed_min),
      heart_speed_max: clampFloat(
        base.overlay.heart_speed_max,
        base.overlay.heart_speed_min,
        120,
        Math.max(base.overlay.heart_speed_min, fallback.overlay.heart_speed_max),
      ),
      word_fade_per_sec: clampFloat(base.overlay.word_fade_per_sec, 10, 300, fallback.overlay.word_fade_per_sec),
      heart_fade_per_sec: clampFloat(base.overlay.heart_fade_per_sec, 10, 400, fallback.overlay.heart_fade_per_sec),
      word_font_min: wordFontMin,
      word_font_max: wordFontMax,
      heart_font_min: heartFontMin,
      heart_font_max: heartFontMax,
    },
    animation: {
      background_r: clampInt(base.animation.background_r, 0, 255, fallback.animation.background_r),
      background_g: clampInt(base.animation.background_g, 0, 255, fallback.animation.background_g),
      background_b: clampInt(base.animation.background_b, 0, 255, fallback.animation.background_b),
      background_a: clampInt(base.animation.background_a, 0, 255, fallback.animation.background_a),
      pulse_amplitude: clampFloat(base.animation.pulse_amplitude, 0, 120, fallback.animation.pulse_amplitude),
      pulse_speed: clampFloat(base.animation.pulse_speed, 0.001, 0.2, fallback.animation.pulse_speed),
    },
  };
}

export function resolveForestCanopyConfig(settings: SettingsForestCanopy): ResolvedForestCanopyConfig {
  const s = normalizeForestCanopySettings(settings);
  return {
    canvasHeight: s.strip.canvas_height,
    stripMaxWidth: s.strip.max_width,
    stripMinWidth: s.strip.min_width,
    numParticles: s.particles.count,
    overlaySpawnIntervalMs: s.overlay.spawn_interval_ms,
    overlayWordChance: s.overlay.word_chance,
    overlayBurstStripMin: s.overlay.burst_strip_min,
    overlayBurstStripMax: s.overlay.burst_strip_max,
    overlayBurstFullscreenMin: s.overlay.burst_fullscreen_min,
    overlayBurstFullscreenMax: s.overlay.burst_fullscreen_max,
    backgroundR: s.animation.background_r,
    backgroundG: s.animation.background_g,
    backgroundB: s.animation.background_b,
    backgroundA: s.animation.background_a,
    pulseAmplitude: s.animation.pulse_amplitude,
    pulseSpeed: s.animation.pulse_speed,
    leafSizeMin: s.particles.size_min,
    leafSizeMax: s.particles.size_max,
    leafRMin: s.particles.color_r_min,
    leafRMax: s.particles.color_r_max,
    leafGMin: s.particles.color_g_min,
    leafGMax: s.particles.color_g_max,
    leafBMin: s.particles.color_b_min,
    leafBMax: s.particles.color_b_max,
    leafAlpha: s.particles.alpha,
    wordVyMin: s.overlay.word_speed_min,
    wordVyMax: s.overlay.word_speed_max,
    heartVyMin: s.overlay.heart_speed_min,
    heartVyMax: s.overlay.heart_speed_max,
    wordFadePerSec: s.overlay.word_fade_per_sec,
    heartFadePerSec: s.overlay.heart_fade_per_sec,
    wordFontMin: s.overlay.word_font_min,
    wordFontMax: s.overlay.word_font_max,
    heartFontMin: s.overlay.heart_font_min,
    heartFontMax: s.overlay.heart_font_max,
  };
}

export const DEFAULT_RESOLVED_FOREST_CANOPY_CONFIG = resolveForestCanopyConfig(DEFAULT_FOREST_CANOPY);

let cachedSettings: SettingsForestCanopy | null = null;
let cachedResolved: ResolvedForestCanopyConfig | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateForestCanopySettingsCache(): void {
  cachedSettings = null;
  cachedResolved = null;
  cacheExpiresAt = 0;
}

/** Charge les réglages canopée (cache 60 s) — lecture publique anon OK (RLS dédiée). */
export async function fetchForestCanopySettings(): Promise<{
  data: SettingsForestCanopy;
  resolved: ResolvedForestCanopyConfig;
  error: string | null;
}> {
  const now = Date.now();
  if (cachedSettings && cachedResolved && now < cacheExpiresAt) {
    return { data: cachedSettings, resolved: cachedResolved, error: null };
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.forestCanopy)
    .maybeSingle();

  if (error) {
    return {
      data: DEFAULT_FOREST_CANOPY,
      resolved: DEFAULT_RESOLVED_FOREST_CANOPY_CONFIG,
      error: error.message,
    };
  }

  const row = data as { value?: string | null } | null;
  const normalized = normalizeForestCanopySettings(
    parseJsonSetting(row?.value, DEFAULT_FOREST_CANOPY),
    DEFAULT_FOREST_CANOPY,
  );
  const resolved = resolveForestCanopyConfig(normalized);

  cachedSettings = normalized;
  cachedResolved = resolved;
  cacheExpiresAt = now + CACHE_TTL_MS;

  return { data: normalized, resolved, error: null };
}

export async function saveForestCanopySettings(
  settings: SettingsForestCanopy,
): Promise<{ error: string | null }> {
  const normalized = normalizeForestCanopySettings(settings);

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SETTINGS_KEYS.forestCanopy,
      value: stringifySetting(normalized),
    },
    { onConflict: "key" },
  );

  if (error) return { error: error.message };

  invalidateForestCanopySettingsCache();
  return { error: null };
}
