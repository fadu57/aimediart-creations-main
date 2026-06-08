import { differenceInYears } from "date-fns";

/** Date locale à minuit (comparaisons jour par jour). */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function clampLocalDay(date: Date, min?: Date, max?: Date): Date {
  let d = startOfLocalDay(date);
  if (min && d < startOfLocalDay(min)) d = startOfLocalDay(min);
  if (max && d > startOfLocalDay(max)) d = startOfLocalDay(max);
  return d;
}

/** Parse une date SQL « yyyy-MM-dd » (ou préfixe ISO) en Date locale. */
export function parseDateOnlyString(raw: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function coerceFormDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim()) return parseDateOnlyString(value);
  return undefined;
}

/** Corrige une naissance postérieure au décès (erreur de siècle fréquente : 1981 → 1881). */
export function resolveArtistBirthDate(
  birthDate: unknown,
  deathDate: unknown,
  isLiving: boolean,
): Date | undefined {
  const birth = coerceFormDate(birthDate);
  if (!birth || isLiving) return birth;

  const death = coerceFormDate(deathDate);
  if (!death || death >= birth) return birth;

  const centuryCorrected = new Date(birth.getFullYear() - 100, birth.getMonth(), birth.getDate());
  if (centuryCorrected <= death) return centuryCorrected;

  return birth;
}

/** Âge en années : vivant → aujourd’hui − naissance ; décédé → décès − naissance. */
export function computeArtistAgeYears(
  birthDate: unknown,
  deathDate: unknown,
  isLiving: boolean,
): number | null {
  const birth = resolveArtistBirthDate(birthDate, deathDate, isLiving);
  if (!birth) return null;

  const endDate = isLiving ? new Date() : coerceFormDate(deathDate) ?? null;
  if (!endDate) return null;

  const years = differenceInYears(endDate, birth);
  return years >= 0 ? years : null;
}
