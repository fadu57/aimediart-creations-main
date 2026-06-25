import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import {
  defaultNavAccessForRole,
  mergeNavAccessFromMatriceSecurite,
  NAV_MATRIX_CIBLES,
  NAV_MATRIX_MENU_ROWS,
  NAV_MATRIX_PAGE_ROWS,
  type NavAccessMap,
  type NavMatrixCible,
} from "@/lib/navigationMatrix";
import { type SecurityMatrixPermissions } from "@/lib/settingsKeys";

/** Libellés i18n des cibles menus/pages (clé settings). */
const NAV_MATRIX_I18N_KEYS: Record<NavMatrixCible, string> = {
  menu_home: "nav_entry_menu_home",
  menu_agence: "nav_entry_menu_agence",
  menu_user: "nav_entry_menu_user",
  menu_expos: "nav_entry_menu_expos",
  menu_artiste: "nav_entry_menu_artiste",
  menu_catalogue: "nav_entry_menu_catalogue",
  menu_stats: "nav_entry_menu_stats",
  page_œuvre: "nav_entry_page_oeuvre",
  page_settings_couts: "nav_entry_page_couts",
  page_suivi_temps: "nav_entry_page_suivi_temps",
  page_suivi_supabase: "nav_entry_page_suivi_supabase",
  page_suivi_tokens: "nav_entry_page_suivi_tokens",
  page_suivi_erreurs_visiteurs: "nav_entry_page_erreurs_visiteurs",
  page_suivi_erreurs_organisateurs: "nav_entry_page_erreurs_organisateurs",
  page_qui_en_ligne: "nav_entry_page_qui_en_ligne",
  page_presence_seuils: "nav_entry_page_presence_seuils",
  page_artistes_corbeille: "nav_entry_page_artistes_corbeille",
  page_catalogue_corbeille: "nav_entry_page_catalogue_corbeille",
  page_agencies_corbeille: "nav_entry_page_agencies_corbeille",
  page_users_corbeille: "nav_entry_page_users_corbeille",
  page_expos_corbeille: "nav_entry_page_expos_corbeille",
  page_visiteurs_corbeille: "nav_entry_page_visiteurs_corbeille",
  page_expos_visitors: "nav_entry_page_expos_visitors",
  page_expos_visitor_audio: "nav_entry_page_expos_visitor_audio",
  page_expos_sponsors: "nav_entry_page_expos_sponsors",
  page_artistes2: "nav_entry_page_artistes2",
  page_catalogue2: "nav_entry_page_catalogue2",
  page_agencies2: "nav_entry_page_agencies2",
  page_expos2: "nav_entry_page_expos2",
  page_prompts: "nav_entry_page_prompts",
  page_controle_ia: "nav_entry_page_controle_ia",
  page_aimediart_legal: "nav_entry_page_aimediart_legal",
  page_aimediart_bp: "nav_entry_page_aimediart_bp",
  page_aimediart_marketing: "nav_entry_page_aimediart_marketing",
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
  { roleId: 1, roleName: "admin_general", appSettingsRead: true, appSettingsWrite: true, promptStyleRead: true, promptStyleWrite: true },
  { roleId: 2, roleName: "super_admin", appSettingsRead: true, appSettingsWrite: true, promptStyleRead: true, promptStyleWrite: true },
  { roleId: 3, roleName: "developpeur", appSettingsRead: true, appSettingsWrite: true, promptStyleRead: true, promptStyleWrite: true },
  { roleId: 4, roleName: "admin_agency", appSettingsRead: true, appSettingsWrite: true, promptStyleRead: true, promptStyleWrite: true },
  { roleId: 5, roleName: "curator_expo", appSettingsRead: true, appSettingsWrite: false, promptStyleRead: true, promptStyleWrite: false },
  { roleId: 6, roleName: "equipe_expo", appSettingsRead: true, appSettingsWrite: false, promptStyleRead: true, promptStyleWrite: false },
  { roleId: 7, roleName: "visiteur", appSettingsRead: false, appSettingsWrite: false, promptStyleRead: false, promptStyleWrite: false },
] as const;

/** Rôles affichés dans la matrice (hors admin général = 1 et visiteur = 7). */
const SECURITY_MATRIX_VISIBLE_ROLE_IDS = new Set([2, 3, 4, 5, 6]);

const MATRICE_RESSOURCE_APP = "app_settings";
const MATRICE_RESSOURCE_PROMPT = "prompt_style";
const MATRICE_SAVING_KEY = "matrice_securite";

