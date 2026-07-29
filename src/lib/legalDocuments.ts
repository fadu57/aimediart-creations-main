/**
 * Contenu éditable des pages légales publiques.
 * - published : visible par tous
 * - draft : version provisoire « avant validation » (juriste / admin 1)
 * - commentaires liés au draft uniquement (aussi embarqués dans data-legal-comment)
 */

import { supabase } from "./supabase";

export type LegalPageSlug =
  | "cgv"
  | "privacy"
  | "cookies"
  | "terms"
  | "ai_policy"
  | "contrat_mise_disposition_locaux"
  | "pacte_associes"
  | "declaration_non_condamnation"
  | "etat_actes_formation"
  | "liste_souscripteurs"
  | "convention_associes_remuneration"
  | "statuts_sas";
export type LegalPageStatus = "draft" | "published";

export type LegalPageContent = {
  id: string;
  slug: string;
  locale: string;
  bodyHtml: string;
  status: LegalPageStatus;
  updatedAt: string;
  updatedBy: string | null;
};

export type LegalPageComment = {
  id: string;
  contentId: string;
  markId: string;
  quoteText: string;
  body: string;
  createdAt: string;
  createdBy: string | null;
};

export type LegalCommentDraft = {
  markId: string;
  quoteText: string;
  body: string;
};

/** Destinataire des alertes d’enregistrement provisoire / publication. */
export const LEGAL_DRAFT_NOTIFY_EMAIL = "fadu57@gmail.com";

/** Langues publiées pour les pages légales (version définitive). */
export const LEGAL_PAGE_LOCALES = ["fr", "en", "de", "es", "it"] as const;

function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase().slice(0, 8) || "fr";
}

