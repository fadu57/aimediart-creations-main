import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import i18nInstance from "@/i18n/instance";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardProfile } from "@/hooks/useDashboardProfile";
import { supabase } from "@/lib/supabase";

const BIRTH_YEARS = Array.from({ length: 2010 - 1920 + 1 }, (_, i) => String(2010 - i));
const USERNAME_DEBOUNCE_MS = 500;
const PROFILE_SELECT =
  "id,first_name,last_name,username,avatar_url,phone,zip_code,city,country_code,language,birth_year,created_at";

export type DashboardProfileEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  user: User | null;
  email: string | null;
  onSaved: () => void;
};

type ProfileFormValues = {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
  birthMonth: string;
  birthYear: string;
  city: string;
  zipCode: string;
  language: string;
};

function readMetaString(meta: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!meta) return "";
  for (const key of keys) {
    const raw = meta[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

function readBirthMonth(meta: Record<string, unknown> | undefined): string {
  if (!meta) return "";
  const raw = meta.birth_month;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? String(n).padStart(2, "0") : raw.trim();
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 12) {
    return String(raw).padStart(2, "0");
  }
  return "";
}

function readBirthYear(profile: DashboardProfile | null, meta: Record<string, unknown> | undefined): string {
  if (typeof profile?.birth_year === "number" && Number.isFinite(profile.birth_year)) {
    return String(profile.birth_year);
  }
  const raw = meta?.birth_year;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "";
}

/** Fusionne profiles (DB) et user_metadata (JWT) pour affichage / formulaire. */
export function mergeProfileValues(
  profile: DashboardProfile | null,
  user: User | null,
): ProfileFormValues {
  const meta = (user?.user_metadata as Record<string, unknown> | undefined) ?? {};
  return {
    firstName: profile?.first_name?.trim() || readMetaString(meta, "first_name", "firstname", "prenom") || "",
    lastName: profile?.last_name?.trim() || readMetaString(meta, "last_name", "lastname", "nom") || "",
    username: profile?.username?.trim() || readMetaString(meta, "username") || "",
    phone: profile?.phone?.trim() || readMetaString(meta, "phone") || "",
    birthMonth: readBirthMonth(meta),
    birthYear: readBirthYear(profile, meta),
    city: profile?.city?.trim() || readMetaString(meta, "city") || "",
    zipCode: profile?.zip_code?.trim() || readMetaString(meta, "zip_code", "zip") || "",
    language: profile?.language?.trim() || readMetaString(meta, "language") || "fr",
  };
}

/** Locale active i18n (fr/en/de/es/it) pour les libellés de mois. */
function monthLocale(): string {
  return i18nInstance.language || "fr";
}

function birthMonthOptions(): Array<{ value: string; label: string }> {
  const locale = monthLocale();
  return Array.from({ length: 12 }, (_, idx) => {
    const value = String(idx + 1).padStart(2, "0");
    const raw = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, idx, 1));
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    return { value, label };
  });
}

function formatBirthMonthLabel(month: string | null | undefined): string {
  const m = month?.trim();
  if (!m) return "—";
  const idx = Number.parseInt(m, 10) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx > 11) return m;
  const raw = new Intl.DateTimeFormat(monthLocale(), { month: "long" }).format(new Date(2000, idx, 1));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatBirthDisplay(
  birthMonth: string | null | undefined,
  birthYear: number | string | null | undefined,
): string {
  const monthLabel = formatBirthMonthLabel(birthMonth);
  const year =
    typeof birthYear === "number" && Number.isFinite(birthYear)
      ? String(birthYear)
      : typeof birthYear === "string" && birthYear.trim()
        ? birthYear.trim()
        : "";
  if (monthLabel !== "—" && year) return `${monthLabel} ${year}`;
  if (year) return year;
  if (monthLabel !== "—") return monthLabel;
  return "—";
}

export function birthMonthFromUser(user: User | { user_metadata?: Record<string, unknown> } | null): string {
  const meta = (user?.user_metadata as Record<string, unknown> | undefined) ?? {};
  return readBirthMonth(meta);
}

function applyFormValues(setters: {
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  setUsername: (v: string) => void;
  setPhone: (v: string) => void;
  setBirthMonth: (v: string) => void;
  setBirthYear: (v: string) => void;
  setCity: (v: string) => void;
  setZipCode: (v: string) => void;
  setLanguage: (v: string) => void;
}, values: ProfileFormValues) {
  setters.setFirstName(values.firstName);
  setters.setLastName(values.lastName);
  setters.setUsername(values.username);
  setters.setPhone(values.phone);
  setters.setBirthMonth(values.birthMonth);
  setters.setBirthYear(values.birthYear);
  setters.setCity(values.city);
  setters.setZipCode(values.zipCode);
  setters.setLanguage(values.language);
}