/** Rôles affichés dans la matrice navigation + colonne Visiteur (7). */
const NAV_MATRIX_UI_ROLE_IDS = [2, 3, 4, 5, 6, 7] as const;
const MATRICE_NAV_SAVING_KEY = "matrice_securite_nav";

const NAV_RESSOURCE_SET = new Set<string>(NAV_MATRIX_CIBLES);

type MatriceSecuriteRow = {
  role_id: number;
  ressource: string;
  lecture: boolean;
  ecriture: boolean;
};

const checkboxNoShadow =
  "shadow-none ring-0 ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=checked]:shadow-none";

function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

function defaultNavMatrixAllRoles(): Record<number, NavAccessMap> {
  const o: Record<number, NavAccessMap> = {} as Record<number, NavAccessMap>;
  for (const rid of NAV_MATRIX_UI_ROLE_IDS) o[rid] = defaultNavAccessForRole(rid);
  return o;
}

function navMatrixFromMatriceSecuriteRows(rows: MatriceSecuriteRow[] | null | undefined): Record<number, NavAccessMap> {
  const base = defaultNavMatrixAllRoles();
  if (!rows?.length) return base;
  const out: Record<number, NavAccessMap> = { ...base };
  for (const rid of NAV_MATRIX_UI_ROLE_IDS) {
    const forRole = rows.filter((r) => r.role_id === rid && NAV_RESSOURCE_SET.has(r.ressource));
    out[rid] = mergeNavAccessFromMatriceSecurite(rid, forRole.map((r) => ({ ressource: r.ressource, lecture: r.lecture })));
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

/** Panneau « Sécurité et accès » : matrice de droits + matrice menus/pages. */
export function SecurityAccessPanel() {
  const { t } = useTranslation("settings");
  const { refresh: refreshNavigationMatrix } = useNavigationMatrix();

  const [roleLabelsById, setRoleLabelsById] = useState<Record<number, string>>({});
  const [securityMatrix, setSecurityMatrix] = useState<Record<number, SecurityMatrixPermissions>>(() =>
    defaultSecurityMatrixVisible(),
  );
  const [navAccessMatrix, setNavAccessMatrix] = useState<Record<number, NavAccessMap>>(() => defaultNavMatrixAllRoles());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSettingsKey, setSavingSettingsKey] = useState<string | null>(null);

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
      setLoading(true);
      setLoadError(null);
      try {
        const [rolesRes, matriceRes] = await Promise.all([
          supabase.from("roles_user").select("*"),
          supabase.from("matrice_securite").select("role_id, ressource, lecture, ecriture").in("role_id", [2, 3, 4, 5, 6, 7]),
        ]);
        if (cancelled) return;
        if (rolesRes.error) throw new Error(`roles_user — ${rolesRes.error.message}`);
        setRoleLabelsById(mapRoles(rolesRes.data as Record<string, unknown>[] | null | undefined));
        if (matriceRes.error) {
          console.warn("[SecurityAccessPanel] matrice_securite:", matriceRes.error.message);
          setSecurityMatrix(defaultSecurityMatrixVisible());
          setNavAccessMatrix(defaultNavMatrixAllRoles());
        } else {
          const allMatrice = (matriceRes.data as MatriceSecuriteRow[] | null) ?? [];
          setSecurityMatrix(securityMatrixFromMatriceRows(allMatrice));
          setNavAccessMatrix(navMatrixFromMatriceSecuriteRows(allMatrice));
        }
      } catch (e) {
        if (!cancelled) setLoadError(getErrorMessage(e, t("error_sec_save")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [t]);

  const applySecurityPatch = async (roleId: number, patch: Partial<SecurityMatrixPermissions>) => {
    const base = securityMatrix[roleId];
    if (!base) return;
    const merged = { ...base, ...patch };
    const matrixBefore = { ...securityMatrix };
    setSecurityMatrix({ ...securityMatrix, [roleId]: merged });
    const nowIso = new Date().toISOString();
    setSavingSettingsKey(MATRICE_SAVING_KEY);
    try {
      const { error } = await supabase.from("matrice_securite").upsert(
        [
          { role_id: roleId, ressource: MATRICE_RESSOURCE_APP, lecture: merged.appSettingsRead, ecriture: merged.appSettingsWrite, updated_at: nowIso },
          { role_id: roleId, ressource: MATRICE_RESSOURCE_PROMPT, lecture: merged.promptStyleRead, ecriture: merged.promptStyleWrite, updated_at: nowIso },
        ],
        { onConflict: "role_id,ressource" },
      );
      if (error) throw error;
      toast.success(t("toast_sec_matrix"));
    } catch (e) {
      setSecurityMatrix(matrixBefore);
      toast.error(getErrorMessage(e, t("error_sec_save")));
    } finally {
      setSavingSettingsKey(null);
    }
  };

  const applyNavMatrixPatch = async (roleId: number, cible: NavMatrixCible, acces: boolean) => {
    const base = navAccessMatrix[roleId];
    if (!base) return;
    const matrixBefore = { ...navAccessMatrix };
    setNavAccessMatrix({ ...navAccessMatrix, [roleId]: { ...base, [cible]: acces } });
    setSavingSettingsKey(MATRICE_NAV_SAVING_KEY);
    try {
      const { error } = await supabase.from("matrice_securite").upsert(
        { role_id: roleId, ressource: cible, lecture: acces, ecriture: false, updated_at: new Date().toISOString() },
        { onConflict: "role_id,ressource" },
      );
      if (error) throw error;
      toast.success(t("toast_sec_nav"));
      void refreshNavigationMatrix();
    } catch (e) {
      setNavAccessMatrix(matrixBefore);
      toast.error(getErrorMessage(e, t("error_sec_save")));
    } finally {
      setSavingSettingsKey(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("settings_loading")}</p>;
  }
  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  const rows = SECURITY_ACCESS_MATRIX.filter((r) => SECURITY_MATRIX_VISIBLE_ROLE_IDS.has(r.roleId));
  const navRows = SECURITY_ACCESS_MATRIX.filter((r) => (NAV_MATRIX_UI_ROLE_IDS as readonly number[]).includes(r.roleId));
  const busy = savingSettingsKey === MATRICE_SAVING_KEY;
  const busyNav = savingSettingsKey === MATRICE_NAV_SAVING_KEY;
  const roleLabel = (roleId: number, roleName: string) =>
    roleLabelsById[roleId] ?? (ROLE_FB_I18N[roleId] !== undefined ? t(ROLE_FB_I18N[roleId]!) : roleName);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("sec_matrix_title")}</p>
        <div className="overflow-x-auto rounded border border-border/50 bg-background shadow-none">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th colSpan={2} scope="colgroup" className="border-b border-border/60 px-2 py-2 text-left align-bottom font-semibold">
                  {t("sec_col_resource_rights")}
                </th>
                {rows.map((row) => (
                  <th key={`security-head-role-${row.roleId}`} scope="col" className="border-b border-border/60 px-2 py-2 text-center align-bottom font-semibold">
                    {roleLabel(row.roleId, row.roleName)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="align-middle">
                <th rowSpan={2} scope="rowgroup" className="border-b border-border/40 bg-muted/20 px-2 py-2 text-left align-middle text-[11px] font-semibold leading-tight">
                  {t("sec_group_app")} <code className="font-normal">app_settings</code>
                </th>
                <th scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">{t("sec_rw_read")}</th>
                {rows.map((row) => {
                  const perms = securityMatrix[row.roleId];
                  if (!perms) return null;
                  return (
                    <PermissionCell
                      key={`security-app-read-${row.roleId}`}
                      checkboxId={`security-r${row.roleId}-app-read`}
                      checkboxName={`security_${row.roleId}_app_settings_read`}
                      allowed={perms.appSettingsRead}
                      disabled={busy}
                      ariaLabel={t("sec_aria_app_read", { label: roleLabel(row.roleId, row.roleName) })}
                      onCheckedChange={(c) => void applySecurityPatch(row.roleId, { appSettingsRead: c })}
                    />
                  );
                })}
              </tr>
              <tr className="align-middle">
                <th scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">{t("sec_rw_write")}</th>
                {rows.map((row) => {
                  const perms = securityMatrix[row.roleId];
                  if (!perms) return null;
                  return (
                    <PermissionCell
                      key={`security-app-write-${row.roleId}`}
                      checkboxId={`security-r${row.roleId}-app-write`}
                      checkboxName={`security_${row.roleId}_app_settings_write`}
                      allowed={perms.appSettingsWrite}
                      disabled={busy}
                      ariaLabel={t("sec_aria_app_write", { label: roleLabel(row.roleId, row.roleName) })}
                      onCheckedChange={(c) => void applySecurityPatch(row.roleId, { appSettingsWrite: c })}
                    />
                  );
                })}
              </tr>
              <tr className="align-middle">
                <th rowSpan={2} scope="rowgroup" className="border-b border-border/40 bg-muted/20 px-2 py-2 text-left align-middle text-[11px] font-semibold leading-tight">
                  {t("sec_group_prompt")} <code className="font-normal">prompt_style</code>
                </th>
                <th scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">{t("sec_rw_read")}</th>
                {rows.map((row) => {
                  const perms = securityMatrix[row.roleId];
                  if (!perms) return null;
                  return (
                    <PermissionCell
                      key={`security-prompt-read-${row.roleId}`}
                      checkboxId={`security-r${row.roleId}-prompt-read`}
                      checkboxName={`security_${row.roleId}_prompt_style_read`}
                      allowed={perms.promptStyleRead}
                      disabled={busy}
                      ariaLabel={t("sec_aria_prompt_read", { label: roleLabel(row.roleId, row.roleName) })}
                      onCheckedChange={(c) => void applySecurityPatch(row.roleId, { promptStyleRead: c })}
                    />
                  );
                })}
              </tr>
              <tr className="align-middle">
                <th scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">{t("sec_rw_write")}</th>
                {rows.map((row) => {
                  const perms = securityMatrix[row.roleId];
                  if (!perms) return null;
                  return (
                    <PermissionCell
                      key={`security-prompt-write-${row.roleId}`}
                      checkboxId={`security-r${row.roleId}-prompt-write`}
                      checkboxName={`security_${row.roleId}_prompt_style_write`}
                      allowed={perms.promptStyleWrite}
                      disabled={busy}
                      ariaLabel={t("sec_aria_prompt_write", { label: roleLabel(row.roleId, row.roleName) })}
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
                <th colSpan={2} scope="colgroup" className="border-b border-border/60 px-2 py-2 text-left align-bottom font-semibold">
                  {t("sec_menus_pages_column")}
                </th>
                {navRows.map((row) => (
                  <th key={`nav-head-role-${row.roleId}`} scope="col" className="border-b border-border/60 px-2 py-2 text-center align-bottom font-semibold">
                    {roleLabel(row.roleId, row.roleName)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-muted/25">
                <td colSpan={2 + navRows.length} className="border-b border-border/40 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("sec_group_menus")}
                </td>
              </tr>
              {NAV_MATRIX_MENU_ROWS.map((item) => {
                const menuTitle = t(NAV_MATRIX_I18N_KEYS[item.key]);
                return (
                  <tr key={`nav-menu-${item.key}`} className="align-middle">
                    <th colSpan={2} scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">{menuTitle}</th>
                    {navRows.map((roleRow) => {
                      const perms = navAccessMatrix[roleRow.roleId];
                      if (!perms) return null;
                      return (
                        <PermissionCell
                          key={`nav-${item.key}-r${roleRow.roleId}`}
                          checkboxId={`nav-r${roleRow.roleId}-${item.key}`}
                          checkboxName={`nav_${roleRow.roleId}_${item.key}`}
                          allowed={perms[item.key]}
                          disabled={busyNav}
                          ariaLabel={t("sec_aria_nav_menu", { label: roleLabel(roleRow.roleId, roleRow.roleName), menu: menuTitle })}
                          onCheckedChange={(c) => void applyNavMatrixPatch(roleRow.roleId, item.key, c)}
                        />
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="bg-muted/25">
                <td colSpan={2 + navRows.length} className="border-b border-border/40 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("sec_group_pages")}
                </td>
              </tr>
              {NAV_MATRIX_PAGE_ROWS.map((item) => {
                const pageTitle = t(NAV_MATRIX_I18N_KEYS[item.key]);
                return (
                  <tr key={`nav-page-${item.key}`} className="align-middle">
                    <th colSpan={2} scope="row" className="border-b border-border/40 px-2 py-2 text-left font-medium">{pageTitle}</th>
                    {navRows.map((roleRow) => {
                      const perms = navAccessMatrix[roleRow.roleId];
                      if (!perms) return null;
                      return (
                        <PermissionCell
                          key={`nav-page-${item.key}-r${roleRow.roleId}`}
                          checkboxId={`nav-page-r${roleRow.roleId}-${item.key}`}
                          checkboxName={`nav_page_${roleRow.roleId}_${item.key}`}
                          allowed={perms[item.key]}
                          disabled={busyNav}
                          ariaLabel={t("sec_aria_nav_page", { label: roleLabel(roleRow.roleId, roleRow.roleName), page: pageTitle })}
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
}

export default SecurityAccessPanel;
