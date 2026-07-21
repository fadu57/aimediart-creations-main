import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deriveGlobalRoleId,
  derivePrimaryRoleId,
  isAgencyRoleEnabled,
  isGlobalRole,
  roleIdsNeedExpos,
  roleIdsNeedOrganisation,
  toggleUserRole,
} from "@/lib/userRoleAssignment";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type RoleOption = { role_id: number; label: string };

type AgencyRef = { id: string; name_agency: string };

type ExpoOption = { id: string; value: string; expo_name: string };

type UserRolesFieldProps = {
  idPrefix?: string;
  roleOptions: RoleOption[];
  roleIds: number[];
  onRoleIdsChange: (next: number[]) => void;
  agencyId: string | null;
  onAgencyIdChange: (agencyId: string) => void;
  expoIds: string[];
  onExpoIdsChange: (expoIds: string[]) => void;
  agencies: AgencyRef[];
  expoOptions: ExpoOption[];
  callerRoleId: number | null;
  canEditAgency: boolean;
  resolvedAgencyLabel: string;
  disabled?: boolean;
  /** Affiche un * sur le titre des rôles (création). */
  rolesRequired?: boolean;
  /** Libellé d'affectation SaaS (ex. AIMEDIArt) quand pas d'organisation. */
  saasAssignmentLabel?: string | null;
};

export function UserRolesField({
  idPrefix = "user",
  roleOptions,
  roleIds,
  onRoleIdsChange,
  agencyId,
  onAgencyIdChange,
  expoIds,
  onExpoIdsChange,
  agencies,
  expoOptions,
  callerRoleId,
  canEditAgency,
  resolvedAgencyLabel,
  disabled = false,
  rolesRequired = false,
  saasAssignmentLabel = null,
}: UserRolesFieldProps) {
  const { t } = useTranslation("utilisateurs");
  const primaryRoleId = derivePrimaryRoleId(roleIds);
  const globalRoleId = deriveGlobalRoleId(roleIds);
  const showOrganisation = roleIdsNeedOrganisation(roleIds);
  const showExpos = roleIdsNeedExpos(roleIds);

  const globalOptions = roleOptions.filter((r) => isGlobalRole(r.role_id));
  const agencyOptions = roleOptions.filter((r) => r.role_id >= 4 && r.role_id <= 6);

  const toggleExpo = (expoValue: string, checked: boolean) => {
    const trimmed = expoValue.trim();
    if (!trimmed) return;
    if (checked) {
      onExpoIdsChange([...new Set([...expoIds, trimmed])]);
    } else {
      onExpoIdsChange(expoIds.filter((id) => id !== trimmed));
    }
  };

  const orgRolesHint =
    primaryRoleId != null && primaryRoleId <= 3
      ? t("form.roles_org_with_global")
      : primaryRoleId === 4
        ? t("form.roles_org_with_admin")
        : "";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>
          {t("form.roles_title")}
          {rolesRequired ? <span className="text-[#E63946]"> *</span> : null}
        </Label>
        {globalOptions.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">{t("form.role_global")}</p>
            <div className="flex flex-col gap-2">
              {globalOptions.map((role) => {
                const checked = globalRoleId === role.role_id;
                const inputId = `${idPrefix}-role-global-${role.role_id}`;
                return (
                  <label
                    key={role.role_id}
                    htmlFor={inputId}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 text-sm",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => onRoleIdsChange(toggleUserRole(roleIds, role.role_id, callerRoleId))}
                    />
                    <span>{role.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {agencyOptions.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("form.roles_org")}
              {rolesRequired ? <span className="text-[#E63946]"> *</span> : null}
              {orgRolesHint}
            </p>
            <div className="flex flex-col gap-2">
              {agencyOptions.map((role) => {
                const checked = roleIds.includes(role.role_id);
                const enabled = isAgencyRoleEnabled(role.role_id, primaryRoleId, roleIds, callerRoleId);
                const inputId = `${idPrefix}-role-agency-${role.role_id}`;
                return (
                  <label
                    key={role.role_id}
                    htmlFor={inputId}
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      enabled && !disabled ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={disabled || !enabled}
                      onCheckedChange={() => onRoleIdsChange(toggleUserRole(roleIds, role.role_id, callerRoleId))}
                    />
                    <span>{role.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {showOrganisation ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-agency`}>{t("form.organisation")}</Label>
          <Select
            value={agencyId ?? ""}
            onValueChange={(v) => {
              onAgencyIdChange(v);
              onExpoIdsChange([]);
            }}
            disabled={disabled || !canEditAgency}
          >
            <SelectTrigger id={`${idPrefix}-agency`}>
              <SelectValue placeholder={t("form.choose_organisation")} />
            </SelectTrigger>
            <SelectContent>
              {agencies.length === 0 && (
                <SelectItem value="__none_agency__" disabled>
                  {t("form.no_organisation")}
                </SelectItem>
              )}
              {agencies.map((agency) => (
                <SelectItem key={agency.id} value={agency.id}>
                  {agency.name_agency || agency.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!canEditAgency && resolvedAgencyLabel ? (
            <p className="text-xs text-muted-foreground">
              {t("form.organisation_prefix", { name: resolvedAgencyLabel })}
            </p>
          ) : null}
        </div>
      ) : saasAssignmentLabel ? (
        <p className="text-sm text-muted-foreground">
          {t("form.assignment_label")}{" "}
          <span className="font-semibold text-foreground">{saasAssignmentLabel}</span>
        </p>
      ) : null}

      {showExpos ? (
        <div className="space-y-2">
          <Label>{t("form.expos_label")}</Label>
          {!agencyId?.trim() ? (
            <p className="text-xs text-muted-foreground">{t("form.select_org_first")}</p>
          ) : expoOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("form.no_expo_for_org")}</p>
          ) : (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border/60 p-3">
              {expoOptions.map((expo) => {
                const checked = expoIds.includes(expo.value);
                const inputId = `${idPrefix}-expo-${expo.id}`;
                return (
                  <label key={expo.id} htmlFor={inputId} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(v) => toggleExpo(expo.value, v === true)}
                    />
                    <span>{expo.expo_name}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {t("form.organisation_prefix", { name: resolvedAgencyLabel })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
