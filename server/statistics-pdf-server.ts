/**
 * Serveur d’export PDF des statistiques via Chromium (Playwright page.pdf).
 * À lancer en local en parallèle de Vite : npm run pdf-server
 *
 * Variables d’environnement : voir server/README-pdf-export.md
 */
import "dotenv/config";
import cors from "cors";
import express from "express";
import { chromium, type Browser } from "playwright";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

const PORT = Number(process.env.PDF_SERVER_PORT ?? 3847);
const HOST = process.env.PDF_SERVER_HOST ?? "127.0.0.1";
const APP_ORIGIN = (process.env.PDF_EXPORT_ORIGIN ?? "http://localhost:8080").replace(/\/$/, "");
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const ALLOWED_ORIGINS = (process.env.PDF_EXPORT_CORS_ORIGINS ?? "http://localhost:8080,http://127.0.0.1:8080")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function supabaseAuthStorageKey(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const ref = hostname.split(".")[0] || "supabase";
    return `sb-${ref}-auth-token`;
  } catch {
    return "sb-local-auth-token";
  }
}

const PLAYWRIGHT_FORMAT: Record<string, "A4" | "A3" | "A5" | "Letter" | "Legal" | "Tabloid"> = {
  a4: "A4",
  a3: "A3",
  a5: "A5",
  letter: "Letter",
  legal: "Legal",
  tabloid: "Tabloid",
};

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    });
  }
  return browserPromise;
}

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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: "SUPABASE_URL / SUPABASE_ANON_KEY non configurés sur le serveur PDF" });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(session.access_token);

  if (authErr || !user) {
    res.status(401).json({ error: "Session invalide ou expirée" });
    return;
  }

  const paperFormat = (body.paperFormat ?? "a4").toLowerCase();
  const pdfFormat = PLAYWRIGHT_FORMAT[paperFormat] ?? "A4";

  const storageKey = supabaseAuthStorageKey(SUPABASE_URL);
  const sessionJson = JSON.stringify(session);

  let browser: Browser | undefined;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 2000 },
      deviceScaleFactor: 2,
      locale: "fr-FR",
    });

    await context.addInitScript(
      ([key, json]) => {
        try {
          localStorage.setItem(key as string, json as string);
        } catch {
          /* ignore */
        }
      },
      [storageKey, sessionJson],
    );

    const page = await context.newPage();

    const url = `${APP_ORIGIN}/statistiques?chromiumPdf=1`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

    await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {
      /* certaines apps gardent du polling — on continue */
    });

    await page.waitForSelector("#statistics-print-area[data-statistics-export-ready='true']", {
      timeout: 180_000,
    });

    await page.waitForFunction(
      () => {
        const root = document.querySelector("#statistics-print-area");
        if (!root) return false;
        const expected = Number(root.getAttribute("data-expected-chart-surfaces") ?? "0");
        const surfaces = root.querySelectorAll(".recharts-surface").length;
        return expected === 0 || surfaces >= expected;
      },
      { timeout: 120_000 },
    );

    await page.evaluate(async () => {
      await document.fonts?.ready?.catch(() => undefined);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      await new Promise<void>((r) => setTimeout(r, 500));
    });

    await page.addStyleTag({
      content: `
        /* Marges réelles : options page.pdf() + pied de page numéroté */
        @page {
          margin: 0;
        }
        /*
         * Chromium ne fragmente pas correctement les flex ancestors : tout reste sur une « couche ».
         * Forcer du bloc sur toute la chaîne jusqu’au rapport pour rétablir les sauts de page.
         */
        #root,
        #root > div,
        main,
        main > div {
          display: block !important;
          flex: none !important;
          flex-direction: unset !important;
          align-items: unset !important;
          justify-content: unset !important;
          min-height: 0 !important;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
        }
        html {
          background: #ffffff !important;
        }
        body {
          background: #ffffff !important;
          color: #111111 !important;
        }
        #root,
        #root > div,
        main {
          background: #ffffff !important;
        }
        header,
        [data-backoffice-header],
        nav[role="navigation"] {
          display: none !important;
        }
        .sticky.top-16 {
          display: none !important;
        }
        main .container {
          max-width: none !important;
          padding-top: 0 !important;
          padding-bottom: 0 !important;
          background: #ffffff !important;
        }
        [data-radix-dialog-overlay] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        [role="dialog"],
        [data-radix-dialog-content] {
          position: relative !important;
          inset: 0 !important;
          left: 0 !important;
          top: 0 !important;
          transform: none !important;
          max-width: none !important;
          max-height: none !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          border: none !important;
          box-shadow: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        #statistics-print-area {
          max-height: none !important;
          overflow: visible !important;
          background: #ffffff !important;
          display: block !important;
        }
        .statistics-report-root {
          display: block !important;
        }
        /* Saut de page : break-before est plus fiable que break-after sous Blink PDF */
        .statistics-report-page {
          display: flow-root !important;
          box-sizing: border-box !important;
          contain: none !important;
        }
        .statistics-report-page:not(:first-child) {
          break-before: page !important;
          page-break-before: always !important;
        }
        .statistics-report-chart-host {
          overflow: hidden !important;
        }
        thead {
          display: table-header-group;
        }
        tr,
        img {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      `,
    });

    /* Impression : applique @media print du client + sauts de page (évite la répétition « écran »). */
    await page.emulateMedia({ media: "print" });

    const footerTpl = `
      <div style="width:100%;font-size:9pt;color:#444;text-align:center;font-family:system-ui,Segoe UI,sans-serif;padding-top:2mm;">
        Page <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`;

    const pdfBuffer = await page.pdf({
      format: pdfFormat,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "12mm", bottom: "22mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footerTpl,
      scale: 0.92,
    });

    await context.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="statistiques.pdf"');
    res.send(Buffer.from(pdfBuffer));
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
