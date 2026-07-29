/**
 * Saisie / lecture du chiffre d'affaires (table revenue_entries).
 * Accès : admins globaux role_id 1-2 (is_cost_admin côté RLS).
 */
import { supabase } from "./supabase";

export const REVENUE_DOCUMENTS_BUCKET = "revenue-documents";
const SIGNED_URL_TTL_SEC = 3600;

export const REVENUE_CATEGORIES = [
  "abonnement",
  "pack_oeuvres",
  "prestation",
  "licence",
  "formation",
  "autre",
] as const;

export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];

export const REVENUE_STATUSES = ["draft", "invoiced", "paid", "cancelled"] as const;
export type RevenueStatus = (typeof REVENUE_STATUSES)[number];

export type RevenueDocument = {
  path: string;
  name: string;
};

export type RevenueEntry = {
  id: string;
  entry_date: string;
  label: string;
  category: string;
  client_name: string | null;
  agency_id: string | null;
  amount_ttc: number;
  currency: string;
  vat_rate: number;
  invoice_ref: string | null;
  status: RevenueStatus;
  note: string | null;
  documents: RevenueDocument[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type RevenueEntryInput = {
  entryDate: string;
  label: string;
  category: string;
  clientName?: string;
  agencyId?: string | null;
  amountTtc: number;
  currency?: string;
  vatRate?: number;
  invoiceRef?: string;
  status?: RevenueStatus;
  note?: string;
  documents?: RevenueDocument[];
};

export type RevenueFilters = {
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  status?: string;
  q?: string;
};

function slugifyFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base =
    (dot > 0 ? name.slice(0, dot) : name)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "document";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return ext ? `${base}.${ext}` : base;
}

function mapRow(row: Record<string, unknown>): RevenueEntry {
  const docs = Array.isArray(row.documents) ? (row.documents as RevenueDocument[]) : [];
  return {
    id: String(row.id),
    entry_date: String(row.entry_date),
    label: String(row.label ?? ""),
    category: String(row.category ?? "autre"),
    client_name: (row.client_name as string | null) ?? null,
    agency_id: (row.agency_id as string | null) ?? null,
    amount_ttc: Number(row.amount_ttc) || 0,
    currency: String(row.currency ?? "EUR"),
    vat_rate: Number(row.vat_rate) || 0,
    invoice_ref: (row.invoice_ref as string | null) ?? null,
    status: (String(row.status ?? "draft") as RevenueStatus),
    note: (row.note as string | null) ?? null,
    documents: docs,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
  };
}

export async function listRevenueEntries(filters: RevenueFilters = {}): Promise<{
  data: RevenueEntry[];
  error: string | null;
}> {
  let q = supabase
    .from("revenue_entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.dateFrom) q = q.gte("entry_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("entry_date", filters.dateTo);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    q = q.or(`label.ilike.${term},client_name.ilike.${term},invoice_ref.ilike.${term}`);
  }

  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)), error: null };
}

export function computeRevenueKpis(entries: RevenueEntry[]) {
  const active = entries.filter((e) => e.status !== "cancelled");
  const paid = active.filter((e) => e.status === "paid");
  const total = active.reduce((s, e) => s + e.amount_ttc, 0);
  const paidTotal = paid.reduce((s, e) => s + e.amount_ttc, 0);
  const count = active.length;
  const avg = count ? total / count : 0;

  const byCat = new Map<string, number>();
  for (const e of active) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount_ttc);
  }
  let topCategory = "—";
  let topAmount = 0;
  for (const [cat, amt] of byCat) {
    if (amt > topAmount) {
      topAmount = amt;
      topCategory = cat;
    }
  }

  const byMonth = new Map<string, number>();
  for (const e of active) {
    const key = e.entry_date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + e.amount_ttc);
  }
  const timeline = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));

  const categoryPie = [...byCat.entries()].map(([category, amount]) => ({ category, amount }));

  return { total, paidTotal, count, avg, topCategory, topAmount, timeline, categoryPie };
}

export async function createRevenueEntry(
  input: RevenueEntryInput,
  userId: string | null,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("revenue_entries")
    .insert({
      entry_date: input.entryDate,
      label: input.label.trim(),
      category: input.category,
      client_name: input.clientName?.trim() || null,
      agency_id: input.agencyId || null,
      amount_ttc: input.amountTtc,
      currency: input.currency || "EUR",
      vat_rate: input.vatRate ?? 20,
      invoice_ref: input.invoiceRef?.trim() || null,
      status: input.status || "draft",
      note: input.note?.trim() || null,
      documents: input.documents ?? [],
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };
  return { id: data?.id ?? null, error: null };
}

export async function updateRevenueEntry(
  id: string,
  input: RevenueEntryInput,
  userId: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("revenue_entries")
    .update({
      entry_date: input.entryDate,
      label: input.label.trim(),
      category: input.category,
      client_name: input.clientName?.trim() || null,
      agency_id: input.agencyId || null,
      amount_ttc: input.amountTtc,
      currency: input.currency || "EUR",
      vat_rate: input.vatRate ?? 20,
      invoice_ref: input.invoiceRef?.trim() || null,
      status: input.status || "draft",
      note: input.note?.trim() || null,
      documents: input.documents ?? [],
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteRevenueEntry(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("revenue_entries").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function uploadRevenueDocument(
  file: File,
  entryId: string,
): Promise<{ doc: RevenueDocument | null; error: string | null }> {
  const safe = slugifyFileName(file.name);
  const path = `${entryId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(REVENUE_DOCUMENTS_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { doc: null, error: error.message };
  return { doc: { path, name: file.name }, error: null };
}

export async function getRevenueDocumentSignedUrl(
  path: string,
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(REVENUE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null, error: null };
}

export function exportRevenueCsv(entries: RevenueEntry[]): string {
  const header = [
    "date",
    "label",
    "category",
    "client",
    "amount_ttc",
    "currency",
    "vat_rate",
    "status",
    "invoice_ref",
    "note",
  ];
  const lines = [header.join(";")];
  for (const e of entries) {
    lines.push(
      [
        e.entry_date,
        JSON.stringify(e.label),
        e.category,
        JSON.stringify(e.client_name ?? ""),
        String(e.amount_ttc).replace(".", ","),
        e.currency,
        String(e.vat_rate),
        e.status,
        JSON.stringify(e.invoice_ref ?? ""),
        JSON.stringify(e.note ?? ""),
      ].join(";"),
    );
  }
  return lines.join("\n");
}
