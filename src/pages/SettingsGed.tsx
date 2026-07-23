import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, FolderOpen } from "lucide-react";

import { AimediartDocumentsPanel } from "@/components/settings/AimediartDocumentsPanel";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";

/** G.E.D. — réservée aux admins globaux (role_id 1–3). */
export default function SettingsGed() {
  const { t } = useTranslation("settings");
  const { role_id, role_name } = useAuthUser();

  const canAccess =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 3) ||
    (role_id == null && hasFullDataAccess(role_name));

  return (
    <div className="w-full min-w-0 px-2 py-6 space-y-3 sm:px-3">
      <div className="flex flex-col gap-2">
        <Link
          to="/settings"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          {t("subpage_back_settings")}
        </Link>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight">
          <FolderOpen className="h-6 w-6 text-primary" aria-hidden />
          {t("aimediart_docs.panel_title")}
        </h1>
      </div>

      {!canAccess ? (
        <p className="text-sm text-muted-foreground">{t("subpage_no_access")}</p>
      ) : (
        <AimediartDocumentsPanel hideTitle />
      )}
    </div>
  );
}
