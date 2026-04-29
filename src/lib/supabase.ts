import { createClient } from "@supabase/supabase-js";
import type { Database } from "@types/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase : définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans votre fichier .env à la racine du projet."
  );
}

export const supabase = createClient<Database>(supabaseUrl ?? "", supabaseAnonKey ?? "");

/** URL du projet uniquement (pas de clé) — utile pour vérifier qu’on ne pointe pas sur le mauvais projet. */
if (import.meta.env.DEV) {
  console.debug("[Supabase] URL projet :", supabaseUrl ?? "(VITE_SUPABASE_URL non défini)");
}
