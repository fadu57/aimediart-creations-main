/**
 * Heuristiques Qualité / Vitesse / Résilience TPM / Compromis global pour le pilotage IA.
 * À garder aligné avec `supabase/functions/discover-free-models/index.ts`.
 */

export type ModelExperienceScores = {
  quality_score: number;
  speed_score: number;
  /** Résilience production / risque rate-limit & marge TPM (0–10, plus haut = plus sûr). */
  tpm_resilience_score: number;
  /** Compromis global (qualité, latence perçue, résilience TPM). */
  balance_score: number;
};

export type ModelProfileKind = "deep_research" | "groq_70b" | "gemini_flash" | "default";

function clamp10(n: number): number {
  return Math.min(10, Math.max(0, n));
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Qualité seule (palier historique id + nom). */
export function inferQualityScoreHeuristic(id: string, name: string): number {
  const hay = `${id} ${name}`.toLowerCase();

  const topTier =
    hay.includes("deep research") ||
    hay.includes("70b") ||
    /(^|[-._/\s])pro($|[-._/\s])/.test(hay) ||
    /\bpro\b/.test(hay);
  if (topTier) return 9.5;

  const lowTier =
    hay.includes("lite") ||
    hay.includes("mini") ||
    hay.includes("nano") ||
    /\b8b\b/.test(hay) ||
    /(^|[-._])8b($|[-._])/i.test(hay);
  if (lowTier) return 6.0;

  const hasFlash = hay.includes("flash");
  if (hasFlash && !hay.includes("lite") && !hay.includes("mini")) return 8.0;
  if (hay.includes("32b") || hay.includes("gemma 4") || hay.includes("gemma-4")) return 8.0;

  return 5.0;
}

/** Résilience TPM hors profils nommés (réputation rate-limit Groq vs quotas Gemini). */
function inferTpmResilienceDefault(id: string, name: string, provider: "gemini" | "groq"): number {
  const hay = `${id} ${name}`.toLowerCase();
  if (provider === "groq") {
    if (hay.includes("70b") || hay.includes("llama-3.3")) return 4;
    return 6.5;
  }
  if (hay.includes("flash") && !hay.includes("lite") && !hay.includes("mini")) return 9;
  if (/\bpro\b/.test(hay) || hay.includes("ultra")) return 8;
  return 7;
}

export function inferExperienceScores(id: string, name: string, provider: "gemini" | "groq"): ModelExperienceScores {
  const hay = `${id} ${name}`.toLowerCase();

  if (hay.includes("deep research") || hay.includes("deep-research")) {
    return { quality_score: 9.5, speed_score: 2, tpm_resilience_score: 9, balance_score: 6.5 };
  }

  if (provider === "groq" && (hay.includes("llama-3.3") || hay.includes("70b"))) {
    return { quality_score: 8, speed_score: 10, tpm_resilience_score: 4, balance_score: 7.5 };
  }

  if (
    provider === "gemini" &&
    hay.includes("flash") &&
    !hay.includes("lite") &&
    !hay.includes("mini")
  ) {
    return { quality_score: 7.5, speed_score: 9, tpm_resilience_score: 10, balance_score: 8.8 };
  }

  const quality = inferQualityScoreHeuristic(id, name);

  let speed = 5;
  if (provider === "groq") {
    speed = 10;
  } else if (hay.includes("flash")) {
    speed = 9;
  } else if (/\bpro\b/.test(hay) || hay.includes("ultra")) {
    speed = 4;
  } else {
    speed = 6;
  }

  const tpmResilience = inferTpmResilienceDefault(id, name, provider);
  const balance = clamp10(roundTenth((quality + speed + tpmResilience) / 3));

  return {
    quality_score: clamp10(quality),
    speed_score: clamp10(speed),
    tpm_resilience_score: clamp10(tpmResilience),
    balance_score: balance,
  };
}

export function inferModelProfileKind(id: string, name: string, provider: "gemini" | "groq"): ModelProfileKind {
  const hay = `${id} ${name}`.toLowerCase();
  if (hay.includes("deep research") || hay.includes("deep-research")) return "deep_research";
  if (provider === "groq" && (hay.includes("llama-3.3") || hay.includes("70b"))) return "groq_70b";
  if (provider === "gemini" && hay.includes("flash") && !hay.includes("lite") && !hay.includes("mini")) {
    return "gemini_flash";
  }
  return "default";
}

export function mergeScoresFromCache(
  raw: Partial<ModelExperienceScores> | undefined,
  fallback: ModelExperienceScores,
): ModelExperienceScores {
  const q = raw?.quality_score;
  const s = raw?.speed_score;
  const tr = raw?.tpm_resilience_score;
  const b = raw?.balance_score;
  return {
    quality_score: clamp10(typeof q === "number" && Number.isFinite(q) ? q : fallback.quality_score),
    speed_score: clamp10(typeof s === "number" && Number.isFinite(s) ? s : fallback.speed_score),
    tpm_resilience_score: clamp10(
      typeof tr === "number" && Number.isFinite(tr) ? tr : fallback.tpm_resilience_score,
    ),
    balance_score: clamp10(typeof b === "number" && Number.isFinite(b) ? b : fallback.balance_score),
  };
}
