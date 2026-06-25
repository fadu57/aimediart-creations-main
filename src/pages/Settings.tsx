import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  APP_SETTINGS_INITIAL_FETCH_KEYS,
  DEFAULT_MEDIATION_GENERATION,
  DEFAULT_IDENTITY,
  DEFAULT_LANGUAGE,
  DEFAULT_LINKS_QR,
  DEFAULT_LIMITS,
  DEFAULT_MAINTENANCE,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_VISITORS,
  parseJsonSetting,
  SETTINGS_KEYS,
  stringifySetting,
  type SettingsMediationGeneration,
  type SettingsMediationGenerationMode,
  type SettingsGeneralIdentity,
  type SettingsGeneralLanguage,
  type SettingsGeneralLimits,
  type SettingsGeneralLinksQr,
  type SettingsGeneralMaintenance,
  type SettingsNotifications,
  type SettingsVisitorsBehavior,
} from "@/lib/settingsKeys";
import { useTranslation } from "react-i18next";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess } from "@/lib/authUser";
import { Search, Settings as SettingsGearIcon, SlidersHorizontal, Bell, Users, Activity } from "lucide-react";
import PresenceThresholdSettings from "@/components/settings/PresenceThresholdSettings";
import { AimediartDocumentsPanel } from "@/components/settings/AimediartDocumentsPanel";

type SettingSection = {
  id: string;
  title: string;
  description: string;
  icon: typeof SettingsGearIcon;
};

type AppSettingRow = {
  [key: string]: unknown;
};

const checkboxNoShadow =
  "shadow-none ring-0 ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=checked]:shadow-none";

/** PostgREST / Supabase renvoie souvent `{ message }` sans être une instance de `Error`. */
function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

