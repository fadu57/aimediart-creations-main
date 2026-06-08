/**
 * providerRegistry.ts
 * Registre central des fournisseurs IA / outils connus.
 *
 * Trois niveaux distincts :
 *   detected_in_code  → le fournisseur figure dans ce registre (toujours true ici)
 *   configured        → la clé API / envar est présente côté Edge Function
 *   actively_used     → détecté dans les logs de consommation récents (calculé par providers-analyze)
 *
 * Pour ajouter un fournisseur : ajouter un objet dans PROVIDER_REGISTRY.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderDetectionResult = {
  configured: boolean;
  meta?: Record<string, unknown>;
};

export type ProviderSyncResult = {
  status: "success" | "not_implemented" | "error" | "skipped";
  message: string;
  /** Données brutes importées, à insérer dans ai_usage_events si pertinent */
  rawData?: unknown;
  error?: string;
};

export type ProviderVisibility = "active" | "legacy";

export type ProviderDefinition = {
  key: string;
  name: string;
  category: "llm" | "tts" | "image" | "ocr" | "translation" | "embedding" | "email" | "other";
  /** "active" = analysé et affiché ; "legacy" = conservé pour réactivation, exclu par défaut */
  visibility?: ProviderVisibility;
  detectConfiguration: () => ProviderDetectionResult;
  /** True si un connecteur d'import coûts existe ou est prévu */
  supportsCostSync: boolean;
  syncCosts?: () => Promise<ProviderSyncResult>;
};

// ---------------------------------------------------------------------------
// Registre
// ---------------------------------------------------------------------------

