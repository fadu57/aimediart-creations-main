/** Utilitaires partagés entre le tableau de bord stats et le rapport PDF/impression. */

/** Convertit un nom d’émotion DB en clé i18n stable, ex. "Ébloui.e" → "eblouie" */
export function normalizeEmotionKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

/** Icône affichée (émoji DB ou repli) — aligné sur le tableau croisé. */
export function emotionEmojiForPreview(name: string, icon?: string | null): string {
  if (name.toLowerCase().includes("troublé")) return "😵‍💫";
  const t = (icon || "").trim();
  return t || "✨";
}