export default function SettingsPage() {
  const { t } = useTranslation("settings");
  const [searchParams, setSearchParams] = useSearchParams();

  const sectionsCatalog = useMemo((): SettingSection[] => [
    {
      id: "general",
      title: t("section_general_title"),
      description: t("section_general_desc"),
      icon: SlidersHorizontal,
    },
    {
      id: "presence-seuils",
      title: t("section_presence_thresholds_title"),
      description: t("section_presence_thresholds_desc"),
      icon: Activity,
    },
    {
      id: "visitors",
      title: t("section_visitors_title"),
      description: t("section_visitors_desc"),
      icon: Users,
    },
    {
      id: "notifications",
      title: t("section_notifications_title"),
      description: t("section_notifications_desc"),
      icon: Bell,
    },
  ], [t]);

  const sectionIdSet = useMemo(() => new Set(sectionsCatalog.map((s) => s.id)), [sectionsCatalog]);

  const accordionSectionParam = searchParams.get("section");
  const accordionOpenValue =
    accordionSectionParam != null && sectionIdSet.has(accordionSectionParam) ? accordionSectionParam : "";

  const setAccordionSectionInUrl = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set("section", value);
          else next.delete("section");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [search, setSearch] = useState("");
  const [appSettingsRows, setAppSettingsRows] = useState<AppSettingRow[]>([]);

  const [identity, setIdentity] = useState<SettingsGeneralIdentity>(DEFAULT_IDENTITY);
  const [language, setLanguage] = useState<SettingsGeneralLanguage>(DEFAULT_LANGUAGE);
  const [mediationGeneration, setMediationGeneration] = useState<SettingsMediationGeneration>(
    DEFAULT_MEDIATION_GENERATION,
  );
  const [linksQr, setLinksQr] = useState<SettingsGeneralLinksQr>(DEFAULT_LINKS_QR);
  const [limits, setLimits] = useState<SettingsGeneralLimits>(DEFAULT_LIMITS);
  const [maintenance, setMaintenance] = useState<SettingsGeneralMaintenance>(DEFAULT_MAINTENANCE);
  const [visitors, setVisitors] = useState<SettingsVisitorsBehavior>(DEFAULT_VISITORS);
  const [notifications, setNotifications] = useState<SettingsNotifications>(DEFAULT_NOTIFICATIONS);
  const [savingSettingsKey, setSavingSettingsKey] = useState<string | null>(null);
  const { role_id, role_name } = useAuthUser();

  /** Niveaux `roles_user` 1–3 uniquement (admin général, super admin, développeur). */
  const canAccessGeneralSettings = useMemo(() => {
    if (typeof role_id === "number" && role_id >= 1 && role_id <= 3) return true;
    if (role_id == null && hasFullDataAccess(role_name)) return true;
    return false;
  }, [role_id, role_name]);

  const getRawSettingValue = useCallback(
    (key: string) => {
      const row = appSettingsRows.find((r) => String(r.key) === key);
      return row?.value != null ? String(row.value) : "";
    },
    [appSettingsRows],
  );

  useEffect(() => {
    setIdentity(parseJsonSetting<SettingsGeneralIdentity>(getRawSettingValue(SETTINGS_KEYS.generalIdentity), DEFAULT_IDENTITY));
    setLanguage(parseJsonSetting<SettingsGeneralLanguage>(getRawSettingValue(SETTINGS_KEYS.generalLanguage), DEFAULT_LANGUAGE));
    const parsedMediationGen = parseJsonSetting<SettingsMediationGeneration>(
      getRawSettingValue(SETTINGS_KEYS.mediationGeneration),
      DEFAULT_MEDIATION_GENERATION,
    );
    setMediationGeneration({
      mode: parsedMediationGen.mode === "all_languages" ? "all_languages" : "single_plus_optional",
    });
    setLinksQr(parseJsonSetting<SettingsGeneralLinksQr>(getRawSettingValue(SETTINGS_KEYS.generalLinksQr), DEFAULT_LINKS_QR));
    setLimits(parseJsonSetting<SettingsGeneralLimits>(getRawSettingValue(SETTINGS_KEYS.generalLimits), DEFAULT_LIMITS));
    setMaintenance(parseJsonSetting<SettingsGeneralMaintenance>(getRawSettingValue(SETTINGS_KEYS.generalMaintenance), DEFAULT_MAINTENANCE));
    setVisitors(parseJsonSetting<SettingsVisitorsBehavior>(getRawSettingValue(SETTINGS_KEYS.visitorsBehavior), DEFAULT_VISITORS));
    setNotifications(parseJsonSetting<SettingsNotifications>(getRawSettingValue(SETTINGS_KEYS.notifications), DEFAULT_NOTIFICATIONS));
  }, [appSettingsRows, getRawSettingValue]);

  const filteredSections = useMemo(() => {
    let base = canAccessGeneralSettings
      ? sectionsCatalog
      : sectionsCatalog.filter((s) => s.id !== "general");
    if (role_id !== 1) {
      base = base.filter((s) => s.id !== "presence-seuils");
    }
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((section) => {
      return section.title.toLowerCase().includes(q) || section.description.toLowerCase().includes(q);
    });
  }, [search, canAccessGeneralSettings, sectionsCatalog, role_id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value, max_caract, max_tokens")
        .in("key", APP_SETTINGS_INITIAL_FETCH_KEYS);
      if (cancelled) return;
      if (error) {
        console.warn("[Settings] app_settings:", error.message);
        return;
      }
      setAppSettingsRows((data as AppSettingRow[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAppSettings = async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value, max_caract, max_tokens")
      .in("key", APP_SETTINGS_INITIAL_FETCH_KEYS);
    if (error) throw error;
    setAppSettingsRows((data as AppSettingRow[] | null) ?? []);
  };

  const upsertAppSettingJson = async (key: string, value: unknown) => {
    setSavingSettingsKey(key);
    try {
      const { error } = await supabase.from("app_settings").upsert(
        { key, value: stringifySetting(value) },
        { onConflict: "key" },
      );
      if (error) throw error;
      toast.success(t("settings_toast_saved"));
      await refreshAppSettings();
    } catch (e) {
      toast.error(getErrorMessage(e, t("settings_toast_error_save")));
    } finally {
      setSavingSettingsKey(null);
    }
  };

  const fieldClass = "shadow-none";

  const renderGeneralContent = () => (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("gen_brand_heading")}</p>
        <p className="text-xs text-muted-foreground">
          {t("gen_stored_in_prefix")}{" "}
          <code className="rounded bg-muted px-1">{SETTINGS_KEYS.generalIdentity}</code>{" "}
          {t("gen_stored_json_suffix")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="settings-identity-organization_name" className="text-xs font-medium">
              {t("gen_org_name_label")}
            </label>
            <Input
              id="settings-identity-organization_name"
              name="settings_general_identity_organization_name"
              className={fieldClass}
              value={identity.organization_name}
              onChange={(e) => setIdentity((p) => ({ ...p, organization_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="settings-identity-logo_url" className="text-xs font-medium">
              {t("gen_logo_url_label")}
            </label>
            <Input
              id="settings-identity-logo_url"
              name="settings_general_identity_logo_url"
              className={fieldClass}
              value={identity.logo_url}
              onChange={(e) => setIdentity((p) => ({ ...p, logo_url: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="settings-identity-favicon_url" className="text-xs font-medium">
              {t("gen_favicon_url_label")}
            </label>
            <Input
              id="settings-identity-favicon_url"
              name="settings_general_identity_favicon_url"
              className={fieldClass}
              value={identity.favicon_url}
              onChange={(e) => setIdentity((p) => ({ ...p, favicon_url: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="settings-identity-accent_color" className="text-xs font-medium">
              {t("gen_accent_color_label")}
            </label>
            <Input
              id="settings-identity-accent_color"
              name="settings_general_identity_accent_color"
              className={fieldClass}
              value={identity.accent_color}
              onChange={(e) => setIdentity((p) => ({ ...p, accent_color: e.target.value }))}
              placeholder="#c62828"
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={savingSettingsKey === SETTINGS_KEYS.generalIdentity}
          onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.generalIdentity, identity)}
        >
          {savingSettingsKey === SETTINGS_KEYS.generalIdentity ? t("form_btn_saving") : t("form_btn_save")}
        </Button>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("gen_language_heading")}</p>
        <p className="text-xs text-muted-foreground">
          {t("gen_key_word")}{" "}
          <code className="rounded bg-muted px-1">{SETTINGS_KEYS.generalLanguage}</code>
          .
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="settings-language-default_locale" className="text-xs font-medium">
              {t("gen_locale_label")}
            </label>
            <Input
              id="settings-language-default_locale"
              name="settings_general_language_default_locale"
              className={fieldClass}
              value={language.default_locale}
              onChange={(e) => setLanguage((p) => ({ ...p, default_locale: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="settings-language-date_format" className="text-xs font-medium">
              {t("gen_date_format_label")}
            </label>
            <Input
              id="settings-language-date_format"
              name="settings_general_language_date_format"
              className={fieldClass}
              value={language.date_format}
              onChange={(e) => setLanguage((p) => ({ ...p, date_format: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="settings-language-time_format" className="text-xs font-medium">
              {t("gen_time_format_label")}
            </label>
            <Input
              id="settings-language-time_format"
              name="settings_general_language_time_format"
              className={fieldClass}
              value={language.time_format}
              onChange={(e) => setLanguage((p) => ({ ...p, time_format: e.target.value }))}
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={savingSettingsKey === SETTINGS_KEYS.generalLanguage}
          onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.generalLanguage, language)}
        >
          {savingSettingsKey === SETTINGS_KEYS.generalLanguage ? t("form_btn_saving") : t("form_btn_save")}
        </Button>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("gen_mediation_generation_heading")}</p>
        <p className="text-xs text-muted-foreground">
          {t("gen_mediation_generation_intro")}{" "}
          <code className="rounded bg-muted px-1">{SETTINGS_KEYS.mediationGeneration}</code>.
        </p>
        <RadioGroup
          value={mediationGeneration.mode}
          onValueChange={(v) =>
            setMediationGeneration((p) => ({
              ...p,
              mode: v as SettingsMediationGenerationMode,
            }))
          }
          className="gap-3"
        >
          <div className="flex items-start gap-2">
            <RadioGroupItem
              value="single_plus_optional"
              id="mediation-gen-single-plus-optional"
              className="mt-0.5"
            />
            <Label htmlFor="mediation-gen-single-plus-optional" className="cursor-pointer text-sm font-normal leading-snug">
              {t("gen_mediation_generation_mode_single")}
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem value="all_languages" id="mediation-gen-all-languages" className="mt-0.5" />
            <Label htmlFor="mediation-gen-all-languages" className="cursor-pointer text-sm font-normal leading-snug">
              {t("gen_mediation_generation_mode_all")}
            </Label>
          </div>
        </RadioGroup>
        <p className="text-[11px] text-muted-foreground">{t("gen_mediation_generation_hint")}</p>
        <Button
          type="button"
          size="sm"
          disabled={savingSettingsKey === SETTINGS_KEYS.mediationGeneration}
          onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.mediationGeneration, mediationGeneration)}
        >
          {savingSettingsKey === SETTINGS_KEYS.mediationGeneration ? t("form_btn_saving") : t("form_btn_save")}
        </Button>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("gen_site_heading")}</p>
        <p className="text-xs text-muted-foreground">{t("gen_site_intro")}</p>
        <div className="space-y-1">
          <label htmlFor="settings-site-qr_origin" className="text-xs font-medium">
            {t("gen_qr_prefix_label")}
          </label>
          <Input
            id="settings-site-qr_origin"
            name="settings_general_site_qr_origin"
            className={fieldClass}
            value={linksQr.public_site_origin}
            onChange={(e) => setLinksQr((p) => ({ ...p, public_site_origin: e.target.value }))}
            placeholder={t("gen_qr_origin_placeholder")}
          />
          <p className="text-[11px] text-muted-foreground">{t("gen_qr_tunnel_hint")}</p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={savingSettingsKey === SETTINGS_KEYS.generalLinksQr}
          onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.generalLinksQr, linksQr)}
        >
          {savingSettingsKey === SETTINGS_KEYS.generalLinksQr ? t("form_btn_saving") : t("form_btn_save")}
        </Button>
      </div>
      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("gen_links_qr_heading")}</p>
        <p className="text-xs text-muted-foreground">
          {t("gen_key_word")}{" "}
          <code className="rounded bg-muted px-1">{SETTINGS_KEYS.generalLinksQr}</code>
          .
        </p>
        <div className="space-y-2">

          <div className="space-y-1">
            <label htmlFor="settings-links-qr_notes" className="text-xs font-medium">
              {t("prompts.notes_label")}
            </label>
            <Textarea
              id="settings-links-qr_notes"
              name="settings_general_links_qr_notes"
              className={`min-h-[72px] ${fieldClass}`}
              value={linksQr.qr_notes}
              onChange={(e) => setLinksQr((p) => ({ ...p, qr_notes: e.target.value }))}
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={savingSettingsKey === SETTINGS_KEYS.generalLinksQr}
          onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.generalLinksQr, linksQr)}
        >
          {savingSettingsKey === SETTINGS_KEYS.generalLinksQr ? t("form_btn_saving") : t("form_btn_save")}
        </Button>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("gen_limits_heading")}</p>
        <p className="text-xs text-muted-foreground">
          {t("gen_key_word")}{" "}
          <code className="rounded bg-muted px-1">{SETTINGS_KEYS.generalLimits}</code>
          .
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="settings-limits-max_upload_mb" className="text-xs font-medium">
              {t("gen_upload_max_label")}
            </label>
            <Input
              id="settings-limits-max_upload_mb"
              name="settings_general_limits_max_upload_mb"
              type="number"
              className={fieldClass}
              min={1}
              value={limits.max_upload_mb}
              onChange={(e) =>
                setLimits((p) => ({ ...p, max_upload_mb: Number(e.target.value) || p.max_upload_mb }))
              }
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="settings-limits-image_compression_quality" className="text-xs font-medium">
              {t("gen_img_quality_label")}
            </label>
            <Input
              id="settings-limits-image_compression_quality"
              name="settings_general_limits_image_compression_quality"
              type="number"
              className={fieldClass}
              min={0}
              max={100}
              value={limits.image_compression_quality}
              onChange={(e) =>
                setLimits((p) => ({
                  ...p,
                  image_compression_quality: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                }))
              }
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={savingSettingsKey === SETTINGS_KEYS.generalLimits}
          onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.generalLimits, limits)}
        >
          {savingSettingsKey === SETTINGS_KEYS.generalLimits ? t("form_btn_saving") : t("form_btn_save")}
        </Button>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("gen_maintenance_heading")}</p>
        <p className="text-xs text-muted-foreground">
          {t("gen_key_word")}{" "}
          <code className="rounded bg-muted px-1">{SETTINGS_KEYS.generalMaintenance}</code>
          .
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              id="settings-maintenance-enabled"
              name="settings_general_maintenance_enabled"
              checked={maintenance.enabled}
              onCheckedChange={(v) => setMaintenance((p) => ({ ...p, enabled: v === true }))}
              className={checkboxNoShadow}
            />
            <span>{t("gen_maintenance_checkbox")}</span>
          </label>
        </div>
        <div className="space-y-1">
          <label htmlFor="settings-maintenance-message" className="text-xs font-medium">
            {t("prompts.message_label")}
          </label>
          <Textarea
            id="settings-maintenance-message"
            name="settings_general_maintenance_message"
            className={`min-h-[72px] ${fieldClass}`}
            value={maintenance.message}
            onChange={(e) => setMaintenance((p) => ({ ...p, message: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="settings-maintenance-allowed_role_ids" className="text-xs font-medium">
            {t("gen_roles_allowed_label")}
          </label>
          <Input
            id="settings-maintenance-allowed_role_ids"
            name="settings_general_maintenance_allowed_role_ids"
            className={fieldClass}
            value={maintenance.allowed_role_ids.join(",")}
            onChange={(e) => {
              const parts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
              const ids = parts.map((x) => Number(x)).filter((n) => Number.isFinite(n));
              setMaintenance((p) => ({ ...p, allowed_role_ids: ids }));
            }}
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={savingSettingsKey === SETTINGS_KEYS.generalMaintenance}
          onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.generalMaintenance, maintenance)}
        >
          {savingSettingsKey === SETTINGS_KEYS.generalMaintenance ? t("form_btn_saving") : t("form_btn_save")}
        </Button>
      </div>
    </div>
  );

  const renderVisitorsContent = () => (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
      <p className="text-sm font-semibold">{t("vis_heading")}</p>
      <p className="text-xs text-muted-foreground">
        {t("gen_key_word")}{" "}
        <code className="rounded bg-muted px-1">{SETTINGS_KEYS.visitorsBehavior}</code>
        .
      </p>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          id="settings-visitors-ressenti_mandatory"
          name="settings_visitors_ressenti_mandatory"
          checked={visitors.ressenti_mandatory}
          onCheckedChange={(v) => setVisitors((p) => ({ ...p, ressenti_mandatory: v === true }))}
          className={checkboxNoShadow}
        />
        <span>{t("vis_ressenti_mandatory")}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          id="settings-visitors-show_exit_dialog"
          name="settings_visitors_show_exit_dialog"
          checked={visitors.show_exit_dialog}
          onCheckedChange={(v) => setVisitors((p) => ({ ...p, show_exit_dialog: v === true }))}
          className={checkboxNoShadow}
        />
        <span>{t("vis_exit_dialog")}</span>
      </label>
      <Button
        type="button"
        size="sm"
        disabled={savingSettingsKey === SETTINGS_KEYS.visitorsBehavior}
        onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.visitorsBehavior, visitors)}
      >
        {savingSettingsKey === SETTINGS_KEYS.visitorsBehavior ? t("form_btn_saving") : t("form_btn_save")}
      </Button>
    </div>
  );

  const renderNotificationsContent = () => (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t("notif_intro_before")}{" "}
        <code className="rounded bg-muted px-1">{SETTINGS_KEYS.notifications}</code>{" "}
        {t("notif_intro_after")}
      </p>
      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("notif_channels_heading")}</p>
        <div className="space-y-1">
          <label htmlFor="settings-notifications-email_from" className="text-xs font-medium">
            {t("notif_email_from")}
          </label>
          <Input
            id="settings-notifications-email_from"
            name="settings_notifications_email_from"
            type="email"
            className={fieldClass}
            value={notifications.email_from}
            onChange={(e) => setNotifications((p) => ({ ...p, email_from: e.target.value }))}
            placeholder={t("notif_placeholder_email_from")}
            autoComplete="email"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="settings-notifications-webhook_url" className="text-xs font-medium">
            {t("notif_webhook_url")}
          </label>
          <Input
            id="settings-notifications-webhook_url"
            name="settings_notifications_webhook_url"
            type="url"
            className={fieldClass}
            value={notifications.webhook_url}
            onChange={(e) => setNotifications((p) => ({ ...p, webhook_url: e.target.value }))}
            placeholder={t("notif_placeholder_webhook")}
          />
        </div>
      </div>
      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("notif_frequency_heading")}</p>
        <div className="space-y-1">
          <label htmlFor="settings-notifications-frequency_batch_seconds" className="text-xs font-medium">
            {t("notif_batch_seconds")}
          </label>
          <Input
            id="settings-notifications-frequency_batch_seconds"
            name="settings_notifications_frequency_batch_seconds"
            type="number"
            min={0}
            className={fieldClass}
            value={notifications.frequency_batch_seconds}
            onChange={(e) =>
              setNotifications((p) => ({
                ...p,
                frequency_batch_seconds: Math.max(0, Number(e.target.value) || 0),
              }))
            }
          />
        </div>
      </div>
      <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
        <p className="text-sm font-semibold">{t("notif_content_heading")}</p>
        <div className="space-y-1">
          <label htmlFor="settings-notifications-content_detail" className="text-xs font-medium">
            {t("notif_detail_level")}
          </label>
          <Input
            id="settings-notifications-content_detail"
            name="settings_notifications_content_detail"
            className={fieldClass}
            value={notifications.content_detail}
            onChange={(e) => setNotifications((p) => ({ ...p, content_detail: e.target.value }))}
            placeholder={t("notif_detail_placeholder")}
          />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={savingSettingsKey === SETTINGS_KEYS.notifications}
        onClick={() => void upsertAppSettingJson(SETTINGS_KEYS.notifications, notifications)}
      >
        {savingSettingsKey === SETTINGS_KEYS.notifications ? t("form_btn_saving") : t("form_btn_save")}
      </Button>
    </div>
  );

  return (
    <div className="container py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold">{t("page_main_title")}</h2>
        </div>
        <Button className="gradient-gold gradient-gold-hover-bg text-primary-foreground gap-2 shrink-0" asChild>
          <Link to="/catalogue">
            <SettingsGearIcon className="h-4 w-4" />
            {t("btn_back_catalogue")}
          </Link>
        </Button>
      </div>

      <Card className="border-border/50 bg-card/70 backdrop-blur-sm shadow-none">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <label htmlFor="settings-search" className="sr-only">
                {t("search_aria")}
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="settings-search"
                name="settings_search_query"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("search_placeholder")}
                className="pl-9 h-10 shadow-none"
                autoComplete="off"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredSections.length === 0 ? (
        <Card className="border border-dashed border-border/60 bg-muted/20 shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            {t("empty_search")}
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-border/50 bg-white/80 shadow-none">
          <CardContent className="p-2 md:p-3">
            <Accordion
              type="single"
              collapsible
              className="w-full"
              value={accordionOpenValue}
              onValueChange={(v) => setAccordionSectionInUrl(v ?? "")}
            >
              {filteredSections.map((section) => (
                <AccordionItem key={section.id} value={section.id} className="border-border/50">
                  <AccordionTrigger className="px-3 hover:no-underline">
                    <div className="flex w-full items-start justify-between gap-4 pr-2 text-left">
                      <div className="min-w-0">
                        <h3 className="font-serif text-xl font-bold">{section.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                      </div>
                      <div className="shrink-0 rounded-md border border-border/60 bg-muted/40 p-2 shadow-none">
                        <section.icon className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-4">
                    {section.id === "general" ? (
                      renderGeneralContent()
                    ) : section.id === "visitors" ? (
                      renderVisitorsContent()
                    ) : section.id === "notifications" ? (
                      renderNotificationsContent()
                    ) : section.id === "presence-seuils" ? (
                      <PresenceThresholdSettings roleId={role_id} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("section_wip")}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {canAccessGeneralSettings && (
        <Card className="border border-border/50 bg-white/80 shadow-none">
          <CardContent className="p-4 md:p-6">
            <AimediartDocumentsPanel />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
