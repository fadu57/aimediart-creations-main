/**
 * Taux USD → EUR du jour.
 * Source : currency-api via jsDelivr (CORS * en prod).
 * Dev : proxy same-origin `/api/fx-rate/…` (vite.config.ts) — pas de Frankfurter.
 */

const FX_CDN =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";

/** Dev = proxy Vite (same-origin) ; prod = CDN direct. */
const FX_URL = import.meta.env.DEV ? "/api/fx-rate/usd.json" : FX_CDN;

const CACHE_KEY = "aimediart_fx_usd_eur_v2";
const CACHE_DATE_KEY = "aimediart_fx_usd_eur_date_v2";

type FxApiResponse = {
  date?: string;
  usd?: { eur?: number };
};

function cacheRate(date: string, rate: number): void {
  try {
    sessionStorage.setItem(CACHE_KEY, String(rate));
    sessionStorage.setItem(CACHE_DATE_KEY, date);
  } catch { /* sessionStorage indisponible */ }
}

export async function getUsdToEurRate(): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const cachedDate = sessionStorage.getItem(CACHE_DATE_KEY);
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cachedDate === today && cached) {
      const n = parseFloat(cached);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch { /* sessionStorage indisponible */ }

  try {
    const resp = await fetch(FX_URL);
    if (!resp.ok) return null;
    const data = (await resp.json()) as FxApiResponse;
    const rate = data.usd?.eur;
    if (!rate || !Number.isFinite(rate) || rate <= 0) return null;

    cacheRate(data.date ?? today, rate);
    return rate;
  } catch {
    return null;
  }
}

export function usdToEur(usd: number, rate: number): number {
  return usd * rate;
}
