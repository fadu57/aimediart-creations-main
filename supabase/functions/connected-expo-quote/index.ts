import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

function clampText(value: FormDataEntryValue | null, max: number): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "FormData invalide." }, 400);
  }

  const org_name = clampText(formData.get("org_name"), 200);
  const contact_name = clampText(formData.get("contact_name"), 200);
  const contact_email = clampText(formData.get("contact_email"), 320);
  const contact_phone = clampText(formData.get("contact_phone"), 40);
  const need_description = clampText(formData.get("need_description"), 5000);

  if (!org_name || !contact_name || !contact_email || !contact_phone || !need_description) {
    return jsonResponse({ error: "Champs obligatoires manquants." }, 400);
  }
  if (!EMAIL_RE.test(contact_email)) {
    return jsonResponse({ error: "E-mail invalide." }, 400);
  }

  const address = clampText(formData.get("address"), 300);
  const zip_code = clampText(formData.get("zip_code"), 20);
  const city = clampText(formData.get("city"), 100);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration Supabase serveur incomplète." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: insertErr } = await admin
    .from("connected_expo_quote_requests")
    .insert({
      user_id: null,
      agency_id: null,
      org_name,
      contact_name,
      contact_email,
      address,
      zip_code,
      city,
      contact_phone,
      need_description,
    })
    .select("id")
    .single();

  if (insertErr) {
    return jsonResponse({ error: insertErr.message }, 500);
  }

  const floorPlan = formData.get("floor_plan");
  if (floorPlan instanceof File && floorPlan.size > 0 && row?.id) {
    if (floorPlan.size > MAX_FILE_BYTES) {
      return jsonResponse({ ok: true, id: row.id, warn_floor_plan: true });
    }
    const safeName = floorPlan.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
    const path = `connected-expo-quotes/public/${row.id}_${safeName}`;
    const buf = await floorPlan.arrayBuffer();
    const { error: upErr } = await admin.storage.from("photos").upload(path, buf, {
      contentType: floorPlan.type || "application/octet-stream",
      upsert: true,
    });
    if (!upErr) {
      const { data: urlData } = admin.storage.from("photos").getPublicUrl(path);
      await admin
        .from("connected_expo_quote_requests")
        .update({ floor_plan_url: urlData.publicUrl })
        .eq("id", row.id);
    }
  }

  return jsonResponse({ ok: true, id: row.id });
});
