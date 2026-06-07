import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isOnOrAfterOvhImportCutoff, OVH_IMPORT_FROM_DATE } from "./ovhApiClient.ts";

export { OVH_IMPORT_FROM_DATE, isOnOrAfterOvhImportCutoff };

export type OvhAmountType = "ht" | "ttc";

export type OvhInvoiceInput = {
  invoice_ref: string;
  invoice_date: string;
  amount_eur: number;
  amount_type: OvhAmountType;
  order_ref?: string | null;
};

export type ImportOvhInvoiceOptions = {
  source?: "manual_entry" | "ovh_api_sync";
  amount_ht?: number | null;
  amount_ttc?: number | null;
};

export type ImportOvhInvoiceResult =
  | { status: "skipped"; message: string }
  | { status: "already_imported"; message: string; invoice_ref: string }
  | {
    status: "success";
    message: string;
    invoice_ref: string;
    amount: number;
    currency: string;
    id: string;
  };

export function normalizeOvhInvoiceRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ref = value.trim().toUpperCase();
  if (!/^[A-Z]{2}\d{5,}$/.test(ref)) return null;
  return ref;
}

export function parseOvhInvoiceDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = Date.parse(`${d}T12:00:00.000Z`);
  if (!Number.isFinite(t)) return null;
  return d;
}

export function parseOvhAmountEur(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function parseOvhAmountType(value: unknown): OvhAmountType {
  return value === "ht" ? "ht" : "ttc";
}

export function ovhInvoiceImportHash(invoiceRef: string): string {
  return `ovh_invoice:${invoiceRef}`;
}

export function parseOvhInvoiceBody(body: unknown): OvhInvoiceInput | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Corps JSON invalide." };
  }
  const b = body as Record<string, unknown>;
  const invoiceRef = normalizeOvhInvoiceRef(b.invoice_ref);
  if (!invoiceRef) {
    return { error: "invoice_ref invalide (ex. FR77865132)." };
  }
  const invoiceDate = parseOvhInvoiceDate(b.invoice_date);
  if (!invoiceDate) {
    return { error: "invoice_date invalide (YYYY-MM-DD requis)." };
  }
  if (!isOnOrAfterOvhImportCutoff(invoiceDate)) {
    return { error: `Seules les factures à partir du ${OVH_IMPORT_FROM_DATE} sont importées.` };
  }
  const amountEur = parseOvhAmountEur(b.amount_eur);
  if (amountEur === null) {
    return { error: "amount_eur invalide (nombre ≥ 0 requis)." };
  }
  const amountType = parseOvhAmountType(b.amount_type);
  const orderRef = typeof b.order_ref === "string" && b.order_ref.trim()
    ? b.order_ref.trim().slice(0, 40)
    : null;

  return {
    invoice_ref: invoiceRef,
    invoice_date: invoiceDate,
    amount_eur: amountEur,
    amount_type: amountType,
    order_ref: orderRef,
  };
}

export async function importOvhInvoice(
  admin: SupabaseClient,
  input: OvhInvoiceInput,
  options: ImportOvhInvoiceOptions = {},
): Promise<ImportOvhInvoiceResult> {
  if (!isOnOrAfterOvhImportCutoff(input.invoice_date)) {
    return {
      status: "skipped",
      message: `Facture antérieure au ${OVH_IMPORT_FROM_DATE} — ignorée.`,
    };
  }

  const { data: providerRow, error: providerErr } = await admin
    .from("cost_providers")
    .select("provider_key, status")
    .eq("provider_key", "ovh")
    .maybeSingle();

  if (providerErr) {
    throw new Error(`Lecture cost_providers ovh impossible: ${providerErr.message}`);
  }
  if (!providerRow) {
    return { status: "skipped", message: "Fournisseur ovh introuvable." };
  }
  if (providerRow.status !== "active") {
    return {
      status: "skipped",
      message: `Fournisseur ovh inactif (status=${providerRow.status}).`,
    };
  }

  const importHash = ovhInvoiceImportHash(input.invoice_ref);
  const { data: existing, error: existingErr } = await admin
    .from("ai_usage_events")
    .select("id")
    .eq("import_hash", importHash)
    .limit(1);

  if (existingErr) {
    throw new Error(`Vérification idempotence OVH impossible: ${existingErr.message}`);
  }
  if (existing?.length) {
    return {
      status: "already_imported",
      message: "Facture déjà importée.",
      invoice_ref: input.invoice_ref,
    };
  }

  const source = options.source ?? "manual_entry";
  const currency = "EUR";
  const createdAt = `${input.invoice_date}T12:00:00.000Z`;

  const { data: inserted, error: insertErr } = await admin
    .from("ai_usage_events")
    .insert({
      import_hash: importHash,
      created_at: createdAt,
      tool_type: "infrastructure",
      provider: "ovh",
      api_name: "ovh_invoice",
      model_name: input.invoice_ref,
      operation_name: "invoice_payment",
      cost_estimated: input.amount_eur,
      currency,
      status: "success",
      source,
      metadata: {
        invoice_ref: input.invoice_ref,
        invoice_date: input.invoice_date,
        amount_type_used: input.amount_type,
        order_ref: input.order_ref,
        billing_mode: "ovh_invoices",
        import_from_date: OVH_IMPORT_FROM_DATE,
        ...(options.amount_ht != null ? { amount_ht: options.amount_ht } : {}),
        ...(options.amount_ttc != null ? { amount_ttc: options.amount_ttc } : {}),
      },
    })
    .select("id")
    .single();

  if (insertErr) {
    if (/duplicate|unique|23505/i.test(insertErr.message)) {
      return {
        status: "already_imported",
        message: "Facture déjà importée.",
        invoice_ref: input.invoice_ref,
      };
    }
    throw new Error(`Insertion ai_usage_events OVH impossible: ${insertErr.message}`);
  }

  return {
    status: "success",
    message: "Facture OVH enregistrée.",
    invoice_ref: input.invoice_ref,
    amount: input.amount_eur,
    currency,
    id: inserted.id as string,
  };
}
