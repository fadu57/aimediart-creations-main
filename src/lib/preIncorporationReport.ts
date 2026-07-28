/**
 * Rapport « État des actes accomplis pour le compte de la société en formation »
 * (art. R. 210-6 du Code de commerce) — agrégation + export Markdown / PDF imprimable.
 */

import { costProviderDisplayName } from "./costs";
import { getUsdToEurRate, usdToEur } from "./fxRates";
import { supabase } from "./supabase";

export const PRE_INCORPORATION_COMPANY = {
  name: "ALTIVART",
  legalForm: "Société par Actions Simplifiée au capital de 10 000 euros",
  seat: "9 rue des Bagrasses, 57420 VERNY",
  cityForDeed: "Verny",
} as const;

/** Associés signataires (ordre statutaire). */
export const PRE_INCORPORATION_SIGNATORIES = [
  { title: "Monsieur", fullName: "Fabien DUPONT", gender: "m" as const },
  { title: "Monsieur", fullName: "Jean-Yves CAMUS", gender: "m" as const },
  { title: "Monsieur", fullName: "Robin CAUDY", gender: "m" as const },
  { title: "Madame", fullName: "Sandra SCHOULER", gender: "f" as const },
] as const;

const DEFAULT_VAT_RATE = 20;

export type PreIncorporationReportLine = {
  id: string;
  date: string;
  provider: string;
  label: string;
  category: string;
  categoryKey: string;
  paidByUserId: string | null;
  paidByName: string;
  currency: string;
  amountTtc: number;
  vatRate: number;
  amountHt: number;
  amountVat: number;
};

export type PreIncorporationReportTotals = {
  ht: number;
  vat: number;
  ttc: number;
};

