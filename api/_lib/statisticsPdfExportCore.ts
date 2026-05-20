/**
 * Génération PDF statistiques (Playwright / Chromium).
 * Code sous `api/` pour que Vercel détecte et bundle la function serverless.
 */
import { createClient } from "@supabase/supabase-js";
import type { Browser, Page } from "playwright-core";
import type { Session } from "@supabase/supabase-js";

const PLAYWRIGHT_FORMAT: Record<string, "A4" | "A3" | "A5" | "Letter" | "Legal" | "Tabloid"> = {
  a4: "A4",
  a3: "A3",
  a5: "A5",
  letter: "Letter",
  legal: "Legal",
  tabloid: "Tabloid",
};

const IS_VERCEL = Boolean(process.env.VERCEL);
const GOTO_TIMEOUT_MS = IS_VERCEL ? 55_000 : 120_000;
const READY_TIMEOUT_MS = IS_VERCEL ? 55_000 : 180_000;
const CHART_TIMEOUT_MS = IS_VERCEL ? 40_000 : 120_000;

function supabaseAuthStorageKey(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const ref = hostname.split(".")[0] || "supabase";
    return `sb-${ref}-auth-token`;
  } catch {
    return "sb-local-auth-token";
  }
}

async function launchBrowser(): Promise<Browser> {
  if (IS_VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: pw } = await import("playwright-core");
    return pw.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
}

async function injectPrintStyles(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
        @page { margin: 0; }
        #root, #root > div, main, main > div {
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
        html, body { background: #ffffff !important; }
        body { color: #111111 !important; }
        #root, #root > div, main { background: #ffffff !important; }
        header, [data-backoffice-header], nav[role="navigation"] { display: none !important; }
        .sticky.top-16 { display: none !important; }
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
        [role="dialog"], [data-radix-dialog-content] {
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
        .statistics-report-root { display: block !important; }
        .statistics-report-page {
          display: flow-root !important;
          box-sizing: border-box !important;
          contain: none !important;
        }
        .statistics-report-page:not(:first-child) {
          break-before: page !important;
          page-break-before: always !important;
        }
        .statistics-report-chart-host { overflow: hidden !important; }
        thead { display: table-header-group; }
        tr, img { break-inside: avoid; page-break-inside: avoid; }
      `,
  });
}

export type StatisticsPdfExportOptions = {
  session: Session;
  paperFormat?: string;
  appOrigin?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export async function generateStatisticsPdfBuffer(
  options: StatisticsPdfExportOptions,
): Promise<Buffer> {
  const session = options.session;
  if (!session?.access_token) {
    throw new Error("session.access_token manquant");
  }

  const supabaseUrl =
    options.supabaseUrl ?? process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const supabaseAnonKey =
    options.supabaseAnonKey ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY non configurés");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(session.access_token);

  if (authErr || !user) {
    throw new Error("Session invalide ou expirée");
  }

  const paperFormat = (options.paperFormat ?? "a4").toLowerCase();
  const pdfFormat = PLAYWRIGHT_FORMAT[paperFormat] ?? "A4";

  const resolvedOrigin = (() => {
    const raw =
      options.appOrigin ??
      process.env.PDF_EXPORT_ORIGIN ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
      "http://localhost:8080";
    const trimmed = raw.replace(/\/$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    return `https://${trimmed}`;
  })();

  const storageKey = supabaseAuthStorageKey(supabaseUrl);
  const sessionJson = JSON.stringify(session);

  const browser = await launchBrowser();
  try {
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
    const url = `${resolvedOrigin}/statistiques?chromiumPdf=1`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });

    await page.waitForLoadState("networkidle", { timeout: GOTO_TIMEOUT_MS }).catch(() => undefined);

    await page.waitForSelector("#statistics-print-area[data-statistics-export-ready='true']", {
      timeout: READY_TIMEOUT_MS,
    });

    await page.waitForFunction(
      () => {
        const root = document.querySelector("#statistics-print-area");
        if (!root) return false;
        const expected = Number(root.getAttribute("data-expected-chart-surfaces") ?? "0");
        const surfaces = root.querySelectorAll(".recharts-surface").length;
        return expected === 0 || surfaces >= expected;
      },
      { timeout: CHART_TIMEOUT_MS },
    );

    await page.evaluate(async () => {
      await document.fonts?.ready?.catch(() => undefined);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      await new Promise<void>((r) => setTimeout(r, 500));
    });

    await injectPrintStyles(page);
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
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
