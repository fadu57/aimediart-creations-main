/** Clés `app_settings.key` pour la page Configurations (JSON dans `value`). */

export const SETTINGS_KEYS = {
  generalIdentity: "settings_general_identity",
  generalLanguage: "settings_general_language",
  generalLinksQr: "settings_general_links_qr",
  generalLimits: "settings_general_limits",
  generalMaintenance: "settings_general_maintenance",
  /** Mode de génération des médiations IA (1 langue + optionnelle vs toutes les langues). */
  mediationGeneration: "settings_mediation_generation",
  visitorsBehavior: "settings_visitors_behavior",
  notifications: "settings_notifications",
  securityMatrix: "settings_security_matrix",
  /** Seuils présence en ligne (organisateur / visiteur). */
  presenceThresholds: "settings_presence_thresholds",
  /** Canopée p5 — vitrine / projection /expo. */
  forestCanopy: "settings_forest_canopy",
} as const;

/** `single_plus_optional` : langue UI (+ 1 langue optionnelle en fiche). `all_languages` : FR, EN, DE, ES, IT. */
export type SettingsMediationGenerationMode = "single_plus_optional" | "all_languages";

export type SettingsMediationGeneration = {
  mode: SettingsMediationGenerationMode;
};

export const DEFAULT_MEDIATION_GENERATION: SettingsMediationGeneration = {
  mode: "single_plus_optional",
};

export type SettingsGeneralIdentity = {
  organization_name: string;
  logo_url: string;
  favicon_url: string;
  accent_color: string;
};

export type SettingsGeneralLanguage = {
  default_locale: string;
  date_format: string;
  time_format: string;
};

export type SettingsGeneralLinksQr = {
  public_site_origin: string;
  qr_notes: string;
};

export type SettingsGeneralLimits = {
  max_upload_mb: number;
  image_compression_quality: number;
};

export type SettingsGeneralMaintenance = {
  enabled: boolean;
  message: string;
  allowed_role_ids: number[];
};

export type SettingsVisitorsBehavior = {
  ressenti_mandatory: boolean;
  show_exit_dialog: boolean;
};

export type SettingsNotifications = {
  email_from: string;
  webhook_url: string;
  frequency_batch_seconds: number;
  content_detail: string;
};

export type SettingsPresenceThresholds = {
  organizer: {
    activeMinutes: 30 | 60 | 120;
    abandonedHours: 4 | 12 | 24;
  };
  visitor: {
    activeMinutes: 15 | 20 | 120;
    abandonedHours: 2 | 3 | 4;
  };
};

/** Réglages canopée p5 (bandeau vitrine + projection /expo). */
export type SettingsForestCanopy = {
  strip: {
    canvas_height: number;
    max_width: number;
    min_width: number;
  };
  particles: {
    count: number;
    size_min: number;
    size_max: number;
    color_r_min: number;
    color_r_max: number;
    color_g_min: number;
    color_g_max: number;
    color_b_min: number;
    color_b_max: number;
    alpha: number;
  };
  overlay: {
    spawn_interval_ms: number;
    word_chance: number;
    burst_strip_min: number;
    burst_strip_max: number;
    burst_fullscreen_min: number;
    burst_fullscreen_max: number;
    word_speed_min: number;
    word_speed_max: number;
    heart_speed_min: number;
    heart_speed_max: number;
    word_fade_per_sec: number;
    heart_fade_per_sec: number;
    word_font_min: number;
    word_font_max: number;
    heart_font_min: number;
    heart_font_max: number;
  };
  animation: {
    background_r: number;
    background_g: number;
    background_b: number;
    background_a: number;
    pulse_amplitude: number;
    pulse_speed: number;
  };
};

export const DEFAULT_PRESENCE_THRESHOLDS: SettingsPresenceThresholds = {
  organizer: { activeMinutes: 30, abandonedHours: 4 },
  visitor: { activeMinutes: 20, abandonedHours: 2 },
};

