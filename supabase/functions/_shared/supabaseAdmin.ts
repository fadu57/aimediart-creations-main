// Modifié : getUser(JWT) explicite pour created_by fiable depuis les Edge Functions.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function getServiceRoleClient(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

/** Utilisateur JWT de la requête (Authorization: Bearer …). */
export async function getRequestUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[auth] Missing or invalid Authorization header');
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    console.warn('[auth] SUPABASE_URL or SUPABASE_ANON_KEY missing');
    return null;
  }

  const userClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await userClient.auth.getUser(token);

  if (error) {
    console.warn('[auth] getUser failed:', error.message);
    return null;
  }

  return data.user?.id ?? null;
}
