import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DashboardTeamMember } from "@/hooks/useDashboardProfile";
import { sortDashboardTeamMembers } from "@/lib/dashboardTeamScope";
import { cn } from "@/lib/utils";

function memberLabel(member: DashboardTeamMember): string {
  const full = [member.first_name?.trim(), member.last_name?.trim()].filter(Boolean).join(" ");
  if (full) return full;
  if (member.username?.trim()) return `@${member.username.trim()}`;
  return member.user_id.slice(0, 8);
}

type DashboardProfileSelectorProps = {
  members: DashboardTeamMember[];
  currentUserId: string;
  selectedUserId: string;
  onSelect: (userId: string) => void;
  className?: string;
};

export function DashboardProfileSelector({
  members,
  selectedUserId,
  onSelect,
  className,
}: DashboardProfileSelectorProps) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const scoped = members.filter((m) => m.user_id?.trim());
    return sortDashboardTeamMembers(scoped);
  }, [members]);

  const selected = options.find((m) => m.user_id === selectedUserId) ?? options[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between bg-background font-normal", className)}
        >
          <span className="truncate">{selected ? memberLabel(selected) : "Choisir un profil…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher un membre…" />
          <CommandList>
            <CommandEmpty>Aucun profil trouvé.</CommandEmpty>
            <CommandGroup>
              {options.map((member) => (
                <CommandItem
                  key={member.user_id}
                  value={`${memberLabel(member)} ${member.username ?? ""} ${member.agency_role_label ?? ""}`}
                  onSelect={() => {
                    onSelect(member.user_id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedUserId === member.user_id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{memberLabel(member)}</span>
                  {member.agency_role_label ? (
                    <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
                      {member.agency_role_label}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
