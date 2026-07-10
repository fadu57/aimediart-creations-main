import { Heart } from "lucide-react";

import { AIMEDIART_LOGO_RED } from "@/lib/aimediartBrandLogo";
import { cn } from "@/lib/utils";

export type AimediartBrandLogoBlockProps = {
  className?: string;
  /** sm = pages visiteur / header compact ; md = bandeau standard */
  size?: "sm" | "md";
  /** @deprecated Préférer size="sm" */
  compact?: boolean;
  /** Masquer les textes en dessous du breakpoint sm (header desktop). */
  hideTextBelowSm?: boolean;
  /** Animation pulsation du cœur. */
  animateHeart?: boolean;
  /** Fond semi-transparent (scanner, cartes visiteur). */
  backdrop?: boolean;
};

const SIZE = {
  sm: {
    box: "h-8 w-8",
    heart: "h-4 w-4",
    title: "text-[0.7rem] sm:text-[0.75rem]",
    subtitle: "mt-px text-[8px] sm:text-[10px]",
    gap: "gap-1.5 sm:gap-2",
  },
  md: {
    box: "h-10 w-10",
    heart: "h-6 w-6",
    title: "text-[0.9rem] sm:text-[1rem]",
    subtitle: "text-[9px] sm:text-[10px]",
    gap: "gap-1.5 sm:gap-2",
  },
} as const;

/** Bloc logo marque AIMEDIArt — carré rouge, cœur, textes. Source visuelle alignée sur l’export SVG/PDF. */
export function AimediartBrandLogoBlock({
  className,
  size,
  compact = false,
  hideTextBelowSm = false,
  animateHeart = false,
  backdrop = false,
}: AimediartBrandLogoBlockProps) {
  const resolvedSize = size ?? (compact ? "sm" : "md");
  const tokens = SIZE[resolvedSize];

  const heartIcon = (
    <Heart
      className={cn("text-white", tokens.heart)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      aria-hidden
    />
  );

  const content = (
    <>
      <div
        className={cn("flex shrink-0 items-center justify-center rounded-[15%] shadow-sm", tokens.box)}
        style={{ backgroundColor: AIMEDIART_LOGO_RED }}
        aria-hidden
      >
        {animateHeart ? <span className="inline-flex animate-logo-heart">{heartIcon}</span> : heartIcon}
      </div>
      <div
        className={cn(
          "min-w-0 flex flex-col items-start justify-center leading-tight",
          hideTextBelowSm && resolvedSize === "md" ? "hidden sm:flex" : "flex",
        )}
      >
        <span
          className={cn("block whitespace-nowrap font-sans font-bold tracking-tight", tokens.title)}
          style={{ color: AIMEDIART_LOGO_RED }}
        >
          AIMEDIArt.com
        </span>
        <span
          className={cn("block whitespace-nowrap font-sans font-bold italic leading-snug", tokens.subtitle)}
          style={{ color: AIMEDIART_LOGO_RED }}
        >
          Art-mediation with AI
        </span>
      </div>
    </>
  );

  const rowClassName = cn("flex min-w-0 items-center", tokens.gap, backdrop && "px-1 py-0.5");

  if (backdrop) {
    return (
      <div className={cn("inline-flex rounded bg-background/80 backdrop-blur-sm", className)}>
        <div className={rowClassName}>{content}</div>
      </div>
    );
  }

  return <div className={cn(rowClassName, className)}>{content}</div>;
}
