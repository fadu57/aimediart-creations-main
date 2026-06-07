import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type CostEventInsert = {
  import_hash: string;
  created_at: string;
  tool_type: string;
  provider: string;
  api_name?: string | null;
  model_name?: string | null;
  operation_name?: string | null;
  input_units?: number | null;
  output_units?: number | null;
  unit_type?: string | null;
  cost_estimated: number;
  currency: string;
  status?: string;
  source?: string | null;
  metadata?: Record<string, unknown>;
};

export type InsertCostEventsResult = {
  inserted: number;
  skipped: number;
  errors: string[];
};

/**
 * Insertion idempotente dans ai_usage_events via import_hash.
 * Les doublons (contrainte unique) sont comptés comme skipped.
 */
export async function insertCostEventsIdempotent(
  admin: SupabaseClient,
  events: CostEventInsert[],
  batchSize = 100,
): Promise<InsertCostEventsResult> {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const { error } = await admin
      .from("ai_usage_events")
      .upsert(batch, {
        onConflict: "import_hash",
        ignoreDuplicates: true,
      });

    if (error) {
      // Fallback : insertion ligne par ligne si upsert global échoue
      for (const row of batch) {
        const { error: rowErr } = await admin.from("ai_usage_events").insert(row);
        if (rowErr) {
          if (/duplicate|unique|23505/i.test(rowErr.message)) {
            skipped++;
          } else {
            errors.push(rowErr.message);
          }
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, skipped, errors };
}

/** SHA-256 hex (Deno Web Crypto) pour clés dérivées si besoin. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
