import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  OvhApiClient,
  billToImportInput,
  getOvhApiConfigFromEnv,
  isOnOrAfterOvhImportCutoff,
  OVH_IMPORT_FROM_DATE,
} from "./ovhApiClient.ts";
import {
  importOvhInvoice,
  type ImportOvhInvoiceResult,
  type OvhInvoiceInput,
} from "./ovhInvoiceImport.ts";

export type SyncOvhInvoicesResult = {
  status: "success" | "skipped" | "error";
  message: string;
  imported: number;
  already_imported: number;
  ignored_before_cutoff: number;
  errors: string[];
};

export async function syncOvhInvoicesFromApi(
  admin: SupabaseClient,
  importFromDate = OVH_IMPORT_FROM_DATE,
): Promise<SyncOvhInvoicesResult> {
  const cfg = getOvhApiConfigFromEnv();
  if (!cfg) {
    return {
      status: "skipped",
      message: "API OVH non configurée (OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY).",
      imported: 0,
      already_imported: 0,
      ignored_before_cutoff: 0,
      errors: [],
    };
  }

  const client = new OvhApiClient(cfg);
  let imported = 0;
  let alreadyImported = 0;
  let ignoredBeforeCutoff = 0;
  const errors: string[] = [];

  let billIds: string[];
  try {
    billIds = await client.listBillIds(importFromDate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      message: msg,
      imported: 0,
      already_imported: 0,
      ignored_before_cutoff: 0,
      errors: [msg],
    };
  }

  for (const billId of billIds) {
    try {
      const bill = await client.getBill(billId);
      const parsed = billToImportInput(bill, "ttc");
      if (!parsed) {
        const ymd = bill.date?.slice(0, 10) ?? "";
        if (ymd && !isOnOrAfterOvhImportCutoff(ymd)) ignoredBeforeCutoff += 1;
        continue;
      }

      const input: OvhInvoiceInput = {
        ...parsed,
        amount_type: "ttc",
      };

      const ht = bill.priceWithoutTax && typeof bill.priceWithoutTax === "object"
        ? Number(bill.priceWithoutTax.value ?? NaN)
        : null;
      const ttc = bill.priceWithTax && typeof bill.priceWithTax === "object"
        ? Number(bill.priceWithTax.value ?? NaN)
        : parsed.amount_eur;

      const result: ImportOvhInvoiceResult = await importOvhInvoice(admin, input, {
        source: "ovh_api_sync",
        amount_ht: Number.isFinite(ht) ? ht : null,
        amount_ttc: Number.isFinite(ttc) ? ttc : parsed.amount_eur,
      });

      if (result.status === "success") imported += 1;
      else if (result.status === "already_imported") alreadyImported += 1;
    } catch (err) {
      errors.push(`${billId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const now = new Date().toISOString();
  await admin
    .from("cost_providers")
    .update({
      last_synced_at: now,
      last_sync_status: errors.length ? "partial" : "success",
      last_sync_error: errors.length ? errors.slice(0, 3).join(" | ") : null,
    })
    .eq("provider_key", "ovh");

  return {
    status: errors.length && imported === 0 && alreadyImported === 0 ? "error" : "success",
    message: `${imported} facture(s) importée(s), ${alreadyImported} déjà présente(s).`,
    imported,
    already_imported: alreadyImported,
    ignored_before_cutoff: ignoredBeforeCutoff,
    errors,
  };
}