export const PROVIDER_REGISTRY: ProviderDefinition[] = [

  // ---- Groq (LLM) ----
  {
    key: "groq",
    name: "Groq",
    category: "llm",
    detectConfiguration: () => ({
      configured: Boolean(Deno.env.get("GROQ_API_KEY")),
      meta: { billing_mode: "estimated_from_logs" },
    }),
    supportsCostSync: true,
    // Pas d'API billing Groq : sync via ai_usage_logs + grille tarifaire (groqCostEstimator.ts).
  },

  // ---- Google Gemini ----
  // Clé principale : GEMINI_API_KEY (Google AI Studio)
  // Fallback       : GOOGLE_API_KEY  (clé multi-services Google)
  // GOOGLE_GENERATIVE_AI_API_KEY n'est pas utilisée dans ce projet.
  {
    key: "google_gemini",
    name: "Google Gemini",
    category: "llm",
    detectConfiguration: () => {
      const primary  = Deno.env.get("GEMINI_API_KEY");
      const fallback = Deno.env.get("GOOGLE_API_KEY");
      const usedVar  = primary ? "GEMINI_API_KEY" : fallback ? "GOOGLE_API_KEY" : null;
      return {
        configured: Boolean(primary ?? fallback),
        meta: {
          key_var: usedVar ?? "absent",
          billing_mode: "gcp_billing_export",
        },
      };
    },
    supportsCostSync: true,
    // Coûts réels via Cloud Billing Export → BigQuery (googleBilling.ts).
  },

  // ---- OpenAI (hors scope coûts pour l'instant) ----
  {
    key: "openai",
    name: "OpenAI",
    category: "llm",
    detectConfiguration: () => ({
      configured: Boolean(Deno.env.get("OPENAI_API_KEY")),
    }),
    supportsCostSync: false,
  },

  // ---- Google TTS ----
  // TTS visiteur via Edge Function google-tts (Cloud Text-to-Speech Neural2).
  {
    key: "google_tts",
    name: "Google TTS",
    category: "tts",
    detectConfiguration: () => ({
      configured: Boolean(Deno.env.get("GOOGLE_TTS_API_KEY")),
      meta: {
        billing_mode: "api_per_character",
        app_tts_engine: "google_cloud_tts",
        note: "TTS visiteur via Cloud Text-to-Speech Neural2 (Edge Function google-tts). Coûts estimés depuis ai_usage_logs.",
      },
    }),
    supportsCostSync: true,
  },

  // ---- HuggingFace (inférence image — scripts avatars, crédits payants) ----
  {
    key: "huggingface",
    name: "HuggingFace",
    category: "image",
    detectConfiguration: () => ({
      configured: Boolean(Deno.env.get("HF_TOKEN")),
      meta: {
        billing_mode: "hf_credits",
        key_var: "HF_TOKEN",
        note: "Inférence via router.huggingface.co (ex. generate-avatars.js). Coûts = crédits HF.",
      },
    }),
    supportsCostSync: false,
  },

  // ---- Cursor (IDE — abonnement mensuel fixe, sync dédiée) ----
  {
    key: "cursor",
    name: "Cursor",
    category: "other",
    detectConfiguration: () => ({
      configured: true,
      meta: {
        billing_mode: "fixed_monthly",
        cost_mode: "fixed_monthly",
        plan: "Pro+",
        amount_usd: 60,
        currency: "USD",
      },
    }),
    supportsCostSync: false,
  },

  // ---- Supabase (hébergement — abonnement mensuel fixe, sync dédiée) ----
  {
    key: "supabase",
    name: "Supabase",
    category: "other",
    detectConfiguration: () => {
      const url = Deno.env.get("SUPABASE_URL") ?? "";
      const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;
      return {
        configured: Boolean(url || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
        meta: {
          billing_mode: "fixed_monthly",
          cost_mode: "fixed_monthly",
          plan: "Free",
          amount_usd: 0,
          currency: "USD",
          project_ref: projectRef,
        },
      };
    },
    supportsCostSync: false,
  },

  // ---- Vercel (frontend — abonnement mensuel fixe, sync dédiée) ----
  {
    key: "vercel",
    name: "Vercel",
    category: "other",
    detectConfiguration: () => ({
      configured: true,
      meta: {
        billing_mode: "fixed_monthly",
        cost_mode: "fixed_monthly",
        plan: "Hobby",
        amount_usd: 0,
        currency: "USD",
      },
    }),
    supportsCostSync: false,
  },

  // ---- OVH (factures API OVHcloud — import ≥ 2026-04-01) ----
  {
    key: "ovh",
    name: "OVH",
    category: "other",
    detectConfiguration: () => {
      const apiReady = Boolean(
        Deno.env.get("OVH_APP_KEY") &&
        Deno.env.get("OVH_APP_SECRET") &&
        Deno.env.get("OVH_CONSUMER_KEY"),
      );
      return {
        configured: apiReady,
        meta: {
          billing_mode: "ovh_invoices",
          currency: "EUR",
          import_from_date: "2026-04-01",
          amount_type: "ttc",
          api_configured: apiReady,
        },
      };
    },
    supportsCostSync: true,
  },

  // ---- SMTP Email ----
  {
    key: "smtp_email",
    name: "SMTP Email",
    category: "email",
    detectConfiguration: () => ({
      configured:
        Boolean(Deno.env.get("EMAIL_USER")) &&
        Boolean(Deno.env.get("EMAIL_APP_PASSWORD")),
    }),
    supportsCostSync: false,
  },
];

/**
 * Fournisseurs hors registre actif — conservés pour référence uniquement.
 * Pour réactiver : déplacer l'entrée dans PROVIDER_REGISTRY et redéployer providers-analyze.
 */
export const LEGACY_PROVIDER_REGISTRY: ProviderDefinition[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isActiveProvider(p: ProviderDefinition): boolean {
  return (p.visibility ?? "active") === "active";
}

/** Clés des fournisseurs actifs (analyse + sync). */
export function getActiveProviderKeys(): string[] {
  return PROVIDER_REGISTRY.filter(isActiveProvider).map((p) => p.key);
}

export function getProviderDefinition(key: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((p) => p.key === key)
    ?? LEGACY_PROVIDER_REGISTRY.find((p) => p.key === key);
}

export function detectAllProviders(): Array<{
  definition: ProviderDefinition;
  detection: ProviderDetectionResult;
}> {
  return PROVIDER_REGISTRY
    .filter(isActiveProvider)
    .map((p) => ({
      definition: p,
      detection: p.detectConfiguration(),
    }));
}
