import type { ReactNode } from "react";

const AIMEDIART_COM = /(Aimediart\.com)/gi;

function isAimediartDotCom(part: string): boolean {
  return /^Aimediart\.com$/i.test(part);
}

/**
 * Met en évidence « Aimediart.com » dans une chaîne i18n (pages légales, etc.).
 */
export function highlightAimediartCom(text: string): ReactNode {
  const parts = text.split(AIMEDIART_COM);
  if (parts.length === 1) {
    return text;
  }
  return (
    <>
      {parts.map((part, i) =>
        isAimediartDotCom(part) ? (
          <span key={i} className="font-semibold text-[#E63946]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
