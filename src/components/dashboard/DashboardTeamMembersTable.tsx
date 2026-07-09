import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DashboardAgencyExpoOption, DashboardTeamMember } from "@/hooks/useDashboardProfile";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function textOrDash(v: string | null | undefined): string {
  return v?.trim() || "—";
}

function memberFullName(row: DashboardTeamMember): string {
  const full = [row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(" ");
  return full || "—";
}

function expoLabelsForMember(member: DashboardTeamMember, expoOptions: DashboardAgencyExpoOption[]): string[] {
  return member.expo_ids
    .map((id) => expoOptions.find((o) => o.value === id || o.id === id)?.label ?? id)
    .filter(Boolean);
}

type TeamMemberExposCellProps = {
  member: DashboardTeamMember;
  expoOptions: DashboardAgencyExpoOption[];
  canEdit: boolean;
  saving: boolean;
  compact?: boolean;
  onChange?: (member: DashboardTeamMember, expoIds: string[]) => void;
};

function TeamMemberExposCell({ member, expoOptions, canEdit, saving, compact = false, onChange }: TeamMemberExposCellProps) {
  const { t } = useTranslation("dashboard");
  const labels = expoLabelsForMember(member, expoOptions);

  if (!canEdit) {
    if (labels.length === 0) return <span className="text-muted-foreground">—</span>;
    return <span className="text-sm">{labels.join(", ")}</span>;
  }

  if (expoOptions.length === 0) {
    return <span className="text-sm text-muted-foreground">{t("team_table.no_expo")}</span>;
  }

  const selected = new Set(member.expo_ids);

  const toggleExpo = (expoValue: string, checked: boolean) => {
    const next = new Set(member.expo_ids);
    if (checked) next.add(expoValue);
    else next.delete(expoValue);
    onChange?.(member, [...next]);
  };

  const summary =
    labels.length === 0
      ? t("team_table.choose")
      : labels.length === 1
        ? labels[0]
        : t("team_table.expo_count", { count: labels.length });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 justify-between gap-1 font-normal",
            compact ? "w-full max-w-full" : "min-w-[9rem] max-w-[14rem]",
          )}
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate">{saving ? t("team_table.saving") : summary}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">{t("team_table.expos_popover_title")}</p>
        <div className="max-h-52 space-y-0.5 overflow-y-auto">
          {expoOptions.map((expo) => {
            const checked = selected.has(expo.value) || selected.has(expo.id);
            return (
              <label
                key={expo.id}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1.5 hover:bg-muted/50"
              >
                <Checkbox
                  checked={checked}
                  disabled={saving}
                  onCheckedChange={(value) => toggleExpo(expo.value, value === true)}
                />
                <span className="truncate text-sm">{expo.label}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type DashboardTeamMembersTableProps = {
  members: DashboardTeamMember[];
  expoOptions?: DashboardAgencyExpoOption[];
  currentUserId?: string | null;
  canEditMember?: (member: DashboardTeamMember) => boolean;
  canDeleteMember?: (member: DashboardTeamMember) => boolean;
  canEditMemberExpos?: (member: DashboardTeamMember) => boolean;
  savingExpoUserId?: string | null;
  onEditMember?: (member: DashboardTeamMember) => void;
  onDeleteMember?: (member: DashboardTeamMember) => void;
  onMemberExposChange?: (member: DashboardTeamMember, expoIds: string[]) => void;
};

function TeamMemberActions({
  member,
  editable,
  deletable,
  onEditMember,
  onDeleteMember,
}: {
  member: DashboardTeamMember;
  editable: boolean;
  deletable: boolean;
  onEditMember?: (member: DashboardTeamMember) => void;
  onDeleteMember?: (member: DashboardTeamMember) => void;
}) {
  const { t } = useTranslation("dashboard");

  if (!editable && !deletable) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      {editable && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onEditMember?.(member);
          }}
          aria-label={t("common.edit")}
          title={t("common.edit")}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
      {deletable && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteMember?.(member);
          }}
          aria-label={t("common.delete")}
          title={t("common.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function DashboardTeamMembersTable({
  members,
  expoOptions = [],
  currentUserId,
  canEditMember,
  canDeleteMember,
  canEditMemberExpos,
  savingExpoUserId,
  onEditMember,
  onDeleteMember,
  onMemberExposChange,
}: DashboardTeamMembersTableProps) {
  const { t } = useTranslation("dashboard");
  const showActions = Boolean(onEditMember || onDeleteMember);

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {t("team_table.empty")}
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {members.map((member) => {
          const isSelf = currentUserId && member.user_id === currentUserId;
          const isRole4 = member.agency_role_id === 4;
          const editable = canEditMember?.(member) ?? false;
          const deletable = canDeleteMember?.(member) ?? false;
          const expoEditable = canEditMemberExpos?.(member) ?? false;
          const rowBold = isRole4 ? "font-bold" : undefined;

          return (
            <div
              key={member.user_id}
              className={cn(
                "min-w-0 rounded-lg border border-border/60 p-3 space-y-2",
                isSelf && "bg-primary/5",
                editable && "cursor-pointer hover:bg-muted/30",
              )}
              role={editable ? "button" : undefined}
              tabIndex={editable ? 0 : undefined}
              onClick={() => {
                if (editable) onEditMember?.(member);
              }}
              onKeyDown={(e) => {
                if (!editable) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEditMember?.(member);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-medium", rowBold)}>{memberFullName(member)}</p>
                  {member.username ? (
                    <p className={cn("truncate text-xs text-muted-foreground", rowBold)}>
                      @{member.username}
                    </p>
                  ) : null}
                </div>
                {showActions ? (
                  <TeamMemberActions
                    member={member}
                    editable={editable}
                    deletable={deletable}
                    onEditMember={onEditMember}
                    onDeleteMember={onDeleteMember}
                  />
                ) : null}
              </div>
              <p className={cn("text-sm", rowBold)}>{textOrDash(member.agency_role_label)}</p>
              {member.phone?.trim() ? (
                <p className={cn("text-sm text-muted-foreground", rowBold)}>{member.phone.trim()}</p>
              ) : null}
              <div
                className="space-y-1"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <p className="text-xs font-medium text-muted-foreground">{t("team_table.col_expo")}</p>
                <TeamMemberExposCell
                  member={member}
                  expoOptions={expoOptions}
                  canEdit={expoEditable}
                  saving={savingExpoUserId === member.user_id}
                  compact
                  onChange={onMemberExposChange}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 md:block">
        <Table className="min-w-[48rem]">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="px-3 py-2">{t("team_table.col_lastname")}</TableHead>
              <TableHead className="px-3 py-2">{t("team_table.col_firstname")}</TableHead>
              <TableHead className="px-3 py-2">{t("team_table.col_username")}</TableHead>
              <TableHead className="px-3 py-2">{t("team_table.col_role")}</TableHead>
              <TableHead className="min-w-[10rem] px-3 py-2">{t("team_table.col_expo")}</TableHead>
              <TableHead className="hidden lg:table-cell px-3 py-2">{t("team_table.col_phone")}</TableHead>
              {showActions && <TableHead className="w-[88px] px-3 py-2 text-right">{t("team_table.col_actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = currentUserId && member.user_id === currentUserId;
              const isRole4 = member.agency_role_id === 4;
              const editable = canEditMember?.(member) ?? false;
              const deletable = canDeleteMember?.(member) ?? false;
              const expoEditable = canEditMemberExpos?.(member) ?? false;
              const rowBold = isRole4 ? "font-bold" : undefined;

              return (
                <TableRow
                  key={member.user_id}
                  className={cn(
                    isSelf && "bg-primary/5",
                    editable && "cursor-pointer hover:bg-muted/30",
                  )}
                  onClick={() => {
                    if (editable) onEditMember?.(member);
                  }}
                >
                  <TableCell className={cn("px-3 py-2 font-medium", rowBold)}>{textOrDash(member.last_name)}</TableCell>
                  <TableCell className={cn("px-3 py-2", rowBold)}>{textOrDash(member.first_name)}</TableCell>
                  <TableCell className={cn("px-3 py-2", rowBold)}>{member.username ? `@${member.username}` : "—"}</TableCell>
                  <TableCell className={cn("px-3 py-2", rowBold)}>{textOrDash(member.agency_role_label)}</TableCell>
                  <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <TeamMemberExposCell
                      member={member}
                      expoOptions={expoOptions}
                      canEdit={expoEditable}
                      saving={savingExpoUserId === member.user_id}
                      onChange={onMemberExposChange}
                    />
                  </TableCell>
                  <TableCell className={cn("hidden lg:table-cell px-3 py-2", rowBold)}>{textOrDash(member.phone)}</TableCell>
                  {showActions && (
                    <TableCell className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <TeamMemberActions
                        member={member}
                        editable={editable}
                        deletable={deletable}
                        onEditMember={onEditMember}
                        onDeleteMember={onDeleteMember}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** Libellé secondaire sous le nom complet (utilisé ailleurs si besoin). */
export function memberDisplayLine(row: DashboardTeamMember): string {
  const name = memberFullName(row);
  const role = row.role_label?.trim();
  if (role && name !== "—") return `${name} · ${role}`;
  return name;
}
