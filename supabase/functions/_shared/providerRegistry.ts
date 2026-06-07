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
  // TTS visiteur = Web Speech API navigateur uniquement (pas Cloud Text-to-Speech serveur).
  {
    key: "google_tts",
    name: "Google TTS",
    category: "tts",
    detectConfiguration: () => ({
      configured: true,
      meta: {
        billing_mode: "no_server_cost",
        app_tts_engine: "web_speech_api",
        note: "TTS visiteur = Web Speech API navigateur, pas Cloud TTS.",
      },
    }),
    supportsCostSync: false,
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
 * Fournisseurs abandonnés / hors prod — non analysés ni affichés par défaut.
 * Pour réactiver : déplacer l'entrée dans PROVIDER_REGISTRY et redéployer.
 *
 * HuggingFace : tests abandonnés, plus utilisé en prod.
 * Seul usage résiduel : scripts/generate-avatars.js (outil local, hors Edge Functions).
 */
export const LEGACY_PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    key: "huggingface",
    name: "HuggingFace",
    category: "llm",
    visibility: "legacy",
    detectConfiguration: () => ({
      configured: Boolean(Deno.env.get("HF_TOKEN")),
    }),
    supportsCostSync: false,
  },
];

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