function mapContentRow(row: {
  id: string;
  slug: string;
  locale: string;
  body_html: string;
  status?: string | null;
  updated_at: string;
  updated_by: string | null;
}): LegalPageContent {
  return {
    id: row.id,
    slug: row.slug,
    locale: row.locale,
    bodyHtml: row.body_html,
    status: row.status === "published" ? "published" : "draft",
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function mapCommentRows(
  comments: Array<{
    id: string;
    content_id: string;
    mark_id: string;
    quote_text: string;
    body: string;
    created_at: string;
    created_by: string | null;
  }>,
): LegalPageComment[] {
  return comments.map((c) => ({
    id: c.id,
    contentId: c.content_id,
    markId: c.mark_id,
    quoteText: c.quote_text,
    body: c.body,
    createdAt: c.created_at,
    createdBy: c.created_by,
  }));
}

/** Contenu pour le public : published uniquement. */
export async function fetchPublishedLegalPage(
  slug: LegalPageSlug,
  locale: string,
): Promise<{ data: LegalPageContent | null; error: string | null }> {
  const loc = normalizeLocale(locale);
  const { data, error } = await supabase
    .from("legal_page_contents")
    .select("id, slug, locale, body_html, status, updated_at, updated_by")
    .eq("slug", slug)
    .eq("locale", loc)
    .eq("status", "published")
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  return { data: mapContentRow(data as Parameters<typeof mapContentRow>[0]), error: null };
}

/**
 * Contenu pour éditeurs : draft s’il existe, sinon published.
 * Les commentaires sont chargés depuis la table + récupérés depuis le HTML (data-legal-comment).
 */
export async function fetchEditorLegalPage(
  slug: LegalPageSlug,
  locale: string,
): Promise<{
  data: LegalPageContent | null;
  comments: LegalPageComment[];
  error: string | null;
}> {
  const loc = normalizeLocale(locale);

  const { data: draft, error: draftErr } = await supabase
    .from("legal_page_contents")
    .select("id, slug, locale, body_html, status, updated_at, updated_by")
    .eq("slug", slug)
    .eq("locale", loc)
    .eq("status", "draft")
    .maybeSingle();

  if (draftErr) return { data: null, comments: [], error: draftErr.message };

  let content = draft ? mapContentRow(draft as Parameters<typeof mapContentRow>[0]) : null;

  if (!content) {
    const pub = await fetchPublishedLegalPage(slug, loc);
    if (pub.error) return { data: null, comments: [], error: pub.error };
    content = pub.data;
  }

  if (!content || content.status !== "draft") {
    return { data: content, comments: [], error: null };
  }

  const { data: comments, error: cErr } = await supabase
    .from("legal_page_comments")
    .select("id, content_id, mark_id, quote_text, body, created_at, created_by")
    .eq("content_id", content.id)
    .order("created_at", { ascending: true });

  const fromDb = cErr
    ? []
    : mapCommentRows(
        (comments ?? []) as Array<{
          id: string;
          content_id: string;
          mark_id: string;
          quote_text: string;
          body: string;
          created_at: string;
          created_by: string | null;
        }>,
      );

  // Fusion : HTML embarqué comble les trous si la table est vide / désync
  const fromHtml = extractLegalCommentsFromHtml(content.bodyHtml);
  const byMark = new Map<string, LegalPageComment>();
  for (const c of fromDb) byMark.set(c.markId, c);
  for (const h of fromHtml) {
    if (!byMark.has(h.markId) && h.body.trim()) {
      byMark.set(h.markId, {
        id: `html:${h.markId}`,
        contentId: content.id,
        markId: h.markId,
        quoteText: h.quoteText,
        body: h.body,
        createdAt: content.updatedAt,
        createdBy: null,
      });
    }
  }

  return {
    data: content,
    comments: Array.from(byMark.values()),
    error: cErr ? cErr.message : null,
  };
}

/** Lit les annotations depuis le HTML (mark + data-legal-cid / data-legal-comment). */
export function extractLegalCommentsFromHtml(html: string): LegalCommentDraft[] {
  if (typeof DOMParser === "undefined" || !html.trim()) return [];
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  if (!root) return [];
  const out: LegalCommentDraft[] = [];
  root.querySelectorAll<HTMLElement>("mark.legal-annotation[data-legal-cid]").forEach((el) => {
    const markId = (el.getAttribute("data-legal-cid") || el.dataset.legalCid || "").trim();
    if (!markId) return;
    const body = (el.getAttribute("data-legal-comment") || el.dataset.legalComment || "").trim();
    const quoteText = (el.textContent || "").trim().slice(0, 2000);
    out.push({ markId, quoteText, body });
  });
  return out;
}

/** Synchronise data-legal-comment sur chaque mark du HTML. */
export function syncLegalCommentAttrsInHtml(
  html: string,
  comments: LegalCommentDraft[],
): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  if (!root) return html;
  const byId = new Map(comments.map((c) => [c.markId, c]));
  root.querySelectorAll<HTMLElement>("mark.legal-annotation[data-legal-cid]").forEach((el) => {
    const markId = (el.getAttribute("data-legal-cid") || "").trim();
    const c = byId.get(markId);
    if (c?.body) {
      el.setAttribute("data-legal-comment", c.body);
      el.title = c.body;
    }
  });
  return root.innerHTML;
}

/** Fusionne commentaires React + marks HTML (priorité au body non vide). */
export function mergeLegalComments(
  fromState: LegalCommentDraft[],
  fromHtml: LegalCommentDraft[],
): LegalCommentDraft[] {
  const map = new Map<string, LegalCommentDraft>();
  for (const c of fromHtml) {
    if (!c.markId) continue;
    map.set(c.markId, {
      markId: c.markId,
      quoteText: c.quoteText,
      body: c.body,
    });
  }
  for (const c of fromState) {
    if (!c.markId) continue;
    const prev = map.get(c.markId);
    map.set(c.markId, {
      markId: c.markId,
      quoteText: c.quoteText || prev?.quoteText || "",
      body: c.body.trim() || prev?.body || "",
    });
  }
  return Array.from(map.values()).filter((c) => c.markId && c.body.trim());
}

/** Enregistre une version provisoire (draft) — n’écrase pas le published. */
export async function saveLegalPageDraft(input: {
  slug: LegalPageSlug;
  locale: string;
  bodyHtml: string;
  userId: string | null;
  comments: LegalCommentDraft[];
  notifyEmail?: boolean;
}): Promise<{ contentId: string | null; error: string | null; notifyError: string | null }> {
  const loc = normalizeLocale(input.locale);
  let html = input.bodyHtml.trim();
  if (!html) return { contentId: null, error: "Le contenu ne peut pas être vide.", notifyError: null };

  const merged = mergeLegalComments(input.comments, extractLegalCommentsFromHtml(html));
  html = syncLegalCommentAttrsInHtml(html, merged);

  const { data, error } = await supabase
    .from("legal_page_contents")
    .upsert(
      {
        slug: input.slug,
        locale: loc,
        status: "draft",
        body_html: html,
        updated_at: new Date().toISOString(),
        updated_by: input.userId,
      },
      { onConflict: "slug,locale,status" },
    )
    .select("id")
    .single();

  if (error) return { contentId: null, error: error.message, notifyError: null };
  const contentId = (data as { id: string }).id;

  const { error: delErr } = await supabase
    .from("legal_page_comments")
    .delete()
    .eq("content_id", contentId);
  if (delErr) return { contentId, error: delErr.message, notifyError: null };

  const rows = merged
    .map((c) => ({
      content_id: contentId,
      mark_id: c.markId.trim(),
      quote_text: c.quoteText.trim().slice(0, 2000),
      body: c.body.trim(),
      created_by: input.userId,
    }))
    .filter((c) => c.mark_id && c.body);

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("legal_page_comments").insert(rows);
    if (insErr) return { contentId, error: insErr.message, notifyError: null };
  }

  let notifyError: string | null = null;
  if (input.notifyEmail !== false) {
    const n = await notifyLegalDraftSaved({
      slug: input.slug,
      locale: loc,
      commentCount: rows.length,
      pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
    });
    notifyError = n.error;
  }

  return { contentId, error: null, notifyError };
}

