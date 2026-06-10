import { Link, NavLink, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  ArchiveRestore,
  BarChart3,
  ChevronDown,
  Clock,
  Coins,
  Euro,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SETTINGS_TRASH_MENU_LINKS } from "@/lib/trashMenuLinks";
import { cn } from "@/lib/utils";

const SUIVI_LINKS = [
  { to: "/settings/couts", labelKey: "settings_submenu_couts", Icon: Euro },
  { to: "/suivi_tokens", labelKey: "settings_submenu_suivi_tokens", Icon: Coins },
  { to: "/suivi_temps", labelKey: "settings_submenu_suivi_temps", Icon: Clock },
] as const;

const ERROR_LOG_LINKS = [
  { to: "/suivi_erreurs_visiteurs", labelKey: "settings_submenu_error_logs_visitors" },
  { to: "/suivi_erreurs_organisateurs", labelKey: "settings_submenu_error_logs_organizers" },
] as const;

type SettingsMenuDropdownProps = {
  triggerClassName?: string;
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

  const suiviActive = SUIVI_LINKS.some((link) => location.pathname.startsWith(link.to));
  const errorLogsActive = ERROR_LOG_LINKS.some((link) => location.pathname.startsWith(link.to));
  const trashActive = SETTINGS_TRASH_MENU_LINKS.some((link) => location.pathname.startsWith(link.to));
  const paramsActive = location.pathname === "/settings";
  const menuActive = paramsActive || suiviActive || errorLogsActive || trashActive;

  if (variant === "fab") {
    return (
      <div className="fab-item flex-col items-stretch gap-1 px-2 py-2">
        <NavLink
          to="/settings"
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted/60",
            paramsActive && "font-medium text-[#E63946]",
          )}
          onClick={onNavigate}
        >
          <Settings className="h-5 w-5 shrink-0 text-[#121212]" aria-hidden />
          <span>{t("settings_submenu_params")}</span>
        </NavLink>

        <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings_submenu_suivis")}
        </p>
        {SUIVI_LINKS.map(({ to, labelKey, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={cn(
              "flex items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-xs hover:bg-muted/60",
              location.pathname.startsWith(to) && "font-medium text-[#E63946]",
            )}
            onClick={onNavigate}
          >
            <Icon className="h-4 w-4 shrink-0 text-[#121212]" aria-hidden />
            {t(labelKey)}
          </NavLink>
        ))}

        <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings_submenu_error_logs")}
        </p>
        {ERROR_LOG_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={cn(
              "flex items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-xs hover:bg-muted/60",
              location.pathname.startsWith(link.to) && "font-medium text-[#E63946]",
            )}
            onClick={onNavigate}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#121212]" aria-hidden />
            {t(link.labelKey)}
          </NavLink>
        ))}

        <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings_submenu_trash")}
        </p>
        {SETTINGS_TRASH_MENU_LINKS.map((link) => (
          <Link
            key={link.id}
            to={link.to}
            className={cn(
              "flex items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-xs hover:bg-muted/60",
              location.pathname.startsWith(link.to) && "font-medium text-[#E63946]",
            )}
            onClick={onNavigate}
          >
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
          menuActive ? "bg-[#E63946] text-white" : "text-foreground hover:bg-muted",
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
          <Link
            to="/settings"
            className={cn(paramsActive && "font-medium text-[#E63946]")}
          >
            {t("settings_submenu_params")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            className={cn(
              "flex items-center gap-2",
              suiviActive && "text-[#E63946] focus:text-[#E63946]",
            )}
          >
            <BarChart3 className="h-4 w-4 opacity-70" aria-hidden />
            {t("settings_submenu_suivis")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {SUIVI_LINKS.map(({ to, labelKey, Icon }) => (
              <DropdownMenuItem key={to} asChild>
                <Link
                  to={to}
                  className={cn(
                    "flex items-center gap-2",
                    location.pathname.startsWith(to) && "font-medium text-[#E63946]",
                  )}
                >
                  <Icon className="h-4 w-4 opacity-70" aria-hidden />
                  {t(labelKey)}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            className={cn(
              "flex items-center gap-2",
              errorLogsActive && "text-[#E63946] focus:text-[#E63946]",
            )}
          >
            <AlertTriangle className="h-4 w-4 opacity-70" aria-hidden />
            {t("settings_submenu_error_logs")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ERROR_LOG_LINKS.map((link) => (
              <DropdownMenuItem key={link.to} asChild>
                <Link
                  to={link.to}
                  className={cn(
                    location.pathname.startsWith(link.to) && "font-medium text-[#E63946]",
                  )}
                >
                  {t(link.labelKey)}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            className={cn(
              "flex items-center gap-2",
              trashActive && "text-[#E63946] focus:text-[#E63946]",
            )}
          >
            <ArchiveRestore className="h-4 w-4 opacity-70" aria-hidden />
            {t("settings_submenu_trash")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {SETTINGS_TRASH_MENU_LINKS.map((link) => (
              <DropdownMenuItem key={link.id} asChild>
                <Link
                  to={link.to}
                  className={cn(
                    location.pathname.startsWith(link.to) && "text-[#E63946] font-medium",
                  )}
                >
                  {t(link.labelKey)}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
