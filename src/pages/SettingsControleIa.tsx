import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AiModelControlPanel } from "@/components/settings/AiModelControlPanel";
import AppSettingsRawEditor from "@/components/settings/AppSettingsRawEditor";
import { supabase } from "@/lib/supabase";
import { AI_APP_SETTINGS_KEY_LIST } from "@/lib/settingsKeys";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";

type AppSettingRow = Record<string, unknown>;

export default function SettingsControleIa() {
  const { t } = useTranslation("settings");
  const { role_id, role_name } = useAuthUser();

  const canAccess =
    (typeof role_id === "number" && role_id >= 1 && role_id <= 3) ||
    (role_id == null && hasFullDataAccess(role_name));

  const [appSettingsRows, setAppSettingsRows] = useState<AppSettingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value, max_caract, max_tokens")
      .order("key", { ascending: true });
    if (!error) setAppSettingsRows((data as AppSettingRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadRows();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadRows]);

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
            <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            {t("section_ai_control_title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("section_ai_control_desc")}</p>
        </div>
      </div>

      <Card className="border border-border/50 bg-white/80 shadow-none">
        <CardContent className="p-4 md:p-6">
          {!canAccess ? (
            <p className="text-sm text-muted-foreground">{t("subpage_no_access")}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">{t("settings_loading")}</p>
          ) : (
            <div className="space-y-4">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="raw-app-settings" className="border-border/50">
                  <AccordionTrigger className="px-1 hover:no-underline bg-[#f2f1f0] border border-black shadow-[0px_4px_12px_0px_rgba(0,0,0,0.15)]">
                    <span className="font-serif text-base font-bold">{t("controle_ia_raw_section_title")}</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-1 pb-3">
                    <AppSettingsRawEditor
                      keys={AI_APP_SETTINGS_KEY_LIST}
                      hint={t("controle_ia_raw_section_hint")}
                      onSaved={loadRows}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <AiModelControlPanel appSettingsRows={appSettingsRows} onRefreshRows={loadRows} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
