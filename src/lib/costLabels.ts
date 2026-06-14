import type { TFunction } from "i18next";

type SettingsT = TFunction<"settings">;

function i18nOrFallback(t: SettingsT, key: string, fallback: string): string {
  const label = t(key);
  return label === key ? fallback : label;
}

function humanizeToken(raw: string): string {
  return raw.trim().replace(/_/g, " ");
}

/** Libellé affiché pour un `tool_type` (filtres + tableau coûts). */
export function costToolTypeLabel(toolType: string, t: SettingsT): string {
  if (!toolType.trim()) return "—";
  return i18nOrFallback(t, `couts.tool_type_${toolType}`, humanizeToken(toolType));
}

/** Libellé affiché pour une `operation_name`. */
export function costOperationLabel(operation: string, t: SettingsT): string {
  if (!operation.trim()) return "—";
  return i18nOrFallback(t, `couts.operation_${operation}`, humanizeToken(operation));
}

/** Libellé affiché pour un statut d'événement coût. */
export function costEventStatusLabel(status: string, t: SettingsT): string {
  if (!status.trim()) return "—";
  return i18nOrFallback(t, `couts.event_status_${status}`, humanizeToken(status));
}

/** Classe CSS pour champs date/select lisibles sur fond back-office sombre. */
export const BACKOFFICE_FORM_CONTROL_CLASS = "backoffice-form-control";
