import { supabase } from "@/lib/supabase";
import { dispatchAiUsageRefresh } from "@/lib/aiUsageRefresh";
import type { Language } from "@/hooks/useArtistBios";

type GenerateBiographyArgs = {
  prenom: string;
  name: string;
  artTypes: string[];
};

export async function generateMultilingualBiographyWithGrok(
  args: GenerateBiographyArgs,
): Promise<Record<Language, string>> {
  const { data, error } = await supabase.functions.invoke("generate-artist-bio", {
    body: args,
  });

  if (error) {
    const maybeMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Appel à generate-artist-bio impossible.";

    throw new Error(maybeMessage);
  }

  const bios = data as Partial<Record<Language, string>> | null;

  dispatchAiUsageRefresh();

  return {
    fr: bios?.fr?.trim() || "",
    en: bios?.en?.trim() || "",
    es: bios?.es?.trim() || "",
    de: bios?.de?.trim() || "",
    it: bios?.it?.trim() || "",
  };
}