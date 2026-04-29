import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserRound, X } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthUser } from "@/hooks/useAuthUser";
import { supabase } from "@/lib/supabase";
import { assertImageFileAllowed, prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { USER_AGE_OPTIONS } from "@/lib/userAgeOptions";

type UserRow = {
  id: string;
  role_id?: number | null;
  agency_id?: string | null;
  user_photo_url?: string | null;
  user_prenom?: string | null;
  user_nom?: string | null;
  user_pseudo?: string | null;
  user_age?: string | null;
  user_email?: string | null;
  user_phone?: string | null;
  user_expo_id?: string | null;
   user_roles?: string | null;
  user_control?: string | null;
};

type ExpoOption = {
  id: string;
  value: string;
  expo_name: string;
};

type RoleOption = {
  role_id: number;
  label: string;
};

type AgencyRef = {
  id: string;
  name_agency: string;
  logo_agency?: string | null;
};

function expoLogoRawFromRow(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== "object") return "";
  const keys = ["logo_expo", "expo_logo", "expo_logo_url", "logo", "image_url"] as const;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function normalizeRoleLabel(roleId: number, label: string | null | undefined): string {
  const raw = label?.trim() || `Rôle ${roleId}`;
  if (roleId === 4 && raw.toLowerCase() === "admin agence") return "Admin organisation";
  return raw;
}

function extractRoleNameClair(
  row: { role_name_clair?: unknown; label?: unknown; role_name?: unknown },
  roleId: number,
): string {
  const roleNameClair = typeof row.role_name_clair === "string" ? row.role_name_clair.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const roleName = typeof row.role_name === "string" ? row.role_name.trim() : "";
  return normalizeRoleLabel(roleId, roleNameClair || label || roleName || `Rôle ${roleId}`);
}

const FALLBACK_ROLE_OPTIONS: RoleOption[] = [
  { role_id: 4, label: "Admin organisation" },
  { role_id: 5, label: "Curator expo" },
  { role_id: 6, label: "Equipe expo" },
  { role_id: 7, label: "Visiteur" },
];

function normalizeAgeForEnum(age: string | null | undefined): string | null {
  const raw = age?.trim() || "";
  if (!raw) return null;
  const remap: Record<string, string> = {
    "45-54 ans (Séniors actifs)": "45-54 ans (Actifs expérimentés)",
    "55-64 ans (Pré-retraite)": "55-64 ans (Actifs très expérimentés)",
  };
  return remap[raw] || raw;
}

function textOrDash(v: string | null | undefined): string {
  return v?.trim() || "—";
}

function userFullName(row: UserRow): string {
  const full = [row.user_prenom?.trim(), row.user_nom?.trim()].filter(Boolean).join(" ");
  return full || "Utilisateur";
}

function roleLabelFromUserRow(row: UserRow, roleOptions: RoleOption[]): string {
  const roleId = Number(row.role_id ?? NaN);
  if (!Number.isFinite(roleId)) return "—";
  const option = roleOptions.find((r) => r.role_id === roleId);
  return option?.label || `Rôle ${roleId}`;
}

function buildUserControl(prenom: string, nom: string, email: string): string {
  const raw = `${prenom}${nom}${email}`.trim().toLowerCase();
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9@]/g, "");
}

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRoleValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function roleIdFromValue(value: unknown): number | null {
  const raw = normalizeRoleValue(value);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPublicStorageUrl(url: string | null | undefined): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  // Normalise les anciennes URLs storage non publiques vers le chemin public.
  return raw.replace("/storage/v1/object/images/", "/storage/v1/object/public/images/");
}

function buildTestEmailAlias(email: string, userId: string): string {
  const trimmed = email.trim().toLowerCase();
  const token = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || Date.now().toString(36);
  const at = trimmed.indexOf("@");
  if (at > 0) {
    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1) || "example.local";
    return `${local}+test-${token}@${domain}`;
  }
  return `test-${token}@example.local`;
}

async function uploadUserPhoto(file: File): Promise<string> {
  const prepared = await prepareImageForSupabaseUpload(file);
  const ext = prepared.name.split(".").pop()?.toLowerCase() || "webp";
  const objectPath = `users/photos/${crypto.randomUUID()}.${ext}`;
  const preferredBucket = import.meta.env.VITE_SUPABASE_USER_PHOTOS_BUCKET?.trim() || "selfies";

  const tryUpload = async (bucket: string) => {
    const { error } = await supabase.storage.from(bucket).upload(objectPath, prepared, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) return { ok: false as const, error, bucket };
    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return { ok: true as const, publicUrl: data.publicUrl };
  };

  const first = await tryUpload(preferredBucket);
  if (first.ok) return first.publicUrl;
  throw new Error(`Envoi photo impossible sur le bucket "${preferredBucket}" : ${first.error.message}`);
}

type UsersProps = {
  embeddedDialogOnly?: boolean;
  forcedEditUserId?: string | null;
  onDialogClosed?: () => void;
  onUserSaved?: () => void;
};

