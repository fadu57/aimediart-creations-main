import { ARTIST_BIO_LANGUAGES, type Language } from "@/hooks/useArtistBios";

import { supabase } from "@/lib/supabase";

import { dispatchAiUsageRefresh } from "@/lib/aiUsageRefresh";

import {

  extractAIRateLimitFromBody,

  getAIRateLimitUserMessage,

  parseAIRateLimitPayload,

} from "@/lib/aiGuard";



type GenerateBiographyArgs = {

  prenom: string;

  name: string;

  artTypes: string[];

};



const BIO_CALL_GAP_MS = 500;

const MIN_BIO_CHARS = 200;

const MAX_SHORT_RETRIES = 1;



function sleep(ms: number): Promise<void> {

  return new Promise((resolve) => window.setTimeout(resolve, ms));

}



function parseBioError(raw: string, status: number): string {

  if (raw) {

    try {

      const json = JSON.parse(raw) as unknown;

      const rateLimit = extractAIRateLimitFromBody(json);

      if (rateLimit) return getAIRateLimitUserMessage(rateLimit);

      const err = json as { message?: string; error?: string; details?: string };

      const msg = [err.message, err.error, err.details].filter(Boolean).join(" — ");

      if (msg) return msg;

    } catch {

      const rateLimit = parseAIRateLimitPayload(raw);

      if (rateLimit) return getAIRateLimitUserMessage(rateLimit);

    }

  }

  return `Erreur generate-artist-bio (${status}).`;

}



type BioRequestBody = {

  prenom: string;

  nom: string;

  art_types: string[];

  lang: Language;

  source_bio?: string;

};



/**

 * Appel direct fetch (lecture `response.text()` complète) — évite toute troncature

 * côté `functions.invoke`.

 */

async function generateBiographyForLanguage(

  args: GenerateBiographyArgs,

  lang: Language,

  sourceBio?: string,

): Promise<string> {

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !anonKey) {

    throw new Error("Configuration Supabase manquante (URL ou ANON KEY).");

  }



  const { data: sessionData } = await supabase.auth.getSession();

  const accessToken = sessionData.session?.access_token?.trim() || anonKey;



  const body: BioRequestBody = {

    prenom: args.prenom,

    nom: args.name,

    art_types: args.artTypes,

    lang,

  };

  if (sourceBio?.trim() && lang !== "fr") {

    body.source_bio = sourceBio.trim();

  }



  const response = await fetch(`${supabaseUrl}/functions/v1/generate-artist-bio`, {

    method: "POST",

    headers: {

      "Content-Type": "application/json",

      apikey: anonKey,

      Authorization: `Bearer ${accessToken}`,

    },

    body: JSON.stringify(body),

  });



  const raw = await response.text();

  let parsed: { bio?: string; error?: string; details?: string; message?: string } | null = null;

  try {

    parsed = raw ? (JSON.parse(raw) as typeof parsed) : null;

  } catch {

    parsed = null;

  }



  if (!response.ok) {

    throw new Error(parseBioError(raw, response.status));

  }



  const bio = parsed?.bio?.trim() ?? "";

  if (!bio) {

    throw new Error("Réponse vide de generate-artist-bio.");

  }

  return bio;

}



function isBioTruncated(bio: string): boolean {
  const text = bio.trim();
  if (!text) return true;
  if (text.length < MIN_BIO_CHARS) return true;
  const lastChar = text.replace(/\s+$/u, "").slice(-1);
  return !/[.!?…»]/.test(lastChar);
}

async function generateWithShortRetry(
  args: GenerateBiographyArgs,
  lang: Language,
  sourceBio?: string,
): Promise<string> {
  let bio = await generateBiographyForLanguage(args, lang, sourceBio);
  let retries = 0;

  while (isBioTruncated(bio) && retries < MAX_SHORT_RETRIES) {
    retries += 1;
    await sleep(BIO_CALL_GAP_MS);
    bio = await generateBiographyForLanguage(args, lang, sourceBio);
  }

  return bio;
}



/** Génère une bio FR complète puis traduit vers les autres langues (longueurs homogènes). */

export async function generateMultilingualBiographyWithGrok(

  args: GenerateBiographyArgs,

): Promise<Record<Language, string>> {

  const result = {} as Record<Language, string>;



  result.fr = await generateWithShortRetry(args, "fr");



  const translationLangs = ARTIST_BIO_LANGUAGES.filter((lang) => lang !== "fr");

  for (let i = 0; i < translationLangs.length; i += 1) {

    const lang = translationLangs[i];

    await sleep(BIO_CALL_GAP_MS);

    result[lang] = await generateWithShortRetry(args, lang, result.fr);

  }



  dispatchAiUsageRefresh();



  return result;

}

