import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@types/supabase";

/** Vite (navigateur) ou variables process (prérendu Node). */
function readEnv(key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const fromVite = typeof import.meta !== "undefined" ? import.meta.env?.[key]?.trim() : "";
  if (fromVite) return fromVite;
  return process.env[key]?.trim() ?? "";
}

let client: SupabaseClient<Database> | null = null;

function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const supabaseUrl = readEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = readEnv("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase non configuré : définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.",
    );
  }

  client = createClient<Database>(supabaseUrl, supabaseAnonKey);
  return client;
}

/** Client Supabase lazy — aucun appel à createClient tant que le module n’est pas utilisé. */
export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const c = getSupabaseClient();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(c) : value;
  },
});

export function isSupabaseConfigured(): boolean {
  return Boolean(readEnv("VITE_SUPABASE_URL") && readEnv("VITE_SUPABASE_ANON_KEY"));
}

if (import.meta.env?.DEV) {
  const url = readEnv("VITE_SUPABASE_URL");
  console.debug("[Supabase] URL projet :", url ?? "(VITE_SUPABASE_URL non défini)");
}
