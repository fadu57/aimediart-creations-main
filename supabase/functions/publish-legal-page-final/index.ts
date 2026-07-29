/**
 * Publie une version définitive de page légale (admin général uniquement) :
 * - upsert published (+ draft aligné) pour la langue source
 * - traduit le HTML vers les 4 autres langues (fr/en/de/es/it) via Groq
 * - upsert published (+ draft) pour chaque traduction
 * - e-mail de confirmation « publiée dans les 5 langues »
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DEFAULT_RESEND_FROM,
  isResendApiKeyConfigured,
  sendResendEmail,
} from "../_shared/resend.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const DEFAULT_TO = "fadu57@gmail.com";
const LEGAL_LOCALES = ["fr", "en", "de", "es", "it"] as const;
type LegalLocale = (typeof LEGAL_LOCALES)[number];

const LANG_LABELS: Record<LegalLocale, string> = {
  fr: "français",
  en: "anglais",
  de: "allemand",
  es: "espagnol",
  it: "italien",
};

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const CHUNK_SOFT_MAX = 7000;

function parseRoleId(user: { app_metadata?: Record<string, unknown> } | null): number {
  const raw = user?.app_metadata?.role_id;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeLocale(locale: string): LegalLocale {
  const loc = locale.trim().toLowerCase().slice(0, 2);
  return (LEGAL_LOCALES as readonly string[]).includes(loc)
    ? (loc as LegalLocale)
    : "fr";
}

/** Retire les <mark class="legal-annotation"> en conservant le texte. */
function stripLegalAnnotationMarks(html: string): string {
  return html
    .replace(/<mark\b[^>]*class=["'][^"']*legal-annotation[^"']*["'][^>]*>/gi, "")
    .replace(/<mark\b[^>]*data-legal-cid\b[^>]*>/gi, "")
    .replace(/<\/mark>/gi, "");
}

function unwrapMarkdownFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:html|HTML)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return t;
}

