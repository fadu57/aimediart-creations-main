import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  ArchiveRestore,
  BarChart3,
  BrainCircuit,
  ChevronDown,
  Clock,
  Coins,
  Database,
  Euro,
  Settings,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuthUser } from "@/hooks/useAuthUser";

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

/** Page « Accès » (matrice des droits) — réservée aux admins (rôles 1-3). */
const ACCES_LINK = { to: "/settings/acces", labelKey: "settings_submenu_acces", Icon: Shield } as const;

/** Sous-menu « IA » : Prompts + Contrôle — réservé aux admins (rôles 1-3). */
const IA_LINKS = [
  { to: "/settings/prompts-ia", labelKey: "settings_submenu_ia_prompts", Icon: BrainCircuit },
  { to: "/settings/controle-ia", labelKey: "settings_submenu_ia_controle", Icon: Sparkles },
] as const;

const SUIVI_LINKS = [
  { to: "/settings/couts", labelKey: "settings_submenu_couts", Icon: Euro },
  { to: "/suivi_tokens", labelKey: "settings_submenu_suivi_tokens", Icon: Coins },
  { to: "/suivi_temps", labelKey: "settings_submenu_suivi_temps", Icon: Clock },
  { to: "/suivi_supabase", labelKey: "settings_submenu_supabase_db", Icon: Database },
] as const;

const ERROR_LOG_LINKS = [
  { to: "/suivi_erreurs_visiteurs", labelKey: "settings_submenu_error_logs_visitors" },
  { to: "/suivi_erreurs_organisateurs", labelKey: "settings_submenu_error_logs_organizers" },
] as const;

const ONLINE_PRESENCE_LINK = {
  to: "/settings/qui-est-en-ligne",
  labelKey: "settings_submenu_online_presence",
  Icon: Users,
} as const;

type FabSection = "ia" | "suivis" | "errors" | "trash";

type SettingsMenuDropdownProps = {
  triggerClassName?: string;
  variant?: "header" | "fab";
  onNavigate?: () => void;
};

function resolveInitialFabSection(
  iaActive: boolean,
  suiviActive: boolean,
  errorLogsActive: boolean,
  trashActive: boolean,
): FabSection | null {
  if (iaActive) return "ia";
  if (suiviActive) return "suivis";
  if (errorLogsActive) return "errors";
  if (trashActive) return "trash";
  return null;
}

const fabRowClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted/60";
const fabSubLinkClass =
  "flex items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-xs hover:bg-muted/60";

