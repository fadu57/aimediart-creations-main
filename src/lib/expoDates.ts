export function formatExpoDate(value: string | null | undefined, locale = "fr-FR"): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(locale);
}

type ExpoDatesT = (key: string, opts?: Record<string, string>) => string;

export function formatExpoDatesLabel(
  du: string | null | undefined,
  au: string | null | undefined,
  locale: string,
  t: ExpoDatesT,
  keys: { range: string; permanent: string },
): string {
  const duTrim = (du ?? "").trim();
  const auTrim = (au ?? "").trim();
  if (!duTrim && !auTrim) return t(keys.permanent);
  if (duTrim && auTrim) {
    return t(keys.range, {
      from: formatExpoDate(duTrim, locale),
      to: formatExpoDate(auTrim, locale),
    });
  }
  return t(keys.permanent);
}