export const DEFAULT_FOREST_CANOPY: SettingsForestCanopy = {
  strip: {
    canvas_height: 150,
    max_width: 850,
    min_width: 320,
  },
  particles: {
    count: 600,
    size_min: 12,
    size_max: 40,
    color_r_min: 18,
    color_r_max: 48,
    color_g_min: 80,
    color_g_max: 160,
    color_b_min: 30,
    color_b_max: 60,
    alpha: 150,
  },
  overlay: {
    spawn_interval_ms: 1100,
    word_chance: 0.42,
    burst_strip_min: 1,
    burst_strip_max: 2,
    burst_fullscreen_min: 3,
    burst_fullscreen_max: 4,
    word_speed_min: 10,
    word_speed_max: 22,
    heart_speed_min: 14,
    heart_speed_max: 26,
    word_fade_per_sec: 63,
    heart_fade_per_sec: 99,
    word_font_min: 20,
    word_font_max: 50,
    heart_font_min: 22,
    heart_font_max: 58,
  },
  animation: {
    background_r: 5,
    background_g: 20,
    background_b: 10,
    background_a: 80,
    pulse_amplitude: 20,
    pulse_speed: 0.02,
  },
};

export type SecurityMatrixPermissions = {
  appSettingsRead: boolean;
  appSettingsWrite: boolean;
  promptStyleRead: boolean;
  promptStyleWrite: boolean;
};

export type SettingsSecurityMatrix = Record<string, SecurityMatrixPermissions>;

export const DEFAULT_IDENTITY: SettingsGeneralIdentity = {
  organization_name: "",
  logo_url: "",
  favicon_url: "",
  accent_color: "",
};

export const DEFAULT_LANGUAGE: SettingsGeneralLanguage = {
  default_locale: "fr",
  date_format: "dd/MM/yyyy",
  time_format: "HH:mm",
};

export const DEFAULT_LINKS_QR: SettingsGeneralLinksQr = {
  public_site_origin: "",
  qr_notes: "",
};

export const DEFAULT_LIMITS: SettingsGeneralLimits = {
  max_upload_mb: 10,
  image_compression_quality: 85,
};

export const DEFAULT_MAINTENANCE: SettingsGeneralMaintenance = {
  enabled: false,
  message: "",
  allowed_role_ids: [1, 2, 3],
};

export const DEFAULT_VISITORS: SettingsVisitorsBehavior = {
  ressenti_mandatory: false,
  show_exit_dialog: true,
};

export const DEFAULT_NOTIFICATIONS: SettingsNotifications = {
  email_from: "",
  webhook_url: "",
  frequency_batch_seconds: 300,
  content_detail: "standard",
};

export function parseJsonSetting<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || String(raw).trim() === "") return fallback;
  try {
    const v = JSON.parse(String(raw)) as T;
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
  } catch {
    return fallback;
  }
}

export function stringifySetting(obj: unknown): string {
  return JSON.stringify(obj, null, 0);
}

/** Clés encore lues/écrites dans `app_settings` (la matrice de sécurité est dans `matrice_securite`). */
export const ALL_SETTINGS_PAGE_KEYS = Object.values(SETTINGS_KEYS).filter((k) => k !== SETTINGS_KEYS.securityMatrix);

/** Pilotage global du modèle IA (page Configurations — section « Contrôle IA »). */
export const AI_APP_SETTINGS_KEYS = {
  selectedModel: "selected_ai_model",
  modelsCache: "available_models_cache",
} as const;

export type AiAppSettingsKey = (typeof AI_APP_SETTINGS_KEYS)[keyof typeof AI_APP_SETTINGS_KEYS];

export const AI_APP_SETTINGS_KEY_LIST = Object.values(AI_APP_SETTINGS_KEYS);

/** Clés chargées au premier fetch (config JSON + pilotage IA). */
export const APP_SETTINGS_INITIAL_FETCH_KEYS = [...ALL_SETTINGS_PAGE_KEYS, ...AI_APP_SETTINGS_KEY_LIST];

export type CachedAiModel = {
  id: string;
  provider: "gemini" | "groq";
  name: string;
  tpm_limit: number;
  /** Indice de qualité / 10. */
  quality_score: number;
  /** Indice de vitesse perçue / 10 (UX latence). */
  speed_score: number;
  /** Résilience production / risque rate-limit (0–10). */
  tpm_resilience_score: number;
  /** Compromis global (Q + V + résilience TPM). */
  balance_score: number;
  /** URL du playground officiel (remplie par discover-free-models selon le fournisseur). */
  playground_url: string;
};
