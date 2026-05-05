import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { buildSignupTrackingPayload } from "@/lib/signupTrackingFromLogin";
import { clearLoginTrackerSession } from "@/lib/visitorTracking";
import { getPasswordResetRedirectUrl } from "@/lib/passwordReset";
import { useAuthUser } from "@/hooks/useAuthUser";
import { isVisitorRole } from "@/lib/authUser";
import { getCurrentExpoId, setCurrentExpoId } from "@/lib/expoContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_VALIDATION_MESSAGE = "Veuillez inclure un « @ » dans l’adresse e-mail.";

const getRedirectAfterLoginPath = (): string | null => {
  if (typeof window === "undefined") return null;

  const redirectUrl = sessionStorage.getItem("redirectAfterLogin")?.trim();
  if (!redirectUrl) return null;

  try {
    const parsed = new URL(redirectUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
};

const Login = () => {
  const [searchParams] = useSearchParams();
  const { session, loading: authLoading, role_name, agency_id, role_id } = useAuthUser();
  const expoIdFromUrl = searchParams.get("expo_id")?.trim() || "";

  useEffect(() => {
    if (expoIdFromUrl) setCurrentExpoId(expoIdFromUrl);
  }, [expoIdFromUrl]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (session) {
    const redirectAfterLoginPath = getRedirectAfterLoginPath();
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("redirectAfterLogin");
    }
    const target = redirectAfterLoginPath || "/";
    return <Navigate to={target} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      toast.error("Saisissez l’e-mail et le mot de passe.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message || "Connexion impossible.");
      return;
    }

    toast.success("Connexion réussie.");
    clearLoginTrackerSession();
    /* Redirection : `session` + rôle via `useAuthUser` (bloc Navigate ci-dessus). */
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error("Saisissez d’abord votre adresse e-mail.");
      return;
    }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    setSendingReset(false);
    if (error) {
      toast.error(error.message || "Envoi du lien impossible.");
      return;
    }
    toast.success("Si un compte existe pour cet e-mail, vous recevrez un lien pour choisir un nouveau mot de passe.");
  };

  const upsertProfileForLevel4 = async (
    authUserId: string,
    targetAgencyId: string,
    tracking: Record<string, unknown> | null,
  ) => {
    // Les donnees de profil vont dans public.profiles (le trigger signUp peut avoir deja cree la ligne)
    const profilePayload: {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      avatar_url?: string | null;
      phone?: string | null;
      zip_code?: string | null;
      city?: string | null;
      country_code?: string | null;
      language?: string | null;
    } = { id: authUserId };
    if (tracking) {
      const allowed = ["first_name", "last_name", "username", "avatar_url", "phone", "zip_code", "city", "country_code", "language"] as const;
      for (const key of allowed) {
        if (key in tracking) {
          const val = tracking[key];
          (profilePayload as Record<string, unknown>)[key] = typeof val === "string" ? val : null;
        }
      }
    }
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (profileErr) {
      throw new Error(`Mise a jour profil impossible : ${profileErr.message}`);
    }

    // Le rattachement agence + role va dans agency_users (PK composite user_id, agency_id)
    const { error: linkErr } = await supabase
      .from("agency_users")
      .upsert({ user_id: authUserId, agency_id: targetAgencyId, role_id: 4 }, { onConflict: "user_id,agency_id" });
    if (linkErr) {
      throw new Error(`Rattachement agence impossible : ${linkErr.message}`);
    }
  };

  const handleCreateAccount = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      toast.error("Saisissez l’e-mail et le mot de passe pour créer le compte.");
      return;
    }

    const targetAgencyId = (agency_id ?? import.meta.env.VITE_DEFAULT_AGENCY_ID?.trim()) || null;
    if (!targetAgencyId) {
      toast.error("agency_id introuvable. Définissez VITE_DEFAULT_AGENCY_ID pour la création de compte niveau 4.");
      return;
    }

    setCreatingAccount(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmed,
        password,
      });

      if (error) throw new Error(error.message);

      const authUserId = data.user?.id ?? null;
      if (!authUserId) {
        throw new Error("ID utilisateur non retourné par Supabase après signUp.");
      }

      const tracking = buildSignupTrackingPayload(searchParams);
      await upsertProfileForLevel4(authUserId, targetAgencyId, tracking);
      clearLoginTrackerSession();
      toast.success("Compte créé. Vérifiez l’e-mail si la confirmation est activée.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Création du compte impossible.";
      toast.error(msg);
    } finally {
      setCreatingAccount(false);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col items-center px-4 pb-8 pt-0">
      <Card className="mt-5 w-full max-w-[320px] border-border shadow-lg">
        <CardHeader className="space-y-1 px-3 pt-4 pb-2">
          <CardTitle className="font-serif text-2xl text-center">Connexion</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-4 pt-0">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-[5px]">
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onInvalid={(e) => {
                  const input = e.currentTarget;
                  if (input.validity.typeMismatch || input.validity.patternMismatch) {
                    input.setCustomValidity(EMAIL_VALIDATION_MESSAGE);
                    return;
                  }
                  if (input.validity.valueMissing) {
                    input.setCustomValidity("L’adresse e-mail est obligatoire.");
                    return;
                  }
                  input.setCustomValidity("");
                }}
                onInput={(e) => {
                  e.currentTarget.setCustomValidity("");
                }}
                placeholder="vous@exemple.com"
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-[5px]">
              <Label htmlFor="login-password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-1 flex items-center px-2 text-muted-foreground shadow-none drop-shadow-none focus:outline-none focus:ring-0 active:opacity-100"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  className="text-xs font-medium text-red-500 no-underline shadow-none drop-shadow-none hover:text-red-500 focus:outline-none focus:ring-0 active:opacity-100 disabled:opacity-50"
                  onClick={() => void handleForgotPassword()}
                  disabled={submitting || sendingReset}
                >
                  {sendingReset ? "Envoi…" : "Mot de passe oublié ?"}
                </button>
              </div>
            </div>
            <div className="flex flex-row gap-3 w-full">
              <Button
                type="button"
                className="flex-1 w-full bg-white text-black border border-border hover:bg-gray-100 text-sm"
                onClick={() => void handleCreateAccount()}
                disabled={submitting || creatingAccount}
              >
                {creatingAccount ? "Création..." : "Créer un compte"}
              </Button>
              <Button type="submit" className="flex-1 w-full gradient-gold gradient-gold-hover-bg text-primary-foreground" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connexion…
                  </>
                ) : (
                  "Se connecter"
                )}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              <Link
                to={expoIdFromUrl ? `/register?expo_id=${encodeURIComponent(expoIdFromUrl)}` : "/register"}
                className="underline underline-offset-2 transition-colors hover:text-foreground"
              >
                Pas encore de compte ? S&apos;inscrire
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
