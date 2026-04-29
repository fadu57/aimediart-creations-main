/** Clés `app_settings.key` pour la page Configurations (JSON dans `value`). */

export const SETTINGS_KEYS = {
  generalIdentity: "settings_general_identity",
  generalLanguage: "settings_general_language",
  generalLinksQr: "settings_general_links_qr",
  generalLimits: "settings_general_limits",
  generalMaintenance: "settings_general_maintenance",
  visitorsBehavior: "settings_visitors_behavior",
  notifications: "settings_notifications",
  securityMatrix: "settings_security_matrix",
} as const;

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
