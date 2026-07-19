import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  getPasswordPolicyIssue,
  isPasswordPolicyOk,
  mapSupabasePasswordError,
  PASSWORD_MIN_LENGTH,
} from "@/lib/passwordPolicy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountIdentity = {
  email: string;
  firstName: string;
  lastName: string;
};

function pickMetaString(meta: Record<string, unknown> | undefined, keys: string[]): string {
  if (!meta) return "";
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function resolveAccountIdentity(): Promise<AccountIdentity | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const email = user.email?.trim() || "";
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  let firstName = pickMetaString(meta, ["first_name", "prenom", "user_prenom", "given_name"]);
  let lastName = pickMetaString(meta, ["last_name", "nom", "family_name"]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    if (profile.first_name?.trim()) firstName = profile.first_name.trim();
    if (profile.last_name?.trim()) lastName = profile.last_name.trim();
  }

  if (!email && !firstName && !lastName) return null;
  return { email, firstName, lastName };
}

const ResetPassword = () => {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFirstSetup = searchParams.get("setup") === "1";
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);

  const [previousPassword, setPreviousPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPrev, setShowPrev] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ready) {
      setIdentity(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const resolved = await resolveAccountIdentity();
      if (!cancelled) setIdentity(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
      }
    });

    void (async () => {
      const tokenHash = searchParams.get("token_hash")?.trim() || "";
      const otpType = (searchParams.get("type")?.trim() || "recovery") as
        | "recovery"
        | "magiclink"
        | "signup"
        | "invite"
        | "email";

      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType === "recovery" ? "recovery" : otpType,
        });
        if (cancelled) return;
        if (!error) {
          setReady(true);
          setChecking(false);
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) setReady(true);
      setChecking(false);
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const policyIssue = getPasswordPolicyIssue(password);
    if (policyIssue === "too_short") {
      toast.error(t("recovery.toast_min_length", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirm) {
      toast.error(t("recovery.toast_confirm_mismatch"));
      return;
    }
    if (!isFirstSetup) {
      const prev = previousPassword.trim();
      if (prev.length > 0 && prev === password) {
        toast.error(t("recovery.toast_same_as_previous"));
        return;
      }
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      toast.error(mapSupabasePasswordError(error.message, t));
      return;
    }

    toast.success(isFirstSetup ? t("recovery.toast_created") : t("recovery.toast_updated"));
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 px-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center overflow-y-auto">
        <p className="text-sm text-muted-foreground max-w-md">{t("recovery.invalid_link")}</p>
        <Button variant="outline" asChild>
          <Link to="/login">{t("recovery.link_back_login")}</Link>
        </Button>
      </div>
    );
  }

  const displayName = [identity?.firstName, identity?.lastName].filter(Boolean).join(" ").trim();
  const showSetupWelcome = isFirstSetup && identity && (displayName || identity.email);
  /** Dès qu’une saisie existe dans le 2e champ : comparer en direct avec le 1er. */
  const confirmStarted = confirm.length > 0;
  const passwordsMatch = confirmStarted && password === confirm;
  const confirmMismatch = confirmStarted && password !== confirm;
  const passwordStarted = password.length > 0;
  const passwordPolicyIssue = passwordStarted ? getPasswordPolicyIssue(password) : null;
  const passwordPolicyError =
    passwordPolicyIssue === "too_short"
      ? t("recovery.toast_min_length", { min: PASSWORD_MIN_LENGTH })
      : null;
  const canSubmit =
    isPasswordPolicyOk(password) && passwordsMatch && !submitting;

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-start px-4 py-6 sm:justify-center sm:py-12 overflow-y-auto">
      <Card className="w-full max-w-md border-border shadow-lg my-auto">
        <CardHeader className="space-y-1 px-4 sm:px-6">
          <CardTitle className="font-serif text-xl sm:text-2xl text-center">
            {isFirstSetup ? t("recovery.setup_card_title") : t("recovery.card_title")}
          </CardTitle>
          {showSetupWelcome ? (
            <div className="flex flex-col items-center gap-1 pt-1 text-center text-sm text-foreground min-w-0 w-full">
              {displayName ? (
                <p className="break-words max-w-full">
                  {t("recovery.setup_welcome_hello")}{" "}
                  <strong className="font-bold text-[#ca2b2b]">{displayName}</strong>
                </p>
              ) : null}
              {identity.email ? (
                <p className="break-all max-w-full">
                  <strong className="font-bold text-[#ca2b2b]">{identity.email}</strong>
                </p>
              ) : null}
            </div>
          ) : null}
          {!isFirstSetup ? (
            <CardDescription className="text-center">
              {t("recovery.card_description")}
            </CardDescription>
          ) : (
            <p className="text-center text-xs text-muted-foreground pt-1 px-1">
              {t("recovery.setup_after_hint")}
            </p>
          )}
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {!isFirstSetup ? (
              <div className="space-y-[5px]">
                <Label htmlFor="reset-previous">{t("recovery.previous_password_label")}</Label>
                <div className="relative">
                  <Input
                    id="reset-previous"
                    type={showPrev ? "text" : "password"}
                    autoComplete="current-password"
                    value={previousPassword}
                    onChange={(e) => setPreviousPassword(e.target.value)}
                    disabled={submitting}
                    className="pr-10"
                    placeholder={t("recovery.previous_placeholder")}
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setShowPrev((v) => !v)}
                    aria-label={showPrev ? t("recovery.aria_hide_password") : t("recovery.aria_show_password")}
                  >
                    {showPrev ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="space-y-[5px]">
              <Label htmlFor="reset-new">
                {isFirstSetup ? t("recovery.setup_password_label") : t("recovery.new_password_label")}
              </Label>
              <p className="text-xs text-muted-foreground leading-snug">{t("recovery.setup_password_hint")}</p>
              <div className="relative">
                <Input
                  id="reset-new"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  aria-invalid={passwordPolicyError ? "true" : "false"}
                  aria-describedby={passwordPolicyError ? "reset-password-error" : "reset-password-hint"}
                  className={`pr-10 ${
                    passwordPolicyError ? "border-[#ca2b2b] focus-visible:ring-[#ca2b2b]" : ""
                  }`}
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? t("recovery.aria_hide_password") : t("recovery.aria_show_password")}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordPolicyError ? (
                <p id="reset-password-error" className="text-xs font-medium text-[#ca2b2b]" role="alert">
                  {passwordPolicyError}
                </p>
              ) : (
                <span id="reset-password-hint" className="sr-only">
                  {t("recovery.setup_password_hint")}
                </span>
              )}
            </div>
            <div className="space-y-[5px]">
              <Label htmlFor="reset-confirm">{t("recovery.confirm_password_label")}</Label>
              <div className="relative">
                <Input
                  id="reset-confirm"
                  type={showCf ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={submitting}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  aria-invalid={confirmMismatch ? "true" : "false"}
                  aria-describedby={confirmMismatch ? "reset-confirm-error" : undefined}
                  className={`pr-16 ${
                    confirmMismatch
                      ? "border-[#ca2b2b] focus-visible:ring-[#ca2b2b]"
                      : passwordsMatch
                        ? "border-emerald-500 focus-visible:ring-emerald-500"
                        : ""
                  }`}
                />
                {confirmStarted ? (
                  <span className="absolute inset-y-0 right-10 flex items-center pointer-events-none">
                    {passwordsMatch ? (
                      <Check className="h-4 w-4 text-emerald-500" aria-hidden />
                    ) : (
                      <X className="h-4 w-4 text-[#ca2b2b]" aria-hidden />
                    )}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowCf((v) => !v)}
                  aria-label={showCf ? t("recovery.aria_hide_password") : t("recovery.aria_show_password")}
                >
                  {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmMismatch ? (
                <p id="reset-confirm-error" className="text-xs font-medium text-[#ca2b2b]" role="alert">
                  {t("recovery.confirm_mismatch_live")}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground min-h-11"
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("recovery.submit_loading")}
                </>
              ) : isFirstSetup ? (
                t("recovery.setup_submit")
              ) : (
                t("recovery.submit")
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                {t("recovery.link_back_login")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
