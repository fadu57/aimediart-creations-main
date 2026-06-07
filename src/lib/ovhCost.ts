/** Date minimale d'import des factures OVH (suivi coûts infra). */
export const OVH_IMPORT_FROM_DATE = "2026-04-01";

export function isOnOrAfterOvhImportCutoff(invoiceDate: string): boolean {
  return invoiceDate >= OVH_IMPORT_FROM_DATE;
}

/** Parse un montant EUR (≥ 0, 2 décimales max). */
export function parseOvhAmountEurInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatOvhAmountEur(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "0";
  return n.toFixed(2).replace(".", ",");
}

export function normalizeOvhInvoiceRefInput(value: string): string | null {
  const ref = value.trim().toUpperCase();
  if (!/^[A-Z]{2}\d{5,}$/.test(ref)) return null;
  return ref;
}

export type OvhAmountType = "ht" | "ttc";