/** Découpe le HTML en blocs (sections / titres) pour tenir dans le contexte Groq. */
function chunkHtml(html: string): string[] {
  const trimmed = html.trim();
  if (!trimmed) return [];
  if (trimmed.length <= CHUNK_SOFT_MAX) return [trimmed];

  const parts = trimmed.split(/(?=<section\b)/i).filter((p) => p.trim());
  if (parts.length > 1) {
    return mergeChunks(parts);
  }

  const byH2 = trimmed.split(/(?=<h2\b)/i).filter((p) => p.trim());
  if (byH2.length > 1) {
    return mergeChunks(byH2);
  }

  // Repli : découpe après </p> / </h2> / </li> si possible
  const out: string[] = [];
  let rest = trimmed;
  while (rest.length > CHUNK_SOFT_MAX) {
    const window = rest.slice(0, CHUNK_SOFT_MAX);
    const candidates = [
      window.lastIndexOf("</p>") + 4,
      window.lastIndexOf("</li>") + 5,
      window.lastIndexOf("</h2>") + 5,
    ].filter((i) => i > CHUNK_SOFT_MAX * 0.4);
    const idx = candidates.length > 0 ? Math.max(...candidates) : CHUNK_SOFT_MAX;
    out.push(rest.slice(0, idx).trim());
    rest = rest.slice(idx).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

function mergeChunks(parts: string[]): string[] {
  const out: string[] = [];
  let buf = "";
  for (const part of parts) {
    if (!buf) {
      buf = part;
      continue;
    }
    if (buf.length + part.length <= CHUNK_SOFT_MAX) {
      buf += part;
    } else {
      out.push(buf);
      buf = part;
    }
  }
  if (buf) out.push(buf);
  return out;
}

async function translateHtmlChunk(params: {
  apiKey: string;
  html: string;
  sourceLang: LegalLocale;
  targetLang: LegalLocale;
}): Promise<string> {
  const system =
    "Tu es un traducteur juridique professionnel. Tu traduis du HTML en préservant exactement toutes les balises, attributs et la structure. Tu ne traduis que les nœuds texte. Tu réponds UNIQUEMENT avec le HTML traduit, sans markdown, sans guillemets, sans commentaire.";
  const user =
    `Traduis le fragment HTML suivant du ${LANG_LABELS[params.sourceLang]} vers le ${LANG_LABELS[params.targetLang]}. ` +
    `Conserve toutes les balises HTML et attributs tels quels. Ne traduis pas les noms de domaine (ex. Aimediart.com).\n\n` +
    params.html;

  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 8000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${details.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const translated = unwrapMarkdownFence(raw);
  if (!translated) throw new Error("Traduction vide.");
  return translated;
}

async function translateHtmlDocument(params: {
  apiKey: string;
  html: string;
  sourceLang: LegalLocale;
  targetLang: LegalLocale;
}): Promise<string> {
  const chunks = chunkHtml(params.html);
  const translated: string[] = [];
  for (const chunk of chunks) {
    translated.push(
      await translateHtmlChunk({
        apiKey: params.apiKey,
        html: chunk,
        sourceLang: params.sourceLang,
        targetLang: params.targetLang,
      }),
    );
  }
  return translated.join("");
}

async function upsertLocaleContent(params: {
  admin: ReturnType<typeof createClient>;
  slug: string;
  locale: string;
  bodyHtml: string;
  userId: string;
}): Promise<{ draftId: string | null; error: string | null }> {
  const now = new Date().toISOString();
  const base = {
    slug: params.slug,
    locale: params.locale,
    body_html: params.bodyHtml,
    updated_at: now,
    updated_by: params.userId,
  };

  const { error: pubErr } = await params.admin.from("legal_page_contents").upsert(
    { ...base, status: "published" },
    { onConflict: "slug,locale,status" },
  );
  if (pubErr) return { draftId: null, error: pubErr.message };

  const { data: draftRow, error: draftErr } = await params.admin
    .from("legal_page_contents")
    .upsert({ ...base, status: "draft" }, { onConflict: "slug,locale,status" })
    .select("id")
    .single();
  if (draftErr) return { draftId: null, error: draftErr.message };

  const draftId = (draftRow as { id: string } | null)?.id ?? null;
  if (draftId) {
    await params.admin.from("legal_page_comments").delete().eq("content_id", draftId);
  }
  return { draftId, error: null };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Méthode non autorisée." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ ok: false, error: "Variables Supabase serveur manquantes." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "Token manquant." }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ ok: false, error: "Utilisateur non authentifié." }, 401);
  }

  if (parseRoleId(user) !== 1) {
    return jsonResponse({ ok: false, error: "Non autorisé (admin général uniquement)." }, 403);
  }

  let body: {
    slug?: string;
    locale?: string;
    body_html?: string;
    page_url?: string | null;
    to?: string;
    notify_email?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: "Body JSON invalide." }, 400);
  }

  const slug = (body.slug ?? "cgv").trim().toLowerCase() || "cgv";
  const sourceLocale = normalizeLocale(body.locale ?? "fr");
  const rawHtml = (body.body_html ?? "").trim();
  if (!rawHtml) {
    return jsonResponse({ ok: false, error: "Le contenu ne peut pas être vide." }, 400);
  }

  const publishedHtml = stripLegalAnnotationMarks(rawHtml).trim();
  if (!publishedHtml) {
    return jsonResponse({ ok: false, error: "Le contenu publié ne peut pas être vide." }, 400);
  }

  const groqApiKey = Deno.env.get("GROQ_API_KEY")?.trim() ?? "";
  if (!groqApiKey) {
    return jsonResponse({ ok: false, error: "GROQ_API_KEY manquant." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const publishedLocales: LegalLocale[] = [];
  const translationErrors: Array<{ locale: string; error: string }> = [];

  // 1) Langue source
  const sourceUpsert = await upsertLocaleContent({
    admin,
    slug,
    locale: sourceLocale,
    bodyHtml: publishedHtml,
    userId: user.id,
  });
  if (sourceUpsert.error) {
    return jsonResponse({ ok: false, error: sourceUpsert.error }, 502);
  }
  publishedLocales.push(sourceLocale);

  // 2) Traductions vers les autres langues
  const targets = LEGAL_LOCALES.filter((l) => l !== sourceLocale);
  for (const target of targets) {
    try {
      const translated = await translateHtmlDocument({
        apiKey: groqApiKey,
        html: publishedHtml,
        sourceLang: sourceLocale,
        targetLang: target,
      });
      const up = await upsertLocaleContent({
        admin,
        slug,
        locale: target,
        bodyHtml: translated,
        userId: user.id,
      });
      if (up.error) {
        translationErrors.push({ locale: target, error: up.error });
      } else {
        publishedLocales.push(target);
      }
    } catch (e) {
      translationErrors.push({
        locale: target,
        error: e instanceof Error ? e.message : "Échec traduction",
      });
    }
  }

  // 3) E-mail de confirmation
  let notifyError: string | null = null;
  if (body.notify_email !== false) {
    const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
    if (!isResendApiKeyConfigured(apiKey)) {
      notifyError = "RESEND_API_KEY manquant.";
    } else {
      const fromEmail =
        Deno.env.get("RESEND_FROM")?.trim() ||
        Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
        Deno.env.get("NOTIFY_FROM_EMAIL")?.trim() ||
        DEFAULT_RESEND_FROM;
      const to = (body.to ?? DEFAULT_TO).trim() || DEFAULT_TO;
      const pageUrl = (body.page_url ?? "").trim();
      const editorEmail = user.email ?? "(inconnu)";
      const localesLabel = LEGAL_LOCALES.map((l) => LANG_LABELS[l]).join(", ");
      const publishedLabel = publishedLocales
        .map((l) => `${l} (${LANG_LABELS[l]})`)
        .join(", ");
      const failBlock =
        translationErrors.length > 0
          ? `<p><strong>Traductions en échec :</strong></p><ul>${translationErrors
              .map(
                (e) =>
                  `<li>${escapeHtml(e.locale)} — ${escapeHtml(e.error)}</li>`,
              )
              .join("")}</ul>`
          : `<p>Les cinq langues ont bien été publiées : ${escapeHtml(localesLabel)}.</p>`;

      const linkBlock = pageUrl
        ? `<p style="margin:16px 0;"><a href="${escapeHtml(pageUrl)}" style="color:#0b5fff;">Ouvrir la page</a></p>`
        : "";

      const subject =
        `[AIMEDIArt] Version définitive publiée — ${slug.toUpperCase()} (${publishedLocales.length}/5 langues)`;
      const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family:Georgia,serif;color:#1f1f1f;line-height:1.5;">
  <h1 style="font-size:18px;">Version définitive publiée</h1>
  <p>La version <strong>définitive</strong> de la page légale a été publiée sur le site.</p>
  <ul>
    <li><strong>Page</strong> : ${escapeHtml(slug)}</li>
    <li><strong>Langue source</strong> : ${escapeHtml(sourceLocale)} (${escapeHtml(LANG_LABELS[sourceLocale])})</li>
    <li><strong>Langues publiées</strong> : ${escapeHtml(publishedLabel)}</li>
    <li><strong>Éditeur</strong> : ${escapeHtml(editorEmail)}</li>
  </ul>
  ${failBlock}
  ${linkBlock}
  <p style="font-size:12px;color:#666;">Notification automatique AIMEDIArt — ne pas répondre.</p>
</body>
</html>`;

      const mail = await sendResendEmail({
        apiKey,
        fromEmail,
        to,
        subject,
        html,
      });
      if (!mail.ok) notifyError = mail.error || "Échec Resend.";
    }
  }

  const allOk = translationErrors.length === 0;
  return jsonResponse({
    ok: allOk,
    published_locales: publishedLocales,
    translation_errors: translationErrors,
    notify_error: notifyError,
    error: allOk
      ? null
      : `Publication partielle : ${publishedLocales.join(", ")}. Échecs : ${translationErrors
          .map((e) => e.locale)
          .join(", ")}.`,
  });
});
