import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { persistVisitorProfile } from "../_shared/visitorProfile.ts";
import { sendResendEmail, isResendApiKeyConfigured } from "../_shared/resend.ts";

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
  role_id?: string | number | null;
  agency_id?: string | null;
  user_age?: string | null;
  user_phone?: string | null;
  user_photo_url?: string | null;
  user_expo_id?: string | null;
  visitor_uuid?: string | null;
  device_fingerprint?: string | null;
  zip_code?: string | null;
  city?: string | null;
  country?: string | null;
  country_code?: string | null;
  /** Si true (ou password absent) : compte créé sans mdp connu + e-mail de création de mdp. */
  send_password_setup_email?: boolean;
  /** URL de retour après clic (ex. https://host/reset-password?setup=1). */
  redirect_to?: string | null;
  /** Lien public vers le carnet (partage 30 jours ou /summary). */
  diary_url?: string | null;
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
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin.replace(/\/$/, ""));
}

/** Origine publique (préfixe QR) pour les liens e-mail — jamais localhost. */
function getPublicSiteOrigin(): string {
  const fromEnv = (Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "").trim().replace(/\/$/, "");
  if (fromEnv && !isLocalhostOrigin(fromEnv)) return fromEnv;
  return "https://www.aimediart.com";
}

/** Réécrit une URL absolue pour utiliser le préfixe public si l'origine est localhost. */
function toPublicAbsoluteUrl(raw: string, fallbackPath = "/"): string {
  const trimmed = raw.trim();
  const publicOrigin = getPublicSiteOrigin();
  if (!trimmed) return `${publicOrigin}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;
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

function isEmailLike(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
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

function buildPasswordSetupActionLink(linkPayload: unknown): string {
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

  // Lien court public — la page /reset-password appelle verifyOtp (front déployé).
  const url = new URL(`${getPublicSiteOrigin()}/reset-password`);
  url.searchParams.set("setup", "1");
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

function buildBrandLogoHeaderHtml(): string {
  // Carré rouge + cœur blanc (SVG data-URI — évite l’emoji coloré qui ignore le CSS)
  const heartSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">' +
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" ' +
    'stroke="#ffffff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";
  const heartDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(heartSvg)}`;
  const font =
    "Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
  <tr>
    <td style="vertical-align:middle;padding:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="40" height="40" align="center" valign="middle" bgcolor="#ca2b2b"
              style="width:40px;height:40px;background-color:#ca2b2b;border-radius:6px;text-align:center;vertical-align:middle;line-height:40px;">
            <img src="${heartDataUri}" width="22" height="22" alt=""
                 style="display:inline-block;width:22px;height:22px;border:0;outline:none;vertical-align:middle;" />
          </td>
          <td style="padding-left:8px;vertical-align:middle;">
            <div style="font-family:${font};font-size:16px;font-weight:700;letter-spacing:-0.025em;color:#ca2b2b;line-height:1.15;">AIMEDIArt.com</div>
            <div style="font-family:${font};font-size:10px;font-weight:700;font-style:italic;color:#ca2b2b;line-height:1.2;margin-top:2px;">Art-mediation with AI</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function buildPasswordSetupEmailHtml(params: {
  prenom: string;
  actionLink: string;
  diaryUrl: string;
}): string {
  const name = params.prenom.trim() || "visiteur";
  const font =
    "Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const diaryHref = params.diaryUrl.trim();
  const passwordHref = params.actionLink.trim();

  const diaryIntro = brandAimediart(
    "Votre carnet de voyage émotionnel sera disponible pendant 1 mois avec ce lien",
  );
  const diaryButton = diaryHref
    ? `<p style="margin:0 0 14px;text-align:center;">
        <a href="${diaryHref}"
           style="display:inline-block;background:#ca2b2b;color:#ffffff;text-decoration:none;font-family:${font};font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px;">
          Accéder à mon carnet
        </a>
      </p>`
    : "";

  const footerLinks = `
              <p style="margin:24px 0 8px;font-size:12px;line-height:1.45;color:#666;font-family:${font};">
                Si les boutons ne fonctionnent pas, copiez le lien correspondant dans votre navigateur&nbsp;:
              </p>
              ${
                passwordHref
                  ? `<p style="margin:0 0 4px;font-size:12px;line-height:1.45;color:#666;font-family:${font};">
                Lien de création du mot de passe&nbsp;:
              </p>
              <p style="margin:0 0 12px;font-size:11px;line-height:1.4;color:#888;word-break:break-all;font-family:${font};">
                <a href="${passwordHref}" style="color:#888;">${passwordHref}</a>
              </p>`
                  : ""
              }
              ${
                diaryHref
                  ? `<p style="margin:0 0 4px;font-size:12px;line-height:1.45;color:#666;font-family:${font};">
                Lien vers le carnet de voyage émotionnel&nbsp;:
              </p>
              <p style="margin:0;font-size:11px;line-height:1.4;color:#888;word-break:break-all;font-family:${font};">
                <a href="${diaryHref}" style="color:#888;">${diaryHref}</a>
              </p>`
                  : ""
              }`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;font-family:${font};">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e5e5e5;font-family:${font};">
          <tr>
            <td style="font-family:${font};color:#1a1a1a;">
              ${buildBrandLogoHeaderHtml()}
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;font-family:${font};">Bonjour ${name},</p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;font-family:${font};">
                ${brandAimediart("Merci pour votre inscription sur le site de AIMEDIArt.")}
              </p>
              <p style="margin:0 0 10px;font-size:15px;line-height:1.55;font-family:${font};">
                ${diaryIntro}.
              </p>
              ${diaryButton}
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;font-family:${font};">
                ${brandAimediart(
                  "Lors d'une nouvelle visite sur une exposition accompagnée par AIMEDIArt, vous allez pouvoir vous reconnecter avec votre e-mail.",
                )}
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.55;font-family:${font};">
                Pour cela, il est nécessaire de choisir un mot de passe en cliquant sur le bouton ci-dessous.
              </p>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="${passwordHref}"
                   style="display:inline-block;background:#C4A574;color:#ffffff;text-decoration:none;font-family:${font};font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px;">
                  Créer mon mot de passe
                </a>
              </p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;font-family:${font};">A très bientôt</p>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.55;font-family:${font};">
                ${brandAimediart("L'équipe d'AIMEDIArt")}
              </p>
              ${footerLinks}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function resolveDiaryUrl(
  admin: ReturnType<typeof createClient>,
  params: {
    diaryUrlFromBody: string;
    visitorUuid: string;
    expoId: string;
    redirectTo: string;
  },
): Promise<string> {
  const origin = getPublicSiteOrigin();

  // Lien e-mail = partage public (30 j). Sans `share=`, /summary?expo_id redirige vers /visitor.
  if (params.visitorUuid) {
    const rpcParams: { p_visitor_id: string; p_expo_id?: string } = {
      p_visitor_id: params.visitorUuid,
    };
    if (params.expoId) rpcParams.p_expo_id = params.expoId;
    const { data } = await admin.rpc("create_travel_diary_share_link", rpcParams);
    const token =
      data && typeof data === "object" && typeof (data as { token?: unknown }).token === "string"
        ? (data as { token: string }).token.trim()
        : "";
    if (token) {
      return `${origin}/summary?share=${encodeURIComponent(token)}`;
    }
  }

  const fromBody = toPublicAbsoluteUrl(params.diaryUrlFromBody, "/summary");
  if (fromBody && /[?&]share=/.test(fromBody)) {
    return fromBody;
  }

  // Dernier recours : URL déjà fournie (idéalement avec share= côté client)
  if (fromBody) return fromBody;
  if (params.expoId) {
    return `${origin}/summary?expo_id=${encodeURIComponent(params.expoId)}`;
  }
  return `${origin}/summary`;
}

async function sendPasswordSetupEmail(
  admin: ReturnType<typeof createClient>,
  params: {
    email: string;
    prenom: string;
    redirectTo: string;
    diaryUrl: string;
  },
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  if (!isResendApiKeyConfigured(resendApiKey)) {
    return { ok: false, error: "RESEND_API_KEY manquant — impossible d'envoyer l'e-mail de création de mot de passe." };
  }

  const publicRedirect = toPublicAbsoluteUrl(params.redirectTo, "/reset-password?setup=1");
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: params.email,
    options: { redirectTo: publicRedirect },
  });
  if (linkErr) {
    return { ok: false, error: linkErr.message || "Impossible de générer le lien de création de mot de passe." };
  }

  const actionLink = buildPasswordSetupActionLink(linkData);
  if (!actionLink) {
    return { ok: false, error: "Lien de création de mot de passe vide." };
  }
  if (/localhost|127\.0\.0\.1/i.test(actionLink)) {
    return {
      ok: false,
      error: "Lien de création de mot de passe encore en localhost — Site URL Supabase à corriger vers https://www.aimediart.com.",
    };
  }

  const fromEmail =
    Deno.env.get("RESEND_FROM")?.trim() ||
    Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
    "Aimediart <onboarding@resend.dev>";

  const html = buildPasswordSetupEmailHtml({
    prenom: params.prenom,
    actionLink,
    diaryUrl: params.diaryUrl,
  });

  const mail = await sendResendEmail({
    apiKey: resendApiKey,
    fromEmail,
    to: params.email,
    subject: "AIMEDIArt — créez votre mot de passe",
    html,
  });
  if (!mail.ok) {
    // Domaine perso non vérifié : retry via l’expéditeur de test Resend.
    if (/domain is not verified/i.test(mail.error || "") && !/onboarding@resend\.dev/i.test(fromEmail)) {
      const retry = await sendResendEmail({
        apiKey: resendApiKey,
        fromEmail: "Aimediart <onboarding@resend.dev>",
        to: params.email,
        subject: "AIMEDIArt — créez votre mot de passe",
        html,
      });
      if (!retry.ok) {
        return { ok: false, error: retry.error || mail.error || "Échec d'envoi Resend." };
      }
      return { ok: true, id: retry.id };
    }
    return { ok: false, error: mail.error || "Échec d'envoi Resend." };
  }
  return { ok: true, id: mail.id };
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
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, error: "Variables serveur Supabase manquantes." });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { ok: false, error: "Body JSON invalide." });
  }

  const email = body.email?.trim() || "";
  const passwordFromBody = body.password || "";
  const deferPasswordSetup =
    body.send_password_setup_email === true || passwordFromBody.trim().length === 0;
  const password = deferPasswordSetup ? randomPassword() : passwordFromBody;
  const prenom = body.prenom?.trim() || "";
  const nom = body.nom?.trim() || "";
  const requestedRoleIdRaw = body.role_id;
  const requestedRoleId =
    requestedRoleIdRaw == null ? null : String(requestedRoleIdRaw).trim();
  const agencyIdFromBody = body.agency_id?.trim() || null;
  const userAge = body.user_age?.trim() || null;
  const userPhone = body.user_phone?.trim() || null;
  const userPhotoUrl = body.user_photo_url?.trim() || null;
  const expoId = body.user_expo_id?.trim() || null;
  const visitorUuid = body.visitor_uuid?.trim() || null;
  const deviceFingerprint = body.device_fingerprint?.trim().slice(0, 128) || null;
  const zipCode = body.zip_code?.trim() || null;
  const city = body.city?.trim() || null;
  const country = body.country?.trim() || null;
  const countryCode = body.country_code?.trim()?.toUpperCase() || null;

  const appUrlFallback = getPublicSiteOrigin();
  const redirectToRaw = body.redirect_to?.trim() || "";
  const redirectTo = toPublicAbsoluteUrl(
    redirectToRaw || `${appUrlFallback}/reset-password?setup=1`,
    "/reset-password?setup=1",
  );

  if (!isEmailLike(email)) {
    return jsonResponse(400, { ok: false, code: "invalid_email", error: "Adresse e-mail invalide." });
  }
  if (!deferPasswordSetup && password.length < 8) {
    return jsonResponse(400, { ok: false, code: "weak_password", error: "Mot de passe trop court (minimum 8 caractères)." });
  }
  if (!prenom || !nom) {
    return jsonResponse(400, { ok: false, code: "invalid_profile", error: "Prénom et nom sont requis." });
  }
  if (requestedRoleId !== null && requestedRoleId !== "7") {
    return jsonResponse(403, {
      ok: false,
      code: "invalid_role_for_instant_registration",
      error: "Inscription instantanée autorisée uniquement pour role_id=7 (visiteur).",
    });
  }
  if (deferPasswordSetup && !redirectTo) {
    return jsonResponse(400, {
      ok: false,
      code: "missing_redirect_to",
      error: "redirect_to (ou APP_URL) requis pour l'e-mail de création de mot de passe.",
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let resolvedAgencyId: string | null = agencyIdFromBody;
  let resolvedExpoId: string | null = expoId;
  if (expoId) {
    const byId = await admin.from("expos").select("id, agency_id").eq("id", expoId).maybeSingle();
    if (byId.error) {
      return jsonResponse(400, { ok: false, code: "invalid_expo_id", error: byId.error.message });
    }
    if (byId.data && typeof byId.data === "object") {
      const row = byId.data as { id?: string | null; agency_id?: string | null };
      resolvedExpoId = row.id?.trim() || expoId;
      resolvedAgencyId = row.agency_id?.trim() || null;
    } else {
      const byExternalId = await admin
        .from("expos")
        .select("id, agency_id")
        .eq("expo_id", expoId)
        .maybeSingle();
      if (byExternalId.error) {
        return jsonResponse(400, { ok: false, code: "invalid_expo_id", error: byExternalId.error.message });
      }
      if (byExternalId.data && typeof byExternalId.data === "object") {
        const row = byExternalId.data as { id?: string | null; agency_id?: string | null };
        resolvedExpoId = row.id?.trim() || expoId;
        resolvedAgencyId = row.agency_id?.trim() || null;
      }
    }
  }

  const userPrenom = prenom;
  const fullName = `${prenom} ${nom}`.trim();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      prenom,
      nom,
      first_name: prenom,
      last_name: nom,
      user_prenom: userPrenom,
      full_name: fullName,
      role_id: 7,
      role_name: "visiteur",
      user_roles: "7",
      agency_id: resolvedAgencyId,
      expo_id: resolvedExpoId,
      user_expo_id: resolvedExpoId,
      user_age: userAge,
      user_phone: userPhone,
      user_photo_url: userPhotoUrl,
      user_email: email,
      password_setup_pending: deferPasswordSetup,
      ...(deviceFingerprint ? { device_fingerprint: deviceFingerprint } : {}),
    },
  });

  let userId = created.user?.id ?? null;

  if (createError) {
    const msg = createError.message || "Création utilisateur impossible.";
    const lower = msg.toLowerCase();
    const alreadyExists =
      lower.includes("already") || lower.includes("registered") || lower.includes("exists");

    if (alreadyExists && deferPasswordSetup) {
      const { data: linkBootstrap, error: linkBootstrapErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      const existingId =
        (linkBootstrap as { user?: { id?: string } } | null)?.user?.id?.trim() || null;
      if (linkBootstrapErr || !existingId) {
        return jsonResponse(409, {
          ok: false,
          code: "user_already_exists",
          error: msg,
        });
      }
      userId = existingId;

      const profileResult = await persistVisitorProfile(admin, {
        userId,
        email,
        prenom,
        nom,
        agencyId: resolvedAgencyId,
        expoId: resolvedExpoId,
        userAge,
        userPhone,
        userPhotoUrl,
        deviceFingerprint,
        zipCode,
        city,
        country,
        countryCode,
      });
      if (!profileResult.ok) {
        return jsonResponse(500, {
          ok: false,
          code: "profile_upsert_failed",
          error: profileResult.error,
        });
      }

      if (visitorUuid) {
        await admin.rpc("link_visitor_to_auth_user", {
          p_visitor_client_id: visitorUuid,
          p_auth_user_id: userId,
        });
      }

      const actionLink = buildPasswordSetupActionLink(linkBootstrap);
      if (!actionLink) {
        return jsonResponse(502, {
          ok: false,
          code: "password_setup_email_failed",
          error: "Lien de création de mot de passe vide.",
          user_id: userId,
        });
      }
      if (/localhost|127\.0\.0\.1/i.test(actionLink)) {
        return jsonResponse(502, {
          ok: false,
          code: "password_setup_email_failed",
          error:
            "Lien de création de mot de passe encore en localhost — ajoutez https://www.aimediart.com/** aux Redirect URLs Supabase.",
          user_id: userId,
        });
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
      if (!isResendApiKeyConfigured(resendApiKey)) {
        return jsonResponse(502, {
          ok: false,
          code: "password_setup_email_failed",
          error: "RESEND_API_KEY manquant — impossible d'envoyer l'e-mail.",
          user_id: userId,
        });
      }

      const fromEmail =
        Deno.env.get("RESEND_FROM")?.trim() ||
        Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
        "Aimediart <onboarding@resend.dev>";

      const diaryUrl = toPublicAbsoluteUrl(
        await resolveDiaryUrl(admin, {
          diaryUrlFromBody: body.diary_url?.trim() || "",
          visitorUuid: visitorUuid || "",
          expoId: resolvedExpoId || "",
          redirectTo,
        }),
        "/summary",
      );
      const emailHtml = buildPasswordSetupEmailHtml({ prenom, actionLink, diaryUrl });

      let mail = await sendResendEmail({
        apiKey: resendApiKey,
        fromEmail,
        to: email,
        subject: "AIMEDIArt — créez votre mot de passe",
        html: emailHtml,
      });
      if (!mail.ok && /domain is not verified/i.test(mail.error || "") && !/onboarding@resend\.dev/i.test(fromEmail)) {
        mail = await sendResendEmail({
          apiKey: resendApiKey,
          fromEmail: "Aimediart <onboarding@resend.dev>",
          to: email,
          subject: "AIMEDIArt — créez votre mot de passe",
          html: emailHtml,
        });
      }
      if (!mail.ok) {
        return jsonResponse(502, {
          ok: false,
          code: "password_setup_email_failed",
          error: mail.error,
          user_id: userId,
        });
      }

      return jsonResponse(200, {
        ok: true,
        user_id: userId,
        role_id: "7",
        password_setup_email_sent: true,
        existing_user: true,
        email_id: mail.id ?? null,
      });
    }

    if (alreadyExists) {
      return jsonResponse(409, { ok: false, code: "user_already_exists", error: msg });
    }
    return jsonResponse(400, { ok: false, code: createError.code || "create_failed", error: msg });
  }

  if (!userId) {
    return jsonResponse(500, { ok: false, code: "missing_user_id", error: "ID utilisateur non retourné." });
  }

  const profileResult = await persistVisitorProfile(admin, {
    userId,
    email,
    prenom,
    nom,
    agencyId: resolvedAgencyId,
    expoId: resolvedExpoId,
    userAge,
    userPhone,
    userPhotoUrl,
    deviceFingerprint,
    zipCode,
    city,
    country,
    countryCode,
  });
  if (!profileResult.ok) {
    return jsonResponse(500, {
      ok: false,
      code: "profile_upsert_failed",
      error: profileResult.error,
    });
  }

  if (visitorUuid) {
    const { error: reconcileError } = await admin
      .from("guest_visits")
      .update({ user_id: userId })
      .eq("visitor_uuid", visitorUuid)
      .is("user_id", null);
    if (reconcileError && reconcileError.message && Deno.env.get("DENO_DEPLOYMENT_ID")) {
      // noop
    }

    const { error: linkVisitorError } = await admin.rpc("link_visitor_to_auth_user", {
      p_visitor_client_id: visitorUuid,
      p_auth_user_id: userId,
    });
    if (linkVisitorError && Deno.env.get("DENO_DEPLOYMENT_ID")) {
      // noop
    }
  }

  let passwordSetupEmailSent = false;
  let emailId: string | null = null;
  if (deferPasswordSetup) {
    const diaryUrl = toPublicAbsoluteUrl(
      await resolveDiaryUrl(admin, {
        diaryUrlFromBody: body.diary_url?.trim() || "",
        visitorUuid: visitorUuid || "",
        expoId: resolvedExpoId || "",
        redirectTo,
      }),
      "/summary",
    );
    const mail = await sendPasswordSetupEmail(admin, {
      email,
      prenom,
      redirectTo,
      diaryUrl,
    });
    if (!mail.ok) {
      return jsonResponse(502, {
        ok: false,
        code: "password_setup_email_failed",
        error: mail.error,
        user_id: userId,
      });
    }
    passwordSetupEmailSent = true;
    emailId = mail.id ?? null;
  }

  return jsonResponse(200, {
    ok: true,
    user_id: userId,
    role_id: "7",
    password_setup_email_sent: passwordSetupEmailSent,
    email_id: emailId,
  });
});
