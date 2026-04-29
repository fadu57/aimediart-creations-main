import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { Database } from "@types/supabase";
import { supabase } from "@/lib/supabase";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RoleRow = Database["public"]["Tables"]["roles_user"]["Row"];

type UserRoleSelectProps = {
  userId: string;
  value: number | null;
  onChange?: (nextRoleId: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
};

/**
 * Sélecteur de rôle restreint aux niveaux 4→7 (admin_agency à visiteur).
 * Au changement, met à jour `public.users.role_id`.
 */
export function UserRoleSelect({
  userId,
  value,
  onChange,
  disabled = false,
  label = "Rôle utilisateur",
  className,
}: UserRoleSelectProps) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localValue, setLocalValue] = useState<string>(value ? String(value) : "");

  useEffect(() => {
    setLocalValue(value ? String(value) : "");
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingRoles(true);
      const { data, error } = await supabase
        .from("roles_user")
        .select("role_id, role_name, label")
        .gte("role_id", 4)
        .lte("role_id", 7)
        .order("role_id", { ascending: true });

      if (cancelled) return;
      setLoadingRoles(false);

      if (error) {
        toast.error(`Chargement des rôles impossible : ${error.message}`);
        setRoles([]);
        return;
      }

      setRoles((data as RoleRow[] | null) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const roleLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of roles) {
      const label = row.label?.trim() || row.role_name?.trim() || `Rôle ${row.role_id}`;
      map.set(row.role_id, label);
    }
    return map;
  }, [roles]);

  const handleValueChange = async (nextValue: string) => {
    const nextRoleId = Number(nextValue);
    if (!Number.isFinite(nextRoleId) || nextRoleId < 4 || nextRoleId > 7) return;

    const previous = localValue;
    setLocalValue(nextValue);
    setSaving(true);

    const { error } = await supabase.from("users").update({ role_id: nextRoleId }).eq("id", userId);
    setSaving(false);

    if (error) {
      setLocalValue(previous);
      toast.error(`Mise à jour du rôle impossible : ${error.message}`);
      return;
    }

    onChange?.(nextRoleId);
    toast.success(`Rôle mis à jour : ${roleLabelById.get(nextRoleId) ?? `#${nextRoleId}`}`);
  };

  const isDisabled = disabled || saving || loadingRoles;

  return (
    <div className={className}>
      <Label htmlFor={`user-role-select-${userId}`}>{label}</Label>
      <div className="mt-1.5">
        <Select value={localValue} onValueChange={handleValueChange} disabled={isDisabled}>
          <SelectTrigger id={`user-role-select-${userId}`}>
            <SelectValue placeholder="Choisir un rôle (4 à 7)" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.role_id} value={String(r.role_id)}>
                {r.label?.trim() || r.role_name?.trim() || `Rôle ${r.role_id}`} (#{r.role_id})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(loadingRoles || saving) && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {loadingRoles ? "Chargement des rôles..." : "Mise à jour du rôle..."}
        </p>
      )}
    </div>
  );
}
