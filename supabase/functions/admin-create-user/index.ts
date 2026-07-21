import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_RESEND_FROM,
  isResendApiKeyConfigured,
  sendResendEmail,
} from "../_shared/resend.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  email?: string;
  password?: string;
  prenom?: string;
  nom?: string;
  phone?: string;
  role_id?: number | string;
  agency_id?: string;
  expo_ids?: string[];
  /** true = générer MDP serveur + e-mail de bienvenue / setup */
  invite?: boolean;
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isLocalhostOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(origin);
}

function getPublicSiteOrigin(): string {
  const fromEnv = (Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "").trim().replace(/\/$/, "");
  if (fromEnv && !isLocalhostOrigin(fromEnv)) return fromEnv;
  return "https://www.aimediart.com";
}

function toPublicAbsoluteUrl(raw: string, fallbackPath = "/"): string {
  const trimmed = raw.trim();
  const publicOrigin = getPublicSiteOrigin();
  if (!trimmed) {
    return `${publicOrigin}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;
  }
  try {
    const u = new URL(trimmed);
    if (isLocalhostOrigin(u.origin)) {
      return `${publicOrigin}${u.pathname}${u.search}${u.hash}`;
    }
    return u.toString();
  } catch {
    if (trimmed.startsWith("/")) return `${publicOrigin}${trimmed}`;
    return trimmed;
  }
}

function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function brandAimediart(text: string): string {
  return text.replace(
    /AIMEDIArt/g,
    '<strong style="color:#ca2b2b;font-weight:700;">AIMEDIArt</strong>',
  );
}

function buildPasswordSetupActionLink(linkPayload: unknown, nextPath: string): string {
  const props =
    linkPayload && typeof linkPayload === "object" && "properties" in linkPayload
      ? ((linkPayload as { properties?: Record<string, unknown> }).properties ?? {})
      : {};

  let hashedToken = typeof props.hashed_token === "string" ? props.hashed_token.trim() : "";
  if (!hashedToken) {
    const actionLinkRaw = typeof props.action_link === "string" ? props.action_link.trim() : "";
    if (actionLinkRaw) {
      try {
        const u = new URL(actionLinkRaw);
        hashedToken =
          u.searchParams.get("token")?.trim() ||
          u.searchParams.get("token_hash")?.trim() ||
          "";
      } catch {
        /* ignore */
      }
    }
  }
  if (!hashedToken) return "";

  const url = new URL(`${getPublicSiteOrigin()}/reset-password`);
  url.searchParams.set("setup", "1");
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  if (nextPath.trim()) url.searchParams.set("next", nextPath.trim());
  return url.toString();
}

function buildStaffWelcomeEmailHtml(params: {
  prenom: string;
  orgLabel: string;
  actionLink: string;
  profileUrl: string;
}): string {
  const name = params.prenom.trim() || "collègue";
  const font =
    "Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const passwordHref = params.actionLink.trim();
  const profileHref = params.profileUrl.trim();
  const org = params.orgLabel.trim() || "AIMEDIArt";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e5e5e5;">
          <tr>
            <td style="color:#1a1a1a;font-family:${font};">
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Bonjour ${name},</p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
                ${brandAimediart(`Bienvenue sur AIMEDIArt — vous avez été invité(e) à rejoindre l'espace <strong>${org}</strong>.`)}
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">
                Pour commencer, créez votre mot de passe personnel en cliquant sur le bouton ci-dessous.
              </p>
              <p style="margin:0 0 22px;text-align:center;">
                <a href="${passwordHref}"
                   style="display:inline-block;background:#ca2b2b;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;">
                  Créer mon mot de passe
                </a>
              </p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
                Ensuite, complétez votre profil (photo, pseudo, date de naissance, adresse) pour finaliser votre espace.
              </p>
              <p style="margin:0 0 8px;text-align:center;">
                <a href="${profileHref}"
                   style="display:inline-block;background:#1f1f1f;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 18px;border-radius:8px;">
                  Compléter mon profil
                </a>
              </p>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.45;color:#666;">
                Si le bouton ne fonctionne pas, copiez ce lien&nbsp;:<br/>
                <a href="${passwordHref}" style="color:#888;word-break:break-all;">${passwordHref}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Rôles créables selon l'appelant. */
function getAllowedRoleIds(callerRoleId: number): number[] {
  if (callerRoleId === 1) return [1, 2, 3, 4, 5, 6];
  if (callerRoleId === 2 || callerRoleId === 3) return [4, 5, 6];
  if (callerRoleId === 4) return [4, 5, 6];
  return [];
}

async function resolveCallerRole(
  admin: SupabaseClient,
  callerUserId: string,
  req: Request,
): Promise<{ roleId: number; agencyId: string | null } | null> {
  const { data: profileRow } = await admin
    .from("profiles")
    .select("role_id")
    .eq("id", callerUserId)
    .maybeSingle();
  const profileRoleId = Number((profileRow as { role_id?: number | null } | null)?.role_id ?? NaN);
  if (Number.isFinite(profileRoleId) && profileRoleId >= 1 && profileRoleId <= 3) {
    return { roleId: profileRoleId, agencyId: null };
  }

  const { data: agencyRow } = await admin
    .from("agency_users")
    .select("role_id, agency_id")
    .eq("user_id", callerUserId)
    .order("role_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (agencyRow) {
    const agencyRoleId = Number((agencyRow as { role_id: number }).role_id);
    const agencyId = String((agencyRow as { agency_id?: string }).agency_id ?? "").trim() || null;
    if (Number.isFinite(agencyRoleId)) {
      return { roleId: agencyRoleId, agencyId };
    }
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const parts = token.split(".");
    if (parts.length === 3) {
      const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
      const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, "+").replace(/_/g, "/"))));
      const raw = payload?.app_metadata?.role_id ?? payload?.user_metadata?.role_id;
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 1 && n <= 3) {
        return { roleId: n, agencyId: null };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Méthode non autorisée." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { ok: false, error: "Variables Supabase serveur manquantes." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse(401, { ok: false, error: "Token manquant." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Body JSON invalide." });
  }

  const email = body.email?.trim().toLowerCase() || "";
  const prenom = body.prenom?.trim() || "";
  const nom = body.nom?.trim() || "";
  const phone = body.phone?.trim() || "";
  const targetRoleId = Number(body.role_id);
  const bodyAgencyId = body.agency_id?.trim() || "";
  const expoIds = Array.isArray(body.expo_ids)
    ? body.expo_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const passwordFromBody = body.password?.trim() || "";
  const wantInvite = body.invite === true || passwordFromBody.length === 0;

  if (!email || !prenom || !nom || !phone || !Number.isFinite(targetRoleId)) {
    return jsonResponse(400, {
      ok: false,
      error: "Email, prénom, nom, téléphone et rôle sont requis.",
    });
  }
  if (!wantInvite && passwordFromBody.length < 6) {
    return jsonResponse(400, { ok: false, error: "Mot de passe provisoire trop court (min. 6)." });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: callerUser },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return jsonResponse(401, { ok: false, error: "Utilisateur appelant introuvable." });
  }

  const caller = await resolveCallerRole(admin, callerUser.id, req);
  if (!caller) {
    return jsonResponse(403, { ok: false, error: "Profil appelant non autorisé." });
  }

  const allowedRoleIds = getAllowedRoleIds(caller.roleId);
  if (!allowedRoleIds.includes(targetRoleId)) {
    return jsonResponse(403, { ok: false, error: "Rôle cible non autorisé pour cet appelant." });
  }

  const isSaaSTarget = targetRoleId >= 1 && targetRoleId <= 3;
  const isOrgTarget = targetRoleId >= 4 && targetRoleId <= 6;

  let effectiveAgencyId: string | null = null;
  let orgLabel = "AIMEDIArt";

  if (isOrgTarget) {
    const isSaasAdmin = caller.roleId >= 1 && caller.roleId <= 3;
    if (caller.roleId === 4) {
      if (!caller.agencyId) {
        return jsonResponse(403, {
          ok: false,
          error: "Admin organisation non rattaché à une agence.",
        });
      }
      // Toujours l'agence de l'appelant rôle 4.
      effectiveAgencyId = caller.agencyId;
      if (bodyAgencyId && bodyAgencyId !== effectiveAgencyId) {
        return jsonResponse(403, {
          ok: false,
          error: "Le nouvel utilisateur doit être lié à votre organisation.",
        });
      }
    } else if (isSaasAdmin) {
      // Admins 1/2/3 : peuvent affecter à n'importe quelle agence.
      effectiveAgencyId = bodyAgencyId || null;
      if (!effectiveAgencyId) {
        return jsonResponse(400, {
          ok: false,
          error: "Sélectionnez une organisation pour ce rôle métier.",
        });
      }
    } else {
      return jsonResponse(403, {
        ok: false,
        error: "Non autorisé à créer des membres organisation.",
      });
    }
    const { data: agencyRow } = await admin
      .from("agencies")
      .select("name_agency")
      .eq("id", effectiveAgencyId)
      .maybeSingle();
    if (!agencyRow) {
      return jsonResponse(400, { ok: false, error: "Organisation introuvable." });
    }
    orgLabel =
      (agencyRow as { name_agency?: string | null }).name_agency?.trim() || "votre organisation";
  } else if (isSaaSTarget) {
    if (caller.roleId !== 1) {
      return jsonResponse(403, {
        ok: false,
        error: "Seul un admin général (niveau 1) peut créer des utilisateurs AIMEDIArt.",
      });
    }
    orgLabel = "AIMEDIArt";
  }

  if ((targetRoleId === 5 || targetRoleId === 6) && expoIds.length === 0) {
    return jsonResponse(400, {
      ok: false,
      error: "Au moins une exposition est requise pour ce rôle.",
    });
  }

  const password = wantInvite ? randomPassword() : passwordFromBody;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: prenom,
      last_name: nom,
      prenom,
      nom,
      user_prenom: prenom,
      full_name: `${prenom} ${nom}`.trim(),
      phone,
      must_complete_profile: true,
    },
    app_metadata: isSaaSTarget ? { role_id: targetRoleId } : {},
  });
  if (createError || !created.user?.id) {
    return jsonResponse(400, {
      ok: false,
      error: createError?.message || "Création Auth impossible.",
    });
  }

  const newUserId = created.user.id;

  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: newUserId,
      first_name: prenom,
      last_name: nom,
      phone,
      role_id: isSaaSTarget ? targetRoleId : null,
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    return jsonResponse(500, { ok: false, error: profileErr.message });
  }

  if (effectiveAgencyId && isOrgTarget) {
    const { error: agencyErr } = await admin.from("agency_users").upsert(
      { user_id: newUserId, agency_id: effectiveAgencyId, role_id: targetRoleId },
      { onConflict: "user_id,agency_id" },
    );
    if (agencyErr) {
      return jsonResponse(500, { ok: false, error: agencyErr.message });
    }
  }

  if (expoIds.length > 0) {
    const { error: expoErr } = await admin
      .from("expo_user_role")
      .insert(expoIds.map((expo_id) => ({ user_id: newUserId, expo_id })));
    if (expoErr) {
      return jsonResponse(500, { ok: false, error: expoErr.message });
    }
  }

  let inviteSent = false;
  if (wantInvite) {
    const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
    if (!isResendApiKeyConfigured(resendApiKey)) {
      return jsonResponse(500, {
        ok: false,
        error: "RESEND_API_KEY manquant — impossible d'envoyer l'e-mail d'invitation.",
        user_id: newUserId,
      });
    }

    const nextPath = "/dashboard?complete_profile=1";
    const redirectTo = toPublicAbsoluteUrl(
      `${getPublicSiteOrigin()}/reset-password?setup=1&next=${encodeURIComponent(nextPath)}`,
      "/reset-password?setup=1",
    );
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr) {
      return jsonResponse(500, {
        ok: false,
        error: linkErr.message || "Impossible de générer le lien de création de mot de passe.",
        user_id: newUserId,
      });
    }

    const actionLink = buildPasswordSetupActionLink(linkData, nextPath);
    if (!actionLink) {
      return jsonResponse(500, {
        ok: false,
        error: "Lien de création de mot de passe vide.",
        user_id: newUserId,
      });
    }

    const profileUrl = toPublicAbsoluteUrl(
      `${getPublicSiteOrigin()}/dashboard?complete_profile=1`,
      "/dashboard?complete_profile=1",
    );
    const html = buildStaffWelcomeEmailHtml({
      prenom,
      orgLabel,
      actionLink,
      profileUrl,
    });
    const fromEmail =
      Deno.env.get("RESEND_FROM")?.trim() ||
      Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
      DEFAULT_RESEND_FROM;

    const mail = await sendResendEmail({
      apiKey: resendApiKey,
      fromEmail,
      to: email,
      subject: "❤️ AIMEDIArt — bienvenue, créez votre mot de passe",
      html,
    });
    if (!mail.ok) {
      return jsonResponse(500, {
        ok: false,
        error: mail.error || "Échec d'envoi de l'e-mail d'invitation.",
        user_id: newUserId,
      });
    }
    inviteSent = true;
  }

  return jsonResponse(200, {
    ok: true,
    user_id: newUserId,
    invite_sent: inviteSent,
  });
});
