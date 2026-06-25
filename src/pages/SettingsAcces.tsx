import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Shield } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SecurityAccessPanel } from "@/components/settings/SecurityAccessPanel";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";

export default function SettingsAcces() {
  const { t } = useTranslation("settings");
  const { role_id, role_name } = useAuthUser();

  const canAccess =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 3) ||
    (role_id == null && hasFullDataAccess(role_name));

  return (
    <div className="container py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden />
              {t("subpage_back_settings")}
            </Link>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-serif font-bold tracking-tight">
            <Shield className="h-6 w-6 text-primary" aria-hidden />
            {t("section_security_title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("section_security_desc")}</p>
        </div>
      </div>

      <Card className="border border-border/50 bg-white/80 shadow-none">
        <CardContent className="p-4 md:p-6">
          {canAccess ? (
            <SecurityAccessPanel />
          ) : (
            <p className="text-sm text-muted-foreground">{t("subpage_no_access")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
