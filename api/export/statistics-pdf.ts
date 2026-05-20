import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Session } from "@supabase/supabase-js";
import { generateStatisticsPdfBuffer } from "../../server/statisticsPdfExportCore";

type ExportBody = {
  session: Session;
  paperFormat?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  const body = req.body as ExportBody;
  const session = body?.session;

  if (!session?.access_token) {
    res.status(400).json({ error: "session.access_token manquant" });
    return;
  }

  try {
    const pdf = await generateStatisticsPdfBuffer({
      session,
      paperFormat: body.paperFormat,
      appOrigin: process.env.PDF_EXPORT_ORIGIN,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="statistiques.pdf"');
    res.status(200).send(pdf);
  } catch (e) {
    console.error("[api/export/statistics-pdf]", e);
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg.slice(0, 800) });
  }
}
