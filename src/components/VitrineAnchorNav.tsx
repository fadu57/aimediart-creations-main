import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export const VITRINE_ANCHOR_IDS = [
  "accueil",
  "exposition-vivante",
  "parcours",
  "tarifs",
  "accessibilite",
  "connectivite",
] as const;

type VitrineAnchorNavProps = {
  vitrinePathPrefix: "" | "/organisation";
  variant?: "floating" | "header";
  align?: "center" | "end";
  className?: string;
  onNavigate?: () => void;
};

function scrollToVitrineAnchor(anchorId: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = anchorId;

  const tryScroll = (attempt = 0) => {
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (attempt < 30) {
      window.setTimeout(() => tryScroll(attempt + 1), 50);
    }
  };

  tryScroll();
}

export function VitrineAnchorNav({
  vitrinePathPrefix,
  variant = "floating",
  align = "center",
  className,
  onNavigate,
}: VitrineAnchorNavProps) {
  const { t } = useTranslation("home");

  const itemClassName =
    variant === "header"
      ? "group inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight text-foreground/85 transition-colors hover:bg-neutral-100 lg:text-[12px]"
      : "group inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium text-foreground/85 transition-colors hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-ring lg:gap-0.5 lg:rounded lg:px-1 lg:py-0.5 lg:text-[11px] lg:leading-tight xl:px-1.5 xl:text-[12px]";

  const navLayoutClassName =
    variant === "header"
      ? cn(
          "flex flex-nowrap items-center gap-0.5",
          align === "end" ? "justify-end" : "justify-center",
        )
      : "flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-0";

  return (
    <nav aria-label={t("nav.public_vitrine")} className={cn(navLayoutClassName, className)}>
      {VITRINE_ANCHOR_IDS.map((id) => {
        const label = t(`nav.anchor_${id.replace(/-/g, "_")}`);
        const dot = (
          <span
            className={cn(
              "shrink-0 rounded-full bg-neutral-300 transition-colors group-hover:bg-[#E63946]",
              variant === "header" ? "h-1.5 w-1.5" : "h-2 w-2 lg:h-1.5 lg:w-1.5",
            )}
            aria-hidden
          />
        );

        if (vitrinePathPrefix) {
          return (
            <Link
              key={id}
              to={`${vitrinePathPrefix}#${id}`}
              className={itemClassName}
              onClick={(e) => {
                const onSamePage =
                  vitrinePathPrefix === "/organisation"
                    ? window.location.pathname === "/organisation"
                    : window.location.pathname === vitrinePathPrefix;
                if (onSamePage) {
                  e.preventDefault();
                  scrollToVitrineAnchor(id);
                }
                onNavigate?.();
              }}
            >
              {dot}
              {label}
            </Link>
          );
        }

        return (
          <a
            key={id}
            href={`#${id}`}
            className={itemClassName}
            onClick={(e) => {
              e.preventDefault();
              scrollToVitrineAnchor(id);
              onNavigate?.();
            }}
          >
            {dot}
            {label}
          </a>
        );
      })}
    </nav>
  );
}
