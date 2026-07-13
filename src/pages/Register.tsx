import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { uploadVisitorSelfiePhoto } from "@/lib/storagePaths";
import { getPasswordResetRedirectUrl } from "@/lib/passwordReset";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useUiLanguage } from "@/providers/UiLanguageProvider";
import { isVisitorRole } from "@/lib/authUser";
import { getStoredVisitorUuid } from "@/lib/visitorIdentity";
import { setCurrentExpoId } from "@/lib/expoContext";
import {
  hasVisitorRegistrationMetadata,
  readOAuthNameParts,
  startVisitorOAuthSignIn,
  VISITOR_REGISTER_OAUTH_FLAG,
} from "@/lib/visitorOAuth";
import { getAnonymousTrackingConsent, loadOrCreateFingerprintJsId } from "@/lib/fingerprintConsent";
import {
  localizeVisitorAnonymousProfile,
  persistAnonymousVisitorIdentity,
  registerAnonymousVisitorSession,
  resolveReturningAnonymousVisitor,
} from "@/lib/registerAnonymousVisitorSession";
import type { VisitorAnonymousProfile } from "@/lib/visitorAnonymousProfile";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GoogleLogoIcon } from "@/components/OAuthProviderIcons";
import { AimediartBrandLogoBlock } from "@/components/AimediartBrandLogoBlock";
import { VisitorPoolAvatarPicker } from "@/components/VisitorPoolAvatarPicker";
import type { VisitorPoolAvatar } from "@/lib/visitorAvatarPool";

const PASSWORD_MIN_LENGTH = 6;
const TEST_EMAIL_BYPASS = "fadu57@gmail.com";

function isDuplicateEmailSignUpError(message: string, code?: string): boolean {
  const c = (code ?? "").toLowerCase();
  if (c === "email_exists" || c === "user_already_exists") return true;
  const m = message.toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already registered") ||
    m.includes("already exists") ||
    m.includes("email address is already registered")
  );
}

/** Lorsque `functions.invoke` reçoit un statut hors 2xx, le SDK ne parse pas le corps : il est encore lisible via la Response attachée à l’erreur. */
async function readFunctionsHttpErrorJson<T extends Record<string, unknown>>(err: unknown): Promise<T | null> {
  if (!(err instanceof FunctionsHttpError)) return null;
  const res = err.context as Response | undefined;
  if (!res?.clone) return null;
  const ct = (res.headers.get("Content-Type") ?? "").split(";")[0].trim();
  if (ct !== "application/json") return null;
  try {
    return (await res.clone().json()) as T;
  } catch {
    return null;
  }
}

function isBypassEmail(email: string): boolean {
  return email.trim().toLowerCase() === TEST_EMAIL_BYPASS;
}

type RegisterVisitorInstantPayload = {
  email: string;
  password: string;
  prenom: string;
  nom: string;
  agency_id?: string | null;
  user_age?: string | null;
  user_phone?: string | null;
  user_photo_url?: string | null;
  user_expo_id?: string | null;
  visitor_uuid?: string | null;
  device_fingerprint?: string | null;
};

type RegisterVisitorInstantResponse = {
  ok?: boolean;
  user_id?: string;
  code?: string;
  error?: string;
};

type CompleteVisitorOAuthResponse = {
  ok?: boolean;
  user_id?: string;
  code?: string;
  error?: string;
};

