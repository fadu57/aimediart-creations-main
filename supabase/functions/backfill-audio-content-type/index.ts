import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Utilitaire de maintenance ponctuel (AIM-30 / bug WebKit) : les fichiers
// audio générés avant la correction de generate-audio ont été uploadés avec
// contentType "audio/mp4" alors que les octets sont de l'AAC brut (ADTS).
// Ce backfill réécrit les MÊMES octets avec le bon contentType — aucun appel
// OpenAI, donc aucun coût. Le schéma "storage" n'étant pas exposé à l'API
// PostgREST, la liste des fichiers à traiter est fournie par l'appelant
// (obtenue via SQL direct) plutôt que découverte par la fonction elle-même.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET = "audio-guides";
const CORRECT_CONTENT_TYPE = "audio/aac";
const MAX_BATCH_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const body = await req.json().catch(() => ({}));
  const names = Array.isArray(body?.names) ? (body.names as unknown[]).filter((n) => typeof n === "string") as string[] : [];

  if (names.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "Aucun nom fourni dans body.names" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (names.length > MAX_BATCH_SIZE) {
    return new Response(
      JSON.stringify({ success: false, error: `Trop de noms (max ${MAX_BATCH_SIZE} par appel)` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const succeeded: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const name of names) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(name);
      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? "download vide");
      }

      const bytes = await blob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(name, bytes, { contentType: CORRECT_CONTENT_TYPE, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      succeeded.push(name);
    } catch (err) {
      failed.push({ name, error: (err as Error).message ?? "erreur inconnue" });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      processed: names.length,
      succeeded: succeeded.length,
      failed,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
