type StyleInput = {
  key: string;
  label: string;
};

type GeneratedPayload = Record<string, string>;

/**
 * Génère 8 médiations textuelles depuis une "matière brute".
 * Réponse attendue: JSON objet avec une clé par style.
 */
export async function generateArtworkMediationsWithGrok(params: {
  artworkTitle: string;
  artistLabel: string;
  sourceMaterial: string;
  styles: StyleInput[];
}): Promise<GeneratedPayload> {
  const apiKey = import.meta.env.VITE_XAI_API_KEY;
  if (!apiKey) {
    throw new Error("Variable VITE_XAI_API_KEY manquante.");
  }
  if (!params.sourceMaterial.trim()) {
    throw new Error("La matière brute est vide.");
  }
  if (params.styles.length !== 8) {
    throw new Error("Il faut exactement 8 styles de médiation.");
  }

  const stylesJson = JSON.stringify(params.styles);
  const prompt = [
    "Tu es un médiateur culturel expert.",
    `Œuvre: ${params.artworkTitle || "Sans titre"}`,
    `Artiste: ${params.artistLabel || "Artiste non renseigné"}`,
    "Matière brute:",
    params.sourceMaterial,
    "Consignes obligatoires:",
    "- Produis un JSON strict (sans markdown).",
    "- Le JSON doit contenir exactement ces clés de styles:",
    stylesJson,
    "- Pour chaque clé, écrire un texte en français de 250 à 600 caractères.",
    "- Ne pas inventer de faits non présents dans la matière brute.",
  ].join("\n");

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-2-latest",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3200,
      temperature: 0.45,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Erreur API xAI (${response.status})`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Réponse vide de l'API xAI.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Réponse IA non JSON. Réessayez.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Format JSON invalide.");
  }
  return parsed as GeneratedPayload;
}

