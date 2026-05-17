import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ALL_SETTINGS_PAGE_KEYS,
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
  type SecurityMatrixPermissions,
  type SettingsGeneralIdentity,
  type SettingsGeneralLanguage,
  type SettingsGeneralLimits,
  type SettingsGeneralLinksQr,
  type SettingsGeneralMaintenance,
  type SettingsNotifications,
  type SettingsVisitorsBehavior,
} from "@/lib/settingsKeys";
import {
  defaultNavAccessForRole,
  mergeNavAccessFromMatriceSecurite,
  NAV_MATRIX_CIBLES,
  NAV_MATRIX_MENU_ROWS,
  NAV_MATRIX_PAGE_ROWS,
  type NavAccessMap,
  type NavMatrixCible,
} from "@/lib/navigationMatrix";
import { useTranslation } from "react-i18next";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { hasFullDataAccess } from "@/lib/authUser";
import { approxOutputTokensFromMaxChars } from "@/lib/charsToOutputTokens";
import { getStyleLabelFromDb, type PromptStyleLabelFields } from "@/lib/promptStyleLabel";
import { Search, Settings as SettingsGearIcon, SlidersHorizontal, Shield, Bell, BrainCircuit, Users, Trash2 } from "lucide-react";
import RetentionSettings from "@/components/settings/RetentionSettings";

type SettingSection = {
  id: string;
  title: string;
  description: string;
  icon: typeof SettingsGearIcon;
};

type AppSettingRow = {
  [key: string]: unknown;
};

type PromptStyleRow = PromptStyleLabelFields & {
  id: string | number;
  icon?: string | null;
  style_rules?: string | null;
  system_instruction?: string | null;
  max_tokens?: number | null;
};

type PromptStyleForm = {
  name_fr: string;
  name_en: string;
  name_de: string;
  name_es: string;
  name_it: string;
  icon: string;
  style_rules: string;
  system_instruction: string;
  max_tokens: string;
};

const PROMPT_STYLE_SETTINGS_SELECT =
  "id, name_fr, name_en, name_de, name_es, name_it, icon, style_rules, system_instruction, max_tokens";

async function fetchPromptStylesForSettingsPage() {
  let res = await supabase
    .from("prompt_style")
    .select(PROMPT_STYLE_SETTINGS_SELECT)
    .order("id", { ascending: true });
  if (res.error) {
    res = await supabase.from("prompt_style").select("*").order("id", { ascending: true });
  }
  return res;
}

const NAV_MATRIX_I18N_KEYS: Record<NavMatrixCible, string> = {
  menu_home: "nav_entry_menu_home",
  menu_agence: "nav_entry_menu_agence",
  menu_user: "nav_entry_menu_user",
  menu_expos: "nav_entry_menu_expos",
  menu_artiste: "nav_entry_menu_artiste",
  menu_catalogue: "nav_entry_menu_catalogue",
  menu_stats: "nav_entry_menu_stats",
  page_œuvre: "nav_entry_page_oeuvre",
};

const ROLE_FB_I18N: Partial<Record<number, string>> = {
  2: "role_fallback_2",
  3: "role_fallback_3",
  4: "role_fallback_4",
  5: "role_fallback_5",
  6: "role_fallback_6",
  7: "role_fallback_7",
};

const SECURITY_ACCESS_MATRIX = [
  {
    roleId: 1,
    roleName: "admin_general",
    appSettingsRead: true,
    appSettingsWrite: true,
    promptStyleRead: true,
    promptStyleWrite: true,
  },
  {
    roleId: 2,
    roleName: "super_admin",
    appSettingsRead: true,
    appSettingsWrite: true,
    promptStyleRead: true,
    promptStyleWrite: true,
  },
  {
    roleId: 3,
    roleName: "developpeur",
    appSettingsRead: true,
    appSettingsWrite: true,
    promptStyleRead: true,
    promptStyleWrite: true,
  },
  {
    roleId: 4,
    roleName: "admin_agency",
    appSettingsRead: true,
    appSettingsWrite: true,
    promptStyleRead: true,
    promptStyleWrite: true,
  },
  {
    roleId: 5,
    roleName: "curator_expo",
    appSettingsRead: true,
    appSettingsWrite: false,
    promptStyleRead: true,
    promptStyleWrite: false,
  },
  {
    roleId: 6,
    roleName: "equipe_expo",
    appSettingsRead: true,
    appSettingsWrite: false,
    promptStyleRead: true,
    promptStyleWrite: false,
  },
  {
    roleId: 7,
    roleName: "visiteur",
    appSettingsRead: false,
    appSettingsWrite: false,
    promptStyleRead: false,
    promptStyleWrite: false,
  },
] as const;

/** Rôles affichés dans la matrice (hors admin général = 1 et visiteur = 7). */
const SECURITY_MATRIX_VISIBLE_ROLE_IDS = new Set([2, 3, 4, 5, 6]);

const MATRICE_RESSOURCE_APP = "app_settings";
const MATRICE_RESSOURCE_PROMPT = "prompt_style";
/** Clé d’état « enregistrement » pour le bloc matrice (table `matrice_securite`). */
const MATRICE_SAVING_KEY = "matrice_securite";

/** Rôles affichés dans la matrice navigation + colonne Visiteur (7). */
const NAV_MATRIX_UI_ROLE_IDS = [2, 3, 4, 5, 6, 7] as const;

/** Clé d’état « enregistrement » pour la matrice menus / pages (lignes dédiées dans `matrice_securite`). */
const MATRICE_NAV_SAVING_KEY = "matrice_securite_nav";

