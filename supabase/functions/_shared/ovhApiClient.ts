/** Date minimale d'import des factures OVH (suivi projet aimediart). */
export const OVH_IMPORT_FROM_DATE = "2026-04-01";

export function isOnOrAfterOvhImportCutoff(invoiceDate: string): boolean {
  return invoiceDate >= OVH_IMPORT_FROM_DATE;
}

export type OvhApiConfig = {
  appKey: string;
  appSecret: string;
  consumerKey: string;
  host: string;
  basePath: string;
};

export function getOvhApiConfigFromEnv(): OvhApiConfig | null {
  const appKey = Deno.env.get("OVH_APP_KEY")?.trim();
  const appSecret = Deno.env.get("OVH_APP_SECRET")?.trim();
  const consumerKey = Deno.env.get("OVH_CONSUMER_KEY")?.trim();
  if (!appKey || !appSecret || !consumerKey) return null;

  const endpoint = (Deno.env.get("OVH_ENDPOINT")?.trim() || "ovh-eu").toLowerCase();
  const host = endpoint === "ovh-ca"
    ? "ca.api.ovh.com"
    : endpoint === "ovh-us"
    ? "us.ovhcloud.com"
    : "eu.api.ovh.com";

  return {
    appKey,
    appSecret,
    consumerKey,
    host,
    basePath: "/1.0",
  };
}

export function isOvhApiConfigured(): boolean {
  return getOvhApiConfigFromEnv() !== null;
}

async function sha1Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type OvhBillDetail = {
  billId: string;
  date: string;
  orderId?: number | string | null;
  priceWithTax?: { value?: number } | number | null;
  priceWithoutTax?: { value?: number } | number | null;
};

function readPriceValue(field: OvhBillDetail["priceWithTax"]): number | null {
  if (field == null) return null;
  if (typeof field === "number") return field;
  const v = Number(field.value);
  return Number.isFinite(v) ? v : null;
}

export function normalizeOvhBillRef(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ref = raw.trim().toUpperCase();
  if (/^[A-Z]{2}\d+$/.test(ref)) return ref;
  if (/^\d+$/.test(ref)) return `FR${ref}`;
  return ref;
}

export function billDateToYmd(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return m ? m[1] : null;
}

export function billToImportInput(
  bill: OvhBillDetail,
  amountType: "ht" | "ttc" = "ttc",
): { invoice_ref: string; invoice_date: string; amount_eur: number; order_ref: string | null } | null {
  const invoiceRef = normalizeOvhBillRef(bill.billId);
  const invoiceDate = billDateToYmd(bill.date);
  if (!invoiceRef || !invoiceDate) return null;
  if (!isOnOrAfterOvhImportCutoff(invoiceDate)) return null;

  const amountEur = amountType === "ht"
    ? readPriceValue(bill.priceWithoutTax)
    : readPriceValue(bill.priceWithTax);
  if (amountEur === null || amountEur < 0) return null;

  return {
    invoice_ref: invoiceRef,
    invoice_date: invoiceDate,
    amount_eur: Math.round(amountEur * 100) / 100,
    order_ref: bill.orderId != null ? String(bill.orderId) : null,
  };
}

export class OvhApiClient {
  private timeDiffSec: number | null = null;

  constructor(private readonly cfg: OvhApiConfig) {}

  private async getTimeDiff(): Promise<number> {
    if (this.timeDiffSec !== null) return this.timeDiffSec;
    const time = await this.request<number>("GET", "/auth/time");
    this.timeDiffSec = time - Math.round(Date.now() / 1000);
    return this.timeDiffSec;
  }

  private async signRequest(
    method: string,
    url: string,
    body: string,
    timestamp: number,
  ): Promise<string> {
    const payload = [
      this.cfg.appSecret,
      this.cfg.consumerKey,
      method,
      url,
      body,
      String(timestamp),
    ].join("+");
    return `$1$${await sha1Hex(payload)}`;
  }

  async request<T>(method: string, path: string, query?: Record<string, string>): Promise<T> {
    const qs = query && Object.keys(query).length
      ? `?${new URLSearchParams(query).toString()}`
      : "";
    const apiPath = `${this.cfg.basePath}${path}${qs}`;
    const url = `https://${this.cfg.host}${apiPath}`;
    const body = "";
    const timestamp = Math.round(Date.now() / 1000) + await this.getTimeDiff();
    const signature = await this.signRequest(method, url, body, timestamp);

    const resp = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Ovh-Application": this.cfg.appKey,
        "X-Ovh-Consumer": this.cfg.consumerKey,
        "X-Ovh-Timestamp": String(timestamp),
        "X-Ovh-Signature": signature,
      },
    });

    const text = await resp.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Réponse OVH non-JSON (${resp.status})`);
      }
    }

    if (!resp.ok) {
      const msg = typeof json === "object" && json && "message" in json
        ? String((json as { message?: string }).message)
        : text || resp.statusText;
      throw new Error(`OVH API ${resp.status}: ${msg}`);
    }

    return json as T;
  }

  async listBillIds(fromDate: string): Promise<string[]> {
    return this.request<string[]>("GET", "/me/bill", { "date.from": fromDate });
  }

  async getBill(billId: string): Promise<OvhBillDetail> {
    return this.request<OvhBillDetail>("GET", `/me/bill/${encodeURIComponent(billId)}`);
  }
}
