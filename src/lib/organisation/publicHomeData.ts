/**
 * Données vitrine /organisation — fetchable côté build (Node) et côté client.
 * Équivalent du data fetching d'un Server Component Next.js App Router.
 */

import { supabase } from "@/lib/supabase";

export type PricingOptionRow = {
  option_code: string;
  unit_price_ttc_eur: number | null;
};

export type PricingRow = {
  pricing_id: number | null;
  pricing_label: string | null;
  display_name: string | null;
  pricing_plan: string | null;
  plan_code: string | null;
  pricing_max_oeuvres: number | null;
  /** Colonne Supabase : princing_max_visitors ou pricing_max_visitors selon migration. */
  princing_max_visitors: number | null;
  pricing_is_unlimited: boolean | null;
  pricing_monthly_ttc_eur: number | null;
  pricing_annuel: number | null;
  pricing_annual_remis: number | null;
  eco_annuel: number | null;
  standby_monthly_price_ttc_eur: number | null;
  included_mediation_langs_min: number | null;
  included_mediation_langs_max: number | null;
  included_audio_langs: number | null;
  trial_duration_days: number | null;
  is_quote_only: boolean | null;
  pricing_options: PricingOptionRow[];
};

export type PublicHomeInitialData = {
  pricingRows: PricingRow[];
  promptIcons: string[];
};

/** Requêtes du plus riche au plus compatible (évite HTTP 400 si migration partielle). */
const PRICING_SELECT_TIERS = [
  "pricing_label,pricing_plan,plan_code,pricing_id,pricing_max_oeuvres,pricing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,éco_annuel,standby_monthly_price_ttc_eur,included_mediation_langs_min,included_mediation_langs_max,included_audio_langs,trial_duration_days,is_quote_only,pricing_options(option_code,unit_price_ttc_eur)",
  "pricing_label,pricing_plan,plan_code,pricing_id,pricing_max_oeuvres,pricing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,éco_annuel,standby_monthly_price_ttc_eur,included_mediation_langs_min,included_mediation_langs_max,included_audio_langs,trial_duration_days,is_quote_only",
  "pricing_label,pricing_plan,pricing_id,pricing_max_oeuvres,pricing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,éco_annuel",
  "pricing_label,pricing_plan,pricing_id,pricing_max_oeuvres,princing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,éco_annuel",
] as const;

/** Requêtes ciblées page engagement (sans jointure pricing_options). */
const ENGAGEMENT_PRICING_SELECT_TIERS = [
  "display_name,pricing_label,pricing_plan,plan_code,pricing_id,pricing_max_oeuvres,pricing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,éco_annuel,standby_monthly_price_ttc_eur,included_mediation_langs_min,included_mediation_langs_max,included_audio_langs",
  "display_name,pricing_label,pricing_plan,plan_code,pricing_id,pricing_max_oeuvres,princing_max_visitors,pricing_is_unlimited,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,éco_annuel,standby_monthly_price_ttc_eur,included_mediation_langs_min,included_mediation_langs_max,included_audio_langs",
  "pricing_label,pricing_plan,plan_code,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,pricing_max_oeuvres,pricing_max_visitors",
  "pricing_label,pricing_plan,plan_code,pricing_monthly_ttc_eur,pricing_annuel,pricing_annual_remis,pricing_max_oeuvres,princing_max_visitors",
] as const;

type PlanEditorialDefaults = {
  plan_code: string;
  standby_monthly_price_ttc_eur: number | null;
  included_mediation_langs_min: number | null;
  included_mediation_langs_max: number | null;
  included_audio_langs: number | null;
  trial_duration_days: number | null;
  pricing_options: PricingOptionRow[];
};

