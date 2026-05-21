import { Link, NavLink, useLocation } from "react-router-dom";
import { ArchiveRestore, ChevronDown, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SETTINGS_TRASH_MENU_LINKS } from "@/lib/trashMenuLinks";
import { cn } from "@/lib/utils";

type SettingsMenuDropdownProps = {
  /** Classes appliquées au bouton déclencheur (header desktop). */
  triggerClassName?: string;
  /** Variante mobile FAB : liste verticale sans dropdown Radix. */
  variant?: "header" | "fab";
  onNavigate?: () => void;
};

export function SettingsMenuDropdown({
  triggerClassName,
  variant = "header",
  onNavigate,
}: SettingsMenuDropdownProps) {
  const { t } = useTranslation("header");
  const location = useLocation();
  const settingsActive = location.pathname.startsWith("/settings");
  const trashActive = SETTINGS_TRASH_MENU_LINKS.some((link) => location.pathname.startsWith(link.to));

  if (variant === "fab") {
    return (
      <div className="fab-item flex-col items-stretch gap-1 px-2 py-2">
        <NavLink
          to="/settings"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted/60"
          onClick={onNavigate}
        >
          <Settings className="h-5 w-5 shrink-0 text-[#121212]" aria-hidden />
          <span>{t("settings")}</span>
        </NavLink>
        <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings_submenu_trash")}
        </p>
        {SETTINGS_TRASH_MENU_LINKS.map((link) => (
          <Link
            key={link.id}
            to={link.to}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
            onClick={onNavigate}
          >
            <ArchiveRestore className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            {t(link.labelKey)}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center justify-center gap-0.5 rounded-md px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          settingsActive || trashActive
            ? "bg-[#E63946] text-white"
            : "text-foreground hover:bg-muted",
          triggerClassName,
        )}
        aria-label={t("settings")}
        title={t("settings")}
      >
        <Settings className="h-5 w-5" aria-hidden />
        <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("settings")}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/settings">{t("settings_submenu_params")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("settings_submenu_trash")}
        </DropdownMenuLabel>
        {SETTINGS_TRASH_MENU_LINKS.map((link) => (
          <DropdownMenuItem key={link.id} asChild>
            <Link to={link.to} className="flex items-center gap-2">
              <ArchiveRestore className="h-4 w-4 opacity-70" aria-hidden />
              {t(link.labelKey)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
