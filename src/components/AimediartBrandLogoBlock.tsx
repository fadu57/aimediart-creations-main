import { Heart } from "lucide-react";

import { AIMEDIART_LOGO_RED } from "@/lib/aimediartBrandLogo";
import { cn } from "@/lib/utils";

type AimediartBrandLogoBlockProps = {
  className?: string;
  compact?: boolean;
  /** Masquer les textes en dessous du breakpoint sm (comme le Header desktop). */
  hideTextBelowSm?: boolean;
  /** Animation pulsation du cœur (Header connecté). */
  animateHeart?: boolean;
};

/** Bloc logo marque (carré rouge + textes) — même rendu Header et référence export PDF. */
export function AimediartBrandLogoBlock({
  className,
  compact = false,
  hideTextBelowSm = false,
  animateHeart = false,
}: AimediartBrandLogoBlockProps) {
  const heartIcon = (
    <Heart
      className={cn("text-white", compact ? "h-4 w-4" : "h-6 w-6")}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      aria-hidden
    />
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 sm:gap-2", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[15%] shadow-sm",
          compact ? "h-8 w-8" : "h-10 w-10",
        )}
        style={{ backgroundColor: AIMEDIART_LOGO_RED }}
        aria-hidden
      >
        {animateHeart ? <span className="inline-flex animate-logo-heart">{heartIcon}</span> : heartIcon}
      </div>
      <div
        className={cn(
          "min-w-0 flex flex-col items-start justify-center leading-tight",
          hideTextBelowSm && !compact ? "hidden sm:flex" : "flex",
        )}
      >
        <span
          className={cn(
            "block whitespace-nowrap font-sans font-bold tracking-tight",
            compact ? "text-[0.7rem] sm:text-[0.75rem]" : "text-[0.9rem] sm:text-[1rem]",
          )}
          style={{ color: AIMEDIART_LOGO_RED }}
        >
          AIMEDIArt.com
        </span>
        <span
          className={cn(
            "block w-full font-sans font-bold italic leading-snug",
            compact ? "mt-px text-[8px] sm:text-[10px]" : "text-[9px] sm:text-[10px]",
          )}
          style={{ color: AIMEDIART_LOGO_RED }}
        >
          Art-mediation with AI
        </span>
      </div>
    </div>
  );
}