export type PreIncorporationReport = {
  company: typeof PRE_INCORPORATION_COMPANY;
  generatedAt: string;
  signatureDateLabel: string;
  lines: PreIncorporationReportLine[];
  totals: PreIncorporationReportTotals;
  currency: string;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Décompose un montant TTC selon un taux de TVA en %. */
export function splitTtc(amountTtc: number, vatRatePercent = DEFAULT_VAT_RATE): {
  ht: number;
  vat: number;
  ttc: number;
} {
  const ttc = round2(amountTtc);
  const rate = Number.isFinite(vatRatePercent) && vatRatePercent >= 0 ? vatRatePercent : DEFAULT_VAT_RATE;
  if (rate === 0) return { ht: ttc, vat: 0, ttc };
  const ht = round2(ttc / (1 + rate / 100));
  const vat = round2(ttc - ht);
  return { ht, vat, ttc };
}

function formatEuro(n: number): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateFr(isoDate: string): string {
  const d = isoDate.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return isoDate;
  return `${day}/${m}/${y}`;
}

function formatLongDateFr(isoOrDate = new Date()): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function profileLabel(p: {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  id: string;
}): string {
  const full = [p.first_name?.trim(), p.last_name?.trim()].filter(Boolean).join(" ");
  return full || p.username?.trim() || p.id.slice(0, 8);
}

function categoryLabelFr(toolType: string): string {
  const map: Record<string, string> = {
    infrastructure: "Infrastructure / hébergement",
    service: "Service / prestation",
    abonnement: "Abonnement",
    materiel: "Matériel",
    ide: "Licences & Outils Logiciels (SaaS)",
    immatriculation_juridique: "Frais d'immatriculation & Juridique",
    actifs_marque_domaines: "Actifs, Marque & Domaines",
    cloud_hebergement: "Services Cloud & Hébergement",
    licences_saas: "Licences & Outils Logiciels (SaaS)",
    actifs_ip: "Actifs Intangibles & Propriété Intellectuelle",
    honoraires_juridiques: "Honoraires & Frais Juridiques / Comptables",
    marketing_acquisition: "Marketing, Prospection & Acquisition",
    materiel_equipements: "Matériel & Équipements",
    deplacement_representation: "Frais de Déplacement & Représentation",
    other: "Autre",
  };
  return map[toolType] ?? toolType;
}

function isPreIncorporationFlag(meta: Record<string, unknown> | null | undefined): boolean {
  const v = meta?.is_pre_incorporation;
  return v === true || v === "true";
}

function lineLabel(r: {
  provider: string | null;
  operation_name: string | null;
  model_name: string | null;
  metadata: Record<string, unknown> | null;
}): string {
  const meta = r.metadata ?? {};
  if (typeof meta.label === "string" && meta.label.trim()) return meta.label.trim();

  const providerKey = (r.provider ?? "").trim().toLowerCase();
  const model = r.model_name?.trim();
  const op = r.operation_name?.trim();

  if (providerKey === "cursor") {
    const plan = model || (typeof meta.plan === "string" ? meta.plan.trim() : "");
    return plan ? `Abonnement Cursor ${plan}` : "Abonnement Cursor";
  }

  if (op === "monthly_subscription") {
    const name = costProviderDisplayName(providerKey || "—");
    return model ? `Abonnement ${name} ${model}` : `Abonnement ${name}`;
  }

  return op || "—";
}

/** Convertit un montant vers EUR (rapport juridique en euros). */
function amountToEur(
  amount: number,
  currency: string,
  usdToEurRate: number | null,
): { eur: number; error: string | null } {
  const cur = currency.toUpperCase();
  if (cur === "EUR") return { eur: amount, error: null };
  if (cur === "USD") {
    if (usdToEurRate == null || !(usdToEurRate > 0)) {
      return {
        eur: 0,
        error: "Taux USD→EUR indisponible : impossible de convertir les dépenses en dollars (ex. Cursor).",
      };
    }
    return { eur: usdToEur(amount, usdToEurRate), error: null };
  }
  return {
    eur: 0,
    error: `Devise non supportée pour l'état des actes : ${cur}. Convertissez ou saisissez en EUR.`,
  };
}

type RawPreIncRow = {
  id: string;
  created_at: string;
  provider: string | null;
  tool_type: string | null;
  operation_name: string | null;
  model_name: string | null;
  cost_estimated: number | null;
  currency: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Agrège TOUTES les dépenses marquées société en formation
 * (saisies manuelles ET sync auto : Cursor, OVH, Supabase…).
 * Montants normalisés en EUR TTC ; HT/TVA via metadata.vat_rate (défaut 20 %).
 */
export async function generatePreIncorporationReport(options?: {
  /** Date affichée dans « Fait à Verny, le … » (défaut : aujourd’hui). */
  signatureDate?: Date;
}): Promise<{ report: PreIncorporationReport | null; error: string | null }> {
  const { data, error } = await supabase
    .from("ai_usage_events")
    .select(
      "id, created_at, provider, tool_type, operation_name, model_name, cost_estimated, currency, metadata",
    )
    .eq("metadata->>is_pre_incorporation", "true")
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) return { report: null, error: error.message };

  // Filet de sécurité si le filtre JSONB renvoie des variantes inattendues.
  const rows = ((data ?? []) as RawPreIncRow[]).filter((r) =>
    isPreIncorporationFlag(r.metadata),
  );

  const needsFx = rows.some((r) => (r.currency ?? "EUR").toUpperCase() === "USD");
  const usdToEurRate = needsFx ? await getUsdToEurRate() : null;

  const paidByIds = [
    ...new Set(
      rows
        .map((r) => {
          const id = r.metadata?.paid_by_user_id;
          return typeof id === "string" && id.trim() ? id.trim() : null;
        })
        .filter((id): id is string => !!id),
    ),
  ];

  const nameById = new Map<string, string>();
  if (paidByIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, username")
      .in("id", paidByIds);
    for (const p of (profiles ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      username: string | null;
    }>) {
      nameById.set(p.id, profileLabel(p));
    }
  }

  const lines: PreIncorporationReportLine[] = [];
  for (const r of rows) {
    const meta = r.metadata ?? {};
    const rawAmount = Number(r.cost_estimated ?? 0) || 0;
    const sourceCurrency = (r.currency ?? "EUR").toUpperCase();
    const converted = amountToEur(rawAmount, sourceCurrency, usdToEurRate);
    if (converted.error) return { report: null, error: converted.error };

    const rawRate = meta.vat_rate;
    const vatRate =
      typeof rawRate === "number" && Number.isFinite(rawRate)
        ? rawRate
        : typeof rawRate === "string" && Number.isFinite(Number(rawRate))
          ? Number(rawRate)
          : DEFAULT_VAT_RATE;
    const parts = splitTtc(converted.eur, vatRate);
    const paidByUserId =
      typeof meta.paid_by_user_id === "string" && meta.paid_by_user_id.trim()
        ? meta.paid_by_user_id.trim()
        : null;
    const providerKey = (r.provider ?? "").trim();
    const categoryKey = r.tool_type?.trim() || "other";

    lines.push({
      id: r.id,
      date: r.created_at.slice(0, 10),
      provider: providerKey
        ? costProviderDisplayName(providerKey.toLowerCase())
        : "—",
      label: lineLabel(r),
      category: categoryLabelFr(categoryKey),
      categoryKey,
      paidByUserId,
      paidByName: paidByUserId ? (nameById.get(paidByUserId) ?? paidByUserId.slice(0, 8)) : "—",
      currency: "EUR",
      amountTtc: parts.ttc,
      vatRate,
      amountHt: parts.ht,
      amountVat: parts.vat,
    });
  }

  const totals = lines.reduce(
    (acc, line) => {
      acc.ht = round2(acc.ht + line.amountHt);
      acc.vat = round2(acc.vat + line.amountVat);
      acc.ttc = round2(acc.ttc + line.amountTtc);
      return acc;
    },
    { ht: 0, vat: 0, ttc: 0 },
  );

  const signatureDate = options?.signatureDate ?? new Date();
  const report: PreIncorporationReport = {
    company: PRE_INCORPORATION_COMPANY,
    generatedAt: new Date().toISOString(),
    signatureDateLabel: formatLongDateFr(signatureDate),
    lines,
    totals,
    currency: "EUR",
  };

  return { report, error: null };
}

const LEGAL_INTRO =
  "Conformément aux dispositions de l'article R. 210-6 du Code de commerce, est annexé aux statuts de la société ALTIVART l'état des actes accomplis pour le compte de la société en formation, avec l'indication pour chacun d'eux de l'engagement qui en résulterait pour la société.";

const LEGAL_CLOSING =
  "La signature des statuts emportera reprise de ces engagements par la société dès qu'elle aura été immatriculée au Registre du Commerce et des Sociétés.";

/** Génère le Markdown officiel du rapport. */
export function buildPreIncorporationMarkdown(report: PreIncorporationReport): string {
  const { company } = report;
  const lines: string[] = [
    "# ÉTAT DES ACTES ACCOMPLIS POUR LE COMPTE DE LA SOCIÉTÉ EN FORMATION",
    "",
    `**${company.name}**`,
    company.legalForm,
    `Siège social : ${company.seat}`,
    "",
    LEGAL_INTRO,
    "",
    "| Date | Fournisseur / Prestataire | Description & Catégorie | Payé par (Associé) | HT (€) | TVA (€) | TTC (€) |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
  ];

  for (const row of report.lines) {
    const desc = `${row.label} — ${row.category}`.replace(/\|/g, "/");
    lines.push(
      `| ${formatDateFr(row.date)} | ${row.provider.replace(/\|/g, "/")} | ${desc} | ${row.paidByName.replace(/\|/g, "/")} | ${formatEuro(row.amountHt)} | ${formatEuro(row.amountVat)} | ${formatEuro(row.amountTtc)} |`,
    );
  }

  lines.push(
    `| | | | **Total général** | **${formatEuro(report.totals.ht)}** | **${formatEuro(report.totals.vat)}** | **${formatEuro(report.totals.ttc)}** |`,
    "",
    LEGAL_CLOSING,
    "",
    `Fait à ${company.cityForDeed}, le ${report.signatureDateLabel}`,
    "",
  );

  PRE_INCORPORATION_SIGNATORIES.forEach((s, i) => {
    const assocLabel = s.gender === "f" ? "l'associée" : "l'associé";
    lines.push(`### Pour ${assocLabel} ${i + 1} : ${s.title} ${s.fullName}`);
    lines.push("");
    lines.push("_Lu et approuvé_");
    lines.push("");
    lines.push("Signature : _______________________________");
    lines.push("");
  });

  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML imprimable (PDF via dialogue d’impression navigateur) avec ruptures de page. */
export function buildPreIncorporationPrintHtml(report: PreIncorporationReport): string {
  const { company } = report;
  const rowHtml = report.lines
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(formatDateFr(row.date))}</td>
        <td>${escapeHtml(row.provider)}</td>
        <td>${escapeHtml(row.label)}<br/><span class="cat">${escapeHtml(row.category)}</span></td>
        <td>${escapeHtml(row.paidByName)}</td>
        <td class="num">${escapeHtml(formatEuro(row.amountHt))}</td>
        <td class="num">${escapeHtml(formatEuro(row.amountVat))}</td>
        <td class="num">${escapeHtml(formatEuro(row.amountTtc))}</td>
      </tr>`,
    )
    .join("");

  const signatures = PRE_INCORPORATION_SIGNATORIES.map((s, i) => {
    const assocLabel = s.gender === "f" ? "l'associée" : "l'associé";
    return `
      <div class="signature-box">
        <p class="sig-title">Pour ${assocLabel} ${i + 1} :</p>
        <p class="sig-name">${escapeHtml(s.title)} ${escapeHtml(s.fullName)}</p>
        <p class="sig-mention">Mention manuscrite : « Lu et approuvé »</p>
        <p class="sig-line">Signature :</p>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>ALTIVART — État des actes accomplis</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 14mm 22mm 14mm;
      @bottom-left {
        content: "ALTIVART - État des actes accomplis pour le compte de la société en formation";
        font-size: 8pt;
        color: #555;
      }
      @bottom-right {
        content: "Page " counter(page) " / " counter(pages);
        font-size: 8pt;
        color: #555;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      color: #111;
      line-height: 1.35;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 14pt;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      margin: 0 0 1.2rem;
      line-height: 1.25;
    }
    .company {
      text-align: center;
      margin-bottom: 1rem;
    }
    .company .name {
      font-weight: 700;
      font-size: 13pt;
    }
    .intro {
      text-align: justify;
      margin: 0 0 1.25rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 1.25rem;
    }
    th, td {
      border: 1px solid #333;
      padding: 0.35rem 0.4rem;
      vertical-align: top;
    }
    th {
      background: #f0f0f0;
      font-weight: 700;
      text-align: left;
    }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .cat { color: #444; font-size: 8.5pt; font-style: italic; }
    tfoot td {
      font-weight: 700;
      background: #f7f7f7;
    }
    .closing {
      text-align: justify;
      margin: 0 0 0.75rem;
    }
    .place-date {
      margin: 0 0 1rem;
    }
    .signatures-section {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 16px;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .signature-box {
      border: 1px solid #333;
      padding: 0.6rem 0.75rem;
      min-height: 110px;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .sig-title { margin: 0 0 0.25rem; font-size: 9.5pt; }
    .sig-name { margin: 0 0 0.5rem; font-weight: 700; }
    .sig-mention { margin: 0 0 0.75rem; font-size: 9pt; font-style: italic; }
    .sig-line { margin: 0; font-size: 9.5pt; }
    .print-bar {
      position: sticky;
      top: 0;
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      padding: 0.5rem 0 0.75rem;
      background: #fff;
      border-bottom: 1px solid #ddd;
      margin-bottom: 1rem;
      font-family: system-ui, sans-serif;
    }
    .print-bar button {
      cursor: pointer;
      padding: 0.4rem 0.85rem;
      border: 1px solid #333;
      background: #111;
      color: #fff;
      border-radius: 4px;
      font-size: 13px;
    }
    .print-bar button.secondary {
      background: #fff;
      color: #111;
    }
    @media print {
      .print-bar { display: none !important; }
    }
    /* Repli navigateurs sans @page margin boxes */
    .print-footer-fallback {
      display: none;
    }
    @media print {
      .print-footer-fallback {
        display: block;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        font-size: 8pt;
        color: #555;
        font-family: system-ui, sans-serif;
        display: flex;
        justify-content: space-between;
        padding: 0 2mm;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button type="button" class="secondary" onclick="window.close()">Fermer</button>
    <button type="button" onclick="window.print()">Imprimer / PDF</button>
  </div>

  <h1>État des actes accomplis pour le compte de la société en formation</h1>

  <div class="company">
    <div class="name">${escapeHtml(company.name)}</div>
    <div>${escapeHtml(company.legalForm)}</div>
    <div>Siège social : ${escapeHtml(company.seat)}</div>
  </div>

  <p class="intro">${escapeHtml(LEGAL_INTRO)}</p>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Fournisseur / Prestataire</th>
        <th>Description &amp; Catégorie</th>
        <th>Payé par (Associé)</th>
        <th class="num">HT (€)</th>
        <th class="num">TVA (€)</th>
        <th class="num">TTC (€)</th>
      </tr>
    </thead>
    <tbody>
      ${rowHtml || `<tr><td colspan="7">Aucune dépense société en formation enregistrée.</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4">Total général</td>
        <td class="num">${escapeHtml(formatEuro(report.totals.ht))}</td>
        <td class="num">${escapeHtml(formatEuro(report.totals.vat))}</td>
        <td class="num">${escapeHtml(formatEuro(report.totals.ttc))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="signatures-section">
    <p class="closing">${escapeHtml(LEGAL_CLOSING)}</p>
    <p class="place-date">Fait à ${escapeHtml(company.cityForDeed)}, le ${escapeHtml(report.signatureDateLabel)}</p>
    <div class="signatures-grid">
      ${signatures}
    </div>
  </div>

  <div class="print-footer-fallback" aria-hidden="true">
    <span>ALTIVART - État des actes accomplis pour le compte de la société en formation</span>
    <span></span>
  </div>
</body>
</html>`;
}

/** Télécharge le Markdown du rapport. */
export function downloadPreIncorporationMarkdown(report: PreIncorporationReport): void {
  const md = buildPreIncorporationMarkdown(report);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ALTIVART-etat-actes-accomplis-${report.signatureDateLabel.replace(/\s+/g, "-")}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Ouvre une fenêtre vierge immédiatement (geste utilisateur) pour l’aperçu PDF. */
export function openPreIncorporationPrintShell(): Window | null {
  const w = window.open("about:blank", "_blank", "width=900,height=1100");
  if (!w) return null;
  try {
    w.document.open();
    w.document.write(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><title>ALTIVART — Génération…</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;color:#333">
  <p>Génération de l'état des actes accomplis…</p>
</body></html>`);
    w.document.close();
  } catch {
    // ignore
  }
  return w;
}

/** Remplit la fenêtre imprimable (PDF via « Enregistrer au format PDF »). */
export function openPreIncorporationPrintPreview(
  report: PreIncorporationReport,
  targetWindow?: Window | null,
): void {
  const html = buildPreIncorporationPrintHtml(report);
  const w = targetWindow ?? window.open("about:blank", "_blank", "width=900,height=1100");
  if (!w) {
    throw new Error("popup_blocked");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  try {
    w.focus();
  } catch {
    // ignore
  }
}