/**
 * Publie la version définitive (admin 1) :
 * - source + traductions auto vers fr/en/de/es/it (edge function)
 * - e-mail de confirmation « publiée dans les 5 langues »
 */
export async function publishLegalPageDraft(input: {
  slug: LegalPageSlug;
  locale: string;
  bodyHtml: string;
  userId: string | null;
}): Promise<{
  error: string | null;
  publishedLocales: string[];
  notifyError: string | null;
  partial: boolean;
}> {
  const loc = normalizeLocale(input.locale);
  const raw = input.bodyHtml.trim();
  if (!raw) {
    return { error: "Le contenu ne peut pas être vide.", publishedLocales: [], notifyError: null, partial: false };
  }

  try {
    const { data, error } = await supabase.functions.invoke("publish-legal-page-final", {
      body: {
        slug: input.slug,
        locale: loc,
        body_html: raw,
        page_url: typeof window !== "undefined" ? window.location.href : null,
        to: LEGAL_DRAFT_NOTIFY_EMAIL,
        notify_email: true,
      },
    });

    if (error) {
      return {
        error: error.message,
        publishedLocales: [],
        notifyError: null,
        partial: false,
      };
    }

    const payload = data as {
      ok?: boolean;
      error?: string | null;
      published_locales?: string[];
      notify_error?: string | null;
      translation_errors?: Array<{ locale: string; error: string }>;
    } | null;

    const publishedLocales = Array.isArray(payload?.published_locales)
      ? payload.published_locales
      : [];
    const notifyError = payload?.notify_error ?? null;
    const hasTranslationErrors = (payload?.translation_errors?.length ?? 0) > 0;

    if (payload?.ok === false && publishedLocales.length === 0) {
      return {
        error: payload.error || "Publication impossible.",
        publishedLocales: [],
        notifyError,
        partial: false,
      };
    }

    if (hasTranslationErrors) {
      return {
        error: payload?.error || "Publication partielle (certaines langues ont échoué).",
        publishedLocales,
        notifyError,
        partial: true,
      };
    }

    return {
      error: null,
      publishedLocales,
      notifyError,
      partial: false,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Publication impossible.",
      publishedLocales: [],
      notifyError: null,
      partial: false,
    };
  }
}

/** Notifie par e-mail qu’une version provisoire a été enregistrée. */
export async function notifyLegalDraftSaved(input: {
  slug: string;
  locale: string;
  commentCount: number;
  pageUrl?: string;
}): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("notify-legal-draft-saved", {
      body: {
        slug: input.slug,
        locale: input.locale,
        comment_count: input.commentCount,
        page_url: input.pageUrl ?? null,
        to: LEGAL_DRAFT_NOTIFY_EMAIL,
      },
    });
    if (error) return { error: error.message };
    const payload = data as { ok?: boolean; error?: string } | null;
    if (payload && payload.ok === false) {
      return { error: payload.error || "Échec d’envoi de l’e-mail." };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Échec d’envoi de l’e-mail." };
  }
}

/** Enveloppe la sélection courante dans un <mark data-legal-cid="…">. */
export function wrapSelectionWithLegalMark(root: HTMLElement): {
  markId: string;
  quoteText: string;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const quoteText = sel.toString().trim();
  if (!quoteText) return null;

  const markId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : `m${Date.now().toString(36)}`;

  const mark = document.createElement("mark");
  mark.className = "legal-annotation";
  mark.dataset.legalCid = markId;
  mark.title = "Commentaire de relecture";

  try {
    range.surroundContents(mark);
  } catch {
    const frag = range.extractContents();
    mark.appendChild(frag);
    range.insertNode(mark);
  }
  sel.removeAllRanges();
  return { markId, quoteText };
}

