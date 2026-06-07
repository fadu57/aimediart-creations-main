import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";
import { normalizeMediationMarkdownSource } from "@/lib/normalizeMediationMarkdown";

type VisitorMediationMarkdownProps = {
  text: string;
  /** Poète / vers : chaque retour ligne devient un saut (remark-breaks), en plus du Markdown standard. */
  verseMode?: boolean;
  className?: string;
};

/**
 * Affichage Markdown léger pour les textes de médiation (page visiteur).
 * Respecte les sauts « double espace + retour ligne » et les lignes vides entre strophes.
 */
export function VisitorMediationMarkdown({ text, verseMode = false, className }: VisitorMediationMarkdownProps) {
  const source = useMemo(() => normalizeMediationMarkdownSource(text), [text]);

  const remarkPlugins = useMemo(() => (verseMode ? [remarkBreaks] : []), [verseMode]);

  if (!source) return null;

  return (
    <div
      className={cn(
        "visitor-mediation-markdown text-sm leading-5 text-[#F0F0F0]/90",
        "[&_p]:mb-3 [&_p:last-child]:mb-0",
        "[&_strong]:font-semibold [&_em]:italic",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={{
          pre: () => null,
          p: ({ children }) => (
            <p className="text-sm leading-5 text-[#F0F0F0]/90" style={{ letterSpacing: "-0.3px" }}>{children}</p>
          ),
          code: ({ children }) => <span className="font-normal">{children}</span>,
          a: ({ href, children }) => (
            <a href={href} className="underline text-[#E63946]" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
