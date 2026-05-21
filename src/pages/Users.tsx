import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { UserRound, X, Loader2 } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ProfileAvatarImage } from "@/components/ProfileAvatarImage";
import { Button } from "@/components/ui/button";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import { BackofficeStickyAgencyLogoSlot } from "@/components/BackofficeStickyAgencyLogo";
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
import { BIRTH_YEARS, birthMonthOptions, readBirthMonthFromMeta, readBirthYearFromSources, readMetaString } from "@/lib/birthProfile";
import { supabase } from "@/lib/supabase";
import { assertImageFileAllowed, prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { uploadBackofficeUserPhoto } from "@/lib/storagePaths";
import { toPublicStorageUrl, resolveAvatarDisplayUrl, readAvatarFromMeta } from "@/lib/supabaseStorage";
import { fetchUserEditDetails } from "@/lib/userEditDetails";
import { resolveUserAvatarUrl, readAvatarFromRpcRow } from "@/lib/userAvatar";
import { isRoleAssignableBy, parseNumericRoleId } from "@/lib/roleHierarchy";

// ---------------------------------------------------------------------------
// Nouveau modèle :
//   - profiles       : données profil (first_name, last_name, username, avatar_url, phone)
//   - agency_users   : rattachement agence + role_id
//   - expo_user_role : rattachement expo
//   - auth.users     : email + métadonnées auth (email lu via session ou RPC admin)
// ---------------------------------------------------------------------------
type UserRow = {
  id: string;
  role_id?: number | null;
  agency_id?: string | null;
  avatar_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  birth_month?: string | null;
  birth_year?: string | null;
  email?: string | null;
  phone?: string | null;
  expo_id?: string | null;
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
  const full = [row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(" ");
  return full || "Utilisateur";
}

function roleLabelFromUserRow(row: UserRow, roleOptions: RoleOption[]): string {
  const roleId = Number(row.role_id ?? NaN);
  if (!Number.isFinite(roleId)) return "—";
  const option = roleOptions.find((r) => r.role_id === roleId);
  return option?.label || `Rôle ${roleId}`;
}

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function roleIdFromValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = typeof value === "string" ? value.trim() : "";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Rôles 1–4 : peuvent affecter une expo aux membres curateur / équipe expo. */
function callerCanAssignExpo(callerRoleId: number | null | undefined): boolean {
  return typeof callerRoleId === "number" && Number.isFinite(callerRoleId) && callerRoleId >= 1 && callerRoleId < 5;
}

function targetRoleUsesExpo(targetRoleId: number | null | undefined): boolean {
  return targetRoleId === 5 || targetRoleId === 6;
}

function applyRoleChangeToUserRow(
  prev: UserRow,
  roleId: number | null,
  connectedAgencyId: string | null | undefined,
): UserRow {
  if (roleId != null && roleId >= 1 && roleId <= 3) {
    return { ...prev, role_id: roleId, agency_id: null, expo_id: null };
  }
  const agencyFallback = prev.agency_id?.trim() || connectedAgencyId?.trim() || null;
  if (roleId === 4) {
    return { ...prev, role_id: roleId, agency_id: agencyFallback || null, expo_id: null };
  }
  if (roleId === 5 || roleId === 6) {
    return { ...prev, role_id: roleId, agency_id: agencyFallback || null };
  }
  return { ...prev, role_id: roleId };
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

async function uploadUserPhoto(file: File, userId?: string | null): Promise<string> {
  const uid = userId?.trim();
  if (!uid) {
    throw new Error("Identifiant utilisateur requis pour enregistrer la photo.");
  }
  const prepared = await prepareImageForSupabaseUpload(file);
  return uploadBackofficeUserPhoto(uid, prepared, prepared.name);
}

type RpcUserWithRolesRow = {
  id?: string | null;
  user_id?: string | null;
  role_id?: unknown;
  agency_id?: string | null;
  expo_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  user_photo_url?: string | null;
  photo_url?: string | null;
  picture?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_year?: number | string | null;
  birth_month?: string | number | null;
};

function rpcRowUserId(row: RpcUserWithRolesRow): string {
  const raw = row.id ?? row.user_id;
  return typeof raw === "string" ? raw.trim() : "";
}

function fillMissingProfileFields(target: UserRow, source: Partial<UserRow>): UserRow {
  const next = { ...target };
  const keys: Array<keyof UserRow> = [
    "first_name",
    "last_name",
    "username",
    "avatar_url",
    "phone",
    "email",
    "birth_year",
    "birth_month",
  ];
  for (const key of keys) {
    const current = next[key];
    const incoming = source[key];
    if ((current == null || (typeof current === "string" && !current.trim())) && incoming != null) {
      if (typeof incoming === "string") {
        if (incoming.trim()) next[key] = incoming.trim();
      } else {
        next[key] = incoming;
      }
    }
  }
  return next;
}

function coalesceAvatarUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Fusionne la ligne RPC et le seed dashboard (noms profil + photo RPC). */
function mergeEmbeddedEditRow(existing: UserRow, seed: Partial<UserRow>): UserRow {
  const merged = fillMissingProfileFields(existing, seed);
  return {
    ...merged,
    avatar_url: coalesceAvatarUrl(existing.avatar_url, seed.avatar_url),
    email: existing.email?.trim() || seed.email?.trim() || null,
    role_id: existing.role_id ?? seed.role_id ?? null,
    agency_id: existing.agency_id ?? seed.agency_id ?? null,
    expo_id: existing.expo_id ?? seed.expo_id ?? null,
  };
}

/** Complète photo, email et naissance avant affichage du formulaire. */
async function enrichUserRowForEdit(row: UserRow, sessionUser: User | null): Promise<UserRow> {
  let enriched = { ...row };
  const isSelf = sessionUser?.id === row.id;

  const details = await fetchUserEditDetails(row.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url, birth_year, first_name, last_name, username, phone")
    .eq("id", row.id)
    .maybeSingle();

  const p = profile as {
    avatar_url?: string | null;
    birth_year?: number | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    phone?: string | null;
  } | null;

  if (details) {
    enriched = fillMissingProfileFields(enriched, {
      email: typeof details.email === "string" ? details.email : null,
      first_name: typeof details.first_name === "string" ? details.first_name : null,
      last_name: typeof details.last_name === "string" ? details.last_name : null,
      username: typeof details.username === "string" ? details.username : null,
      phone: typeof details.phone === "string" ? details.phone : null,
      avatar_url: typeof details.avatar_url === "string" ? details.avatar_url : null,
      birth_year: typeof details.birth_year === "number" ? String(details.birth_year) : null,
      birth_month:
        details.birth_month != null
          ? readBirthMonthFromMeta({ birth_month: details.birth_month })
          : null,
    });
  }

  enriched = fillMissingProfileFields(enriched, {
    first_name: p?.first_name ?? null,
    last_name: p?.last_name ?? null,
    username: p?.username ?? null,
    avatar_url: p?.avatar_url ?? null,
    phone: p?.phone ?? null,
    birth_year:
      typeof p?.birth_year === "number" && Number.isFinite(p.birth_year) ? String(p.birth_year) : null,
  });

  if (isSelf && sessionUser) {
    if (sessionUser.email?.trim()) enriched.email = sessionUser.email.trim();
    const meta = (sessionUser.user_metadata as Record<string, unknown> | undefined) ?? {};
    enriched = fillMissingProfileFields(enriched, {
      first_name: readMetaString(meta, "first_name", "firstname", "prenom") || null,
      last_name: readMetaString(meta, "last_name", "lastname", "nom") || null,
      username: readMetaString(meta, "username") || null,
      phone: readMetaString(meta, "phone") || null,
    });
    const metaAvatar = readAvatarFromMeta(meta);
    if (metaAvatar) enriched.avatar_url = enriched.avatar_url?.trim() || metaAvatar;
    enriched.birth_month = readBirthMonthFromMeta(meta) || enriched.birth_month || null;
    if (!enriched.birth_year?.trim()) {
      enriched.birth_year = readBirthYearFromSources(p?.birth_year, meta) || null;
    }
  }

  const needsRpc =
    !enriched.email?.trim() ||
    !enriched.avatar_url?.trim() ||
    !enriched.birth_year?.trim() ||
    !enriched.first_name?.trim() ||
    !enriched.last_name?.trim();
  if (needsRpc) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_users_with_roles");
    if (!rpcErr && Array.isArray(rpcData)) {
      const rpcRow = (rpcData as RpcUserWithRolesRow[]).find((r) => rpcRowUserId(r) === row.id);
      if (rpcRow) {
        enriched = fillMissingProfileFields(enriched, {
          avatar_url: readAvatarFromRpcRow(rpcRow) ?? (typeof rpcRow.avatar_url === "string" ? rpcRow.avatar_url : null),
          email: typeof rpcRow.email === "string" ? rpcRow.email : null,
          first_name: rpcRow.first_name ?? null,
          last_name: rpcRow.last_name ?? null,
          username: rpcRow.username ?? null,
          phone: rpcRow.phone ?? null,
          birth_year:
            rpcRow.birth_year != null && String(rpcRow.birth_year).trim()
              ? String(rpcRow.birth_year).trim()
              : null,
          birth_month:
            rpcRow.birth_month != null
              ? readBirthMonthFromMeta({ birth_month: rpcRow.birth_month })
              : null,
        });
      }
    }
  }

  const resolvedAvatar = await resolveUserAvatarUrl(row.id, sessionUser, {
    seedAvatarUrl: enriched.avatar_url,
    profileAvatarUrl: p?.avatar_url,
  });
  if (resolvedAvatar) {
    enriched.avatar_url = resolvedAvatar;
  }

  return enriched;
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

async function persistUserEmailChange(params: {
  userId: string;
  previousEmail: string;
  nextEmail: string;
  isSelf: boolean;
}): Promise<{ changed: boolean; message?: string }> {
  const prev = normalizeEmail(params.previousEmail);
  const next = normalizeEmail(params.nextEmail);
  if (!next) {
    throw new Error("L'e-mail est requis.");
  }
  if (next === prev) {
    return { changed: false };
  }
  if (!/\S+@\S+\.\S+/.test(next)) {
    throw new Error("Adresse e-mail invalide.");
  }

  if (params.isSelf) {
    const { error } = await supabase.auth.updateUser({ email: next });
    if (error) throw error;
    return {
      changed: true,
      message:
        "Un e-mail de confirmation a été envoyé à la nouvelle adresse. Validez le lien pour finaliser le changement.",
    };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    email?: string;
    unchanged?: boolean;
  }>("admin-update-user-email", {
    body: { user_id: params.userId, email: next },
  });
  if (error) throw error;
  if (!data?.ok) {
    throw new Error(data?.error || "Mise à jour e-mail impossible.");
  }
  if (data.unchanged) {
    return { changed: false };
  }
  return {
    changed: true,
    message: `E-mail de connexion mis à jour : ${data.email || next}`,
  };
}

type UserPhotoFieldProps = {
  avatarUrl: string | null | undefined;
  photoPreview: string;
  saving: boolean;
  inputId: string;
  onFileSelected: (file: File) => void;
};

function UserPhotoField({ avatarUrl, photoPreview, saving, inputId, onFileSelected }: UserPhotoFieldProps) {
  return (
    <div className="relative flex h-44 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
      <ProfileAvatarImage
        src={avatarUrl}
        previewUrl={photoPreview}
        className="h-full w-full object-cover"
        iconClassName="h-14 w-14"
      />
      <label
        htmlFor={inputId}
        className="absolute inset-x-0 top-0 z-10 cursor-pointer bg-black/30 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-[1px] transition hover:bg-black/45"
      >
        Changer la photo
      </label>
      <Input
        id={inputId}
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
          onFileSelected(file);
        }}
      />
    </div>
  );
}

/** Données pré-chargées pour ouvrir la fiche sans requête (ex. depuis le dashboard). */
export type UsersEditSeed = UserRow;

function mapRpcRowToUserRow(row: RpcUserWithRolesRow): UserRow | null {
  const id = rpcRowUserId(row);
  if (!id) return null;
  const birthYearRaw = row.birth_year;
  const birthYear =
    birthYearRaw != null && String(birthYearRaw).trim() ? String(birthYearRaw).trim() : null;
  return {
    id,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    username: row.username ?? null,
    avatar_url: readAvatarFromRpcRow(row) ?? row.avatar_url ?? null,
    phone: row.phone ?? null,
    email: typeof row.email === "string" ? row.email.trim() || null : null,
    birth_month:
      row.birth_month != null ? readBirthMonthFromMeta({ birth_month: row.birth_month }) || null : null,
    birth_year: birthYear,
    role_id: parseNumericRoleId(row.role_id),
    agency_id: row.agency_id ?? null,
    expo_id: row.expo_id ?? null,
  };
}

async function fetchUserProfileFallback(
  targetId: string,
  connectedAgencyId?: string | null,
): Promise<UserRow | null> {
  const [
    { data: profile, error: profileErr },
    { data: agencyRow },
    { data: expoRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, username, avatar_url, phone, birth_year")
      .eq("id", targetId)
      .maybeSingle(),
    supabase
      .from("agency_users")
      .select("agency_id, role_id")
      .eq("user_id", targetId)
      .order("role_id", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("expo_user_role")
      .select("expo_id")
      .eq("user_id", targetId)
      .order("assigned_at", { ascending: false }),
  ]);

  const p = profile as {
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    phone?: string | null;
    birth_year?: number | null;
  } | null;
  const a = agencyRow as { agency_id?: string | null; role_id?: unknown } | null;

  if (profileErr && import.meta.env.DEV) {
    console.warn("[Users] lecture profiles fallback :", profileErr.message);
  }

  if (!p?.id && !a?.agency_id && !a?.role_id) return null;

  const expoList = (expoRows as Array<{ expo_id?: string | null }> | null) ?? [];
  const firstExpo = expoList.find((row) => typeof row.expo_id === "string" && row.expo_id.trim())?.expo_id?.trim();

  return {
    id: targetId,
    first_name: p?.first_name ?? null,
    last_name: p?.last_name ?? null,
    username: p?.username ?? null,
    avatar_url: p?.avatar_url ?? null,
    phone: p?.phone ?? null,
    email: null,
    birth_month: null,
    birth_year:
      typeof p?.birth_year === "number" && Number.isFinite(p.birth_year) ? String(p.birth_year) : null,
    role_id: parseNumericRoleId(a?.role_id),
    agency_id: a?.agency_id ?? connectedAgencyId ?? null,
    expo_id: firstExpo ?? null,
  };
}

// Lecture d'un utilisateur (auth.users.id = profiles.id) via RPC admin, repli profiles si RLS.
async function fetchUserById(targetId: string, connectedAgencyId?: string | null): Promise<UserRow | null> {
  const trimmed = targetId.trim();
  if (!trimmed) return null;

  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_users_with_roles");
  if (!rpcErr && Array.isArray(rpcData)) {
    const row = (rpcData as RpcUserWithRolesRow[]).find((r) => rpcRowUserId(r) === trimmed);
    if (row) return mapRpcRowToUserRow({ ...row, id: rpcRowUserId(row) });
  }

  return fetchUserProfileFallback(trimmed, connectedAgencyId);
}

type UsersProps = {
  embeddedDialogOnly?: boolean;
  forcedEditUserId?: string | null;
  /** Données déjà connues côté appelant (évite « utilisateur introuvable » avant le RPC). */
  forcedEditUserSeed?: UsersEditSeed | null;
  /** Ouvre directement le dialog de création (mode embedded). */
  forceCreateDialog?: boolean;
  onDialogClosed?: () => void;
  onUserSaved?: () => void;
  /** Remonte l'URL avatar résolue (sync dashboard ↔ fiche utilisateur). */
  onAvatarResolved?: (url: string | null) => void;
};

const Users = ({
  embeddedDialogOnly = false,
  forcedEditUserId = null,
  forcedEditUserSeed = null,
  forceCreateDialog = false,
  onDialogClosed,
  onUserSaved,
  onAvatarResolved,
}: UsersProps = {}) => {
  const DEBUG_FORCE_DIALOG_OPEN = false;
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUtilisateurs = (searchParams.get("from") || "").trim().toLowerCase() === "utilisateurs";
  const handledForcedEditUserIdRef = useRef<string | null>(null);
  const forcedEditFetchRef = useRef<string | null>(null);
  const handledForceCreateRef = useRef(false);
  const handledEditUserIdRef = useRef<string | null>(null);
  const { agency_id: connectedAgencyId, role_id: currentRoleId, user: authUser, refresh: refreshAuthUser } = useAuthUser();
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
  const [enrichingEdit, setEnrichingEdit] = useState(false);
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

  // -------------------------------------------------------------------------
  // Chargement liste : RPC get_all_users_with_roles (auth.users + profiles + rattachements)
  // Repli profiles si le RPC est indisponible (souvent limité par RLS au profil courant).
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_users_with_roles");
    if (!rpcErr && Array.isArray(rpcData)) {
      let merged = (rpcData as RpcUserWithRolesRow[])
        .map(mapRpcRowToUserRow)
        .filter((row): row is UserRow => row != null);

      if (currentRoleId === 2) {
        merged = merged.filter((r) => r.role_id !== 1);
      } else if (typeof currentRoleId === "number" && currentRoleId >= 4 && currentRoleId <= 6) {
        merged = merged.filter((r) => {
          const rid = r.role_id;
          return rid != null && rid >= currentRoleId && rid <= 6;
        });
      }

      const agencyFilter = connectedAgencyId?.trim();
      if (agencyFilter && currentRoleId === 4) {
        merged = merged.filter((r) => r.agency_id?.trim() === agencyFilter);
      }

      setRows(merged);
      setLoading(false);
      return;
    }

    const [
      { data: profileData, error: profileErr },
      { data: agencyData },
      { data: expoData },
    ] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name, username, avatar_url, phone"),
      supabase
        .from("agency_users")
        .select("user_id, agency_id, role_id")
        .order("role_id", { ascending: true }),
      supabase
        .from("expo_user_role")
        .select("user_id, expo_id")
        .order("assigned_at", { ascending: false }),
    ]);

    if (profileErr) {
      setRows([]);
      setError(rpcErr?.message || profileErr.message);
      setLoading(false);
      return;
    }

    // Construire des Maps : un seul rattachement par user (le plus prioritaire)
    const agencyByUser = new Map<string, { agency_id: string | null; role_id: number | null }>();
    for (const a of (agencyData ?? []) as Array<{
      user_id?: string | null;
      agency_id?: string | null;
      role_id?: unknown;
    }>) {
      const uid = typeof a.user_id === "string" ? a.user_id : "";
      if (uid && !agencyByUser.has(uid)) {
        agencyByUser.set(uid, {
          agency_id: a.agency_id ?? null,
          role_id: parseNumericRoleId(a.role_id),
        });
      }
    }
    const expoByUser = new Map<string, string | null>();
    for (const e of (expoData ?? []) as Array<{
      user_id?: string | null;
      expo_id?: string | null;
    }>) {
      const uid = typeof e.user_id === "string" ? e.user_id : "";
      if (uid && !expoByUser.has(uid)) {
        expoByUser.set(uid, typeof e.expo_id === "string" ? e.expo_id : null);
      }
    }

    const merged: UserRow[] = (
      (profileData as Array<{
        id?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
        avatar_url?: string | null;
        phone?: string | null;
      }> | null) ?? []
    )
      .filter((p) => typeof p.id === "string" && p.id.trim())
      .map((p) => {
        const uid = String(p.id);
        const agRec = agencyByUser.get(uid);
        return {
          id: uid,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          username: p.username ?? null,
          avatar_url: p.avatar_url ?? null,
          phone: p.phone ?? null,
          email: null,
          birth_month: null,
          birth_year: null,
          role_id: agRec?.role_id ?? null,
          agency_id: agRec?.agency_id ?? null,
          expo_id: expoByUser.get(uid) ?? null,
        };
      });

    setRows(merged);
    setLoading(false);
  }, [connectedAgencyId, currentRoleId]);

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
        typeof currentRoleId === "number" && Number.isFinite(currentRoleId)
          ? await base.gte("role_id", currentRoleId).lte("role_id", 7)
          : await base.in("role_id", [4, 5, 6, 7]);
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

  // Résolution de l'agency_id depuis l'expo si l'utilisateur n'en a pas encore une.
  useEffect(() => {
    if (!editing) return;
    if (editing.agency_id?.trim()) return;
    const expoId = editing.expo_id?.trim() || "";
    if (!expoId) return;

    let cancelled = false;
    void (async () => {
      const { data, error: qErr } = await supabase
        .from("expos")
        .select("agency_id")
        .or(`expo_id.eq.${expoId},id.eq.${expoId}`)
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
  }, [editing?.agency_id, editing?.expo_id, editing?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const targetAgencyId = resolvedAgencyId;
      const selectedExpoId = editing?.expo_id?.trim() || "";
      if (!targetAgencyId) {
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
      const expoId = editing?.expo_id?.trim() || "";
      if (!expoId) {
        setExpoLogoUrl("");
        return;
      }
      const { data, error: qErr } = await supabase
        .from("expos")
        .select("*")
        .or(`expo_id.eq.${expoId},id.eq.${expoId}`)
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
  }, [editing?.expo_id]);

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
      const roleId = Number(u.role_id ?? NaN);
      const roleName = Number.isFinite(roleId) ? roleNameById.get(roleId) || `Rôle ${roleId}` : "";
      const agencyName = (u.agency_id && agencyNameById.get(u.agency_id)) || "";
      const expoKey = safeTrim(u.expo_id);
      const expoName = (expoKey && expoNameByValue.get(expoKey)) || expoKey;
      return [
        userFullName(u),
        safeTrim(u.first_name),
        safeTrim(u.last_name),
        safeTrim(u.phone),
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
    const targetRoleId = typeof editing?.role_id === "number" ? editing.role_id : null;
    const targetIsLevel123 = targetRoleId != null && targetRoleId >= 1 && targetRoleId <= 3;
    if (saving || targetIsLevel123) return false;
    if (currentRoleId === 4) return mode === "create" && !connectedAgencyId;
    return currentRoleId === 1 || currentRoleId === 2 || currentRoleId === 3;
  }, [editing?.role_id, saving, currentRoleId, mode, connectedAgencyId]);

  const canEditExpo = useMemo(() => {
    const targetRoleId = typeof editing?.role_id === "number" ? editing.role_id : null;
    const targetIsLevel123 = targetRoleId != null && targetRoleId >= 1 && targetRoleId <= 3;
    if (saving || targetIsLevel123) return false;
    if (!callerCanAssignExpo(currentRoleId)) return false;
    if (!targetRoleUsesExpo(targetRoleId)) return false;
    return Boolean(resolvedAgencyId);
  }, [editing?.role_id, saving, resolvedAgencyId, currentRoleId]);

  const canEditEmailField = useMemo(() => {
    if (saving) return false;
    if (mode === "create") return true;
    if (!editing?.id) return false;
    if (authUser?.id === editing.id) return true;
    if (typeof currentRoleId === "number" && currentRoleId >= 1 && currentRoleId <= 3) return true;
    if (currentRoleId === 4) {
      const targetRoleId = typeof editing.role_id === "number" ? editing.role_id : null;
      return targetRoleId === 5 || targetRoleId === 6;
    }
    return false;
  }, [saving, mode, editing?.id, editing?.role_id, authUser?.id, currentRoleId]);

  const emailFieldHint = useMemo(() => {
    if (!canEditEmailField || mode !== "edit" || !editing?.id) return null;
    if (authUser?.id === editing.id) {
      return "La modification envoie un e-mail de confirmation Supabase à la nouvelle adresse.";
    }
    return "Met à jour l'e-mail de connexion (auth.users) pour cet utilisateur.";
  }, [canEditEmailField, mode, editing?.id, authUser?.id]);

  const openEdit = (row: UserRow) => {
    const rawAgencyId = safeTrim(row.agency_id);
    const resolvedAgencyId = rawAgencyId || connectedAgencyId || "";
    const baseRow: UserRow = {
      ...row,
      agency_id: resolvedAgencyId || null,
    };

    setMode("edit");
    setEditing(baseRow);
    setInitialEditing(baseRow);
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview("");
    setTemporaryPassword("");
    setPhoneValid(true);
    setDialogOpen(true);
    setEnrichingEdit(true);

    void (async () => {
      try {
        const enriched = await enrichUserRowForEdit(baseRow, authUser);
        setEditing((prev) =>
          prev?.id === enriched.id ? { ...enriched, agency_id: prev.agency_id ?? enriched.agency_id } : enriched,
        );
        setInitialEditing((prev) =>
          prev?.id === enriched.id
            ? { ...enriched, agency_id: prev?.agency_id ?? enriched.agency_id }
            : enriched,
        );
        onAvatarResolved?.(enriched.avatar_url?.trim() || null);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn("[Users] enrichissement fiche utilisateur :", e);
        }
      } finally {
        setEnrichingEdit(false);
      }
    })();
  };

  // Ouverture en edit via URL param ?edit_user_id= (page /user uniquement, pas embedded)
  useEffect(() => {
    if (embeddedDialogOnly) return;
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
      const user = await fetchUserById(targetId, connectedAgencyId);
      if (cancelled) return;
      if (!user) {
        const next = new URLSearchParams(searchParams);
        next.delete("edit_user_id");
        setSearchParams(next, { replace: true });
        toast.error("Utilisateur introuvable.");
        return;
      }
      openEdit(user);
      const next = new URLSearchParams(searchParams);
      next.delete("edit_user_id");
      setSearchParams(next, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, searchParams, setSearchParams, location.state, location.pathname, location.search, navigate]);

  // Ouverture forcée en mode embedded (prop forcedEditUserId) — même logique que Utilisateurs.tsx
  useEffect(() => {
    if (!embeddedDialogOnly) return;
    const targetId = (forcedEditUserId || "").trim();
    if (!targetId) {
      handledForcedEditUserIdRef.current = null;
      forcedEditFetchRef.current = null;
      return;
    }
    if (handledForcedEditUserIdRef.current === targetId && dialogOpen) return;

    const existing = rows.find((r) => r.id === targetId);
    if (existing) {
      handledForcedEditUserIdRef.current = targetId;
      forcedEditFetchRef.current = null;
      openEdit(existing);
      return;
    }

    if (forcedEditFetchRef.current === targetId) return;
    forcedEditFetchRef.current = targetId;

    let cancelled = false;
    void (async () => {
      const user = await fetchUserById(targetId, connectedAgencyId);
      if (cancelled) return;
      forcedEditFetchRef.current = null;
      if (!user) {
        toast.error("Utilisateur introuvable.");
        onDialogClosed?.();
        return;
      }
      handledForcedEditUserIdRef.current = targetId;
      openEdit(user);
    })();
    return () => {
      cancelled = true;
      if (forcedEditFetchRef.current === targetId) {
        forcedEditFetchRef.current = null;
      }
    };
  }, [embeddedDialogOnly, forcedEditUserId, rows, connectedAgencyId, dialogOpen]);

  // Embedded : complète la fiche quand la liste RPC ou le seed dashboard se met à jour
  useEffect(() => {
    if (!embeddedDialogOnly || !dialogOpen || mode !== "edit" || loading || !editing?.id) return;
    const targetId = editing.id.trim();
    const seed = forcedEditUserSeed?.id?.trim() === targetId ? forcedEditUserSeed : null;
    const existing = rows.find((r) => r.id === targetId);

    let patch: Partial<UserRow> | null = null;
    if (existing && seed) {
      patch = mergeEmbeddedEditRow(existing, seed);
    } else if (existing) {
      patch = existing;
    } else if (seed) {
      patch = seed;
    }
    if (!patch) return;

    setEditing((prev) =>
      prev?.id === targetId
        ? { ...fillMissingProfileFields(prev, patch), agency_id: prev.agency_id ?? patch.agency_id ?? null }
        : prev,
    );
    setInitialEditing((prev) =>
      prev?.id === targetId
        ? { ...fillMissingProfileFields(prev, patch), agency_id: prev?.agency_id ?? patch.agency_id ?? null }
        : prev,
    );
  }, [embeddedDialogOnly, dialogOpen, mode, loading, editing?.id, rows, forcedEditUserSeed]);

  // Seed dashboard : complète la fiche si le profil arrive après l'ouverture du dialog
  useEffect(() => {
    if (!embeddedDialogOnly || !dialogOpen || mode !== "edit" || !editing?.id || enrichingEdit) return;
    const targetId = (forcedEditUserId || editing.id).trim();
    if (!targetId || forcedEditUserSeed?.id !== targetId) return;

    const patch = forcedEditUserSeed;
    setEditing((prev) => (prev?.id === targetId ? fillMissingProfileFields(prev, patch) : prev));
    setInitialEditing((prev) =>
      prev?.id === targetId ? fillMissingProfileFields(prev, patch) : prev,
    );
  }, [embeddedDialogOnly, dialogOpen, mode, forcedEditUserId, forcedEditUserSeed, editing?.id, enrichingEdit]);

  const handlePhotoFileSelected = useCallback(
    (file: File) => {
      setPhotoFile(file);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(URL.createObjectURL(file));
    },
    [photoPreview],
  );

  const openCreate = () => {
    setMode("create");
    const emptyRow: UserRow = {
      id: crypto.randomUUID(),
      agency_id: connectedAgencyId || null,
      avatar_url: "",
      first_name: "",
      last_name: "",
      username: "",
      birth_month: "",
      birth_year: "",
      email: "",
      phone: "",
      expo_id: "",
      role_id: null,
    };
    setEditing(emptyRow);
    setInitialEditing({ ...emptyRow, id: "" });
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview("");
    setPhoneValid(true);
    setDialogOpen(true);
  };

  // Ouverture forcée en mode création (embedded depuis le dashboard)
  useEffect(() => {
    if (!embeddedDialogOnly || !forceCreateDialog) {
      handledForceCreateRef.current = false;
      return;
    }
    if (handledForceCreateRef.current) return;
    handledForceCreateRef.current = true;
    openCreate();
  }, [embeddedDialogOnly, forceCreateDialog]);

  const closeDialog = (open: boolean) => {
    if (!open) {
      setPhotoFile(null);
      setInitialEditing(null);
      setEnrichingEdit(false);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview("");
      setTemporaryPassword("");
      if (embeddedDialogOnly) {
        handledForcedEditUserIdRef.current = null;
        forcedEditFetchRef.current = null;
      }
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

  // Vérification d'unicité du pseudo (username) dans profiles.
  useEffect(() => {
    if (!editing) return;
    const usernameVal = editing.username?.trim() || "";
    if (!usernameVal) {
      setCheckingControl(false);
      setControlExists(false);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setCheckingControl(true);
        const { data, error: qErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", usernameVal)
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
  }, [editing?.id, editing?.username]);

  // -------------------------------------------------------------------------
  // Sauvegarde : écriture multi-tables (profiles + agency_users + expo_user_role)
  // -------------------------------------------------------------------------
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      let nextPhoto = resolveAvatarDisplayUrl(editing.avatar_url) || toPublicStorageUrl(editing.avatar_url);
      if (photoFile) {
        nextPhoto = await uploadUserPhoto(photoFile, editing.id);
      }

      const nextRoleId =
        typeof editing.role_id === "number" && editing.role_id > 0 ? editing.role_id : null;
      const isAdminOrganisation = nextRoleId === 4;
      const isLevel123 = nextRoleId != null && nextRoleId >= 1 && nextRoleId <= 3;
      const effectiveAgencyId = isLevel123
        ? null
        : editing.agency_id?.trim() || connectedAgencyId || null;
      const effectiveExpoId =
        isLevel123 || isAdminOrganisation ? null : editing.expo_id?.trim() || null;

      const birthYearNum = editing.birth_year?.trim() ? Number.parseInt(editing.birth_year.trim(), 10) : null;

      const profilePayload = {
        first_name: editing.first_name?.trim() || null,
        last_name: editing.last_name?.trim() || null,
        username: editing.username?.trim() || null,
        avatar_url: nextPhoto || null,
        phone: editing.phone?.trim() || null,
        birth_year: Number.isFinite(birthYearNum) ? birthYearNum : null,
      };

      if (mode === "create") {
        const prenom = editing.first_name?.trim() || "";
        const nom = editing.last_name?.trim() || "";
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
        if (
          typeof currentRoleId === "number" &&
          Number.isFinite(currentRoleId) &&
          !isRoleAssignableBy(currentRoleId, nextRoleId)
        ) {
          toast.error("Vous ne pouvez pas attribuer un rôle supérieur au vôtre.");
          setSaving(false);
          return;
        }
        const effectiveEmail = (editing.email?.trim() || "").toLowerCase();
        if (!effectiveEmail) {
          toast.error("L'email utilisateur est requis.");
          setSaving(false);
          return;
        }
        const tempPassword = temporaryPassword.trim();
        if (tempPassword.length < 6) {
          toast.error("Le mot de passe provisoire doit contenir au moins 6 caractères.");
          setSaving(false);
          return;
        }
        if (!phoneValid) {
          toast.error("Le numéro de téléphone est invalide pour le pays sélectionné.");
          setSaving(false);
          return;
        }

        // Création Auth via edge function
        const { data: createAuthData, error: createAuthErr } = await supabase.functions.invoke(
          "admin-create-user",
          { body: { email: effectiveEmail, password: tempPassword, prenom, nom, role_id: nextRoleId } },
        );
        if (createAuthErr) throw createAuthErr;

        const createdUserId =
          (createAuthData as { user_id?: string | null } | null)?.user_id?.trim() ||
          (createAuthData as { data?: { user_id?: string | null } } | null)?.data?.user_id?.trim() ||
          "";
        if (!createdUserId) {
          throw new Error("Création Auth réussie mais identifiant utilisateur introuvable.");
        }

        // Écriture profil
        const { error: profileErr } = await supabase
          .from("profiles")
          .upsert({ id: createdUserId, ...profilePayload }, { onConflict: "id" });
        if (profileErr) throw profileErr;

        // Rattachement agence + rôle
        if (effectiveAgencyId && nextRoleId) {
          const { error: agencyErr } = await supabase
            .from("agency_users")
            .upsert(
              { user_id: createdUserId, agency_id: effectiveAgencyId, role_id: nextRoleId },
              { onConflict: "user_id,agency_id" },
            );
          if (agencyErr) throw agencyErr;
        }

        // Rattachement expo
        if (effectiveExpoId) {
          const { error: expoErr } = await supabase
            .from("expo_user_role")
            .insert({ user_id: createdUserId, expo_id: effectiveExpoId });
          if (expoErr) throw expoErr;
        }

        toast.success(`Utilisateur créé. Email de connexion : ${effectiveEmail}`);
      } else {
        if (!phoneValid) {
          toast.error("Le numéro de téléphone est invalide pour le pays sélectionné.");
          setSaving(false);
          return;
        }

        // Mise à jour profil
        const { error: profileErr } = await supabase
          .from("profiles")
          .update(profilePayload)
          .eq("id", editing.id);
        if (profileErr) throw profileErr;

        let emailToast: string | null = null;
        const emailResult = await persistUserEmailChange({
          userId: editing.id,
          previousEmail: initialEditing?.email ?? "",
          nextEmail: editing.email ?? "",
          isSelf: authUser?.id === editing.id,
        });
        if (emailResult.message) emailToast = emailResult.message;

        if (authUser?.id === editing.id) {
          const { error: authErr } = await supabase.auth.updateUser({
            data: {
              avatar_url: nextPhoto || null,
              user_photo_url: nextPhoto || null,
              birth_month: editing.birth_month?.trim() || null,
              birth_year: Number.isFinite(birthYearNum) ? birthYearNum : null,
            },
          });
          if (authErr) throw authErr;
        }

        // Remplace le rattachement agence (delete + insert pour gérer les changements d'agence)
        await supabase.from("agency_users").delete().eq("user_id", editing.id);
        if (effectiveAgencyId && nextRoleId) {
          const { error: agencyErr } = await supabase
            .from("agency_users")
            .insert({ user_id: editing.id, agency_id: effectiveAgencyId, role_id: nextRoleId });
          if (agencyErr) throw agencyErr;
        }

        // Remplace le rattachement expo
        await supabase.from("expo_user_role").delete().eq("user_id", editing.id);
        if (effectiveExpoId) {
          const { error: expoErr } = await supabase
            .from("expo_user_role")
            .insert({ user_id: editing.id, expo_id: effectiveExpoId });
          if (expoErr) throw expoErr;
        }

        toast.success(emailToast || "Utilisateur mis à jour.");
        onAvatarResolved?.(nextPhoto || editing.avatar_url?.trim() || null);
      }

      closeDialog(false);
      await load();
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
    const loginEmail = safeTrim(editing.email).toLowerCase();
    if (!loginEmail) {
      toast.error("L'email est requis pour réparer l'accès Auth.");
      return;
    }
    const tempPassword = temporaryPassword.trim();
    if (tempPassword.length < 6) {
      toast.error("Le mot de passe provisoire doit contenir au moins 6 caractères.");
      return;
    }
    const nextRoleId =
      typeof editing.role_id === "number" && editing.role_id > 0
        ? editing.role_id
        : Number(editing.role_id ?? NaN);
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
          prenom: safeTrim(editing.first_name),
          nom: safeTrim(editing.last_name),
          role_id: nextRoleId,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Réparation Auth impossible.");
      const resolvedLoginEmail = (data.login_email || loginEmail).trim().toLowerCase();
      setEditing((prev) => (prev ? { ...prev, email: resolvedLoginEmail } : prev));
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
      "avatar_url",
      "first_name",
      "last_name",
      "username",
      "birth_month",
      "birth_year",
      "email",
      "phone",
      "expo_id",
      "role_id",
    ];
    return keys.some((key) => normalize(editing[key]) !== normalize(initialEditing[key]));
  })();

  // =========================================================================
  // JSX — dialog embedded (utilisé depuis d'autres pages)
  // =========================================================================
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
              {enrichingEdit && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Mise à jour des données…
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
                <div className="space-y-2">
                  <UserPhotoField
                    avatarUrl={editing.avatar_url}
                    photoPreview={photoPreview}
                    saving={saving}
                    inputId="user-photo-upload-overlay"
                    onFileSelected={handlePhotoFileSelected}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-prenom" className="w-[70px] shrink-0 text-xs">
                      Prénom
                    </Label>
                    <Input
                      id="user-prenom"
                      autoComplete="given-name"
                      value={editing.first_name ?? ""}
                      onChange={(e) => setField("first_name", e.target.value)}
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
                      value={editing.last_name ?? ""}
                      onChange={(e) => setField("last_name", e.target.value)}
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
                      value={editing.username ?? ""}
                      onChange={(e) => setField("username", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-start gap-2">
                    <Label className="w-[70px] shrink-0 text-xs pt-2">Naissance</Label>
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                      <Select
                        value={editing.birth_month ?? ""}
                        onValueChange={(v) => setField("birth_month", v)}
                        disabled={saving}
                      >
                        <SelectTrigger id="user-birth-month" className="h-9 flex-1">
                          <SelectValue placeholder="Mois" />
                        </SelectTrigger>
                        <SelectContent>
                          {birthMonthOptions().map((month) => (
                            <SelectItem key={month.value} value={month.value}>
                              {month.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={editing.birth_year ?? ""}
                        onValueChange={(v) => setField("birth_year", v)}
                        disabled={saving}
                      >
                        <SelectTrigger id="user-birth-year" className="h-9 flex-1">
                          <SelectValue placeholder="Année" />
                        </SelectTrigger>
                        <SelectContent>
                          {BIRTH_YEARS.map((year) => (
                            <SelectItem key={year} value={year}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-phone" className="w-[70px] shrink-0 text-xs">
                      Tél.
                    </Label>
                    <SmartPhoneInput
                      id="user-phone"
                      value={editing.phone ?? ""}
                      onChange={(value) => setField("phone", value)}
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
                    value={editing.email ?? ""}
                    onChange={(e) => setField("email", e.target.value)}
                    disabled={saving || !canEditEmailField}
                    readOnly={!canEditEmailField}
                    className={!canEditEmailField ? "bg-muted/50" : undefined}
                  />
                  {emailFieldHint ? (
                    <p className="text-xs text-muted-foreground">{emailFieldHint}</p>
                  ) : !canEditEmailField && mode === "edit" ? (
                    <p className="text-xs text-muted-foreground">
                      L&apos;e-mail ne peut pas être modifié pour ce profil.
                    </p>
                  ) : null}
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
                  value={editing.role_id != null ? String(editing.role_id) : ""}
                  onValueChange={(v) => {
                    const roleId = roleIdFromValue(v);
                    setEditing((prev) =>
                      prev ? applyRoleChangeToUserRow(prev, roleId, connectedAgencyId) : prev,
                    );
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
                      setField("expo_id", "");
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
                    value={editing.expo_id ?? ""}
                    onValueChange={(v) => setField("expo_id", v)}
                    disabled={!canEditExpo}
                  >
                    <SelectTrigger id="user-expo">
                      <SelectValue
                        placeholder={
                          editing.role_id === 4
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

              {checkingControl && <p className="text-xs text-muted-foreground">Vérification du pseudo…</p>}
              {!checkingControl && controlExists && (
                <p className="text-xs text-destructive">
                  Ce pseudo est déjà utilisé. Le bouton Enregistrer est désactivé.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">{/* Action d'enregistrement conservée dans le header rouge */}</div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // =========================================================================
  // JSX — page complète /user
  // =========================================================================
  return (
    <div className="container py-8 space-y-8">
      <div className="sticky top-16 z-30 flex flex-col gap-3 bg-[#121212]/95 py-2 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div className="flex w-full shrink-0 flex-wrap items-center gap-4 md:max-w-[min(100%,680px)]">
          <div>
            <h2 className="text-3xl font-serif font-bold text-white">Utilisateurs</h2>
          </div>
        <div className="relative w-[210px] min-w-[210px] max-w-[210px]">
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
        </div>
        <BackofficeStickyAgencyLogoSlot />
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                {toPublicStorageUrl(u.avatar_url) ? (
                  <img
                    src={toPublicStorageUrl(u.avatar_url)}
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
                {u.username?.trim() ? (
                  <p
                    className="font-sans text-[12px] font-bold italic text-[#000091]"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {`alias "${u.username.trim()}"`}
                  </p>
                ) : null}
                <p className="text-sm font-bold italic">{roleLabelFromUserRow(u, roleOptions)}</p>
                {u.phone?.trim() ? <p className="text-sm">{u.phone.trim()}</p> : null}
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
                  ) : u.expo_id && expoLogosByKey.get(u.expo_id) ? (
                    <img
                      src={expoLogosByKey.get(u.expo_id) || ""}
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
                  <UserPhotoField
                    avatarUrl={editing.avatar_url}
                    photoPreview={photoPreview}
                    saving={saving}
                    inputId="user-photo-upload-main"
                    onFileSelected={handlePhotoFileSelected}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-prenom-main" className="w-[70px] shrink-0 text-xs">
                      Prénom
                    </Label>
                    <Input
                      id="user-prenom-main"
                      autoComplete="given-name"
                      value={editing.first_name ?? ""}
                      onChange={(e) => setField("first_name", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-nom-main" className="w-[70px] shrink-0 text-xs">
                      Nom
                    </Label>
                    <Input
                      id="user-nom-main"
                      autoComplete="family-name"
                      value={editing.last_name ?? ""}
                      onChange={(e) => setField("last_name", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-pseudo-main" className="w-[70px] shrink-0 text-xs">
                      Pseudo
                    </Label>
                    <Input
                      id="user-pseudo-main"
                      value={editing.username ?? ""}
                      onChange={(e) => setField("username", e.target.value)}
                      disabled={saving}
                      className="h-9 flex-1"
                    />
                  </div>
                  <div className="flex items-start gap-2">
                    <Label className="w-[70px] shrink-0 text-xs pt-2">Naissance</Label>
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                      <Select
                        value={editing.birth_month ?? ""}
                        onValueChange={(v) => setField("birth_month", v)}
                        disabled={saving}
                      >
                        <SelectTrigger id="user-birth-month-main" className="h-9 flex-1">
                          <SelectValue placeholder="Mois" />
                        </SelectTrigger>
                        <SelectContent>
                          {birthMonthOptions().map((month) => (
                            <SelectItem key={month.value} value={month.value}>
                              {month.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={editing.birth_year ?? ""}
                        onValueChange={(v) => setField("birth_year", v)}
                        disabled={saving}
                      >
                        <SelectTrigger id="user-birth-year-main" className="h-9 flex-1">
                          <SelectValue placeholder="Année" />
                        </SelectTrigger>
                        <SelectContent>
                          {BIRTH_YEARS.map((year) => (
                            <SelectItem key={year} value={year}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="user-phone-main" className="w-[70px] shrink-0 text-xs">
                      Tél.
                    </Label>
                    <SmartPhoneInput
                      id="user-phone-main"
                      value={editing.phone ?? ""}
                      onChange={(value) => setField("phone", value)}
                      onValidityChange={setPhoneValid}
                      disabled={saving}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user-email-main">Email</Label>
                  <Input
                    id="user-email-main"
                    type="email"
                    autoComplete="email"
                    value={editing.email ?? ""}
                    onChange={(e) => setField("email", e.target.value)}
                    disabled={saving || !canEditEmailField}
                    readOnly={!canEditEmailField}
                    className={!canEditEmailField ? "bg-muted/50" : undefined}
                  />
                  {emailFieldHint ? (
                    <p className="text-xs text-muted-foreground">{emailFieldHint}</p>
                  ) : !canEditEmailField && mode === "edit" ? (
                    <p className="text-xs text-muted-foreground">
                      L&apos;e-mail ne peut pas être modifié pour ce profil.
                    </p>
                  ) : null}
                </div>
                {(mode === "create" || mode === "edit") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="user-temporary-password-main">
                      {mode === "create" ? "Mot de passe provisoire" : "Nouveau mot de passe provisoire"}
                    </Label>
                    <Input
                      id="user-temporary-password-main"
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
                <Label htmlFor="user-roles-main">Rôles</Label>
                <Select
                  value={editing.role_id != null ? String(editing.role_id) : ""}
                  onValueChange={(v) => {
                    const roleId = roleIdFromValue(v);
                    setEditing((prev) =>
                      prev ? applyRoleChangeToUserRow(prev, roleId, connectedAgencyId) : prev,
                    );
                  }}
                  disabled={saving}
                >
                  <SelectTrigger id="user-roles-main">
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
                  <Label htmlFor="user-agency-main">Organisation</Label>
                  <Select
                    value={editing.agency_id ?? ""}
                    onValueChange={(v) => {
                      setField("agency_id", v);
                      setField("expo_id", "");
                    }}
                    disabled={!canEditAgency}
                  >
                    <SelectTrigger id="user-agency-main">
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
                  <Label htmlFor="user-expo-main">Expo</Label>
                  <Select
                    value={editing.expo_id ?? ""}
                    onValueChange={(v) => setField("expo_id", v)}
                    disabled={!canEditExpo}
                  >
                    <SelectTrigger id="user-expo-main">
                      <SelectValue
                        placeholder={
                          editing.role_id === 4
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

              {checkingControl && <p className="text-xs text-muted-foreground">Vérification du pseudo…</p>}
              {!checkingControl && controlExists && (
                <p className="text-xs text-destructive">
                  Ce pseudo est déjà utilisé. Le bouton Enregistrer est désactivé.
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