export function DashboardProfileEditDialog({
  open,
  onOpenChange,
  userId,
  user,
  email,
  onSaved,
}: DashboardProfileEditDialogProps) {
  const { t, i18n } = useTranslation("dashboard");
  const monthOptions = useMemo(() => birthMonthOptions(), [i18n.language]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [city, setCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [language, setLanguage] = useState("fr");
  const [loadingForm, setLoadingForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneValid, setPhoneValid] = useState(true);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [loadedUsername, setLoadedUsername] = useState("");

  const hydrateForm = useCallback(
    (profile: DashboardProfile | null) => {
      const merged = mergeProfileValues(profile, user);
      applyFormValues(
        {
          setFirstName,
          setLastName,
          setUsername,
          setPhone,
          setBirthMonth,
          setBirthYear,
          setCity,
          setZipCode,
          setLanguage,
        },
        merged,
      );
      setLoadedUsername(merged.username.trim().toLowerCase());
      setPhoneValid(true);
      setUsernameAvailable(null);
    },
    [user],
  );

  // Recharge le profil à chaque ouverture pour pré-remplir avec les données à jour.
  useEffect(() => {
    if (!open || !userId.trim()) return;

    let cancelled = false;
    setLoadingForm(true);

    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", userId.trim())
        .maybeSingle();

      if (cancelled) return;
      setLoadingForm(false);

      if (error && import.meta.env.DEV) {
        console.warn("[dashboard] lecture profil pour édition :", error.message);
      }

      hydrateForm((data as DashboardProfile | null) ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, userId, hydrateForm]);

  useEffect(() => {
    if (!open) return;
    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 3) {
      setUsernameChecking(false);
      setUsernameAvailable(null);
      return;
    }
    if (trimmed === loadedUsername) {
      setUsernameChecking(false);
      setUsernameAvailable(true);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setUsernameChecking(true);
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", trimmed)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        setUsernameChecking(false);
        if (error) {
          setUsernameAvailable(null);
          return;
        }
        const existingId = (data as { id?: string } | null)?.id ?? null;
        setUsernameAvailable(!existingId || existingId === userId);
      })();
    }, USERNAME_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, username, loadedUsername, userId]);

  const usernameBlocked = usernameAvailable === false && username.trim().length >= 3;

  const save = async () => {
    const prenom = firstName.trim();
    const nom = lastName.trim();
    if (!prenom || !nom) {
      toast.error(t("profile_edit.toast_name_required"));
      return;
    }
    if (usernameBlocked) {
      toast.error(t("profile_edit.toast_username_taken"));
      return;
    }
    if (!phoneValid) {
      toast.error(t("profile_edit.toast_phone_invalid"));
      return;
    }

    setSaving(true);
    try {
      const usernameVal = username.trim().toLowerCase() || null;
      const birthYearNum = birthYear.trim() ? Number.parseInt(birthYear, 10) : null;

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          first_name: prenom,
          last_name: nom,
          username: usernameVal,
          phone: phone.trim() || null,
          city: city.trim() || null,
          zip_code: zipCode.trim() || null,
          language: language.trim() || null,
          birth_year: Number.isFinite(birthYearNum) ? birthYearNum : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (profileErr) throw profileErr;

      const { error: authErr } = await supabase.auth.updateUser({
        data: {
          first_name: prenom,
          last_name: nom,
          username: usernameVal,
          birth_month: birthMonth.trim() || null,
          birth_year: Number.isFinite(birthYearNum) ? birthYearNum : null,
        },
      });
      if (authErr) throw authErr;

      toast.success(t("profile_edit.toast_saved"));
      onOpenChange(false);
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("profile_edit.toast_save_error");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("profile_edit.title")}</DialogTitle>
        </DialogHeader>

        {loadingForm ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("profile_edit.loading")}
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            {email && (
              <div className="space-y-1.5">
                <Label>{t("profile_edit.email_label")}</Label>
                <Input value={email} disabled className="bg-muted/50" />
                <p className="text-xs text-muted-foreground">{t("profile_edit.email_immutable")}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dash-profile-first">{t("profile_edit.firstname")} *</Label>
                <Input
                  id="dash-profile-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dash-profile-last">{t("profile_edit.lastname")} *</Label>
                <Input
                  id="dash-profile-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dash-profile-username">{t("profile_edit.username")}</Label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground select-none">
                  @
                </span>
                <Input
                  id="dash-profile-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
                  className="pl-7 pr-8"
                  autoComplete="username"
                  disabled={saving}
                />
                {username.trim().length >= 3 && (
                  <span className="absolute inset-y-0 right-2.5 flex items-center">
                    {usernameChecking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : usernameAvailable === true ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : usernameAvailable === false ? (
                      <X className="h-4 w-4 text-destructive" />
                    ) : null}
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dash-profile-birth-month">{t("profile_edit.birth_month")}</Label>
                <Select
                  value={birthMonth || "__none__"}
                  onValueChange={(v) => setBirthMonth(v === "__none__" ? "" : v)}
                  disabled={saving}
                >
                  <SelectTrigger id="dash-profile-birth-month">
                    <SelectValue placeholder={t("profile_edit.birth_month_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("profile_edit.not_provided")}</SelectItem>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dash-profile-birth-year">{t("profile_edit.birth_year")}</Label>
                <Select
                  value={birthYear || "__none__"}
                  onValueChange={(v) => setBirthYear(v === "__none__" ? "" : v)}
                  disabled={saving}
                >
                  <SelectTrigger id="dash-profile-birth-year">
                    <SelectValue placeholder={t("profile_edit.birth_year_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("profile_edit.not_provided")}</SelectItem>
                    {BIRTH_YEARS.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dash-profile-phone">{t("profile_edit.phone")}</Label>
              <SmartPhoneInput
                id="dash-profile-phone"
                value={phone}
                onChange={setPhone}
                onValidityChange={setPhoneValid}
                disabled={saving}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dash-profile-city">{t("profile_edit.city")}</Label>
                <Input id="dash-profile-city" value={city} onChange={(e) => setCity(e.target.value)} disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dash-profile-zip">{t("profile_edit.zip")}</Label>
                <Input id="dash-profile-zip" value={zipCode} onChange={(e) => setZipCode(e.target.value)} disabled={saving} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dash-profile-lang">{t("profile_edit.language")}</Label>
              <Select value={language || "fr"} onValueChange={setLanguage} disabled={saving}>
                <SelectTrigger id="dash-profile-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="it">Italiano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="gradient-gold gradient-gold-hover-bg text-primary-foreground"
            onClick={() => void save()}
            disabled={saving || loadingForm || usernameBlocked || !phoneValid}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("profile_edit.saving")}
              </>
            ) : (
              t("profile_edit.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