const Users = ({
  embeddedDialogOnly = false,
  forcedEditUserId = null,
  onDialogClosed,
  onUserSaved,
}: UsersProps = {}) => {
  const DEBUG_FORCE_DIALOG_OPEN = false;
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUtilisateurs = (searchParams.get("from") || "").trim().toLowerCase() === "utilisateurs";
  const handledForcedEditUserIdRef = useRef<string | null>(null);
  const handledEditUserIdRef = useRef<string | null>(null);
  const { agency_id: connectedAgencyId, role_id: currentRoleId, refresh: refreshAuthUser } = useAuthUser();
  const canRepairAuthAccess = Number(currentRoleId) >= 1 && Number(currentRoleId) <= 3;
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expoOptions, setExpoOptions] = useState<ExpoOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [agenciesRef, setAgenciesRef] = useState<AgencyRef[]>([]);
  const [expoLogosByKey, setExpoLogosByKey] = useState<Map<string, string>>(new Map());
  const [expoNamesByKey, setExpoNamesByKey] = useState<Map<string, string>>(new Map());
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string>("");
  const [expoLogoUrl, setExpoLogoUrl] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repairingAuth, setRepairingAuth] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [initialEditing, setInitialEditing] = useState<UserRow | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("edit");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [checkingControl, setCheckingControl] = useState(false);
  const [controlExists, setControlExists] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [phoneValid, setPhoneValid] = useState(true);

  const resolvedAgencyId = useMemo(
    () => editing?.agency_id?.trim() || connectedAgencyId || "",
    [editing?.agency_id, connectedAgencyId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("users")
      .select(
        "id, role_id, agency_id, user_photo_url, user_prenom, user_nom, user_pseudo, user_age, user_email, user_phone, user_expo_id, user_roles, user_control",
      )
      .order("created_at", { ascending: false, nullsFirst: false });

    if (qErr) {
      setRows([]);
      setError(qErr.message);
      setLoading(false);
      return;
    }
    setRows(((data as UserRow[] | null) ?? []).filter((r) => r.id));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("agencies")
        .select("id, name_agency, logo_agency")
        .order("name_agency", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      if (qErr) {
        setAgenciesRef([]);
        return;
      }
      const mapped =
        ((data as Array<{ id?: string | null; name_agency?: string | null; logo_agency?: string | null }> | null) ?? [])
          .filter((a) => typeof a.id === "string" && a.id.trim())
          .map((a) => ({
            id: String(a.id),
            name_agency: a.name_agency?.trim() || "",
            logo_agency: a.logo_agency?.trim() || null,
          })) ?? [];
      setAgenciesRef(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase.from("expos").select("*");
      if (cancelled) return;
      if (qErr) {
        setExpoLogosByKey(new Map());
        setExpoNamesByKey(new Map());
        return;
      }
      const logoMap = new Map<string, string>();
      const nameMap = new Map<string, string>();
      const rows = (data as Array<Record<string, unknown>> | null) ?? [];
      for (const row of rows) {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const expoId = typeof row.expo_id === "string" ? row.expo_id.trim() : "";
        const expoName = typeof row.expo_name === "string" ? row.expo_name.trim() : "";
        const displayName = expoName || expoId || id;
        const logo = expoLogoRawFromRow(row);

        if (id) {
          if (displayName) nameMap.set(id, displayName);
          if (logo) logoMap.set(id, logo);
        }
        if (expoId) {
          if (displayName) nameMap.set(expoId, displayName);
          if (logo) logoMap.set(expoId, logo);
        }
      }
      setExpoLogosByKey(logoMap);
      setExpoNamesByKey(nameMap);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const base = supabase.from("roles_user").select("*").order("role_id", { ascending: true });
      const { data, error: qErr } =
        currentRoleId === 1
          ? await base
          : currentRoleId === 2
            ? await base.gt("role_id", 2)
            : await base.in("role_id", [4, 5, 6]);
      if (cancelled) return;
      if (qErr) {
        setRoleOptions(FALLBACK_ROLE_OPTIONS);
        return;
      }
      const mapped =
        ((data as Array<{ role_id?: number | null; role_name_clair?: string | null; label?: string | null; role_name?: string | null }> | null) ?? [])
          .filter((r) => typeof r.role_id === "number")
          .map((r) => ({
            role_id: Number(r.role_id),
            label: extractRoleNameClair(r, Number(r.role_id)),
          })) ?? [];
      setRoleOptions(mapped.length ? mapped : FALLBACK_ROLE_OPTIONS);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentRoleId]);

  useEffect(() => {
    if (!editing) return;
    if (editing.agency_id?.trim()) return;
    const userExpoId = editing.user_expo_id?.trim() || "";
    if (!userExpoId) return;

    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("expos")
        .select("agency_id")
        .or(`expo_id.eq.${userExpoId},id.eq.${userExpoId}`)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (qErr) return;
      const aid = (data as { agency_id?: string | null } | null)?.agency_id?.trim() || "";
      if (!aid) return;
      setEditing((prev) => (prev ? { ...prev, agency_id: aid } : prev));
      setInitialEditing((prev) => (prev ? { ...prev, agency_id: aid } : prev));
    })();

    return () => {
      cancelled = true;
    };
  }, [editing?.agency_id, editing?.user_expo_id, editing?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId = resolvedAgencyId;
      const selectedExpoId = editing?.user_expo_id?.trim() || "";
      if (!targetAgencyId) {
        // Fallback: si l'agence n'est pas résolue mais qu'une expo est déjà renseignée, on tente de la charger.
        if (selectedExpoId) {
          const { data: oneExpo, error: oneErr } = await supabase
            .from("expos")
            .select("id, expo_id, expo_name")
            .or(`expo_id.eq.${selectedExpoId},id.eq.${selectedExpoId}`)
            .limit(1)
            .maybeSingle();
          if (!cancelled && !oneErr && oneExpo) {
            const row = oneExpo as { id?: string | null; expo_id?: string | null; expo_name?: string | null };
            const val = row.expo_id?.trim() || row.id?.trim() || "";
            if (val) {
              setExpoOptions([{ id: row.id?.trim() || val, value: val, expo_name: row.expo_name?.trim() || val }]);
              return;
            }
          }
        }
        setExpoOptions([]);
        return;
      }
      const { data, error: qErr } = await supabase
        .from("expos")
        .select("id, expo_id, expo_name")
        .eq("agency_id", targetAgencyId)
        .order("expo_name", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      if (qErr) {
        setExpoOptions([]);
        return;
      }
      const mapped =
        ((data as Array<{ id?: string | null; expo_id?: string | null; expo_name?: string | null }> | null) ?? [])
          .filter((e) => typeof e.id === "string" && e.id.trim())
          .map((e) => ({
            id: String(e.id),
            value: (e.expo_id?.trim() || e.id?.trim() || ""),
            expo_name: e.expo_name?.trim() || String(e.id),
          })) ?? [];
      // Fallback robuste : si la liste d'agence est vide mais user_expo_id existe, injecter au moins l'expo courante.
      if (mapped.length === 0 && selectedExpoId) {
        const { data: oneExpo, error: oneErr } = await supabase
          .from("expos")
          .select("id, expo_id, expo_name")
          .or(`expo_id.eq.${selectedExpoId},id.eq.${selectedExpoId}`)
          .limit(1)
          .maybeSingle();
        if (!cancelled && !oneErr && oneExpo) {
          const row = oneExpo as { id?: string | null; expo_id?: string | null; expo_name?: string | null };
          const val = row.expo_id?.trim() || row.id?.trim() || "";
          if (val) {
            setExpoOptions([{ id: row.id?.trim() || val, value: val, expo_name: row.expo_name?.trim() || val }]);
            return;
          }
        }
      }
      setExpoOptions(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedAgencyId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const userExpoId = editing?.user_expo_id?.trim() || "";
      if (!userExpoId) {
        setExpoLogoUrl("");
        return;
      }
      const { data, error: qErr } = await supabase
        .from("expos")
        .select("*")
        .or(`expo_id.eq.${userExpoId},id.eq.${userExpoId}`)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (qErr) {
        setExpoLogoUrl("");
        return;
      }
      setExpoLogoUrl(expoLogoRawFromRow((data as Record<string, unknown> | null) ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [editing?.user_expo_id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId = resolvedAgencyId;
      if (!targetAgencyId) {
        setAgencyLogoUrl("");
        return;
      }
      const { data, error: qErr } = await supabase
        .from("agencies")
        .select("logo_agency")
        .eq("id", targetAgencyId)
        .maybeSingle();
      if (cancelled) return;
      if (qErr) {
        setAgencyLogoUrl("");
        return;
      }
      const logo = (data as { logo_agency?: string | null } | null)?.logo_agency?.trim() || "";
      setAgencyLogoUrl(logo);
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedAgencyId]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => userFullName(a).localeCompare(userFullName(b), "fr")),
    [rows],
  );
  const agencyLogoById = useMemo(
    () => new Map(agenciesRef.map((a) => [a.id, a.logo_agency?.trim() || ""])),
    [agenciesRef],
  );
  const agencyNameById = useMemo(
    () => new Map(agenciesRef.map((a) => [a.id, a.name_agency?.trim() || a.id])),
    [agenciesRef],
  );
  const roleNameById = useMemo(
    () => new Map(roleOptions.map((r) => [r.role_id, r.label?.trim() || `Rôle ${r.role_id}`])),
    [roleOptions],
  );
  const expoNameByValue = useMemo(() => {
    const map = new Map(expoNamesByKey);
    for (const expo of expoOptions) {
      const key = expo.value?.trim() || "";
      if (!key) continue;
      const name = expo.expo_name?.trim() || key;
      map.set(key, name);
      const id = expo.id?.trim() || "";
      if (id) map.set(id, name);
    }
    return map;
  }, [expoNamesByKey, expoOptions]);

  const searchableTermsForUser = useCallback(
    (u: UserRow): string[] => {
      const roleId = Number(u.role_id ?? Number.parseInt(normalizeRoleValue(u.user_roles), 10));
      const roleName = Number.isFinite(roleId) ? roleNameById.get(roleId) || `Rôle ${roleId}` : "";
      const agencyName = (u.agency_id && agencyNameById.get(u.agency_id)) || "";
      const expoKey = safeTrim(u.user_expo_id);
      const expoName = (expoKey && expoNameByValue.get(expoKey)) || expoKey;
      return [
        userFullName(u),
        safeTrim(u.user_prenom),
        safeTrim(u.user_nom),
        safeTrim(u.user_email),
        safeTrim(u.user_phone),
        roleName,
        roleId ? String(roleId) : "",
        agencyName,
        safeTrim(u.agency_id),
        expoName,
        expoKey,
      ].filter(Boolean);
    },
    [roleNameById, agencyNameById, expoNameByValue],
  );
  const searchSuggestions = useMemo(
    () =>
      [
        ...new Set(
          sorted
            .flatMap((u) => searchableTermsForUser(u))
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ],
    [sorted, searchableTermsForUser],
  );
  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((u) => searchableTermsForUser(u).join(" ").toLowerCase().includes(q));
  }, [sorted, searchTerm, searchableTermsForUser]);

  const resolvedAgencyLabel = useMemo(() => {
    const aid = resolvedAgencyId;
    if (!aid) return "Aucune agence résolue";
    const byId = agenciesRef.find((a) => a.id === aid);
    return byId?.name_agency || aid;
  }, [resolvedAgencyId, agenciesRef]);

  const canEditAgency = useMemo(() => {
    const targetRoleId = roleIdFromValue(editing?.user_roles);
    const targetIsLevel123 = targetRoleId != null && targetRoleId >= 1 && targetRoleId <= 3;
    if (saving || targetIsLevel123) return false;
    // Cas de secours: si un admin organisation n'a pas d'agency_id côté session,
    // on autorise la sélection d'organisation en mode création pour débloquer Expo.
    if (currentRoleId === 4) return mode === "create" && !connectedAgencyId;
    return currentRoleId === 1 || currentRoleId === 2 || currentRoleId === 3;
  }, [editing?.user_roles, saving, currentRoleId, mode, connectedAgencyId]);

  const canEditExpo = useMemo(() => {
    const targetRoleId = roleIdFromValue(editing?.user_roles);
    const targetIsLevel123 = targetRoleId != null && targetRoleId >= 1 && targetRoleId <= 3;
    const targetIsOrgAdmin = targetRoleId === 4;
    if (saving || targetIsLevel123 || targetIsOrgAdmin) return false;
    return Boolean(resolvedAgencyId);
  }, [editing?.user_roles, saving, resolvedAgencyId]);

  const openEdit = (row: UserRow) => {
    console.log("Tentative d'ouverture du modal pour l'user:", row.id);
    const rawAgencyId = safeTrim(row.agency_id);
    const resolvedAgencyId = rawAgencyId || connectedAgencyId || "";

    setMode("edit");
    setEditing({
      ...row,
      agency_id: resolvedAgencyId || null,
    });
    setInitialEditing({
      ...row,
      agency_id: resolvedAgencyId || null,
    });
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview("");
    setTemporaryPassword("");
    setPhoneValid(true);
    setDialogOpen(true);
  };

  useEffect(() => {
    const prefillUser = (location.state as { prefillUser?: UserRow } | null)?.prefillUser;
    if (prefillUser?.id) {
      openEdit(prefillUser);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
      return;
    }

    const targetId = searchParams.get("edit_user_id")?.trim() || "";
    if (!targetId) {
      handledEditUserIdRef.current = null;
      return;
    }
    if (handledEditUserIdRef.current === targetId) return;
    handledEditUserIdRef.current = targetId;

    // Fallback direct: si la ligne est déjà chargée, ouvrir tout de suite sans requête dédiée.
    const existing = rows.find((r) => r.id === targetId);
    if (existing) {
      openEdit(existing);
      const next = new URLSearchParams(searchParams);
      next.delete("edit_user_id");
      setSearchParams(next, { replace: true });
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("users")
        .select(
          "id, role_id, agency_id, user_photo_url, user_prenom, user_nom, user_pseudo, user_age, user_email, user_phone, user_expo_id, user_roles, user_control",
        )
        .eq("id", targetId)
        .maybeSingle();
      if (cancelled) return;
      if (qErr || !data) {
        const next = new URLSearchParams(searchParams);
        next.delete("edit_user_id");
        setSearchParams(next, { replace: true });
        toast.error("Utilisateur introuvable.");
        return;
      }
      openEdit((data as unknown) as UserRow);
      const next = new URLSearchParams(searchParams);
      next.delete("edit_user_id");
      setSearchParams(next, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, searchParams, setSearchParams, location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!embeddedDialogOnly) return;
    const targetId = (forcedEditUserId || "").trim();
    if (!targetId) {
      handledForcedEditUserIdRef.current = null;
      return;
    }
    if (handledForcedEditUserIdRef.current === targetId) return;
    handledForcedEditUserIdRef.current = targetId;

    const existing = rows.find((r) => r.id === targetId);
    if (existing) {
      openEdit(existing);
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("users")
        .select(
          "id, role_id, agency_id, user_photo_url, user_prenom, user_nom, user_pseudo, user_age, user_email, user_phone, user_expo_id, user_roles, user_control",
        )
        .eq("id", targetId)
        .maybeSingle();
      if (cancelled) return;
      if (qErr || !data) {
        toast.error("Utilisateur introuvable.");
        onDialogClosed?.();
        return;
      }
      openEdit((data as unknown) as UserRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [embeddedDialogOnly, forcedEditUserId, rows]);

  const openCreate = () => {
    setMode("create");
    setEditing({
      id: crypto.randomUUID(),
      agency_id: connectedAgencyId || null,
      user_photo_url: "",
      user_prenom: "",
      user_nom: "",
      user_pseudo: "",
      user_age: "",
      user_email: "",
      user_phone: "",
      user_expo_id: "",
      user_roles: "",
      user_control: "",
    });
    setInitialEditing({
      id: "",
      agency_id: connectedAgencyId || null,
      user_photo_url: "",
      user_prenom: "",
      user_nom: "",
      user_pseudo: "",
      user_age: "",
      user_email: "",
      user_phone: "",
      user_expo_id: "",
      user_roles: "",
      user_control: "",
    });
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview("");
    setPhoneValid(true);
    setDialogOpen(true);
  };

  const closeDialog = (open: boolean) => {
    if (!open) {
      setPhotoFile(null);
      setInitialEditing(null);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview("");
      setTemporaryPassword("");
    }
    setDialogOpen(open);
    if (!open && embeddedDialogOnly) {
      onDialogClosed?.();
      return;
    }
    if (!open && fromUtilisateurs) {
      navigate("/user/utilisateurs", { replace: true });
    }
  };

  const setField = (key: keyof UserRow, value: string) => {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  useEffect(() => {
    if (!editing) return;
    const prenom = editing.user_prenom?.trim() || "";
    const nom = editing.user_nom?.trim() || "";
    const email = editing.user_email?.trim() || "";
    const computed = buildUserControl(prenom, nom, email);
    if (computed === (editing.user_control ?? "")) return;
    setEditing((prev) => (prev ? { ...prev, user_control: computed } : prev));
  }, [editing?.user_prenom, editing?.user_nom, editing?.user_email, editing?.user_control]);

  useEffect(() => {
    if (!editing) return;
    const control = editing.user_control?.trim() || "";
    if (!control) {
      setCheckingControl(false);
      setControlExists(false);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setCheckingControl(true);
        const { data, error: qErr } = await supabase
          .from("users")
          .select("id")
          .eq("user_control", control)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        setCheckingControl(false);
        if (qErr) {
          setControlExists(false);
          return;
        }
        const existingId = (data as { id?: string } | null)?.id ?? null;
        setControlExists(Boolean(existingId && existingId !== editing.id));
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [editing?.id, editing?.user_control]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      let nextPhoto = toPublicStorageUrl(editing.user_photo_url);
      if (photoFile) {
        nextPhoto = await uploadUserPhoto(photoFile);
      }

      const normalizedEmail = safeTrim(editing.user_email).toLowerCase();
      if (!normalizedEmail) {
        toast.error("L'email utilisateur est requis.");
        setSaving(false);
        return;
      }
      if (!phoneValid) {
        toast.error("Le numéro de téléphone est invalide pour le pays sélectionné.");
        setSaving(false);
        return;
      }
      let effectiveEmail = normalizedEmail;

      // Dérogation test: si l'email existe déjà sur un autre utilisateur,
      // on bascule immédiatement vers un alias unique.
      const { data: duplicateRows, error: dupErr } = await supabase
        .from("users")
        .select("id")
        .eq("user_email", normalizedEmail)
        .neq("id", editing.id)
        .limit(1);
      if (!dupErr && ((duplicateRows as Array<{ id?: string }> | null) ?? []).length > 0) {
        effectiveEmail = buildTestEmailAlias(normalizedEmail, editing.id);
        setEditing((prev) => (prev ? { ...prev, user_email: effectiveEmail } : prev));
        toast.warning(`Email déjà utilisé : connexion à faire avec l'alias ${effectiveEmail}`);
      }

      const selectedRole = normalizeRoleValue(editing.user_roles);
      const parsedRoleId = Number.parseInt(selectedRole, 10);
      const nextRoleId = Number.isFinite(parsedRoleId) && parsedRoleId > 0 ? parsedRoleId : null;
      const isAdminOrganisation = selectedRole === "4";
      const isLevel123 = nextRoleId != null && nextRoleId >= 1 && nextRoleId <= 3;
      const payload = {
        agency_id: isLevel123 ? null : editing.agency_id?.trim() || connectedAgencyId || null,
        user_photo_url: nextPhoto || null,
        user_prenom: editing.user_prenom?.trim() || null,
        user_nom: editing.user_nom?.trim() || null,
        user_pseudo: editing.user_pseudo?.trim() || null,
        user_age: normalizeAgeForEnum(editing.user_age),
        user_email: effectiveEmail,
        user_phone: editing.user_phone?.trim() || null,
        user_expo_id: isLevel123 || isAdminOrganisation ? null : editing.user_expo_id?.trim() || null,
        ...(nextRoleId != null ? { role_id: nextRoleId } : {}),
        user_roles: selectedRole || null,
        user_control: editing.user_control?.trim() || null,
      };

      if (mode === "create") {
        const prenom = editing.user_prenom?.trim() || "";
        const nom = editing.user_nom?.trim() || "";
        if (!prenom || !nom) {
          toast.error("Le prénom et le nom sont requis.");
          setSaving(false);
          return;
        }
        if (!nextRoleId) {
          toast.error("Le rôle est requis pour créer l'utilisateur.");
          setSaving(false);
          return;
        }
        const tempPassword = temporaryPassword.trim();
        if (tempPassword.length < 6) {
          toast.error("Le mot de passe provisoire doit contenir au moins 6 caractères.");
          setSaving(false);
          return;
        }

        const { data: createAuthData, error: createAuthErr } = await supabase.functions.invoke("admin-create-user", {
          body: {
            email: effectiveEmail,
            password: tempPassword,
            prenom,
            nom,
            role_id: nextRoleId,
          },
        });
        if (createAuthErr) throw createAuthErr;

        const createdUserId =
          (createAuthData as { user_id?: string | null } | null)?.user_id?.trim() ||
          (createAuthData as { data?: { user_id?: string | null } } | null)?.data?.user_id?.trim() ||
          "";
        if (!createdUserId) {
          throw new Error("Création Auth réussie mais identifiant utilisateur introuvable.");
        }

        const { error: upsertErr } = await supabase
          .from("users")
          .upsert({ id: createdUserId, ...payload }, { onConflict: "id" });
        if (upsertErr) throw upsertErr;
      } else {
        const { error: upErr } = await supabase.from("users").update(payload).eq("id", editing.id);
        if (upErr) throw upErr;
      }

      if (mode === "create") {
        toast.success(`Utilisateur créé. Email de connexion : ${effectiveEmail}`);
      } else {
        toast.success("Utilisateur mis à jour.");
      }
      closeDialog(false);
      await load();
      // Force la relecture SQL du profil courant (rôles/droits) après modification des infos perso.
      await refreshAuthUser();
      onUserSaved?.();
    } catch (e) {
      const supaErr =
        e &&
        typeof e === "object" &&
        "message" in e &&
        typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : null;
      const msg = supaErr || (e instanceof Error ? e.message : "Enregistrement impossible.");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const repairAuthAccess = async () => {
    if (!editing) return;
    if (mode !== "edit") {
      toast.error("Créez d'abord l'utilisateur avant de réparer son accès Auth.");
      return;
    }
    const loginEmail = safeTrim(editing.user_email).toLowerCase();
    if (!loginEmail) {
      toast.error("L'email est requis pour réparer l'accès Auth.");
      return;
    }
    const tempPassword = temporaryPassword.trim();
    if (tempPassword.length < 6) {
      toast.error("Le mot de passe provisoire doit contenir au moins 6 caractères.");
      return;
    }
    const parsedRoleId = Number.parseInt(normalizeRoleValue(editing.user_roles), 10);
    const nextRoleId = Number.isFinite(parsedRoleId) && parsedRoleId > 0 ? parsedRoleId : Number(editing.role_id ?? NaN);
    if (!Number.isFinite(nextRoleId)) {
      toast.error("Rôle utilisateur introuvable.");
      return;
    }

    setRepairingAuth(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        login_email?: string;
        error?: string;
      }>("admin-repair-auth-user", {
        body: {
          user_id: editing.id,
          email: loginEmail,
          password: tempPassword,
          prenom: safeTrim(editing.user_prenom),
          nom: safeTrim(editing.user_nom),
          role_id: nextRoleId,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Réparation Auth impossible.");
      const resolvedLoginEmail = (data.login_email || loginEmail).trim().toLowerCase();
      setEditing((prev) => (prev ? { ...prev, user_email: resolvedLoginEmail } : prev));
      toast.success(`Accès Auth réparé. Connexion: ${resolvedLoginEmail}`);
    } catch (e) {
      let fnMessage = "";
      const maybeContext = (e as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } })?.context;
      if (maybeContext?.json) {
        try {
          const payload = (await maybeContext.json()) as { error?: unknown };
          if (typeof payload?.error === "string") fnMessage = payload.error.trim();
        } catch {
          // ignorer, on retombe sur le message standard
        }
      }
      if (!fnMessage && maybeContext?.text) {
        try {
          const txt = await maybeContext.text();
          if (txt?.trim()) fnMessage = txt.trim();
        } catch {
          // ignorer
        }
      }
      const msg = fnMessage || (e instanceof Error ? e.message : "Réparation Auth impossible.");
      toast.error(msg);
    } finally {
      setRepairingAuth(false);
    }
  };

  const hasUserChanges = (() => {
    if (!editing) return false;
    if (photoFile) return true;
    if (!initialEditing) return true;
    const normalize = (value: unknown) => {
      if (typeof value === "string") return value.trim();
      if (value == null) return "";
      return String(value).trim();
    };
    const keys: Array<keyof UserRow> = [
      "agency_id",
      "user_photo_url",
      "user_prenom",
      "user_nom",
      "user_pseudo",
      "user_age",
      "user_email",
      "user_phone",
      "user_expo_id",
      "user_roles",
      "user_control",
    ];
    return keys.some((key) => normalize(editing[key]) !== normalize(initialEditing[key]));
  })();

  if (embeddedDialogOnly) {
    return (
      <Dialog open={DEBUG_FORCE_DIALOG_OPEN ? true : dialogOpen} onOpenChange={(nextOpen) => closeDialog(nextOpen)}>
        <DialogContent
          hideCloseButton
          className="max-h-[90vh] max-w-2xl overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb]"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{mode === "create" ? "Nouvel utilisateur" : "Fiche de l'utilisateur"}</DialogTitle>
          <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-xl text-white sm:text-2xl">
                {mode === "create" ? "Nouvel utilisateur" : "Fiche de l'utilisateur"}
              </h2>
              <div className="flex items-center gap-2">
                {mode === "edit" && canRepairAuthAccess && (
                  <Button
                    type="button"
                    onClick={() => void repairAuthAccess()}
                    disabled={saving || repairingAuth || !editing}
                    className="h-9 px-3 text-sm border border-white/70 bg-[#7a1f2a] text-white font-semibold hover:bg-[#651822]"
                  >
                    {repairingAuth ? "Réparation Auth..." : "Réparer accès Auth"}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !editing || checkingControl || controlExists || (mode === "edit" && !hasUserChanges)}
                  className={
                    mode === "edit"
                      ? "h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b]"
                      : "h-9 px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground"
                  }
                >
                  {saving ? "Enregistrement…" : mode === "create" ? "Enregistrer" : "Enregistrer les modifications"}
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-5 pt-3 pb-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="h-[100px] w-[200px] shrink-0 overflow-hidden rounded-md border border-border bg-muted/20">
                {agencyLogoUrl ? (
                  <img src={agencyLogoUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
              <div className="h-[100px] w-[200px] shrink-0 overflow-hidden rounded-md border border-border bg-muted/20">
                {expoLogoUrl ? (
                  <img src={expoLogoUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
            </div>
          </div>

          {!editing ? null : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="space-y-5 pt-2 px-4 sm:px-5 pb-4"
            >
              <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
                <div className="space-y-2">
                  <div className="relative flex h-44 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
                    {photoPreview || toPublicStorageUrl(editing.user_photo_url) ? (
                      <img
                        src={photoPreview || toPublicStorageUrl(editing.user_photo_url)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <UserRound className="h-14 w-14 text-muted-foreground" aria-hidden />
                    )}
                    <label
                      htmlFor="user-photo-upload-overlay"
                      className="absolute inset-x-0 top-0 z-10 cursor-pointer bg-black/30 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-[1px] transition hover:bg-black/45"
                    >
                      Changer la photo
                    </label>
                    <Input
                      id="user-photo-upload-overlay"
                      type="file"
                      accept="image/*"
                      disabled={saving}
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        if (!file) return;
                        try {
                          assertImageFileAllowed(file);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Image invalide.");
                          return;
                        }
                        setPhotoFile(file);
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhotoPreview(URL.createObjectURL(file));
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-prenom" className="w-[70px] shrink-0 text-xs">
                      Prénom
                    </Label>
                    <Input
                      id="user-prenom"
                      autoComplete="given-name"
                      value={editing.user_prenom ?? ""}
                      onChange={(e) => setField("user_prenom", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-nom" className="w-[70px] shrink-0 text-xs">
                      Nom
                    </Label>
                    <Input
                      id="user-nom"
                      autoComplete="family-name"
                      value={editing.user_nom ?? ""}
                      onChange={(e) => setField("user_nom", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-pseudo" className="w-[70px] shrink-0 text-xs">
                      Pseudo
                    </Label>
                    <Input
                      id="user-pseudo"
                      value={editing.user_pseudo ?? ""}
                      onChange={(e) => setField("user_pseudo", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-age" className="w-[70px] shrink-0 text-xs">
                      Tranche d'âge
                    </Label>
                    <Select value={editing.user_age ?? ""} onValueChange={(v) => setField("user_age", v)} disabled={saving}>
                      <SelectTrigger id="user-age" className="h-9 flex-1">
                        <SelectValue placeholder="Choisir une tranche d’âge" />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_AGE_OPTIONS.map((age) => (
                          <SelectItem key={age} value={age}>
                            {age}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-phone" className="w-[70px] shrink-0 text-xs">
                      Tél.
                    </Label>
                    <SmartPhoneInput
                      id="user-phone"
                      value={editing.user_phone ?? ""}
                      onChange={(value) => setField("user_phone", value)}
                      onValidityChange={setPhoneValid}
                      disabled={saving}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    type="email"
                    autoComplete="email"
                    value={editing.user_email ?? ""}
                    onChange={(e) => setField("user_email", e.target.value)}
                    disabled={saving || currentRoleId === 4}
                  />
                </div>
                {(mode === "create" || mode === "edit") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="user-temporary-password">
                      {mode === "create" ? "Mot de passe provisoire" : "Nouveau mot de passe provisoire"}
                    </Label>
                    <Input
                      id="user-temporary-password"
                      type="password"
                      autoComplete="new-password"
                      value={temporaryPassword}
                      onChange={(e) => setTemporaryPassword(e.target.value)}
                      disabled={saving}
                      placeholder="Saisir un mot de passe provisoire"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1.5 w-[302px]">
                <Label htmlFor="user-roles">Rôles</Label>
                <Select
                  value={normalizeRoleValue(editing.user_roles)}
                  onValueChange={(v) => {
                    setField("user_roles", v);
                    const roleId = roleIdFromValue(v);
                    if (roleId != null && roleId >= 1 && roleId <= 4) {
                      setField("agency_id", "");
                      setField("user_expo_id", "");
                    }
                  }}
                  disabled={saving}
                >
                  <SelectTrigger id="user-roles">
                    <SelectValue placeholder="Choisir un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.length === 0 && (
                      <SelectItem value="__none_role__" disabled>
                        Aucun rôle disponible
                      </SelectItem>
                    )}
                    {roleOptions.map((role) => (
                      <SelectItem key={role.role_id} value={String(role.role_id)}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user-agency">Organisation</Label>
                  <Select
                    value={editing.agency_id ?? ""}
                    onValueChange={(v) => {
                      setField("agency_id", v);
                      setField("user_expo_id", "");
                    }}
                    disabled={!canEditAgency}
                  >
                    <SelectTrigger id="user-agency">
                      <SelectValue placeholder="Choisir une organisation" />
                    </SelectTrigger>
                    <SelectContent>
                      {agenciesRef.length === 0 && (
                        <SelectItem value="__none_agency__" disabled>
                          Aucune organisation disponible
                        </SelectItem>
                      )}
                      {agenciesRef.map((agency) => (
                        <SelectItem key={agency.id} value={agency.id}>
                          {agency.name_agency || agency.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-expo">Expo</Label>
                  <Select
                    value={editing.user_expo_id ?? ""}
                    onValueChange={(v) => setField("user_expo_id", v)}
                    disabled={!canEditExpo}
                  >
                    <SelectTrigger id="user-expo">
                      <SelectValue
                        placeholder={
                          roleIdFromValue(editing.user_roles) === 4
                            ? "Non applicable pour ce rôle"
                            : resolvedAgencyId
                            ? "Choisir une exposition"
                            : "Aucune agence connectée"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {expoOptions.length === 0 && (
                        <SelectItem value="__none_expo__" disabled>
                          Aucune expo disponible
                        </SelectItem>
                      )}
                      {expoOptions.map((expo) => (
                        <SelectItem key={expo.id} value={expo.value}>
                          {expo.expo_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Agence utilisée pour filtrer les expos : {resolvedAgencyLabel}
                  </p>
                </div>
              </div>

              {checkingControl && <p className="text-xs text-muted-foreground">Vérification du contrôle utilisateur…</p>}
              {!checkingControl && controlExists && (
                <p className="text-xs text-destructive">
                  Ce contrôle existe déjà. Le bouton Enregistrer est désactivé.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">{/* Action d'enregistrement conservée dans le header rouge */}</div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col gap-3 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-white">Utilisateurs</h2>
        </div>
        <div className="relative w-[210px] min-w-[210px] max-w-[210px] md:mr-auto">
          <Input
            type="text"
            autoComplete="off"
            list="users-search-suggestions"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher un utilisateur..."
            className="h-9 !w-[210px] min-w-[210px] max-w-[210px] bg-white pr-9"
          />
          {searchTerm.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
              title="Effacer"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <datalist id="users-search-suggestions">
            {searchSuggestions.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
        <Button
          type="button"
          className="gap-2 gradient-gold gradient-gold-hover-bg text-primary-foreground"
          onClick={openCreate}
        >
          + Nouvel utilisateur
        </Button>
        <Button asChild type="button" variant="outline" className="border-border bg-background/80">
          <Link to="/user/utilisateurs" className="text-center leading-tight">Tableau</Link>
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {loading && <p className="text-sm text-muted-foreground text-center py-12">Chargement des utilisateurs…</p>}
        {!loading && !error && filteredUsers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">Aucun utilisateur visible.</p>
        )}

        {filteredUsers.map((u) => (
          <Card key={u.id} className="glass-card hover:shadow-lg transition-all duration-300">
            <CardContent
              className="p-4 flex flex-col sm:flex-row items-start gap-4 cursor-pointer hover:bg-muted/10"
              role="button"
              tabIndex={0}
              onClick={() => openEdit(u)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEdit(u);
                }
              }}
            >
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/40">
                {toPublicStorageUrl(u.user_photo_url) ? (
                  <img
                    src={toPublicStorageUrl(u.user_photo_url)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <UserRound className="h-12 w-12 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="font-serif font-bold text-lg">{userFullName(u)}</h3>
                {u.user_pseudo?.trim() ? (
                  <p
                    className="font-sans text-[12px] font-bold italic text-[#000091]"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {`alias "${u.user_pseudo.trim()}"`}
                  </p>
                ) : null}
                <p className="text-sm font-bold italic">{roleLabelFromUserRow(u, roleOptions)}</p>
                {u.user_email?.trim() ? <p className="text-sm">{u.user_email.trim()}</p> : null}
                {u.user_phone?.trim() ? <p className="text-sm">{u.user_phone.trim()}</p> : null}
              </div>
              <div className="ml-auto flex w-24 shrink-0 flex-col gap-1">
                <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/20">
                  {u.agency_id && agencyLogoById.get(u.agency_id) ? (
                    <img
                      src={agencyLogoById.get(u.agency_id) || ""}
                      alt=""
                      className="h-full w-full object-contain p-1"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="h-full w-full" />
                  )}
                </div>
                <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/20">
                  {Number(u.role_id) === 4 ? (
                    <span className="px-1 text-center text-[10px] leading-tight text-muted-foreground">
                      Responsable de toutes les expos de l'organisation
                    </span>
                  ) : u.user_expo_id && expoLogosByKey.get(u.user_expo_id) ? (
                    <img
                      src={expoLogosByKey.get(u.user_expo_id) || ""}
                      alt=""
                      className="h-full w-full object-contain p-1"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="h-full w-full" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={DEBUG_FORCE_DIALOG_OPEN ? true : dialogOpen} onOpenChange={(nextOpen) => closeDialog(nextOpen)}>
        <DialogContent
          hideCloseButton
          className="max-h-[90vh] max-w-2xl overflow-y-auto overflow-x-hidden border-border bg-background p-0 gap-0 shadow-xl bg-gradient-to-b from-[#f8f8f8] via-white to-[#f6f2eb]"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{mode === "create" ? "Nouvel utilisateur" : "Fiche de l'utilisateur"}</DialogTitle>
          <div className="sticky top-0 z-30 px-4 sm:px-5 py-3 bg-[#E63946] border-b border-[#c92f3b] shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-xl text-white sm:text-2xl">
                {mode === "create" ? "Nouvel utilisateur" : "Fiche de l'utilisateur"}
              </h2>
              <div className="flex items-center gap-2">
                {mode === "edit" && canRepairAuthAccess && (
                  <Button
                    type="button"
                    onClick={() => void repairAuthAccess()}
                    disabled={saving || repairingAuth || !editing}
                    className="h-9 px-3 text-sm border border-white/70 bg-[#7a1f2a] text-white font-semibold hover:bg-[#651822]"
                  >
                    {repairingAuth ? "Réparation Auth..." : "Réparer accès Auth"}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !editing || checkingControl || controlExists || (mode === "edit" && !hasUserChanges)}
                  className={
                    mode === "edit"
                      ? "h-9 px-3 text-sm border border-white bg-white text-[#E63946] font-semibold hover:bg-[#ffecef] hover:text-[#c92f3b]"
                      : "h-9 px-3 text-sm gradient-gold gradient-gold-hover-bg text-primary-foreground"
                  }
                >
                  {saving ? "Enregistrement…" : mode === "create" ? "Enregistrer" : "Enregistrer les modifications"}
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-5 pt-3 pb-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="h-[100px] w-[200px] shrink-0 overflow-hidden rounded-md border border-border bg-muted/20">
                {agencyLogoUrl ? (
                  <img src={agencyLogoUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
              <div className="h-[100px] w-[200px] shrink-0 overflow-hidden rounded-md border border-border bg-muted/20">
                {expoLogoUrl ? (
                  <img src={expoLogoUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
            </div>
          </div>

          {!editing ? null : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="space-y-5 pt-2 px-4 sm:px-5 pb-4"
            >
              <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
                <div className="space-y-2">
                  <div className="relative flex h-44 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
                    {photoPreview || toPublicStorageUrl(editing.user_photo_url) ? (
                      <img
                        src={photoPreview || toPublicStorageUrl(editing.user_photo_url)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <UserRound className="h-14 w-14 text-muted-foreground" aria-hidden />
                    )}
                    <label
                      htmlFor="user-photo-upload-overlay"
                      className="absolute inset-x-0 top-0 z-10 cursor-pointer bg-black/30 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-[1px] transition hover:bg-black/45"
                    >
                      Changer la photo
                    </label>
                    <Input
                      id="user-photo-upload-overlay"
                      type="file"
                      accept="image/*"
                      disabled={saving}
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        if (!file) return;
                        try {
                          assertImageFileAllowed(file);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Image invalide.");
                          return;
                        }
                        setPhotoFile(file);
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhotoPreview(URL.createObjectURL(file));
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-prenom" className="w-[70px] shrink-0 text-xs">
                      Prénom
                    </Label>
                    <Input
                      id="user-prenom"
                      autoComplete="given-name"
                      value={editing.user_prenom ?? ""}
                      onChange={(e) => setField("user_prenom", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-nom" className="w-[70px] shrink-0 text-xs">
                      Nom
                    </Label>
                    <Input
                      id="user-nom"
                      autoComplete="family-name"
                      value={editing.user_nom ?? ""}
                      onChange={(e) => setField("user_nom", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-pseudo" className="w-[70px] shrink-0 text-xs">
                      Pseudo
                    </Label>
                    <Input
                      id="user-pseudo"
                      value={editing.user_pseudo ?? ""}
                      onChange={(e) => setField("user_pseudo", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-age" className="w-[70px] shrink-0 text-xs">
                      Tranche d'âge
                    </Label>
                    <Select value={editing.user_age ?? ""} onValueChange={(v) => setField("user_age", v)} disabled={saving}>
                      <SelectTrigger id="user-age" className="h-9 flex-1">
                        <SelectValue placeholder="Choisir une tranche d’âge" />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_AGE_OPTIONS.map((age) => (
                          <SelectItem key={age} value={age}>
                            {age}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-phone" className="w-[70px] shrink-0 text-xs">
                      Tél.
                    </Label>
                    <SmartPhoneInput
                      id="user-phone"
                      value={editing.user_phone ?? ""}
                      onChange={(value) => setField("user_phone", value)}
                      onValidityChange={setPhoneValid}
                      disabled={saving}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    type="email"
                    autoComplete="email"
                    value={editing.user_email ?? ""}
                    onChange={(e) => setField("user_email", e.target.value)}
                    disabled={saving || currentRoleId === 4}
                  />
                </div>
                {(mode === "create" || mode === "edit") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="user-temporary-password">
                      {mode === "create" ? "Mot de passe provisoire" : "Nouveau mot de passe provisoire"}
                    </Label>
                    <Input
                      id="user-temporary-password"
                      type="password"
                      autoComplete="new-password"
                      value={temporaryPassword}
                      onChange={(e) => setTemporaryPassword(e.target.value)}
                      disabled={saving}
                      placeholder="Saisir un mot de passe provisoire"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1.5 w-[302px]">
                <Label htmlFor="user-roles">Rôles</Label>
                <Select
                  value={normalizeRoleValue(editing.user_roles)}
                  onValueChange={(v) => {
                    setField("user_roles", v);
                    const roleId = roleIdFromValue(v);
                    if (roleId != null && roleId >= 1 && roleId <= 4) {
                      setField("agency_id", "");
                      setField("user_expo_id", "");
                    }
                  }}
                  disabled={saving}
                >
                  <SelectTrigger id="user-roles">
                    <SelectValue placeholder="Choisir un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.length === 0 && (
                      <SelectItem value="__none_role__" disabled>
                        Aucun rôle disponible
                      </SelectItem>
                    )}
                    {roleOptions.map((role) => (
                      <SelectItem key={role.role_id} value={String(role.role_id)}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user-agency">Organisation</Label>
                  <Select
                    value={editing.agency_id ?? ""}
                    onValueChange={(v) => {
                      setField("agency_id", v);
                      // Lors d'un changement d'organisation, on réinitialise l'expo sélectionnée.
                      setField("user_expo_id", "");
                    }}
                    disabled={!canEditAgency}
                  >
                    <SelectTrigger id="user-agency">
                      <SelectValue placeholder="Choisir une organisation" />
                    </SelectTrigger>
                    <SelectContent>
                      {agenciesRef.length === 0 && (
                        <SelectItem value="__none_agency__" disabled>
                          Aucune organisation disponible
                        </SelectItem>
                      )}
                      {agenciesRef.map((agency) => (
                        <SelectItem key={agency.id} value={agency.id}>
                          {agency.name_agency || agency.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-expo">Expo</Label>
                  <Select
                    value={editing.user_expo_id ?? ""}
                    onValueChange={(v) => setField("user_expo_id", v)}
                    disabled={!canEditExpo}
                  >
                    <SelectTrigger id="user-expo">
                      <SelectValue
                        placeholder={
                          roleIdFromValue(editing.user_roles) === 4
                            ? "Non applicable pour ce rôle"
                            : resolvedAgencyId
                            ? "Choisir une exposition"
                            : "Aucune agence connectée"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {expoOptions.length === 0 && (
                        <SelectItem value="__none_expo__" disabled>
                          Aucune expo disponible
                        </SelectItem>
                      )}
                      {expoOptions.map((expo) => (
                        <SelectItem key={expo.id} value={expo.value}>
                          {expo.expo_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Agence utilisée pour filtrer les expos : {resolvedAgencyLabel}
                  </p>
                </div>
              </div>

              {checkingControl && <p className="text-xs text-muted-foreground">Vérification du contrôle utilisateur…</p>}
              {!checkingControl && controlExists && (
                <p className="text-xs text-destructive">
                  Ce contrôle existe déjà. Le bouton Enregistrer est désactivé.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                {/* Action d'enregistrement conservée dans le header rouge */}
              </div>

            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;




