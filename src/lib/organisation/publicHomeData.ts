/**
 * Données vitrine /organisation — fetchable côté build (Node) et côté client.
 * Équivalent du data fetching d'un Server Component Next.js App Router.
 */

export type PricingRow = {
  pricing_label: string | null;
  pricing_plan: string | null;
  pricing_max_oeuvres: number | null;
  /** Colonne Supabase : princing_max_visitors ou pricing_max_visitors selon migration. */
  princing_max_visitors: number | null;
  pricing_is_unlimited: boolean | null;
  pricing_monthly_ttc_eur: number | null;
  pricing_annuel: number | null;
  pricing_annual_remis: number | null;
  eco_annuel: number | null;
};

export type PublicHomeInitialData = {
  pricingRows: PricingRow[];
  promptIcons: string[];
};

const PRICING_COLUMNS =
  "pricing_label,pricing_plan,pricing_max_oeuvres,princing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,éco_annuel";

export function toPricingNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizePricingRow(row: Record<string, unknown>): PricingRow {
  const ecoFromDb = toPricingNumber(row["éco_annuel"] ?? row.eco_annuel);
  const visitors =
    toPricingNumber(row.princing_max_visitors) ?? toPricingNumber(row.pricing_max_visitors);
  return {
    pricing_label:
      typeof row.pricing_label === "string" || row.pricing_label === null
        ? (row.pricing_label as string | null)
        : null,
    pricing_plan:
      typeof row.pricing_plan === "string" || row.pricing_plan === null
        ? (row.pricing_plan as string | null)
        : null,
    pricing_max_oeuvres: toPricingNumber(row.pricing_max_oeuvres),
    princing_max_visitors: visitors,
    pricing_is_unlimited:
      row.pricing_is_unlimited === true ? true : row.pricing_is_unlimited === false ? false : null,
    pricing_monthly_ttc_eur: toPricingNumber(row.pricing_monthly_ttc_eur),
    pricing_annuel: toPricingNumber(row.pricing_annuel),
    pricing_annual_remis: toPricingNumber(row.pricing_annual_remis),
    eco_annuel: ecoFromDb,
  };
}

async function supabaseRestSelect<T>(
  supabaseUrl: string,
  anonKey: string,
  table: string,
  select: string,
): Promise<{ data: T[] | null; error: string | null }> {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set("select", select);

  const res = await fetch(url.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { data: null, error: body || `HTTP ${res.status}` };
  }

  const data = (await res.json()) as T[];
  return { data, error: null };
}

/** Fetch Supabase (REST) — utilisable au build et en fallback client. */
export async function fetchPublicHomeData(
  supabaseUrl: string,
  anonKey: string,
): Promise<PublicHomeInitialData> {
  const [pricingRes, promptIconsRes] = await Promise.all([
    supabaseRestSelect<Record<string, unknown>>(supabaseUrl, anonKey, "pricing", PRICING_COLUMNS),
    supabaseRestSelect<{ icon?: string | null }>(supabaseUrl, anonKey, "prompt_style", "icon"),
  ]);

  if (pricingRes.error) {
    throw new Error(pricingRes.error);
  }

  const rawPricingRows = pricingRes.data ?? [];
  const iconRows = promptIconsRes.data ?? [];
  const cleanedIcons = [...new Set(iconRows.map((r) => (r.icon ?? "").trim()).filter(Boolean))];

  return {
    pricingRows: rawPricingRows.map(normalizePricingRow),
    promptIcons: cleanedIcons.slice(0, 8),
  };
}

const INITIAL_DATA_SCRIPT_ID = "__ORGANISATION_INITIAL_DATA__";

/** Lit le payload injecté au prérendu (dist/organisation/index.html). */
export function getOrganisationInitialData(): PublicHomeInitialData | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById(INITIAL_DATA_SCRIPT_ID);
  if (!el?.textContent?.trim()) return null;
  try {
    return JSON.parse(el.textContent) as PublicHomeInitialData;
  } catch {
    return null;
  }
}
