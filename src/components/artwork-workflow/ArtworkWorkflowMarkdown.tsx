import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

import { normalizeMediationMarkdownSource } from "@/lib/normalizeMediationMarkdown";
import { cn } from "@/lib/utils";

type ArtworkWorkflowMarkdownProps = {
  text: string;
  className?: string;
  /** Limite la hauteur avec défilement (aperçu cliquable). */
  clampPreview?: boolean;
  /** Poète / hip-hop : chaque retour ligne devient un saut (remark-breaks). */
  verseMode?: boolean;
};

export function ArtworkWorkflowMarkdown({
  text,
  className,
  clampPreview = false,
  verseMode = false,
}: ArtworkWorkflowMarkdownProps) {
  const source = useMemo(() => normalizeMediationMarkdownSource(text), [text]);
  const remarkPlugins = useMemo(() => (verseMode ? [remarkBreaks] : []), [verseMode]);
  if (!source) return null;

  return (
    <div
      className={cn(
        "max-w-none text-sm leading-relaxed text-foreground break-words",
        // Pas de classe `prose` : ses marges haut+bas sur chaque <p> doublent l'interlignage.
        "[&_p]:mt-0 [&_p]:mb-1.5 [&_p:last-child]:mb-0",
        "[&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5",
        "[&_strong]:font-semibold [&_em]:italic",
        clampPreview && "max-h-40 overflow-y-auto",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins}>{source}</ReactMarkdown>
    </div>
  );
}

/** Personas dont les sauts de ligne doivent être respectés à l'affichage. */
export function isVerseMediationStyleKey(styleKey: string): boolean {
  const key = styleKey.trim().toLowerCase();
  return key === "poetique" || key === "hip-hopeur" || key === "conteur";
}
