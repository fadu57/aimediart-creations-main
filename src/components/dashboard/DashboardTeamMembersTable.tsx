import { ChevronDown, Pencil, Trash2 } from "lucide-react";

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
  onChange?: (member: DashboardTeamMember, expoIds: string[]) => void;
};

function TeamMemberExposCell({ member, expoOptions, canEdit, saving, onChange }: TeamMemberExposCellProps) {
  const labels = expoLabelsForMember(member, expoOptions);

  if (!canEdit) {
    if (labels.length === 0) return <span className="text-muted-foreground">—</span>;
    return <span className="text-sm">{labels.join(", ")}</span>;
  }

  if (expoOptions.length === 0) {
    return <span className="text-sm text-muted-foreground">Aucune expo</span>;
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
      ? "Choisir…"
      : labels.length === 1
        ? labels[0]
        : `${labels.length} expositions`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-[9rem] max-w-[14rem] justify-between gap-1 font-normal"
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate">{saving ? "Enregistrement…" : summary}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">Expositions</p>
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
  const showActions = Boolean(onEditMember || onDeleteMember);

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Aucun membre rattaché à votre organisation.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border/60 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Nom</TableHead>
            <TableHead>Prénom</TableHead>
            <TableHead>Pseudo</TableHead>
            <TableHead>Rôle métier</TableHead>
            <TableHead className="hidden md:table-cell min-w-[10rem]">Exposition</TableHead>
            <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
            {showActions && <TableHead className="w-[88px] text-right">Actions</TableHead>}
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
                <TableCell className={cn("font-medium", rowBold)}>{textOrDash(member.last_name)}</TableCell>
                <TableCell className={rowBold}>{textOrDash(member.first_name)}</TableCell>
                <TableCell className={rowBold}>{member.username ? `@${member.username}` : "—"}</TableCell>
                <TableCell className={rowBold}>{textOrDash(member.agency_role_label)}</TableCell>
                <TableCell
                  className="hidden md:table-cell"
                  onClick={(e) => e.stopPropagation()}
                >
                  <TeamMemberExposCell
                    member={member}
                    expoOptions={expoOptions}
                    canEdit={expoEditable}
                    saving={savingExpoUserId === member.user_id}
                    onChange={onMemberExposChange}
                  />
                </TableCell>
                <TableCell className={cn("hidden sm:table-cell", rowBold)}>{textOrDash(member.phone)}</TableCell>
                {showActions && (
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {editable || deletable ? (
                      <div className="flex items-center justify-end gap-1">
                        {editable && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => onEditMember?.(member)}
                            aria-label="Modifier"
                            title="Modifier"
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
                            aria-label="Corbeille"
                            title="Corbeille"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Libellé secondaire sous le nom complet (utilisé ailleurs si besoin). */
export function memberDisplayLine(row: DashboardTeamMember): string {
  const name = memberFullName(row);
  const role = row.role_label?.trim();
  if (role && name !== "—") return `${name} · ${role}`;
  return name;
}