const PLAN_EDITORIAL_DEFAULTS: Record<string, PlanEditorialDefaults> = {
  ETINCELLE: {
    plan_code: "ETINCELLE",
    standby_monthly_price_ttc_eur: null,
    included_mediation_langs_min: 1,
    included_mediation_langs_max: 1,
    included_audio_langs: 0,
    trial_duration_days: 30,
    pricing_options: [],
  },
  ATELIER: {
    plan_code: "ATELIER",
    standby_monthly_price_ttc_eur: 19,
    included_mediation_langs_min: 1,
    included_mediation_langs_max: 2,
    included_audio_langs: 1,
    trial_duration_days: null,
    pricing_options: [
      { option_code: "EXTRA_MEDIATION_LANG", unit_price_ttc_eur: 5 },
      { option_code: "EXTRA_AUDIO_LANG", unit_price_ttc_eur: 5 },
      { option_code: "STANDBY", unit_price_ttc_eur: 19 },
    ],
  },
  HORIZON: {
    plan_code: "HORIZON",
    standby_monthly_price_ttc_eur: 49,
    included_mediation_langs_min: 1,
    included_mediation_langs_max: 2,
    included_audio_langs: 1,
    trial_duration_days: null,
    pricing_options: [
      { option_code: "EXTRA_MEDIATION_LANG", unit_price_ttc_eur: 5 },
      { option_code: "EXTRA_AUDIO_LANG", unit_price_ttc_eur: 5 },
      { option_code: "STANDBY", unit_price_ttc_eur: 49 },
    ],
  },
  RAYONNEMENT: {
    plan_code: "RAYONNEMENT",
    standby_monthly_price_ttc_eur: null,
    included_mediation_langs_min: 1,
    included_mediation_langs_max: 5,
    included_audio_langs: 1,
    trial_duration_days: null,
    pricing_options: [
      { option_code: "EXTRA_MEDIATION_LANG", unit_price_ttc_eur: null },
      { option_code: "EXTRA_AUDIO_LANG", unit_price_ttc_eur: null },
    ],
  },
  ZENITH: {
    plan_code: "ZENITH",
    standby_monthly_price_ttc_eur: null,
    included_mediation_langs_min: null,
    included_mediation_langs_max: null,
    included_audio_langs: null,
    trial_duration_days: null,
    pricing_options: [],
  },
};

export function toPricingNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizePricingOptions(value: unknown): PricingOptionRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const code = typeof rec.option_code === "string" ? rec.option_code : null;
      if (!code) return null;
      return {
        option_code: code,
        unit_price_ttc_eur: toPricingNumber(rec.unit_price_ttc_eur),
      };
    })
    .filter((item): item is PricingOptionRow => item !== null);
}

function inferPlanCode(row: Pick<PricingRow, "plan_code" | "pricing_plan">): string | null {
  if (row.plan_code?.trim()) {
    return row.plan_code.trim().toUpperCase();
  }
  const plan = (row.pricing_plan ?? "").toUpperCase();
  if (plan.includes("ETINCELLE") || plan.includes("ÉTINCELLE")) return "ETINCELLE";
  if (plan.includes("ATELIER")) return "ATELIER";
  if (plan.includes("HORIZON")) return "HORIZON";
  if (plan.includes("RAYONNEMENT")) return "RAYONNEMENT";
  if (plan.includes("ZENITH") || plan.includes("ZÉNITH")) return "ZENITH";
  return null;
}

function enrichPricingRowFromPlanDefaults(row: PricingRow): PricingRow {
  const code = inferPlanCode(row);
  const defaults = code ? PLAN_EDITORIAL_DEFAULTS[code] : null;
  if (!defaults) return row;

  return {
    ...row,
    plan_code: row.plan_code ?? defaults.plan_code,
    trial_duration_days: row.trial_duration_days ?? defaults.trial_duration_days,
    included_mediation_langs_min: row.included_mediation_langs_min ?? defaults.included_mediation_langs_min,
    included_mediation_langs_max: row.included_mediation_langs_max ?? defaults.included_mediation_langs_max,
    included_audio_langs: row.included_audio_langs ?? defaults.included_audio_langs,
    standby_monthly_price_ttc_eur:
      row.standby_monthly_price_ttc_eur ?? defaults.standby_monthly_price_ttc_eur,
    pricing_options: row.pricing_options.length > 0 ? row.pricing_options : defaults.pricing_options,
  };
}

function normalizePricingRow(row: Record<string, unknown>): PricingRow {
  const ecoFromDb = toPricingNumber(row["éco_annuel"] ?? row.eco_annuel);
  const visitors =
    toPricingNumber(row.princing_max_visitors) ?? toPricingNumber(row.pricing_max_visitors);
  const normalized: PricingRow = {
    pricing_id: toPricingNumber(row.pricing_id),
    pricing_label:
      typeof row.pricing_label === "string" || row.pricing_label === null
        ? (row.pricing_label as string | null)
        : null,
    display_name:
      typeof row.display_name === "string" || row.display_name === null
        ? (row.display_name as string | null)
        : null,
    pricing_plan:
      typeof row.pricing_plan === "string" || row.pricing_plan === null
        ? (row.pricing_plan as string | null)
        : null,
    plan_code:
      typeof row.plan_code === "string" || row.plan_code === null
        ? (row.plan_code as string | null)
        : null,
    pricing_max_oeuvres: toPricingNumber(row.pricing_max_oeuvres),
    princing_max_visitors: visitors,
    pricing_is_unlimited:
      row.pricing_is_unlimited === true ? true : row.pricing_is_unlimited === false ? false : null,
    pricing_monthly_ttc_eur: toPricingNumber(row.pricing_monthly_ttc_eur),
    pricing_annuel: toPricingNumber(row.pricing_annuel),
    pricing_annual_remis: toPricingNumber(row.pricing_annual_remis),
    eco_annuel: ecoFromDb,
    standby_monthly_price_ttc_eur: toPricingNumber(row.standby_monthly_price_ttc_eur),
    included_mediation_langs_min: toPricingNumber(row.included_mediation_langs_min),
    included_mediation_langs_max: toPricingNumber(row.included_mediation_langs_max),
    included_audio_langs: toPricingNumber(row.included_audio_langs),
    trial_duration_days: toPricingNumber(row.trial_duration_days),
    is_quote_only: row.is_quote_only === true ? true : row.is_quote_only === false ? false : null,
    pricing_options: normalizePricingOptions(row.pricing_options),
  };
  return enrichPricingRowFromPlanDefaults(normalized);
}

