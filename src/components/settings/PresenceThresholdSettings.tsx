import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchPresenceThresholdSettings,
  formatPresenceHoursLabel,
  formatPresenceMinutesLabel,
  ORGANIZER_ABANDONED_HOURS_OPTIONS,
  ORGANIZER_ACTIVE_MINUTES_OPTIONS,
  savePresenceThresholdSettings,
  VISITOR_ABANDONED_HOURS_OPTIONS,
  VISITOR_ACTIVE_MINUTES_OPTIONS,
} from "@/lib/presenceThresholds";
import { DEFAULT_PRESENCE_THRESHOLDS, type SettingsPresenceThresholds } from "@/lib/settingsKeys";

type PresenceThresholdSettingsProps = {
  roleId: number | null | undefined;
};

/** Panneau seuils de présence — accordéon Paramètres, rôle 1 uniquement. */
export default function PresenceThresholdSettings({ roleId }: PresenceThresholdSettingsProps) {
  const { t } = useTranslation("settings");
  const canAccess = roleId === 1;

  const [settings, setSettings] = useState<SettingsPresenceThresholds>(DEFAULT_PRESENCE_THRESHOLDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchPresenceThresholdSettings();
    setSettings(data);
    if (err) setError(err);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  const handleSave = async () => {
    setSaving(true);
    const { error: err } = await savePresenceThresholdSettings(settings);
    setSaving(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(t("presence_thresholds.saved"));
  };

  if (!canAccess) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("presence_thresholds.page_sub")}</p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("presence_thresholds.organizer_section")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="presence-org-active">{t("presence_thresholds.active_label")}</Label>
            <Select
              value={String(settings.organizer.activeMinutes)}
              onValueChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  organizer: {
                    ...s.organizer,
                    activeMinutes: Number(v) as SettingsPresenceThresholds["organizer"]["activeMinutes"],
                  },
                }))
              }
            >
              <SelectTrigger id="presence-org-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZER_ACTIVE_MINUTES_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {formatPresenceMinutesLabel(m, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="presence-org-abandoned">{t("presence_thresholds.abandoned_label")}</Label>
            <Select
              value={String(settings.organizer.abandonedHours)}
              onValueChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  organizer: {
                    ...s.organizer,
                    abandonedHours: Number(v) as SettingsPresenceThresholds["organizer"]["abandonedHours"],
                  },
                }))
              }
            >
              <SelectTrigger id="presence-org-abandoned">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZER_ABANDONED_HOURS_OPTIONS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {formatPresenceHoursLabel(h, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {t("presence_thresholds.organizer_hint", {
              active: formatPresenceMinutesLabel(settings.organizer.activeMinutes, t),
              abandoned: formatPresenceHoursLabel(settings.organizer.abandonedHours, t),
            })}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("presence_thresholds.visitor_section")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="presence-vis-active">{t("presence_thresholds.active_label")}</Label>
            <Select
              value={String(settings.visitor.activeMinutes)}
              onValueChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  visitor: {
                    ...s.visitor,
                    activeMinutes: Number(v) as SettingsPresenceThresholds["visitor"]["activeMinutes"],
                  },
                }))
              }
            >
              <SelectTrigger id="presence-vis-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISITOR_ACTIVE_MINUTES_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {formatPresenceMinutesLabel(m, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="presence-vis-abandoned">{t("presence_thresholds.abandoned_label")}</Label>
            <Select
              value={String(settings.visitor.abandonedHours)}
              onValueChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  visitor: {
                    ...s.visitor,
                    abandonedHours: Number(v) as SettingsPresenceThresholds["visitor"]["abandonedHours"],
                  },
                }))
              }
            >
              <SelectTrigger id="presence-vis-abandoned">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISITOR_ABANDONED_HOURS_OPTIONS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {formatPresenceHoursLabel(h, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {t("presence_thresholds.visitor_hint", {
              active: formatPresenceMinutesLabel(settings.visitor.activeMinutes, t),
              abandoned: formatPresenceHoursLabel(settings.visitor.abandonedHours, t),
            })}
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t("presence_thresholds.cron_hint")}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          <Save className="mr-2 h-4 w-4" aria-hidden />
          {saving ? t("presence_thresholds.saving") : t("presence_thresholds.save")}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/settings/qui-est-en-ligne">{t("presence_thresholds.link_online_page")}</Link>
        </Button>
      </div>
    </div>
  );
}
