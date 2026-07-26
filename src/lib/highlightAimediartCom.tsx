import type { ReactNode } from "react";

const AIMEDIART_COM = /(AIMEDIArt\.com)/gi;
const BRAND_TAGS = /<\/?brand>/gi;

function isAimediartDotCom(part: string): boolean {
  return /^AIMEDIArt\.com$/i.test(part);
}

/**
 * Met en évidence « AIMEDIArt.com » (gras + rouge) dans une chaîne i18n.
 * Ignore aussi les balises legacy &lt;brand&gt;…&lt;/brand&gt; si présentes.
 */
export function highlightAimediartCom(text: string): ReactNode {
  const cleaned = text.replace(BRAND_TAGS, "");
  const parts = cleaned.split(AIMEDIART_COM);
  if (parts.length === 1) {
    return cleaned;
  }
  return (
    <>
      {parts.map((part, i) =>
        isAimediartDotCom(part) ? (
          <span key={i} className="font-bold text-[#E63946]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