/** Charge un plan tarifaire par plan_code (page engagement / upgrade). */
export async function fetchPricingByPlanCode(planCode: string): Promise<PricingRow | null> {
  const code = planCode.trim().toUpperCase();
  if (!code) return null;

  const loadRow = async (select: string): Promise<PricingRow | null> => {
    const { data, error } = await supabase.from("pricing").select(select).eq("plan_code", code).limit(1).maybeSingle();
    if (!error && data) return normalizePricingRow(data as Record<string, unknown>);
    return null;
  };

  const loadRowByPlanName = async (select: string): Promise<PricingRow | null> => {
    const { data, error } = await supabase
      .from("pricing")
      .select(select)
      .ilike("pricing_plan", `%${code}%`)
      .limit(1)
      .maybeSingle();
    if (!error && data) return normalizePricingRow(data as Record<string, unknown>);
    return null;
  };

  let row: PricingRow | null = null;
  for (const select of ENGAGEMENT_PRICING_SELECT_TIERS) {
    row = await loadRow(select);
    if (row) break;
  }
  if (!row) {
    for (const select of ENGAGEMENT_PRICING_SELECT_TIERS) {
      row = await loadRowByPlanName(select);
      if (row) break;
    }
  }
  if (!row) return null;

  if (row.pricing_options.length > 0 || row.pricing_id == null) return row;

  const { data: optionsData, error: optionsError } = await supabase
    .from("pricing_options")
    .select("option_code,unit_price_ttc_eur")
    .eq("pricing_id", row.pricing_id);
  if (optionsError || !optionsData?.length) return row;

  return enrichPricingRowFromPlanDefaults({
    ...row,
    pricing_options: normalizePricingOptions(optionsData),
  });
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

async function fetchPricingRows(
  supabaseUrl: string,
  anonKey: string,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  let lastError: string | null = null;

  for (const select of PRICING_SELECT_TIERS) {
    const res = await supabaseRestSelect<Record<string, unknown>>(supabaseUrl, anonKey, "pricing", select);
    if (!res.error && res.data) {
      let rows = res.data;
      if (!select.includes("pricing_options(")) {
        const optionsRes = await supabaseRestSelect<Record<string, unknown>>(
          supabaseUrl,
          anonKey,
          "pricing_options",
          "pricing_id,option_code,unit_price_ttc_eur",
        );
        if (!optionsRes.error && optionsRes.data?.length) {
          const optionsByPricingId = new Map<number, PricingOptionRow[]>();
          for (const opt of optionsRes.data) {
            const pricingId = toPricingNumber(opt.pricing_id);
            const code = typeof opt.option_code === "string" ? opt.option_code : null;
            if (pricingId === null || !code) continue;
            const bucket = optionsByPricingId.get(pricingId) ?? [];
            bucket.push({
              option_code: code,
              unit_price_ttc_eur: toPricingNumber(opt.unit_price_ttc_eur),
            });
            optionsByPricingId.set(pricingId, bucket);
          }
          rows = rows.map((row) => {
            const pricingId = toPricingNumber(row.pricing_id);
            if (pricingId === null) return row;
            const embedded = normalizePricingOptions(row.pricing_options);
            if (embedded.length > 0) return row;
            return { ...row, pricing_options: optionsByPricingId.get(pricingId) ?? [] };
          });
        }
      }
      return { rows, error: null };
    }
    lastError = res.error;
  }

  return { rows: [], error: lastError };
}

/** Fetch Supabase (REST) — utilisable au build et en fallback client. */
export async function fetchPublicHomeData(
  supabaseUrl: string,
  anonKey: string,
): Promise<PublicHomeInitialData> {
  const [pricingRes, promptIconsRes] = await Promise.all([
    fetchPricingRows(supabaseUrl, anonKey),
    supabaseRestSelect<{ icon?: string | null }>(supabaseUrl, anonKey, "prompt_style", "icon"),
  ]);

  if (pricingRes.error) {
    throw new Error(pricingRes.error);
  }

  const rawPricingRows = pricingRes.rows;
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
