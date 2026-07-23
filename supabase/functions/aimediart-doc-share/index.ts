/**
 * Lien de partage public GED : GET ?t=<share_token>
 * - Document : redirect 302 vers URL signée Storage
 * - Sous-dossier / dossier principal : page HTML listant les fichiers (liens signés)
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** TTL de l’URL signée générée à chaque accès (1 h). Le lien /share reste stable. */
const SIGNED_URL_TTL_SEC = 3600;

type DocRow = {
  bucket: string;
  path: string;
  name: string;
  size_bytes: number | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function signedRows(
  admin: SupabaseClient,
  docs: DocRow[],
): Promise<Array<{ name: string; sizeLabel: string; href: string }>> {
  const out: Array<{ name: string; sizeLabel: string; href: string }> = [];
  for (const doc of docs) {
    if (!doc.bucket || !doc.path) continue;
    const { data: signed } = await admin.storage
      .from(doc.bucket)
      .createSignedUrl(doc.path, SIGNED_URL_TTL_SEC);
    if (!signed?.signedUrl) continue;
    out.push({
      name: doc.name,
      sizeLabel: formatSize(doc.size_bytes),
      href: signed.signedUrl,
    });
  }
  return out;
}

function listingHtml(title: string, items: Array<{ name: string; sizeLabel: string; href: string }>): string {
  const rows =
    items.length === 0
      ? `<p class="empty">Aucun fichier dans ce dossier.</p>`
      : `<ul>${items
          .map(
            (it) =>
              `<li><a href="${escapeHtml(it.href)}" rel="noopener noreferrer">${escapeHtml(it.name)}</a>${
                it.sizeLabel ? ` <span class="meta">${escapeHtml(it.sizeLabel)}</span>` : ""
              }</li>`,
          )
          .join("")}</ul>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — AIMEDIArt GED</title>
  <style>
    body{margin:0;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f4;color:#1a1a1a}
    main{max-width:640px;margin:32px auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #e5e5e5}
    h1{font-size:1.25rem;margin:0 0 8px}
    .sub{font-size:.85rem;color:#666;margin:0 0 20px}
    ul{list-style:none;padding:0;margin:0}
    li{padding:10px 0;border-bottom:1px solid #eee;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
    a{color:#ca2b2b;font-weight:600;text-decoration:none}
    a:hover{text-decoration:underline}
    .meta{font-size:.8rem;color:#888}
    .empty{color:#666;font-size:.95rem}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="sub">Partage AIMEDIArt — liens valables 1&nbsp;heure (rechargez la page pour les renouveler).</p>
    ${rows}
  </main>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  if (req.method !== "GET") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  if (!UUID_RE.test(token)) {
    return jsonResponse({ error: "Token invalide." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuration serveur incomplète." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Document unique → redirect
  const { data: doc, error: docErr } = await admin
    .from("aimediart_documents")
    .select("bucket, path, name")
    .eq("share_token", token)
    .maybeSingle();

  if (docErr) return jsonResponse({ error: docErr.message }, 500);

  if (doc?.bucket && doc?.path) {
    const { data: signed, error: signErr } = await admin.storage
      .from(doc.bucket)
      .createSignedUrl(doc.path, SIGNED_URL_TTL_SEC);

    if (signErr || !signed?.signedUrl) {
      return jsonResponse({ error: signErr?.message ?? "URL signée impossible." }, 500);
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: signed.signedUrl,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // 2) Sous-dossier
  const { data: folder, error: folderErr } = await admin
    .from("aimediart_document_folders")
    .select("id, name")
    .eq("share_token", token)
    .maybeSingle();

  if (folderErr) return jsonResponse({ error: folderErr.message }, 500);

  if (folder?.id) {
    const { data: docs, error: listErr } = await admin
      .from("aimediart_documents")
      .select("bucket, path, name, size_bytes")
      .eq("folder_id", folder.id)
      .order("name", { ascending: true });

    if (listErr) return jsonResponse({ error: listErr.message }, 500);

    const items = await signedRows(admin, (docs as DocRow[] | null) ?? []);
    const html = listingHtml(folder.name ?? "Dossier", items);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // 3) Dossier principal (section)
  const { data: section, error: sectionErr } = await admin
    .from("aimediart_ged_sections")
    .select("slug, name")
    .eq("share_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (sectionErr) return jsonResponse({ error: sectionErr.message }, 500);

  if (section?.slug) {
    const { data: docs, error: listErr } = await admin
      .from("aimediart_documents")
      .select("bucket, path, name, size_bytes")
      .eq("category", section.slug)
      .order("name", { ascending: true });

    if (listErr) return jsonResponse({ error: listErr.message }, 500);

    const items = await signedRows(admin, (docs as DocRow[] | null) ?? []);
    const html = listingHtml(section.name ?? "Dossier", items);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return jsonResponse({ error: "Lien introuvable." }, 404);
});