export function SettingsMenuDropdown({
  triggerClassName,
  variant = "header",
  onNavigate,
}: SettingsMenuDropdownProps) {
  const { t } = useTranslation("header");
  const location = useLocation();
  const { role_id } = useAuthUser();
  const showOnlinePresence = role_id === 1;
  const showConfigLinks = typeof role_id === "number" && role_id >= 1 && role_id <= 3;

  const accesActive = location.pathname.startsWith(ACCES_LINK.to);
  const iaActive = IA_LINKS.some((link) => location.pathname.startsWith(link.to));
  const configActive = accesActive || iaActive;
  const suiviActive =
    SUIVI_LINKS.some((link) => location.pathname.startsWith(link.to)) ||
    (showOnlinePresence && location.pathname.startsWith(ONLINE_PRESENCE_LINK.to));
  const errorLogsActive = ERROR_LOG_LINKS.some((link) => location.pathname.startsWith(link.to));
  const trashActive = SETTINGS_TRASH_MENU_LINKS.some((link) => location.pathname.startsWith(link.to));
  const paramsActive = location.pathname === "/settings";
  const menuActive = paramsActive || configActive || suiviActive || errorLogsActive || trashActive;

  const [openFabSection, setOpenFabSection] = useState<FabSection | null>(() =>
    resolveInitialFabSection(iaActive, suiviActive, errorLogsActive, trashActive),
  );

  const toggleFabSection = (section: FabSection) => {
    setOpenFabSection((prev) => (prev === section ? null : section));
  };

  const handleFabNavigate = () => {
    onNavigate?.();
  };

  if (variant === "fab") {
    return (
      <div className="fab-settings-group">
        <NavLink
          to="/settings"
          className={cn(
            fabRowClass,
            paramsActive && "font-medium text-[#E63946]",
          )}
          onClick={handleFabNavigate}
        >
          <Settings className="h-5 w-5 shrink-0 text-[#121212]" aria-hidden />
          <span>{t("settings_submenu_params")}</span>
        </NavLink>

        {showConfigLinks && (
          <>
            <NavLink
              to={ACCES_LINK.to}
              className={cn(fabRowClass, accesActive && "font-medium text-[#E63946]")}
              onClick={handleFabNavigate}
            >
              <ACCES_LINK.Icon className="h-5 w-5 shrink-0 text-[#121212]" aria-hidden />
              <span>{t(ACCES_LINK.labelKey)}</span>
            </NavLink>

            <button
              type="button"
              className={cn(fabRowClass, iaActive && "text-[#E63946]")}
              aria-expanded={openFabSection === "ia"}
              onClick={() => toggleFabSection("ia")}
            >
              <BrainCircuit className="h-5 w-5 shrink-0 text-[#121212]" aria-hidden />
              <span className="flex-1">{t("settings_submenu_ia")}</span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", openFabSection === "ia" && "rotate-180")}
                aria-hidden
              />
            </button>
            {openFabSection === "ia" && (
              <div className="flex flex-col gap-0.5 pb-1">
                {IA_LINKS.map(({ to, labelKey, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={cn(fabSubLinkClass, location.pathname.startsWith(to) && "font-medium text-[#E63946]")}
                    onClick={handleFabNavigate}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#121212]" aria-hidden />
                    {t(labelKey)}
                  </NavLink>
                ))}
              </div>
            )}
          </>
        )}

        <button
          type="button"
          className={cn(fabRowClass, suiviActive && "text-[#E63946]")}
          aria-expanded={openFabSection === "suivis"}
          onClick={() => toggleFabSection("suivis")}
        >
          <BarChart3 className="h-5 w-5 shrink-0 text-[#121212]" aria-hidden />
          <span className="flex-1">{t("settings_submenu_suivis")}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", openFabSection === "suivis" && "rotate-180")}
            aria-hidden
          />
        </button>
        {openFabSection === "suivis" && (
          <div className="flex flex-col gap-0.5 pb-1">
            {SUIVI_LINKS.map(({ to, labelKey, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  fabSubLinkClass,
                  location.pathname.startsWith(to) && "font-medium text-[#E63946]",
                )}
                onClick={handleFabNavigate}
              >
                <Icon className="h-4 w-4 shrink-0 text-[#121212]" aria-hidden />
                {t(labelKey)}
              </NavLink>
            ))}
            {showOnlinePresence && (
              <NavLink
                to={ONLINE_PRESENCE_LINK.to}
                className={cn(
                  fabSubLinkClass,
                  location.pathname.startsWith(ONLINE_PRESENCE_LINK.to) && "font-medium text-[#E63946]",
                )}
                onClick={handleFabNavigate}
              >
                <ONLINE_PRESENCE_LINK.Icon className="h-4 w-4 shrink-0 text-[#121212]" aria-hidden />
                {t(ONLINE_PRESENCE_LINK.labelKey)}
              </NavLink>
            )}
          </div>
        )}

        <button
          type="button"
          className={cn(fabRowClass, errorLogsActive && "text-[#E63946]")}
          aria-expanded={openFabSection === "errors"}
          onClick={() => toggleFabSection("errors")}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-[#121212]" aria-hidden />
          <span className="flex-1">{t("settings_submenu_error_logs")}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", openFabSection === "errors" && "rotate-180")}
            aria-hidden
          />
        </button>
        {openFabSection === "errors" && (
          <div className="flex flex-col gap-0.5 pb-1">
            {ERROR_LOG_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={cn(
                  fabSubLinkClass,
                  location.pathname.startsWith(link.to) && "font-medium text-[#E63946]",
                )}
                onClick={handleFabNavigate}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#121212]" aria-hidden />
                {t(link.labelKey)}
              </NavLink>
            ))}
          </div>
        )}

        <button
          type="button"
          className={cn(fabRowClass, trashActive && "text-[#E63946]")}
          aria-expanded={openFabSection === "trash"}
          onClick={() => toggleFabSection("trash")}
        >
          <ArchiveRestore className="h-5 w-5 shrink-0 text-[#121212]" aria-hidden />
          <span className="flex-1">{t("settings_submenu_trash")}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", openFabSection === "trash" && "rotate-180")}
            aria-hidden
          />
        </button>
        {openFabSection === "trash" && (
          <div className="flex flex-col gap-0.5 pb-1">
            {SETTINGS_TRASH_MENU_LINKS.map((link) => (
              <Link
                key={link.id}
                to={link.to}
                className={cn(
                  fabSubLinkClass,
                  location.pathname.startsWith(link.to) && "font-medium text-[#E63946]",
                )}
                onClick={handleFabNavigate}
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </div>
        )}
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

        {showConfigLinks && (
          <>
            <DropdownMenuItem asChild>
              <Link
                to={ACCES_LINK.to}
                className={cn("flex items-center gap-2", accesActive && "font-medium text-[#E63946]")}
              >
                <ACCES_LINK.Icon className="h-4 w-4 opacity-70" aria-hidden />
                {t(ACCES_LINK.labelKey)}
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className={cn("flex items-center gap-2", iaActive && "text-[#E63946] focus:text-[#E63946]")}
              >
                <BrainCircuit className="h-4 w-4 opacity-70" aria-hidden />
                {t("settings_submenu_ia")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {IA_LINKS.map(({ to, labelKey, Icon }) => (
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
          </>
        )}

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
            {showOnlinePresence && (
              <DropdownMenuItem asChild>
                <Link
                  to={ONLINE_PRESENCE_LINK.to}
                  className={cn(
                    "flex items-center gap-2",
                    location.pathname.startsWith(ONLINE_PRESENCE_LINK.to) && "font-medium text-[#E63946]",
                  )}
                >
                  <ONLINE_PRESENCE_LINK.Icon className="h-4 w-4 opacity-70" aria-hidden />
                  {t(ONLINE_PRESENCE_LINK.labelKey)}
                </Link>
              </DropdownMenuItem>
            )}
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
