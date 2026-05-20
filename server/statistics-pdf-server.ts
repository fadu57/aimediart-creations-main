/**
 * Serveur d’export PDF des statistiques via Chromium (Playwright page.pdf).
 * À lancer en local en parallèle de Vite : npm run pdf-server
 *
 * Variables d’environnement : voir server/README-pdf-export.md
 */
import "dotenv/config";
import cors from "cors";
import express from "express";
import type { Session } from "@supabase/supabase-js";
import { generateStatisticsPdfBuffer } from "../api/_lib/statisticsPdfExportCore";

const PORT = Number(process.env.PDF_SERVER_PORT ?? 3847);
const HOST = process.env.PDF_SERVER_HOST ?? "127.0.0.1";
const APP_ORIGIN = (process.env.PDF_EXPORT_ORIGIN ?? "http://localhost:8080").replace(/\/$/, "");
const ALLOWED_ORIGINS = (process.env.PDF_EXPORT_CORS_ORIGINS ?? "http://localhost:8080,http://127.0.0.1:8080")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type ExportBody = {
  session: Session;
  paperFormat?: string;
};

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "statistics-pdf" });
});

app.post("/export/statistics-pdf", async (req, res) => {
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
      appOrigin: APP_ORIGIN,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="statistiques.pdf"');
    res.send(pdf);
  } catch (e) {
    console.error("[statistics-pdf-server]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (!res.headersSent) {
      res.status(500).json({ error: msg.slice(0, 800) });
    }
  }
});

app.listen(PORT, HOST, () => {
  console.log(
    `[statistics-pdf-server] http://${HOST}:${PORT} — export POST /export/statistics-pdf — app ${APP_ORIGIN}`,
  );
});