/** Clés `app_settings` : plafond caractères / tokens (popup Modifier du 1er tableau Prompts IA). */
const APP_SETTINGS_MAX_LENGTH_KEYS = new Set(["Analyse de l'image", "analysis_prompt"]);
const OEUVRES_NAVIGATION_TYPE_KEY = "œuvres_navigation_type";

const NAV_RESSOURCE_SET = new Set<string>(NAV_MATRIX_CIBLES);

type MatriceSecuriteRow = {
  role_id: number;
  ressource: string;
  lecture: boolean;
  ecriture: boolean;
};

function defaultNavMatrixAllRoles(): Record<number, NavAccessMap> {
  const o: Record<number, NavAccessMap> = {} as Record<number, NavAccessMap>;
  for (const rid of NAV_MATRIX_UI_ROLE_IDS) {
    o[rid] = defaultNavAccessForRole(rid);
  }
  return o;
}

function navMatrixFromMatriceSecuriteRows(rows: MatriceSecuriteRow[] | null | undefined): Record<number, NavAccessMap> {
  const base = defaultNavMatrixAllRoles();
  if (!rows?.length) return base;
  const out: Record<number, NavAccessMap> = { ...base };
  for (const rid of NAV_MATRIX_UI_ROLE_IDS) {
    const forRole = rows.filter((r) => r.role_id === rid && NAV_RESSOURCE_SET.has(r.ressource));
    out[rid] = mergeNavAccessFromMatriceSecurite(
      rid,
      forRole.map((r) => ({ ressource: r.ressource, lecture: r.lecture })),
    );
  }
  return out;
}

function defaultSecurityMatrixVisible(): Record<number, SecurityMatrixPermissions> {
  const next: Record<number, SecurityMatrixPermissions> = {};
  for (const r of SECURITY_ACCESS_MATRIX) {
    if (!SECURITY_MATRIX_VISIBLE_ROLE_IDS.has(r.roleId)) continue;
    next[r.roleId] = {
      appSettingsRead: r.appSettingsRead,
      appSettingsWrite: r.appSettingsWrite,
      promptStyleRead: r.promptStyleRead,
      promptStyleWrite: r.promptStyleWrite,
    };
  }
  return next;
}

/** Fusionne les lignes `matrice_securite` avec les valeurs par défaut (écran rôles 2–6). */
function securityMatrixFromMatriceRows(rows: MatriceSecuriteRow[] | null | undefined): Record<number, SecurityMatrixPermissions> {
  const base = defaultSecurityMatrixVisible();
  if (!rows?.length) return base;
  const out: Record<number, SecurityMatrixPermissions> = { ...base };
  for (const rid of SECURITY_MATRIX_VISIBLE_ROLE_IDS) {
    const app = rows.find((r) => r.role_id === rid && r.ressource === MATRICE_RESSOURCE_APP);
    const pr = rows.find((r) => r.role_id === rid && r.ressource === MATRICE_RESSOURCE_PROMPT);
    if (!app && !pr) continue;
    out[rid] = {
      appSettingsRead: app ? app.lecture : base[rid].appSettingsRead,
      appSettingsWrite: app ? app.ecriture : base[rid].appSettingsWrite,
      promptStyleRead: pr ? pr.lecture : base[rid].promptStyleRead,
      promptStyleWrite: pr ? pr.ecriture : base[rid].promptStyleWrite,
    };
  }
  return out;
}



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