function cssEscapeAttr(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function findLegalMark(
  root: HTMLElement,
  markId: string,
): HTMLElement | null {
  if (!markId) return null;
  return root.querySelector(
    `mark.legal-annotation[data-legal-cid="${cssEscapeAttr(markId)}"]`,
  );
}

/** Met à jour le commentaire embarqué sur le mark. */
export function setLegalMarkComment(
  root: HTMLElement,
  markId: string,
  body: string,
): boolean {
  const mark = findLegalMark(root, markId);
  if (!mark) return false;
  const trimmed = body.trim();
  if (trimmed) {
    mark.setAttribute("data-legal-comment", trimmed);
    mark.title = trimmed;
  } else {
    mark.removeAttribute("data-legal-comment");
    mark.title = "Commentaire de relecture";
  }
  return true;
}

/** Remplace le texte à l’intérieur du surlignage (conserve le mark). */
export function updateLegalMarkText(
  root: HTMLElement,
  markId: string,
  newText: string,
): boolean {
  const mark = findLegalMark(root, markId);
  if (!mark) return false;
  const text = newText.trim();
  if (!text) return false;
  mark.textContent = text;
  return true;
}

/** Retire le mark en conservant le texte. */
export function unwrapLegalMark(root: HTMLElement, markId: string): boolean {
  const mark = findLegalMark(root, markId);
  if (!mark?.parentNode) return false;
  while (mark.firstChild) mark.parentNode.insertBefore(mark.firstChild, mark);
  mark.parentNode.removeChild(mark);
  return true;
}

/** Retire les marques d’annotation d’un HTML (pour publication / impression publique). */
export function stripLegalAnnotationMarks(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  if (!root) return html;
  root.querySelectorAll("mark.legal-annotation").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  return root.innerHTML;
}

/** CSS Arial / titres PDF — aligné sur pdfLegalDocStyles.ts */
const PDF_LEGAL_PRINT_CSS = `
.pdf-legal-doc {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  line-height: 1.45;
  color: #1f1f1f;
  max-width: 740px;
  margin: 0 auto;
}
.pdf-legal-doc .pdf-title {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 20pt;
  font-weight: 700;
  text-align: center;
  line-height: 1.25;
  margin: 0 0 0.75rem;
}
.pdf-legal-doc .pdf-subtitle {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16pt;
  font-weight: 400;
  font-style: italic;
  text-align: center;
  margin: 0.35rem 0 0.85rem;
}
.pdf-legal-doc .pdf-h2 {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14pt;
  font-weight: 700;
  margin: 1.15rem 0 0.45rem;
}
.pdf-legal-doc .pdf-h3 {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12pt;
  font-weight: 700;
  margin: 0.9rem 0 0.35rem;
}
.pdf-legal-doc .pdf-p {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  margin: 0.35rem 0;
  text-align: justify;
}
.pdf-legal-doc .pdf-ul { margin: 0.35rem 0 0.55rem; padding-left: 1.35rem; list-style-type: disc; }
.pdf-legal-doc .pdf-li { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin: 0.2rem 0; text-align: justify; }
.pdf-legal-doc .pdf-b { font-weight: 700; }
.pdf-legal-doc .pdf-i { font-style: italic; }
.pdf-legal-doc .pdf-s10 { font-size: 10pt; }
.pdf-legal-doc .pdf-s12 { font-size: 12pt; }
.pdf-legal-doc .pdf-s14 { font-size: 14pt; }
.pdf-legal-doc .pdf-s16 { font-size: 16pt; }
.pdf-legal-doc .pdf-s18 { font-size: 18pt; }
.pdf-legal-doc .pdf-s20 { font-size: 20pt; }
.pdf-legal-doc .pdf-s24 { font-size: 24pt; }
.pdf-legal-doc .pdf-table { width: 100%; border-collapse: collapse; margin: 0.75rem 0 1rem; font-size: 10pt; }
.pdf-legal-doc .pdf-table th,
.pdf-legal-doc .pdf-table td {
  border: 1px solid #333;
  padding: 0.35rem 0.45rem;
  vertical-align: top;
  text-align: left;
  font-family: Arial, Helvetica, sans-serif;
}
.pdf-legal-doc .pdf-table th { font-weight: 700; background: #f3f3f3; }
`;

export function printLegalHtml(opts: {
  title: string;
  bodyHtml: string;
  includeAnnotations?: boolean;
}): void {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!win) return;

  const title = opts.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = opts.includeAnnotations
    ? opts.bodyHtml
    : stripLegalAnnotationMarks(opts.bodyHtml);
  const isPdfDoc = /class=["'][^"']*pdf-legal-doc/.test(body);

  win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body {
      font-family: ${isPdfDoc ? 'Arial, Helvetica, sans-serif' : 'Georgia, "Times New Roman", serif'};
      color: #1f1f1f;
      max-width: 820px;
      margin: 2rem auto;
      padding: 0 1.25rem;
      line-height: 1.55;
      font-size: ${isPdfDoc ? "11pt" : "12px"};
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 0.85rem; font-weight: 800; margin-top: 1.5rem; }
    p, li { font-size: inherit; }
    ul { padding-left: 1.25rem; }
    mark.legal-annotation { background: #fef08a; padding: 0 2px; }
    ${isPdfDoc ? PDF_LEGAL_PRINT_CSS : ""}
    @media print { body { margin: 0; max-width: none; } }
  </style>
</head>
<body>
  ${body}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
