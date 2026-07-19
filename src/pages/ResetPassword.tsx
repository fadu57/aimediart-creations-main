import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_LEN = 8;

const ResetPassword = () => {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFirstSetup = searchParams.get("setup") === "1";
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  const [previousPassword, setPreviousPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPrev, setShowPrev] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    if (password.length < MIN_LEN) {
      toast.error(t("recovery.toast_min_length", { min: MIN_LEN }));
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
      toast.error(error.message || t("recovery.toast_update_failed"));
      return;
    }

    toast.success(isFirstSetup ? t("recovery.toast_created") : t("recovery.toast_updated"));
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground max-w-md">{t("recovery.invalid_link")}</p>
        <Button variant="outline" asChild>
          <Link to="/login">{t("recovery.link_back_login")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="font-serif text-2xl text-center">
            {isFirstSetup ? t("recovery.setup_card_title") : t("recovery.card_title")}
          </CardTitle>
          <CardDescription className="text-center">
            {isFirstSetup ? t("recovery.setup_card_description") : t("recovery.card_description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              <div className="relative">
                <Input
                  id="reset-new"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                  minLength={MIN_LEN}
                  className="pr-10"
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
                  minLength={MIN_LEN}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowCf((v) => !v)}
                  aria-label={showCf ? t("recovery.aria_hide_password") : t("recovery.aria_show_password")}
                >
                  {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground" disabled={submitting}>
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
            <p className="text-center text-xs text-muted-foreground">
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
