import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getRequestUserId, getServiceRoleClient } from "../_shared/supabaseAdmin.ts";
import {
  fetchAgencyLogoImage,
  fillSponsoringConventionDocx,
} from "../_shared/sponsoringConventionDocx.ts";
import {
  loadSponsoringConventionPlaceholders,
  requireOrganisationAccess,
} from "../_shared/sponsoringConventionData.ts";

const TEMPLATE_URL = new URL("./template.docx", import.meta.url);
const CONVENTION_BUCKET = "photos";
const CONVENTION_SIGNED_URL_TTL_SEC = 3600;

function buildOfficeOnlineViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;
}

async function loadTemplateBytes(): Promise<Uint8Array> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error("template_not_found");
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function loadAgencyLogoUrl(
  admin: ReturnType<typeof getServiceRoleClient>,
  organisationId: string,
): Promise<string | null> {
  if (!admin) return null;
  const { data } = await admin
    .from("agencies")
    .select("logo_agency")
    .eq("id", organisationId)
    .maybeSingle();
  return (data as { logo_agency?: string | null } | null)?.logo_agency?.trim() || null;
}

async function storeConventionDocxAndGetUrls(
  admin: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  organisationId: string,
  docxBytes: Uint8Array,
): Promise<{ signed_url: string; viewer_url: string; filename: string }> {
  const path = `sponsoring-conventions/${organisationId}/${crypto.randomUUID()}.docx`;
  const { error: uploadError } = await admin.storage.from(CONVENTION_BUCKET).upload(path, docxBytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (uploadError) {
    throw new Error(`storage_upload_failed:${uploadError.message}`);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(CONVENTION_BUCKET)
    .createSignedUrl(path, CONVENTION_SIGNED_URL_TTL_SEC);
  if (signError || !signed?.signedUrl) {
    throw new Error("storage_signed_url_failed");
  }

  const filename = "convention-sponsoring-aimediart.docx";
  return {
    signed_url: signed.signedUrl,
    viewer_url: buildOfficeOnlineViewerUrl(signed.signedUrl),
    filename,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const admin = getServiceRoleClient();
    if (!admin) {
      return jsonResponse({ error: "server_misconfigured" }, 500);
    }

    const userId = await getRequestUserId(req);
    if (!userId) {
      return jsonResponse({ error: "authentication_required" }, 401);
    }

    let body: { organisation_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    const organisationId = body.organisation_id?.trim() ?? "";
    if (!organisationId) {
      return jsonResponse({ error: "organisation_id_required" }, 400);
    }

    const access = await requireOrganisationAccess(admin, userId, organisationId);
    if (!access.ok) {
      return jsonResponse({ error: access.reason }, 403);
    }

    const [placeholders, templateBytes, logoUrl] = await Promise.all([
      loadSponsoringConventionPlaceholders(admin, organisationId),
      loadTemplateBytes(),
      loadAgencyLogoUrl(admin, organisationId),
    ]);

    const agencyLogo = await fetchAgencyLogoImage(logoUrl);
    const docxBytes = fillSponsoringConventionDocx(templateBytes, placeholders, agencyLogo);
    const urls = await storeConventionDocxAndGetUrls(admin, organisationId, docxBytes);

    return jsonResponse(urls);
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation_failed";
    const status =
      message === "no_commercial_discount"
        ? 403
        : message === "organisation_not_found" || message === "template_not_found"
          ? 404
          : message.startsWith("storage_")
            ? 503
            : 500;
    return jsonResponse({ error: message }, status);
  }
});
