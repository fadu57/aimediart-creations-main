import { expoLogoRawFromRow, resolveExpoLogoImgSrc } from "@/lib/expoLogo";
import { supabase } from "@/lib/supabase";

export type VisitorExpoRow = Record<string, unknown>;

export type VisitorExpoInfo = {
  expo_name: string;
  logo_expo: string | null;
  date_expo_du: string | null;
  date_expo_au: string | null;
  expo_descript_i18n: string | Record<string, string> | null;
  /** true = en intérieur (défaut), false = extérieur */
  expo_indoor: boolean;
};

function coerceDisplayCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  return "";
}

/** Libellés possibles dans `public.expos` — `expo_name` en premier. */
export function pickExpoDisplayName(row: VisitorExpoRow | null): string {
  if (!row) return "";
  const keys = ["expo_name", "title", "nom", "name", "expo_title", "label", "expo_label"];
  for (const k of keys) {
    const v = coerceDisplayCell(row[k]);
    if (v) return v;
  }
  return "";
}

export async function fetchExpoRowForVisitor(expoIdRaw: string): Promise<VisitorExpoRow | null> {
  const raw = expoIdRaw.trim();
  if (!raw) return null;

  const attempts: Array<{
    label: string;
    run: () => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  }> = [
    {
      label: "id.eq + deleted_at is null",
      run: () => supabase.from("expos").select("*").eq("id", raw).is("deleted_at", null).maybeSingle(),
    },
    {
      label: "id.eq",
      run: () => supabase.from("expos").select("*").eq("id", raw).maybeSingle(),
    },
    {
      label: "expo_id.eq + deleted_at is null",
      run: () => supabase.from("expos").select("*").eq("expo_id", raw).is("deleted_at", null).maybeSingle(),
    },
    {
      label: "expo_id.eq",
      run: () => supabase.from("expos").select("*").eq("expo_id", raw).maybeSingle(),
    },
  ];

  for (const { label, run } of attempts) {
    const { data, error } = await run();
    if (import.meta.env.DEV && error) {
      console.warn(`[visitorExpoFetch] expos (${label}):`, error.code ?? "", error.message);
    }
    if (error) continue;
    if (data && typeof data === "object") return data as VisitorExpoRow;
  }

  return null;
}

/** true = œuvres scannées l'une après l'autre ; false = toutes les œuvres du même artiste. */
export function readExpoScanSequenceNavigation(row: VisitorExpoRow | null): boolean {
  return row?.type_navigation === true;
}

export function mapExpoRowToInfo(row: VisitorExpoRow): VisitorExpoInfo {
  const rawLogo = expoLogoRawFromRow(row);
  const descriptRaw = row.expo_descript_i18n;
  let expo_descript_i18n: string | Record<string, string> | null = null;
  if (typeof descriptRaw === "string" || (descriptRaw && typeof descriptRaw === "object")) {
    expo_descript_i18n = descriptRaw as string | Record<string, string>;
  }

  return {
    expo_name: pickExpoDisplayName(row),
    logo_expo: rawLogo ? resolveExpoLogoImgSrc(rawLogo) : null,
    date_expo_du: coerceDisplayCell(row.date_expo_du) || null,
    date_expo_au: coerceDisplayCell(row.date_expo_au) || null,
    expo_descript_i18n,
    expo_indoor: row.expo_indoor !== false,
  };
}