function PermissionCell({
  allowed,
  onCheckedChange,
  disabled,
  checkboxId,
  checkboxName,
  ariaLabel,
}: {
  allowed: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  checkboxId: string;
  checkboxName: string;
  /** Libellé pour l’accessibilité (ex. « Configuration — lecture : oui »). */
  ariaLabel: string;
}) {
  const { t } = useTranslation("settings");
  return (
    <td className="border-b border-border/40 px-1 py-2 text-center align-middle">
      <div className="flex justify-center">
        <Checkbox
          id={checkboxId}
          name={checkboxName}
          checked={allowed}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          disabled={disabled}
          className={`shrink-0 ${checkboxNoShadow}`}
          aria-label={ariaLabel}
          title={allowed ? t("perm_yes") : t("perm_no")}
        />
      </div>
    </td>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation("settings");

  const sectionsCatalog = useMemo((): SettingSection[] => [
    {
      id: "general",
      title: t("section_general_title"),
      description: t("section_general_desc"),
      icon: SlidersHorizontal,
    },
    {
      id: "security",
      title: t("section_security_title"),
      description: t("section_security_desc"),
      icon: Shield,
    },
    {
      id: "retention",
      title: t("section_retention_title"),
      description: t("section_retention_desc"),
      icon: Trash2,
    },
    {
      id: "prompts-ia",
      title: t("section_prompts_title"),
      description: t("section_prompts_desc"),
      icon: BrainCircuit,
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
    {
      id: "œuvres-navigation",
      title: t("section_artworks_nav_title"),
      description: t("section_artworks_nav_desc"),
      icon: SlidersHorizontal,
    },
  ], [t]);
  const [search, setSearch] = useState("");
  const [roleLabelsById, setRoleLabelsById] = useState<Record<number, string>>({});
  const [appSettingsRows, setAppSettingsRows] = useState<AppSettingRow[]>([]);
  const [promptStyleRows, setPromptStyleRows] = useState<PromptStyleRow[]>([]);
  const [loadingPromptsData, setLoadingPromptsData] = useState(true);
  /** Liste complète `app_settings` (hors clés page Config) encore en cours de chargement. */
  const [loadingFullAppSettings, setLoadingFullAppSettings] = useState(false);
  const [promptsDataError, setPromptsDataError] = useState<string | null>(null);
  const [editAppOpen, setEditAppOpen] = useState(false);
  const [editingAppRow, setEditingAppRow] = useState<AppSettingRow | null>(null);
  const [editingAppForm, setEditingAppForm] = useState<Record<string, string>>({});
  const [editPromptOpen, setEditPromptOpen] = useState(false);
  const [editingPromptRow, setEditingPromptRow] = useState<PromptStyleRow | null>(null);
  const [editingPromptForm, setEditingPromptForm] = useState<PromptStyleForm>({
    name_fr: "",
    name_en: "",
    name_de: "",
    name_es: "",
    name_it: "",
    icon: "",
    style_rules: "",
    system_instruction: "",
    max_tokens: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [identity, setIdentity] = useState<SettingsGeneralIdentity>(DEFAULT_IDENTITY);
  const [language, setLanguage] = useState<SettingsGeneralLanguage>(DEFAULT_LANGUAGE);
  const [linksQr, setLinksQr] = useState<SettingsGeneralLinksQr>(DEFAULT_LINKS_QR);
  const [limits, setLimits] = useState<SettingsGeneralLimits>(DEFAULT_LIMITS);
  const [maintenance, setMaintenance] = useState<SettingsGeneralMaintenance>(DEFAULT_MAINTENANCE);
  const [visitors, setVisitors] = useState<SettingsVisitorsBehavior>(DEFAULT_VISITORS);
  const [notifications, setNotifications] = useState<SettingsNotifications>(DEFAULT_NOTIFICATIONS);
  const [œuvresNavigationType, setOeuvresNavigationType] = useState("single_scan_sequence");
  const [securityMatrix, setSecurityMatrix] = useState<Record<number, SecurityMatrixPermissions>>(() =>
    defaultSecurityMatrixVisible(),
  );
  const [navAccessMatrix, setNavAccessMatrix] = useState<Record<number, NavAccessMap>>(() => defaultNavMatrixAllRoles());
  const [savingSettingsKey, setSavingSettingsKey] = useState<string | null>(null);
  const { refresh: refreshNavigationMatrix } = useNavigationMatrix();
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
    setLinksQr(parseJsonSetting<SettingsGeneralLinksQr>(getRawSettingValue(SETTINGS_KEYS.generalLinksQr), DEFAULT_LINKS_QR));
    setLimits(parseJsonSetting<SettingsGeneralLimits>(getRawSettingValue(SETTINGS_KEYS.generalLimits), DEFAULT_LIMITS));
    setMaintenance(parseJsonSetting<SettingsGeneralMaintenance>(getRawSettingValue(SETTINGS_KEYS.generalMaintenance), DEFAULT_MAINTENANCE));
    setVisitors(parseJsonSetting<SettingsVisitorsBehavior>(getRawSettingValue(SETTINGS_KEYS.visitorsBehavior), DEFAULT_VISITORS));
    setNotifications(parseJsonSetting<SettingsNotifications>(getRawSettingValue(SETTINGS_KEYS.notifications), DEFAULT_NOTIFICATIONS));
    const rawNavigationType = getRawSettingValue(OEUVRES_NAVIGATION_TYPE_KEY).trim();
    if (rawNavigationType) {
      try {
        const parsed = JSON.parse(rawNavigationType) as { mode?: string };
        const nextMode = typeof parsed?.mode === "string" && parsed.mode.trim() ? parsed.mode.trim() : rawNavigationType;
        setOeuvresNavigationType(nextMode);
      } catch {
        setOeuvresNavigationType(rawNavigationType);
      }
    } else {
      setOeuvresNavigationType("single_scan_sequence");
    }
    /* Matrice : chargée depuis `matrice_securite` (voir useEffect de chargement initial). */
  }, [appSettingsRows, getRawSettingValue]);

  const appSettingsColumns = useMemo(() => {
    const cols = new Set<string>();
    for (const row of appSettingsRows) {
      for (const key of Object.keys(row)) cols.add(key);
    }
    return Array.from(cols).sort((a, b) => a.localeCompare(b));
  }, [appSettingsRows]);

  const filteredSections = useMemo(() => {
    let base = canAccessGeneralSettings
      ? sectionsCatalog
      : sectionsCatalog.filter((s) => s.id !== "general");
    // La section "retention" est réservée aux rôles 1-3 uniquement
    if (!canAccessGeneralSettings) {
      base = base.filter((s) => s.id !== "retention");
    }
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((section) => {
      return section.title.toLowerCase().includes(q) || section.description.toLowerCase().includes(q);
    });
  }, [search, canAccessGeneralSettings, sectionsCatalog]);

  useEffect(() => {
    let cancelled = false;

    const mapRoles = (data: Record<string, unknown>[] | null | undefined) => {
      const map: Record<number, string> = {};
      if (!data?.length) return map;
      for (const raw of data) {
        const idRaw = raw.role_id ?? raw.id;
        const id = typeof idRaw === "number" ? idRaw : Number(idRaw);
        const lab = typeof raw.label === "string" ? raw.label.trim() : "";
        if (Number.isFinite(id) && lab) map[id] = lab;
      }
      return map;
    };

    void (async () => {
      setLoadingPromptsData(true);
      setPromptsDataError(null);
      try {
        const [rolesRes, criticalAppRes, promptStyleRes, matriceRes] = await Promise.all([
          supabase.from("roles_user").select("*"),
          supabase.from("app_settings").select("key, value, max_caract, max_tokens").in("key", ALL_SETTINGS_PAGE_KEYS),
          fetchPromptStylesForSettingsPage(),
          supabase
            .from("matrice_securite")
            .select("role_id, ressource, lecture, ecriture")
            .in("role_id", [2, 3, 4, 5, 6, 7]),
        ]);

        if (cancelled) return;
        if (rolesRes.error) {
          throw new Error(`roles_user — ${rolesRes.error.message}`);
        }
        if (criticalAppRes.error) {
          throw new Error(`app_settings — ${criticalAppRes.error.message}`);
        }
        if (promptStyleRes.error) {
          throw new Error(`prompt_style — ${promptStyleRes.error.message}`);
        }

        setRoleLabelsById(mapRoles(rolesRes.data as Record<string, unknown>[] | null | undefined));
        setAppSettingsRows((criticalAppRes.data as AppSettingRow[] | null) ?? []);
        setPromptStyleRows((promptStyleRes.data as PromptStyleRow[] | null) ?? []);

        if (matriceRes.error) {
          console.warn("[Settings] matrice_securite:", matriceRes.error.message);
          setSecurityMatrix(defaultSecurityMatrixVisible());
          setNavAccessMatrix(defaultNavMatrixAllRoles());
        } else {
          const allMatrice = (matriceRes.data as MatriceSecuriteRow[] | null) ?? [];
          setSecurityMatrix(securityMatrixFromMatriceRows(allMatrice));
          setNavAccessMatrix(navMatrixFromMatriceSecuriteRows(allMatrice));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("prompts_load_error");
        if (!cancelled) setPromptsDataError(msg);
      } finally {
        if (!cancelled) setLoadingPromptsData(false);
      }

      if (cancelled) return;

      setLoadingFullAppSettings(true);
      try {
        const fullRes = await supabase.from("app_settings").select("key, value, max_caract, max_tokens").order("key", { ascending: true });
        if (cancelled) return;
        if (fullRes.error) {
          console.warn("[Settings] Liste complète app_settings:", fullRes.error.message);
        } else {
          setAppSettingsRows((fullRes.data as AppSettingRow[] | null) ?? []);
        }
      } finally {
        if (!cancelled) setLoadingFullAppSettings(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const openAppSettingsEditor = (row: AppSettingRow) => {
    setEditingAppRow(row);
    const rawMc = (row as Record<string, unknown>)["max_caract"];
    const maxCaractStr =
      rawMc != null && rawMc !== "" && Number.isFinite(Number(rawMc)) ? String(Number(rawMc)) : "";
    setEditingAppForm({
      value: row.value == null ? "" : String(row.value),
      max_caract: maxCaractStr,
    });
    setEditError(null);
    setEditAppOpen(true);
  };

  const openPromptStyleEditor = (row: PromptStyleRow) => {
    setEditingPromptRow(row);
    setEditingPromptForm({
      name_fr: row.name_fr ?? "",
      name_en: row.name_en ?? "",
      name_de: row.name_de ?? "",
      name_es: row.name_es ?? "",
      name_it: row.name_it ?? "",
      icon: row.icon ?? "",
      style_rules: row.style_rules ?? "",
      system_instruction: row.system_instruction ?? "",
      max_tokens: row.max_tokens == null ? "" : String(row.max_tokens),
    });
    setEditError(null);
    setEditPromptOpen(true);
  };

  const castEditedValue = (original: unknown, nextText: string): unknown => {
    if (original == null) return nextText;
    if (typeof original === "number") {
      const n = Number(nextText);
      return Number.isFinite(n) ? n : original;
    }
    if (typeof original === "boolean") {
      return nextText.trim().toLowerCase() === "true";
    }
    return nextText;
  };

  const refreshPromptsData = async () => {
    const [appSettingsRes, promptStyleRes] = await Promise.all([
      supabase.from("app_settings").select("key, value, max_caract, max_tokens").order("key", { ascending: true }),
      fetchPromptStylesForSettingsPage(),
    ]);
    if (appSettingsRes.error) throw appSettingsRes.error;
    if (promptStyleRes.error) throw promptStyleRes.error;
    setAppSettingsRows((appSettingsRes.data as AppSettingRow[] | null) ?? []);
    setPromptStyleRows((promptStyleRes.data as PromptStyleRow[] | null) ?? []);
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
      await refreshPromptsData();
    } catch (e) {
      toast.error(getErrorMessage(e, t("settings_toast_error_save")));
    } finally {
      setSavingSettingsKey(null);
    }
  };

  const saveAppSettingsEdit = async () => {
    if (!editingAppRow) return;
    const keyValue = String(editingAppRow.key ?? "").trim();
    if (!keyValue) {
      setEditError(t("settings_error_key_missing"));
      return;
    }
    const payload: Record<string, unknown> = {
      value: castEditedValue(editingAppRow.value, editingAppForm.value ?? ""),
    };
    if (APP_SETTINGS_MAX_LENGTH_KEYS.has(keyValue)) {
      const rawMc = (editingAppForm.max_caract ?? "").trim();
      if (rawMc === "") {
        payload.max_caract = null;
        payload.max_tokens = null;
      } else {
        const n = Number(rawMc);
        if (!Number.isFinite(n) || n < 0) {
          setEditError(t("settings_error_max_caract_invalid"));
          return;
        }
        payload.max_caract = n;
        payload.max_tokens = approxOutputTokensFromMaxChars(n);
      }
    }
    setSavingEdit(true);
    setEditError(null);
    const { error } = await supabase.from("app_settings").update(payload).eq("key", keyValue);
    setSavingEdit(false);
    if (error) {
      setEditError(error.message || t("settings_error_modification"));
      return;
    }
    setEditAppOpen(false);
    setEditingAppRow(null);
    await refreshPromptsData();
  };

  const savePromptStyleEdit = async () => {
    if (!editingPromptRow) return;
    const id = editingPromptRow.id;
    const trimmedTokens = editingPromptForm.max_tokens.trim();
    const parsedTokens =
      trimmedTokens === "" ? null : Number.isFinite(Number(trimmedTokens)) ? Number(trimmedTokens) : NaN;
    if (Number.isNaN(parsedTokens)) {
      setEditError(t("settings_error_max_tokens_invalid"));
      return;
    }
    const name_fr = editingPromptForm.name_fr.trim() || null;
    const name_en = editingPromptForm.name_en.trim() || null;
    const name_de = editingPromptForm.name_de.trim() || null;
    const name_es = editingPromptForm.name_es.trim() || null;
    const name_it = editingPromptForm.name_it.trim() || null;
    const payload = {
      name_fr,
      name_en,
      name_de,
      name_es,
      name_it,
      icon: editingPromptForm.icon.trim() || null,
      style_rules: editingPromptForm.style_rules.trim() || null,
      system_instruction: editingPromptForm.system_instruction.trim() || null,
      max_tokens: parsedTokens,
    };
    setSavingEdit(true);
    setEditError(null);
    const { error } = await supabase.from("prompt_style").update(payload).eq("id", id);
    setSavingEdit(false);
    if (error) {
      setEditError(error.message || t("settings_error_modification"));
      return;
    }
    setEditPromptOpen(false);
    setEditingPromptRow(null);
    await refreshPromptsData();
  };

  const renderPromptIaContent = () => {
    if (loadingPromptsData) {
      return <p className="text-sm text-muted-foreground">{t("settings_loading")}</p>;
    }
    if (promptsDataError) {
      return <p className="text-sm text-destructive">{promptsDataError}</p>;
    }

    return (
      <div className="space-y-4">
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none">
          {loadingFullAppSettings && (
            <p className="mb-2 text-[11px] text-muted-foreground">{t("settings_loading_full")}</p>
          )}
          {appSettingsRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings_no_rows")}</p>
          ) : (
            <div className="overflow-x-auto rounded border border-border/50 bg-background">
              <table className="min-w-full text-xs">
                <tbody>
                  {appSettingsRows.map((row, index) => (
                    <tr key={`app-setting-${index}`} className="align-top">
                      {appSettingsColumns.map((col) => (
                        <td key={`app-setting-${index}-${col}`} className="border-b border-border/40 px-2 py-1.5">
                          {row[col] == null ? t("dash_emdash") : String(row[col])}
                        </td>
                      ))}
                      <td className="border-b border-border/40 px-2 py-1.5">
                        <Button type="button" size="sm" variant="outline" onClick={() => openAppSettingsEditor(row)}>
                          {t("settings_btn_modify")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none">
          {promptStyleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings_no_rows")}</p>
          ) : (
            <div className="overflow-x-auto rounded border border-border/50 bg-background">
              <table className="min-w-full text-xs">
                <tbody>
                  {promptStyleRows.map((row) => (
                    <tr key={`prompt-style-${row.id}`} className="align-top">
                      <td className="border-b border-border/40 px-2 py-1.5">
                        {getStyleLabelFromDb(row, i18n.language) || t("dash_emdash")}
                      </td>
                      <td className="border-b border-border/40 px-2 py-1.5">{row.icon || t("dash_emdash")}</td>
                      <td className="border-b border-border/40 px-2 py-1.5 whitespace-pre-wrap">{row.system_instruction || t("dash_emdash")}</td>
                      <td className="border-b border-border/40 px-2 py-1.5 whitespace-pre-wrap">{row.style_rules || t("dash_emdash")}</td>
                      <td className="border-b border-border/40 px-2 py-1.5">{row.max_tokens ?? t("dash_emdash")}</td>
                      <td className="border-b border-border/40 px-2 py-1.5">
                        <Button type="button" size="sm" variant="outline" onClick={() => openPromptStyleEditor(row)}>
                          {t("settings_btn_modify")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const applySecurityPatch = async (roleId: number, patch: Partial<SecurityMatrixPermissions>) => {
    const base = securityMatrix[roleId];
    if (!base) return;
    const merged = { ...base, ...patch };
    const nextGlobal: Record<number, SecurityMatrixPermissions> = { ...securityMatrix, [roleId]: merged };
    const matrixBefore = { ...securityMatrix };
    setSecurityMatrix(nextGlobal);
    const nowIso = new Date().toISOString();
    setSavingSettingsKey(MATRICE_SAVING_KEY);
    try {
      const { error } = await supabase.from("matrice_securite").upsert(
        [
          {
            role_id: roleId,
            ressource: MATRICE_RESSOURCE_APP,
            lecture: merged.appSettingsRead,
            ecriture: merged.appSettingsWrite,
            updated_at: nowIso,
          },
          {
            role_id: roleId,
            ressource: MATRICE_RESSOURCE_PROMPT,
            lecture: merged.promptStyleRead,
            ecriture: merged.promptStyleWrite,
            updated_at: nowIso,
          },
        ],
        { onConflict: "role_id,ressource" },
      );
      if (error) throw error;
      toast.success(t("toast_sec_matrix"));
    } catch (e) {
      setSecurityMatrix(matrixBefore);
      toast.error(
        getErrorMessage(
          e,
          t("error_sec_save"),
        ),
      );
    } finally {
      setSavingSettingsKey(null);
    }
  };

  const applyNavMatrixPatch = async (roleId: number, cible: NavMatrixCible, acces: boolean) => {
    const base = navAccessMatrix[roleId];
    if (!base) return;
    const matrixBefore = { ...navAccessMatrix };
    const mergedAccess = { ...base, [cible]: acces };
    setNavAccessMatrix({ ...navAccessMatrix, [roleId]: mergedAccess });
    setSavingSettingsKey(MATRICE_NAV_SAVING_KEY);
    try {
      const { error } = await supabase.from("matrice_securite").upsert(
        {
          role_id: roleId,
          ressource: cible,
          lecture: acces,
          ecriture: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "role_id,ressource" },
      );
      if (error) throw error;
      toast.success(t("toast_sec_nav"));
      void refreshNavigationMatrix();
    } catch (e) {
      setNavAccessMatrix(matrixBefore);
      toast.error(
        getErrorMessage(
          e,
          t("error_sec_save"),
        ),
      );
    } finally {
      setSavingSettingsKey(null);
    }
  };

  const fieldClass = "shadow-none";

  const renderSecurityContent = () => {
    const rows = SECURITY_ACCESS_MATRIX.filter((r) => SECURITY_MATRIX_VISIBLE_ROLE_IDS.has(r.roleId));
    const navRows = SECURITY_ACCESS_MATRIX.filter((r) =>
      (NAV_MATRIX_UI_ROLE_IDS as readonly number[]).includes(r.roleId),
    );
    const busy = savingSettingsKey === MATRICE_SAVING_KEY;
    const busyNav = savingSettingsKey === MATRICE_NAV_SAVING_KEY;
    return (
      <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("sec_matrix_title")}</p>
        <div className="overflow-x-auto rounded border border-border/50 bg-background shadow-none">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th
                  colSpan={2}
                  scope="colgroup"
                  className="border-b border-border/60 px-2 py-2 text-left align-bottom font-semibold"
                >
                  {t("sec_col_resource_rights")}
                </th>
                {rows.map((row) => {
                  const label =
                    roleLabelsById[row.roleId] ??
                    (ROLE_FB_I18N[row.roleId] !== undefined ? t(ROLE_FB_I18N[row.roleId]!) : row.roleName);
                  return (
                    <th
                      key={`security-head-role-${row.roleId}`}
                      scope="col"
                      className="border-b border-border/60 px-2 py-2 text-center align-bottom font-semibold"
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="align-middle">
                <th
                  rowSpan={2}
                  scope="rowgroup"
                  className="border-b border-border/40 bg-muted/20 px-2 py-2 text-left align-middle text-[11px] font-semibold leading-tight"
                >
                  {t("sec_group_app")} <code className="font-normal">app_settings</code>
                </th>
                <th scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">
                  {t("sec_rw_read")}
                </th>
                {rows.map((row) => {
                  const label =
                    roleLabelsById[row.roleId] ??
                    (ROLE_FB_I18N[row.roleId] !== undefined ? t(ROLE_FB_I18N[row.roleId]!) : row.roleName);
                  const perms = securityMatrix[row.roleId];
                  if (!perms) return null;
                  return (
                    <PermissionCell
                      key={`settings-security-app-read-${row.roleId}`}
                      checkboxId={`settings-security-r${row.roleId}-app-read`}
                      checkboxName={`security_${row.roleId}_app_settings_read`}
                      allowed={perms.appSettingsRead}
                      disabled={busy}
                      ariaLabel={t("sec_aria_app_read", { label })}
                      onCheckedChange={(c) => void applySecurityPatch(row.roleId, { appSettingsRead: c })}
                    />
                  );
                })}
              </tr>
              <tr className="align-middle">
                <th scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">
                  {t("sec_rw_write")}
                </th>
                {rows.map((row) => {
                  const label =
                    roleLabelsById[row.roleId] ??
                    (ROLE_FB_I18N[row.roleId] !== undefined ? t(ROLE_FB_I18N[row.roleId]!) : row.roleName);
                  const perms = securityMatrix[row.roleId];
                  if (!perms) return null;
                  return (
                    <PermissionCell
                      key={`settings-security-app-write-${row.roleId}`}
                      checkboxId={`settings-security-r${row.roleId}-app-write`}
                      checkboxName={`security_${row.roleId}_app_settings_write`}
                      allowed={perms.appSettingsWrite}
                      disabled={busy}
                      ariaLabel={t("sec_aria_app_write", { label })}
                      onCheckedChange={(c) => void applySecurityPatch(row.roleId, { appSettingsWrite: c })}
                    />
                  );
                })}
              </tr>
              <tr className="align-middle">
                <th
                  rowSpan={2}
                  scope="rowgroup"
                  className="border-b border-border/40 bg-muted/20 px-2 py-2 text-left align-middle text-[11px] font-semibold leading-tight"
                >
                  {t("sec_group_prompt")} <code className="font-normal">prompt_style</code>
                </th>
                <th scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">
                  {t("sec_rw_read")}
                </th>
                {rows.map((row) => {
                  const label =
                    roleLabelsById[row.roleId] ??
                    (ROLE_FB_I18N[row.roleId] !== undefined ? t(ROLE_FB_I18N[row.roleId]!) : row.roleName);
                  const perms = securityMatrix[row.roleId];
                  if (!perms) return null;
                  return (
                    <PermissionCell
                      key={`settings-security-prompt-read-${row.roleId}`}
                      checkboxId={`settings-security-r${row.roleId}-prompt-read`}
                      checkboxName={`security_${row.roleId}_prompt_style_read`}
                      allowed={perms.promptStyleRead}
                      disabled={busy}
                      ariaLabel={t("sec_aria_prompt_read", { label })}
                      onCheckedChange={(c) => void applySecurityPatch(row.roleId, { promptStyleRead: c })}
                    />
                  );
                })}
              </tr>
              <tr className="align-middle">
                <th scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">
                  {t("sec_rw_write")}
                </th>
                {rows.map((row) => {
                  const label =
                    roleLabelsById[row.roleId] ??
                    (ROLE_FB_I18N[row.roleId] !== undefined ? t(ROLE_FB_I18N[row.roleId]!) : row.roleName);
                  const perms = securityMatrix[row.roleId];
                  if (!perms) return null;
                  return (
                    <PermissionCell
                      key={`settings-security-prompt-write-${row.roleId}`}
                      checkboxId={`settings-security-r${row.roleId}-prompt-write`}
                      checkboxName={`security_${row.roleId}_prompt_style_write`}
                      allowed={perms.promptStyleWrite}
                      disabled={busy}
                      ariaLabel={t("sec_aria_prompt_write", { label })}
                      onCheckedChange={(c) => void applySecurityPatch(row.roleId, { promptStyleWrite: c })}
                    />
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("sec_menus_pages_title")}</p>
        <div className="overflow-x-auto rounded border border-border/50 bg-background shadow-none">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th
                  colSpan={2}
                  scope="colgroup"
                  className="border-b border-border/60 px-2 py-2 text-left align-bottom font-semibold"
                >
                  {t("sec_menus_pages_column")}
                </th>
                {navRows.map((row) => {
                  const label =
                    roleLabelsById[row.roleId] ??
                    (ROLE_FB_I18N[row.roleId] !== undefined ? t(ROLE_FB_I18N[row.roleId]!) : row.roleName);
                  return (
                    <th
                      key={`nav-head-role-${row.roleId}`}
                      scope="col"
                      className="border-b border-border/60 px-2 py-2 text-center align-bottom font-semibold"
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-muted/25">
                <td
                  colSpan={2 + navRows.length}
                  className="border-b border-border/40 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {t("sec_group_menus")}
                </td>
              </tr>
              {NAV_MATRIX_MENU_ROWS.map((item) => {
                const menuTitle = t(NAV_MATRIX_I18N_KEYS[item.key]);
                return (
                <tr key={`nav-menu-${item.key}`} className="align-middle">
                  <th
                    colSpan={2}
                    scope="row"
                    className="border-b border-border/40 px-2 py-2 text-left font-medium"
                  >
                    {menuTitle}
                  </th>
                  {navRows.map((roleRow) => {
                    const label =
                      roleLabelsById[roleRow.roleId] ??
                      (ROLE_FB_I18N[roleRow.roleId] !== undefined
                        ? t(ROLE_FB_I18N[roleRow.roleId]!)
                        : roleRow.roleName);
                    const perms = navAccessMatrix[roleRow.roleId];
                    if (!perms) return null;
                    return (
                      <PermissionCell
                        key={`nav-${item.key}-r${roleRow.roleId}`}
                        checkboxId={`settings-nav-r${roleRow.roleId}-${item.key}`}
                        checkboxName={`nav_${roleRow.roleId}_${item.key}`}
                        allowed={perms[item.key]}
                        disabled={busyNav}
                        ariaLabel={t("sec_aria_nav_menu", { label, menu: menuTitle })}
                        onCheckedChange={(c) => void applyNavMatrixPatch(roleRow.roleId, item.key, c)}
                      />
                    );
                  })}
                </tr>
              );
              })}
              <tr className="bg-muted/25">
                <td
                  colSpan={2 + navRows.length}
                  className="border-b border-border/40 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {t("sec_group_pages")}
                </td>
              </tr>
              {NAV_MATRIX_PAGE_ROWS.map((item) => {
                const pageTitle = t(NAV_MATRIX_I18N_KEYS[item.key]);
                return (
                <tr key={`nav-page-${item.key}`} className="align-middle">
                  <th colSpan={2} scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">
                    {pageTitle}
                  </th>
                  {navRows.map((roleRow) => {
                    const label =
                      roleLabelsById[roleRow.roleId] ??
                      (ROLE_FB_I18N[roleRow.roleId] !== undefined
                        ? t(ROLE_FB_I18N[roleRow.roleId]!)
                        : roleRow.roleName);
                    const perms = navAccessMatrix[roleRow.roleId];
                    if (!perms) return null;
                    return (
                      <PermissionCell
                        key={`nav-page-${item.key}-r${roleRow.roleId}`}
                        checkboxId={`settings-nav-page-r${roleRow.roleId}-${item.key}`}
                        checkboxName={`nav_page_${roleRow.roleId}_${item.key}`}
                        allowed={perms[item.key]}
                        disabled={busyNav}
                        ariaLabel={t("sec_aria_nav_page", { label, page: pageTitle })}
                        onCheckedChange={(c) => void applyNavMatrixPatch(roleRow.roleId, item.key, c)}
                      />
                    );
                  })}
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    );
  };

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

  const renderOeuvresNavigationContent = () => (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 shadow-none space-y-3">
      <p className="text-sm font-semibold">{t("nav_type_heading")}</p>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="settings_œuvres_navigation_type"
            value="single_scan_sequence"
            checked={œuvresNavigationType === "single_scan_sequence"}
            onChange={(e) => setOeuvresNavigationType(e.target.value)}
          />
          <span>{t("nav_type_scan_sequence")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="settings_œuvres_navigation_type"
            value="same_artist_all_works"
            checked={œuvresNavigationType === "same_artist_all_works"}
            onChange={(e) => setOeuvresNavigationType(e.target.value)}
          />
          <span>{t("nav_type_same_artist")}</span>
        </label>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={savingSettingsKey === OEUVRES_NAVIGATION_TYPE_KEY}
        onClick={() => void upsertAppSettingJson(OEUVRES_NAVIGATION_TYPE_KEY, { mode: œuvresNavigationType })}
      >
        {savingSettingsKey === OEUVRES_NAVIGATION_TYPE_KEY ? t("form_btn_saving") : t("form_btn_save")}
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
            <Accordion type="single" collapsible className="w-full">
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
                    {section.id === "prompts-ia" ? (
                      renderPromptIaContent()
                    ) : section.id === "security" ? (
                      renderSecurityContent()
                    ) : section.id === "general" ? (
                      renderGeneralContent()
                    ) : section.id === "visitors" ? (
                      renderVisitorsContent()
                    ) : section.id === "notifications" ? (
                      renderNotificationsContent()
                    ) : section.id === "œuvres-navigation" ? (
                      renderOeuvresNavigationContent()
                    ) : section.id === "retention" ? (
                      <RetentionSettings roleId={role_id} />
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

      <Dialog open={editAppOpen} onOpenChange={setEditAppOpen}>
        <DialogContent className="max-w-2xl shadow-none" aria-describedby={undefined} hideCloseButton>
          <DialogHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <DialogTitle className="text-left font-serif text-lg leading-snug sm:pr-4">
              {t("settings_dialog_app_title", { key: editingAppRow ? String(editingAppRow.key ?? "") : "" })}
            </DialogTitle>
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditAppOpen(false)}>
                {t("settings_btn_cancel")}
              </Button>
              <Button type="button" onClick={() => void saveAppSettingsEdit()} disabled={savingEdit}>
                {savingEdit ? t("settings_btn_saving") : t("settings_btn_validate")}
              </Button>
            </div>
          </DialogHeader>
          {editingAppRow &&
            APP_SETTINGS_MAX_LENGTH_KEYS.has(String((editingAppRow as Record<string, unknown>).key ?? "").trim()) && (
              <div className="space-y-1.5">
                <label htmlFor="edit-app-settings-max-caract" className="text-sm font-medium">
                  {t("settings_max_caract_label")}
                </label>
                <Input
                  id="edit-app-settings-max-caract"
                  name="app_settings_max_caract"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder={t("edit_max_caract_placeholder")}
                  value={editingAppForm.max_caract ?? ""}
                  onChange={(e) =>
                    setEditingAppForm((prev) => ({
                      ...prev,
                      max_caract: e.target.value,
                    }))
                  }
                  className="shadow-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("settings_max_caract_help")}
                </p>
              </div>
            )}
          <div className="space-y-2">
            <Textarea
              id="edit-app-settings-value"
              name="app_settings_value"
              value={editingAppForm.value ?? ""}
              onChange={(e) =>
                setEditingAppForm((prev) => ({
                  ...prev,
                  value: e.target.value,
                }))
              }
              className="min-h-[250px] w-full resize-y shadow-none"
              aria-label={
                editingAppRow
                  ? t("settings_aria_value", { key: String(editingAppRow.key ?? "") })
                  : t("settings_aria_value", { key: "" })
              }
            />
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editPromptOpen} onOpenChange={setEditPromptOpen}>
        <DialogContent className="max-w-2xl shadow-none">
          <DialogHeader>
            <DialogTitle>{t("settings_dialog_prompt_title")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["name_fr", "settings_field_name_fr", "edit-prompt-style-name-fr"],
                  ["name_en", "settings_field_name_en", "edit-prompt-style-name-en"],
                  ["name_de", "settings_field_name_de", "edit-prompt-style-name-de"],
                  ["name_es", "settings_field_name_es", "edit-prompt-style-name-es"],
                  ["name_it", "settings_field_name_it", "edit-prompt-style-name-it"],
                ] as const
              ).map(([field, labelKey, inputId]) => (
                <div key={field} className="space-y-1 sm:col-span-1">
                  <label htmlFor={inputId} className="text-xs font-semibold text-muted-foreground">
                    {t(labelKey)}
                  </label>
                  <Input
                    id={inputId}
                    name={`prompt_style_${field}`}
                    value={editingPromptForm[field]}
                    onChange={(e) =>
                      setEditingPromptForm((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="w-[618px] space-y-1">
              <label htmlFor="edit-prompt-style-style_rules" className="text-xs font-semibold text-muted-foreground">
                {t("settings_field_style_rules")}
              </label>
              <Textarea
                id="edit-prompt-style-style_rules"
                name="prompt_style_style_rules"
                value={editingPromptForm.style_rules}
                onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, style_rules: e.target.value }))}
                className="min-h-[90px] w-full"
              />
            </div>
            <div className="w-[618px] space-y-1">
              <label htmlFor="edit-prompt-style-system_instruction" className="text-xs font-semibold text-muted-foreground">
                {t("settings_field_system_instruction")}
              </label>
              <Textarea
                id="edit-prompt-style-system_instruction"
                name="prompt_style_system_instruction"
                value={editingPromptForm.system_instruction}
                onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, system_instruction: e.target.value }))}
                className="min-h-[90px] w-full"
              />
            </div>
            <div className="flex flex-wrap items-start gap-6">
              <div className="w-[160px] space-y-1">
                <label htmlFor="edit-prompt-style-max_tokens" className="text-xs font-semibold text-muted-foreground">
                  {t("settings_field_max_tokens")}
                </label>
                <Input
                  id="edit-prompt-style-max_tokens"
                  name="prompt_style_max_tokens"
                  value={editingPromptForm.max_tokens}
                  onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, max_tokens: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="w-[100px] space-y-1">
                <label htmlFor="edit-prompt-style-icon" className="text-xs font-semibold text-muted-foreground">
                  {t("settings_field_icon")}
                </label>
                <Input
                  id="edit-prompt-style-icon"
                  name="prompt_style_icon"
                  value={editingPromptForm.icon}
                  onChange={(e) => setEditingPromptForm((prev) => ({ ...prev, icon: e.target.value }))}
                  className="w-[100px]"
                />
              </div>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditPromptOpen(false)}>
              {t("settings_btn_cancel")}
            </Button>
            <Button type="button" onClick={() => void savePromptStyleEdit()} disabled={savingEdit}>
              {savingEdit ? t("settings_btn_saving") : t("settings_btn_validate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}




