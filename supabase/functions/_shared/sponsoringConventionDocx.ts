import PizZip from "npm:pizzip@3.1.7";

export type SponsoringConventionPlaceholders = {
  "Nom de l'agency": string;
  Adresse: string;
  zipcode: string;
  city: string;
  Numéro: string;
  "Nom du représentant": string;
  "Président(e), etc.": string;
  commercial_plan_code: string;
  "discount_amount_eur x 12": string;
  "subscription.started_at": string;
  "subscription.expires_at": string;
  "Date du jour": string;
};

export type AgencyLogoImage = {
  bytes: Uint8Array;
  extension: "png" | "jpeg";
};

const AGENCY_LOGO_PLACEHOLDER = "<!--AGENCY_LOGO_PLACEHOLDER-->";
const AIMEDIART_LOGO_HEIGHT_EMU = 476529;
const AIMEDIART_LOGO_WIDTH_EMU = 1989734;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Remplace [token] même si Word a fragmenté le texte entre balises XML. */
export function replaceBracketToken(xml: string, token: string, value: string): string {
  const full = `[${token}]`;
  const safe = escapeXml(value);
  if (xml.includes(full)) {
    return xml.split(full).join(safe);
  }
  let pattern = "";
  for (let i = 0; i < full.length; i++) {
    pattern += escapeRegex(full[i]);
    if (i < full.length - 1) pattern += "(?:<[^>]+>)*";
  }
  return xml.replace(new RegExp(pattern, "g"), safe);
}

function nextRelationshipId(relsXml: string): string {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const max = ids.length ? Math.max(...ids) : 0;
  return `rId${max + 1}`;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

function resolveLogoExtentEmu(bytes: Uint8Array, extension: AgencyLogoImage["extension"]): {
  widthEmu: number;
  heightEmu: number;
} {
  const dims =
    extension === "png" ? readPngDimensions(bytes) : readJpegDimensions(bytes);
  if (!dims?.width || !dims?.height) {
    return { widthEmu: AIMEDIART_LOGO_WIDTH_EMU, heightEmu: AIMEDIART_LOGO_HEIGHT_EMU };
  }
  const heightEmu = AIMEDIART_LOGO_HEIGHT_EMU;
  const widthEmu = Math.round((dims.width / dims.height) * heightEmu);
  return { widthEmu, heightEmu };
}

function buildAgencyLogoDrawing(relationshipId: string, widthEmu: number, heightEmu: number): string {
  const docPrId = 777_484_816;
  return `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" wp14:anchorId="406737D2" wp14:editId="612DFF37"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="Logo agence"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Logo agence"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}" cstate="print"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function injectAgencyLogo(zip: PizZip, documentXml: string, agencyLogo: AgencyLogoImage): string {
  const mediaFileName = agencyLogo.extension === "png" ? "agency-logo.png" : "agency-logo.jpeg";
  const mediaPath = `word/media/${mediaFileName}`;
  zip.file(mediaPath, agencyLogo.bytes);

  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (!relsFile) {
    throw new Error("document_rels_missing");
  }

  let relsXml = relsFile.asText();
  const relId = nextRelationshipId(relsXml);
  relsXml = relsXml.replace(
    "</Relationships>",
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaFileName}"/></Relationships>`,
  );
  zip.file("word/_rels/document.xml.rels", relsXml);

  const { widthEmu, heightEmu } = resolveLogoExtentEmu(agencyLogo.bytes, agencyLogo.extension);
  const drawing = buildAgencyLogoDrawing(relId, widthEmu, heightEmu);

  if (documentXml.includes(AGENCY_LOGO_PLACEHOLDER)) {
    return documentXml.replace(AGENCY_LOGO_PLACEHOLDER, drawing);
  }
  return documentXml;
}

export function fillSponsoringConventionDocx(
  templateBytes: Uint8Array,
  placeholders: SponsoringConventionPlaceholders,
  agencyLogo?: AgencyLogoImage | null,
): Uint8Array {
  const zip = new PizZip(templateBytes);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) {
    throw new Error("document_xml_missing");
  }

  let xml = documentFile.asText();
  for (const [token, value] of Object.entries(placeholders)) {
    xml = replaceBracketToken(xml, token, value);
    if (token === "Nom de l'agency") {
      xml = replaceBracketToken(xml, "Nom de l\u2019agency", value);
    }
  }

  if (agencyLogo) {
    xml = injectAgencyLogo(zip, xml, agencyLogo);
  } else if (xml.includes(AGENCY_LOGO_PLACEHOLDER)) {
    xml = xml.replace(AGENCY_LOGO_PLACEHOLDER, "");
  }

  zip.file("word/document.xml", xml);
  return zip.generate({ type: "uint8array" });
}

export async function fetchAgencyLogoImage(
  logoUrl: string | null | undefined,
): Promise<AgencyLogoImage | null> {
  const url = logoUrl?.trim();
  if (!url) return null;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) return null;

  if (contentType.includes("png") || url.toLowerCase().includes(".png")) {
    return { bytes, extension: "png" };
  }
  return { bytes, extension: "jpeg" };
}
