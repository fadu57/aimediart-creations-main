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
}: UserRolesFieldProps) {
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rôles</Label>
        {globalOptions.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">Rôle global (un seul)</p>
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
              Rôles organisation
              {primaryRoleId != null && primaryRoleId <= 3
                ? " (cumulables avec un rôle global)"
                : primaryRoleId === 4
                  ? " (cumulables : commissaire, équipier)"
                  : null}
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
          <Label htmlFor={`${idPrefix}-agency`}>Organisation</Label>
          <Select
            value={agencyId ?? ""}
            onValueChange={(v) => {
              onAgencyIdChange(v);
              onExpoIdsChange([]);
            }}
            disabled={disabled || !canEditAgency}
          >
            <SelectTrigger id={`${idPrefix}-agency`}>
              <SelectValue placeholder="Choisir une organisation" />
            </SelectTrigger>
            <SelectContent>
              {agencies.length === 0 && (
                <SelectItem value="__none_agency__" disabled>
                  Aucune organisation disponible
                </SelectItem>
              )}
              {agencies.map((agency) => (
                <SelectItem key={agency.id} value={agency.id}>
                  {agency.name_agency || agency.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {showExpos ? (
        <div className="space-y-2">
          <Label>Exposition(s)</Label>
          {!agencyId?.trim() ? (
            <p className="text-xs text-muted-foreground">Sélectionnez d&apos;abord une organisation.</p>
          ) : expoOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune exposition pour cette organisation.</p>
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
            Organisation : {resolvedAgencyLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}
