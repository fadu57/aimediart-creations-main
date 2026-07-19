import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type VisitorProfileInput = {
  userId: string;
  email?: string | null;
  prenom: string;
  nom: string;
  agencyId?: string | null;
  expoId?: string | null;
  userAge?: string | null;
  userPhone?: string | null;
  userPhotoUrl?: string | null;
  deviceFingerprint?: string | null;
  zipCode?: string | null;
  city?: string | null;
  country?: string | null;
  countryCode?: string | null;
};

function parseBirthYear(userAge: string | null | undefined): number | null {
  if (!userAge?.trim()) return null;
  const year = Number.parseInt(userAge.trim().slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/** Métadonnées Auth + public.profiles (+ expo_user_role si expo) pour un visiteur (role_id 7). */
export async function persistVisitorProfile(
  admin: SupabaseClient,
  input: VisitorProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    userId,
    email = null,
    prenom,
    nom,
    agencyId = null,
    expoId = null,
    userAge = null,
    userPhone = null,
    userPhotoUrl = null,
    deviceFingerprint = null,
    zipCode = null,
    city = null,
    country = null,
    countryCode = null,
  } = input;

  const birthYear = parseBirthYear(userAge);
  const fullName = `${prenom} ${nom}`.trim();

  const { data: existingUser, error: readUserErr } = await admin.auth.admin.getUserById(userId);
  if (readUserErr || !existingUser.user) {
    return { ok: false, error: readUserErr?.message || "Utilisateur Auth introuvable." };
  }

  const existingMeta =
    typeof existingUser.user.user_metadata === "object" && existingUser.user.user_metadata !== null
      ? existingUser.user.user_metadata
      : {};

  const mergedMeta = {
    ...existingMeta,
    prenom,
    nom,
    first_name: prenom,
    last_name: nom,
    user_prenom: prenom,
    full_name: fullName,
    role_id: 7,
    role_name: "visiteur",
    user_roles: "7",
    agency_id: agencyId,
    expo_id: expoId,
    user_expo_id: expoId,
    user_age: userAge,
    user_phone: userPhone,
    user_photo_url: userPhotoUrl,
    ...(email ? { user_email: email } : {}),
    ...(deviceFingerprint ? { device_fingerprint: deviceFingerprint } : {}),
  };

  const { error: metaErr } = await admin.auth.admin.updateUserById(userId, { user_metadata: mergedMeta });
  if (metaErr) {
    return { ok: false, error: metaErr.message };
  }

  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      first_name: prenom,
      last_name: nom,
      phone: userPhone,
      ...(userPhotoUrl ? { avatar_url: userPhotoUrl } : {}),
      ...(birthYear != null ? { birth_year: birthYear } : {}),
      ...(zipCode ? { zip_code: zipCode } : {}),
      ...(city ? { city } : {}),
      ...(country ? { country } : {}),
      ...(countryCode ? { country_code: countryCode } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    return { ok: false, error: profileErr.message };
  }

  if (expoId) {
    const { error: expoRoleErr } = await admin.from("expo_user_role").insert({
      user_id: userId,
      expo_id: expoId,
    });
    if (expoRoleErr && !/duplicate|unique/i.test(expoRoleErr.message)) {
      return { ok: false, error: expoRoleErr.message };
    }
  }

  // Rattachement agence + rôle visiteur dans agency_users pour que les RPC et
  // la page /expos/visitors trouvent agency_id et role_id=7 correctement.
  if (agencyId) {
    const { error: agencyUserErr } = await admin.from("agency_users").upsert(
      { user_id: userId, agency_id: agencyId, role_id: 7 },
      { onConflict: "user_id,agency_id" },
    );
    if (agencyUserErr && !/duplicate|unique/i.test(agencyUserErr.message)) {
      // Non bloquant : l'utilisateur est créé même si cette insertion échoue.
      console.warn("[visitorProfile] agency_users upsert:", agencyUserErr.message);
    }
  }

  return { ok: true };
}
