import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import { getPasswordResetRedirectUrl } from "@/lib/passwordReset";
import { useAuthUser } from "@/hooks/useAuthUser";
import { isVisitorRole } from "@/lib/authUser";
import { getStoredVisitorUuid } from "@/lib/visitorIdentity";
import { setCurrentExpoId } from "@/lib/expoContext";
import { USER_AGE_OPTIONS } from "@/lib/userAgeOptions";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    m.includes("email address is already registered")
  );
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
};

type RegisterVisitorInstantResponse = {
  ok?: boolean;
  user_id?: string;
  code?: string;
  error?: string;
};

const Register = () => {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, loading: authLoading, role_name, role_id } = useAuthUser();
  const expoIdFromUrl = searchParams.get("expo_id")?.trim() || "";
  const agencyIdFromUrl = searchParams.get("agency_id")?.trim() || "";

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
  const [userAge, setUserAge] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userPhoneValid, setUserPhoneValid] = useState(true);
  const [userPhotoUrl, setUserPhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [emailDuplicateOpen, setEmailDuplicateOpen] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
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

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (session) {
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
      const ext = prepared.name.split(".").pop()?.toLowerCase() || "webp";
      const objectPath = `selfies/${crypto.randomUUID()}.${ext}`;
      const preferredBucket = "selfies";
      const fallbackBucket = "images";

      const tryUpload = async (bucket: string) => {
        const { error } = await supabase.storage.from(bucket).upload(objectPath, prepared, {
          cacheControl: "3600",
          upsert: false,
        });
        if (error) return { ok: false as const, error };
        const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
        return { ok: true as const, publicUrl: data.publicUrl };
      };

      const first = await tryUpload(preferredBucket);
      if (first.ok) {
        setUserPhotoUrl(first.publicUrl);
        toast.success(t("register_visitor.toast_photo_saved"));
        return;
      }
      const second = await tryUpload(fallbackBucket);
      if (second.ok) {
        setUserPhotoUrl(second.publicUrl);
        toast.success(t("register_visitor.toast_photo_saved"));
        return;
      }
      toast.error(
        t("register_visitor.toast_photo_upload_failed", {
          first: first.error.message,
          second: second.error.message,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("register_visitor.toast_photo_failed");
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    const trimmedPrenom = prenom.trim();
    const trimmedNom = nom.trim();
    const trimmedAge = userAge.trim();
    const trimmedPhone = userPhone.trim();

    if (!trimmed || !password) {
      toast.error(t("register_visitor.toast_complete_email_password"));
      return;
    }
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
        user_age: trimmedAge || null,
        user_phone: trimmedPhone || null,
        user_photo_url: userPhotoUrl.trim() || null,
        user_expo_id: expoIdFromUrl || null,
        visitor_uuid: getStoredVisitorUuid(),
      };

      const { data: createData, error: createError } = await supabase.functions.invoke<RegisterVisitorInstantResponse>(
        "register-visitor-instant",
        { body },
      );

      if (createError) {
        const msg = createError.message || t("register_visitor.toast_visitor_signup_failed");
        if (isDuplicateEmailSignUpError(msg, createData?.code)) {
          setEmailDuplicateOpen(true);
          return;
        }
        toast.error(msg);
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

  return (
    <div className="flex w-full flex-1 flex-col items-center px-4 pb-8 pt-1">
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
        <CardHeader className="space-y-1 px-3 pb-1 pt-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-left font-serif text-xl leading-tight">
              {step === 1 ? t("register_visitor.title_step_access") : t("register_visitor.title_step_profile")}
            </CardTitle>
            <span
              className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground tabular-nums"
              aria-hidden
            >
              {step}/2
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          {step === 1 ? (
            <div className="space-y-2.5">
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
                className="mt-1 w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
                onClick={goToStep2}
                disabled={!canGoToStep2}
              >
                {t("register_visitor.btn_continue")}
              </Button>
              <p className="pt-1 text-center text-[11px] text-muted-foreground">
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
              <div className="flex items-center gap-2">
                <Label htmlFor="register-prenom" className="w-20 shrink-0 text-xs">
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
                  className="h-9 flex-1 text-sm"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="register-nom" className="w-20 shrink-0 text-xs">
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
                  className="h-9 flex-1 text-sm"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="register-age" className="w-20 shrink-0 text-xs">
                  {t("register_visitor.label_age")}
                </Label>
                <Select value={userAge} onValueChange={setUserAge} disabled={submitting || uploadingPhoto}>
                  <SelectTrigger id="register-age" className="h-9 flex-1 text-sm">
                    <SelectValue placeholder={t("register_visitor.age_placeholder")} />
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
                <Label htmlFor="register-phone" className="w-20 shrink-0 text-xs">
                  {t("register_visitor.label_tel")}
                </Label>
                <SmartPhoneInput
                  id="register-phone"
                  value={userPhone}
                  onChange={setUserPhone}
                  onValidityChange={setUserPhoneValid}
                  disabled={submitting || uploadingPhoto}
                  className="flex-1"
                />
              </div>
              <div className="rounded-md border border-border/70 bg-muted/30 p-2">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="register-selfie"
                    className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                  >
                    {uploadingPhoto ? t("register_visitor.btn_photo_uploading") : t("register_visitor.btn_take_selfie")}
                  </label>
                  <input
                    id="register-selfie"
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={(e) => void handleCaptureProfilePhoto(e)}
                    disabled={submitting || uploadingPhoto}
                    className="hidden"
                  />
                  {userPhotoUrl ? (
                    <img src={userPhotoUrl} alt={t("register_visitor.selfie_alt")} className="h-[100px] w-[100px] rounded-full object-cover" />
                  ) : (
                    <div className="h-[100px] w-[100px] rounded-full border border-dashed border-border/80 bg-muted/40" />
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 flex-1 border-border px-2 text-xs"
                  disabled={creatingProfile}
                  onClick={() => setStep(1)}
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