const Register = () => {
  const { t, i18n } = useTranslation("auth");
  const { language: uiLanguage } = useUiLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, loading: authLoading, role_name, role_id } = useAuthUser();
  const expoIdFromUrl = searchParams.get("expo_id")?.trim() || "";
  const agencyIdFromUrl = searchParams.get("agency_id")?.trim() || "";

  const birthMonthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => {
        const value = String(idx + 1).padStart(2, "0");
        const raw = new Intl.DateTimeFormat(i18n.language || "fr", { month: "long" }).format(new Date(2000, idx, 1));
        const label = raw.charAt(0).toUpperCase() + raw.slice(1);
        return { value, label };
      }),
    [i18n.language],
  );

  const birthYearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 110 }, (_, i) => String(y - i));
  }, []);

  const formatSignUpError = useCallback(
    (message: string): string => {
      const m = message.toLowerCase();
      if (isDuplicateEmailSignUpError(message)) {
        return t("register_visitor.error_duplicate_email_signup");
      }
      if (m.includes("password") && (m.includes("short") || m.includes("least") || m.includes(String(PASSWORD_MIN_LENGTH)))) {
        return t("register_visitor.error_password_short_signup", { min: PASSWORD_MIN_LENGTH });
      }
      if (m.includes("invalid email") || (m.includes("email") && m.includes("invalid"))) {
        return t("register_visitor.error_invalid_email_signup");
      }
      return message;
    },
    [t],
  );

  const [step, setStep] = useState<1 | 2>(1);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userPhoneValid, setUserPhoneValid] = useState(true);
  const [userPhotoUrl, setUserPhotoUrl] = useState("");
  const [visitorPhotoFile, setVisitorPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activePoolAvatar, setActivePoolAvatar] = useState<VisitorPoolAvatar | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [emailDuplicateOpen, setEmailDuplicateOpen] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthProfileFlow, setOauthProfileFlow] = useState(false);
  const [postAuthHandled, setPostAuthHandled] = useState(false);
  const [returningProfile, setReturningProfile] = useState<VisitorAnonymousProfile | null>(null);
  const [returningDisplayPseudo, setReturningDisplayPseudo] = useState("");
  const trimmedEmail = email.trim();
  const emailLooksValid = /\S+@\S+\.\S+/.test(trimmedEmail);
  const passwordHasMinLength = password.length >= PASSWORD_MIN_LENGTH;
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const canGoToStep2 = emailLooksValid && passwordHasMinLength && passwordsMatch;
  const finalActionLabel = t("register_visitor.enter_expo");
  const creatingProfile = submitting || uploadingPhoto;
  const canSubmitFinal =
    !creatingProfile && Boolean(prenom.trim()) && Boolean(nom.trim()) && userPhoneValid;

  useEffect(() => {
    if (expoIdFromUrl) setCurrentExpoId(expoIdFromUrl);
  }, [expoIdFromUrl]);

  useEffect(() => {
    if (step !== 2) {
      setReturningProfile(null);
      setReturningDisplayPseudo("");
      return;
    }

    let cancelled = false;
    void resolveReturningAnonymousVisitor().then((profile) => {
      if (cancelled) return;
      setReturningProfile(profile);
      if (profile) {
        void registerAnonymousVisitorSession().catch(() => {
          /* non bloquant */
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (step !== 2 || !returningProfile) {
      setReturningDisplayPseudo("");
      return;
    }

    let cancelled = false;
    void localizeVisitorAnonymousProfile(returningProfile, uiLanguage).then((localized) => {
      if (!cancelled) setReturningDisplayPseudo(localized.pseudo);
    });

    return () => {
      cancelled = true;
    };
  }, [step, uiLanguage, returningProfile]);

  useEffect(() => {
    if (authLoading) return;

    if (!session?.user) {
      setPostAuthHandled(true);
      return;
    }

    const oauthReturn =
      searchParams.get("oauth") === "1" ||
      (typeof window !== "undefined" && sessionStorage.getItem(VISITOR_REGISTER_OAUTH_FLAG) === "1");

    if (oauthReturn) {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(VISITOR_REGISTER_OAUTH_FLAG);
      }
      if (searchParams.get("oauth") === "1") {
        const next = new URL(window.location.href);
        next.searchParams.delete("oauth");
        window.history.replaceState({}, "", `${next.pathname}${next.search}`);
      }

      if (hasVisitorRegistrationMetadata(session.user)) {
        const target = expoIdFromUrl ? `/scan-work1?expo_id=${encodeURIComponent(expoIdFromUrl)}` : "/scan-work1";
        navigate(target, { replace: true });
        return;
      }

      const { prenom: oauthPrenom, nom: oauthNom } = readOAuthNameParts(session.user);
      if (session.user.email) setEmail(session.user.email);
      if (oauthPrenom) setPrenom(oauthPrenom);
      if (oauthNom) setNom(oauthNom);
      setOauthProfileFlow(true);
      setStep(2);
      setPostAuthHandled(true);
      return;
    }

    setPostAuthHandled(true);
  }, [authLoading, session, searchParams, expoIdFromUrl, navigate]);

  if (authLoading || (session && !postAuthHandled)) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (session && !oauthProfileFlow) {
    const target = isVisitorRole(role_name, role_id) ? "/scan-work1" : "/";
    return <Navigate to={target} replace />;
  }

  const goToStep2 = () => {
    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      toast.error(t("register_visitor.toast_enter_email"));
      return;
    }
    if (!password) {
      toast.error(t("register_visitor.toast_enter_password"));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      toast.error(t("register_visitor.toast_password_min", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("register.error_password_mismatch"));
      return;
    }
    setStep(2);
  };

  const handleCaptureProfilePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const prepared = await prepareImageForSupabaseUpload(file, {
        maxBytes: 350 * 1024,
        maxEdgePx: 800,
        forceFileType: "image/jpeg",
        initialQuality: 0.72,
      });
      setVisitorPhotoFile(prepared);
      setUserPhotoUrl(URL.createObjectURL(prepared));
      toast.success(t("register_visitor.toast_photo_saved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("register_visitor.toast_photo_failed");
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleOAuthSignIn = async () => {
    setOauthLoading(true);
    const { error } = await startVisitorOAuthSignIn("google", expoIdFromUrl || undefined, agencyIdFromUrl || undefined);
    if (error) {
      setOauthLoading(false);
      toast.error(error.message || t("register_visitor.toast_oauth_failed"));
    }
  };

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const trimmedPrenom = prenom.trim();
    const trimmedNom = nom.trim();
    const birthIso = birthMonth && birthYear ? `${birthYear}-${birthMonth}` : "";
    const trimmedPhone = userPhone.trim();

    if (!trimmedPrenom) {
      toast.error(t("register_visitor.toast_enter_firstname"));
      return;
    }
    if (!trimmedNom) {
      toast.error(t("register_visitor.toast_enter_lastname"));
      return;
    }
    if (!userPhoneValid) {
      toast.error(t("register_visitor.toast_phone_invalid"));
      return;
    }
    setSubmitting(true);
    try {
      let deviceFingerprint: string | null = null;
      if (getAnonymousTrackingConsent() === "granted") {
        deviceFingerprint = await loadOrCreateFingerprintJsId();
      }

      const poolPhotoUrl = activePoolAvatar?.imageUrl ?? returningProfile?.avatarUrl ?? null;
      const pseudoToPersist =
        activePoolAvatar?.pseudo?.trim() ||
        returningDisplayPseudo.trim() ||
        returningProfile?.pseudo?.trim() ||
        null;

      if (pseudoToPersist && getStoredVisitorUuid()) {
        try {
          await persistAnonymousVisitorIdentity({
            pseudo: pseudoToPersist,
            avatarUrl: activePoolAvatar?.imageUrl ?? returningProfile?.avatarUrl,
            avatarObjectPath: activePoolAvatar?.objectPath ?? returningProfile?.avatarObjectPath,
            selfieFile: visitorPhotoFile,
            keepSelfieUrl: returningProfile?.selfieUrl,
            keepSelfieObjectPath: returningProfile?.selfieObjectPath,
          });
        } catch (persistErr) {
          if (import.meta.env.DEV) {
            console.warn("[Register] mise à jour visitors :", persistErr);
          }
        }
      }

      if (oauthProfileFlow && session?.user) {
        const { data: completeData, error: completeError } =
          await supabase.functions.invoke<CompleteVisitorOAuthResponse>("complete-visitor-oauth-profile", {
            body: {
              prenom: trimmedPrenom,
              nom: trimmedNom,
              agency_id: agencyIdFromUrl || null,
              user_age: birthIso || null,
              user_phone: trimmedPhone || null,
              user_photo_url: poolPhotoUrl,
              user_expo_id: expoIdFromUrl || null,
              visitor_uuid: getStoredVisitorUuid(),
              device_fingerprint: deviceFingerprint,
            },
          });

        if (completeError) {
          const httpPayload = await readFunctionsHttpErrorJson<CompleteVisitorOAuthResponse>(completeError);
          toast.error(httpPayload?.error?.trim() || completeError.message || t("register_visitor.toast_visitor_signup_failed"));
          return;
        }
        if (!completeData?.ok || !completeData.user_id) {
          toast.error(completeData?.error || t("register_visitor.toast_incomplete_profile"));
          return;
        }

        if (visitorPhotoFile) {
          try {
            const publicUrl = await uploadVisitorSelfiePhoto(completeData.user_id, visitorPhotoFile, visitorPhotoFile.name);
            await supabase.auth.updateUser({ data: { user_photo_url: publicUrl } });
          } catch (photoErr) {
            if (import.meta.env.DEV) {
              console.warn("[Register] selfie upload:", photoErr);
            }
          }
        }

        if (typeof window !== "undefined") {
          sessionStorage.removeItem("redirectAfterAuth");
          sessionStorage.removeItem("redirectAfterLogin");
          const target = expoIdFromUrl ? `/scan-work1?expo_id=${encodeURIComponent(expoIdFromUrl)}` : "/scan-work1";
          navigate(target, { replace: true });
        } else {
          navigate("/scan-work1", { replace: true });
        }
        return;
      }

      if (!trimmed || !password) {
        toast.error(t("register_visitor.toast_complete_email_password"));
        return;
      }

      if (isBypassEmail(trimmed)) {
        const { error: bypassSignInError } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (bypassSignInError) {
          toast.message(t("register_visitor.toast_test_bypass"));
        }
        const target = expoIdFromUrl ? `/scan-work1?expo_id=${encodeURIComponent(expoIdFromUrl)}` : "/scan-work1";
        navigate(target, { replace: true });
        return;
      }

      const body: RegisterVisitorInstantPayload = {
        email: trimmed,
        password,
        prenom: trimmedPrenom,
        nom: trimmedNom,
        agency_id: agencyIdFromUrl || null,
        user_age: birthIso || null,
        user_phone: trimmedPhone || null,
        user_photo_url: poolPhotoUrl,
        user_expo_id: expoIdFromUrl || null,
        visitor_uuid: getStoredVisitorUuid(),
        device_fingerprint: deviceFingerprint,
      };

      const { data: createData, error: createError } = await supabase.functions.invoke<RegisterVisitorInstantResponse>(
        "register-visitor-instant",
        { body },
      );

      if (createError) {
        const httpPayload = await readFunctionsHttpErrorJson<RegisterVisitorInstantResponse>(createError);
        const msg =
          httpPayload?.error?.trim() ||
          createError.message ||
          t("register_visitor.toast_visitor_signup_failed");
        const code = httpPayload?.code;
        if (isDuplicateEmailSignUpError(msg, code)) {
          setEmailDuplicateOpen(true);
          return;
        }
        toast.error(formatSignUpError(msg));
        return;
      }

      if (!createData?.ok || !createData?.user_id) {
        const msg = createData?.error || t("register_visitor.toast_incomplete_profile");
        toast.error(msg);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (signInError) {
        toast.error(signInError.message || t("register_visitor.toast_auto_sign_in_failed"));
        return;
      }

      if (visitorPhotoFile && createData.user_id) {
        try {
          const publicUrl = await uploadVisitorSelfiePhoto(createData.user_id, visitorPhotoFile, visitorPhotoFile.name);
          await supabase.auth.updateUser({ data: { user_photo_url: publicUrl } });
        } catch (photoErr) {
          if (import.meta.env.DEV) {
            console.warn("[Register] selfie upload:", photoErr);
          }
        }
      }

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("redirectAfterAuth");
        sessionStorage.removeItem("redirectAfterLogin");
        const target = expoIdFromUrl ? `/scan-work1?expo_id=${encodeURIComponent(expoIdFromUrl)}` : "/scan-work1";
        navigate(target, { replace: true });
      } else {
        navigate("/scan-work1", { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("register_visitor.toast_visitor_signup_failed");
      toast.error(formatSignUpError(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicateYesReset = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t("register_visitor.toast_email_missing"));
      setEmailDuplicateOpen(false);
      return;
    }
    setSendingResetEmail(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    setSendingResetEmail(false);
    setEmailDuplicateOpen(false);
    if (error) {
      toast.error(error.message || t("login.toast_reset_send_failed"));
      return;
    }
    toast.success(t("reset_password.success"));
  };

  const markOk = t("register_visitor.rule_ok");
  const markPending = t("register_visitor.rule_pending");
  const oauthButtonClassName =
    "h-9 w-full rounded-md border border-border bg-background text-sm font-normal text-foreground hover:bg-accent hover:text-accent-foreground";

  return (
    <div className="flex w-full flex-1 flex-col items-center px-4 pb-6 pt-0">
      <AlertDialog open={emailDuplicateOpen} onOpenChange={setEmailDuplicateOpen}>
        <AlertDialogContent className="max-w-[min(320px,calc(100vw-2rem))]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{t("register_visitor.dialog_duplicate_title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm leading-snug">
              {t("register_visitor.dialog_duplicate_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel type="button" className="mt-0" disabled={sendingResetEmail}>
              {t("register_visitor.btn_no")}
            </AlertDialogCancel>
            <Button
              type="button"
              className="gradient-gold gradient-gold-hover-bg text-primary-foreground"
              disabled={sendingResetEmail}
              onClick={() => void handleDuplicateYesReset()}
            >
              {sendingResetEmail ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("register_visitor.btn_sending")}
                </>
              ) : (
                t("register_visitor.btn_yes")
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="mt-1 w-full max-w-[320px] border-border shadow-lg">
        <CardHeader className="space-y-1 px-3 pb-0 pt-2">
          <AimediartBrandLogoBlock size="sm" animateHeart />
          <div className="flex justify-end">
            <span
              className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground tabular-nums"
              aria-hidden
            >
              {step}/2
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-0 px-3 pb-2 pt-1">
          {step === 1 ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="register-email" className="text-xs">
                  {t("register.email")}
                </Label>
                <Input
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("register_visitor.placeholder_email")}
                  className="h-9 text-sm"
                  required
                />
                {email.includes("@") && (
                  <p className="text-[10px] leading-tight text-muted-foreground">{t("register_visitor.hint_email_check")}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="register-password" className="text-xs">
                  {t("register.password")}
                </Label>
                <div className="relative">
                  <Input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 pr-10 text-sm"
                    minLength={PASSWORD_MIN_LENGTH}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-1 flex items-center px-2 text-muted-foreground shadow-none focus:outline-none focus:ring-0"
                    aria-label={
                      showPassword ? t("register_visitor.aria_hide_password") : t("register_visitor.aria_show_password")
                    }
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[10px] leading-tight text-muted-foreground">
                  {t("register_visitor.password_hint_min", { min: PASSWORD_MIN_LENGTH })}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="register-password-confirm" className="text-xs">
                  {t("register.password_confirm")}
                </Label>
                <div className="relative">
                  <Input
                    id="register-password-confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    name="password-confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-9 pr-10 text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-1 flex items-center px-2 text-muted-foreground shadow-none focus:outline-none focus:ring-0"
                    aria-label={
                      showPassword ? t("register_visitor.aria_hide_confirm") : t("register_visitor.aria_show_confirm")
                    }
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 text-[10px] leading-tight">
                  <p className="mb-1 font-semibold text-foreground">{t("register_visitor.validation_box_title")}</p>
                  <p className={passwordHasMinLength ? "text-emerald-600" : "text-muted-foreground"}>
                    {t("register_visitor.rule_password_length", {
                      mark: passwordHasMinLength ? markOk : markPending,
                      min: PASSWORD_MIN_LENGTH,
                    })}
                  </p>
                  <p className={passwordsMatch ? "text-emerald-600" : "text-muted-foreground"}>
                    {t("register_visitor.rule_password_match", { mark: passwordsMatch ? markOk : markPending })}
                  </p>
                  <p className={emailLooksValid ? "text-emerald-600" : "text-muted-foreground"}>
                    {t("register_visitor.rule_email_format", { mark: emailLooksValid ? markOk : markPending })}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
                onClick={goToStep2}
                disabled={!canGoToStep2}
              >
                {t("register_visitor.btn_continue")}
              </Button>

              <div className="relative py-0.5">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wide">
                  <span className="bg-card px-2 text-muted-foreground">{t("register_visitor.oauth_divider")}</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className={oauthButtonClassName}
                disabled={oauthLoading}
                onClick={() => void handleOAuthSignIn()}
              >
                {oauthLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("register_visitor.oauth_google_loading")}
                  </>
                ) : (
                  <>
                    <GoogleLogoIcon />
                    {t("register_visitor.oauth_google")}
                  </>
                )}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground">
                <Link
                  to={expoIdFromUrl ? `/login?expo_id=${encodeURIComponent(expoIdFromUrl)}` : "/login"}
                  className="underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  {t("register_visitor.link_login_combined")}
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleFinalize(e)} className="space-y-2">
              {oauthProfileFlow && session?.user?.email ? (
                <p className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                  {t("register_visitor.oauth_step2_hint", { email: session.user.email })}
                </p>
              ) : null}
              {returningProfile ? (
                <div className="space-y-2 border-b border-border/60 pb-3">
                  <div className="text-center font-sans text-xl leading-snug">
                    <span className="block font-black">
                      <Trans
                        i18nKey="register_visitor.returning_anonymous.greeting"
                        ns="auth"
                        values={{ pseudo: returningDisplayPseudo.trim() || returningProfile.pseudo }}
                        components={{
                          pseudo: <span className="text-primary underline underline-offset-2" />,
                        }}
                      />
                    </span>
                    <span className="mt-1 block text-xs font-semibold leading-snug tracking-[3.5px]">
                      {t("register_visitor.returning_anonymous.subtitle")}
                    </span>
                  </div>
                  <div className="flex flex-row items-center justify-center gap-3 pt-1">
                    <div className="relative flex h-[96px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background/50 shadow-sm">
                      <img
                        src={returningProfile.avatarUrl}
                        alt={t("register_visitor.returning_anonymous.avatar_alt", {
                          pseudo: returningDisplayPseudo.trim() || returningProfile.pseudo,
                        })}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    {returningProfile.selfieUrl?.trim() ? (
                      <div className="relative flex h-[96px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background/50 shadow-sm">
                        <img
                          src={returningProfile.selfieUrl}
                          alt={t("register_visitor.selfie_alt")}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : null}
                  </div>
                  <p className="text-center text-xs font-medium tracking-[-0.5px] text-foreground">
                    {t("register_visitor.returning_anonymous.hint_identity")}
                  </p>
                  <p className="text-center text-xs font-medium tracking-[-0.5px] text-foreground">
                    {t("register_visitor.returning_anonymous.hint_new_avatars")}
                  </p>
                </div>
              ) : null}
              {!returningProfile ? (
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("register_visitor.section_identity")}
                </p>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="register-prenom" className="text-xs">
                  {t("register_visitor.label_firstname")}
                </Label>
                <Input
                  id="register-prenom"
                  type="text"
                  autoComplete="given-name"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Jean"
                  disabled={submitting}
                  className="h-9 w-full text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="register-nom" className="text-xs">
                  {t("register_visitor.label_lastname")}
                </Label>
                <Input
                  id="register-nom"
                  type="text"
                  autoComplete="family-name"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Dupont"
                  disabled={submitting}
                  className="h-9 w-full text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="register-birth-month" className="text-xs">
                    {t("register_visitor.label_birth_month")}
                  </Label>
                  <Select
                    value={birthMonth}
                    onValueChange={setBirthMonth}
                    disabled={submitting || uploadingPhoto}
                  >
                    <SelectTrigger id="register-birth-month" className="h-9 text-sm">
                      <SelectValue placeholder={t("register_visitor.birth_month_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {birthMonthOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register-birth-year" className="text-xs">
                    {t("register_visitor.label_birth_year")}
                  </Label>
                  <Select value={birthYear} onValueChange={setBirthYear} disabled={submitting || uploadingPhoto}>
                    <SelectTrigger id="register-birth-year" className="h-9 text-sm">
                      <SelectValue placeholder={t("register_visitor.birth_year_placeholder")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[220px]">
                      {birthYearOptions.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="register-phone" className="w-[30px] shrink-0 text-xs">
                  {t("register_visitor.label_tel")}
                </Label>
                <SmartPhoneInput
                  id="register-phone"
                  value={userPhone}
                  onChange={setUserPhone}
                  onValidityChange={setUserPhoneValid}
                  disabled={submitting || uploadingPhoto}
                  className="min-w-0 flex-1"
                />
              </div>
              <VisitorPoolAvatarPicker
                active={step === 2}
                locale={uiLanguage}
                showSelfie
                preservedAvatar={
                  returningProfile
                    ? {
                        imageUrl: returningProfile.avatarUrl,
                        objectPath: returningProfile.avatarObjectPath,
                        pseudo: returningDisplayPseudo.trim() || returningProfile.pseudo,
                      }
                    : null
                }
                disabled={creatingProfile}
                visitorPhotoFile={visitorPhotoFile}
                userPhotoUrl={userPhotoUrl}
                onSelfieCapture={(e) => void handleCaptureProfilePhoto(e)}
                uploadingPhoto={uploadingPhoto}
                onActiveAvatarChange={setActivePoolAvatar}
                onClearSelfie={() => {
                  setVisitorPhotoFile(null);
                  setUserPhotoUrl("");
                }}
                selfieInputId="register-selfie"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 flex-1 border-border px-2 text-xs"
                  disabled={creatingProfile}
                  onClick={() => {
                    if (oauthProfileFlow) {
                      void supabase.auth.signOut();
                      setOauthProfileFlow(false);
                      setStep(1);
                      return;
                    }
                    setStep(1);
                  }}
                >
                  {t("register_visitor.btn_back")}
                </Button>
                <Button
                  type="submit"
                  className="h-9 min-w-0 flex-1 gradient-gold gradient-gold-hover-bg px-1.5 text-[11px] leading-tight text-primary-foreground"
                  disabled={!canSubmitFinal}
                >
                  {creatingProfile ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 shrink-0 animate-spin" />
                      {t("register_visitor.btn_creating_profile")}
                    </>
                  ) : (
                    finalActionLabel
                  )}
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                <Link
                  to={expoIdFromUrl ? `/login?expo_id=${encodeURIComponent(expoIdFromUrl)}` : "/login"}
                  className="underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  {t("register_visitor.link_login_combined")}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Register;
