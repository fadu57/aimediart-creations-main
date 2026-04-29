import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_LEN = 8;

const ResetPassword = () => {
  const navigate = useNavigate();
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) setReady(true);
      setChecking(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LEN) {
      toast.error(`Le mot de passe doit contenir au moins ${MIN_LEN} caractères.`);
      return;
    }
    if (password !== confirm) {
      toast.error("Les deux saisies du nouveau mot de passe ne correspondent pas.");
      return;
    }
    const prev = previousPassword.trim();
    if (prev.length > 0 && prev === password) {
      toast.error("Le nouveau mot de passe doit être différent de l’ancien.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      toast.error(error.message || "Impossible de mettre à jour le mot de passe.");
      return;
    }

    toast.success("Mot de passe mis à jour. Vous pouvez vous connecter.");
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
        <p className="text-sm text-muted-foreground max-w-md">
          Lien invalide ou expiré. Demandez un nouveau lien depuis la page de connexion (« Mot de passe oublié »).
        </p>
        <Button variant="outline" asChild>
          <Link to="/login">Retour à la connexion</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="font-serif text-2xl text-center">Nouveau mot de passe</CardTitle>
          <CardDescription className="text-center">
            Choisissez un mot de passe différent de l’ancien. Si vous vous souvenez encore de l’ancien, saisissez-le
            ci-dessous : il ne doit pas être identique au nouveau.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-[5px]">
              <Label htmlFor="reset-previous">Ancien mot de passe (optionnel)</Label>
              <div className="relative">
                <Input
                  id="reset-previous"
                  type={showPrev ? "text" : "password"}
                  autoComplete="current-password"
                  value={previousPassword}
                  onChange={(e) => setPreviousPassword(e.target.value)}
                  disabled={submitting}
                  className="pr-10"
                  placeholder="Pour vérifier qu’il est différent du nouveau"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowPrev((v) => !v)}
                  aria-label={showPrev ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPrev ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-[5px]">
              <Label htmlFor="reset-new">Nouveau mot de passe</Label>
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
                  aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-[5px]">
              <Label htmlFor="reset-confirm">Confirmer le nouveau mot de passe</Label>
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
                  aria-label={showCf ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enregistrement…
                </>
              ) : (
                "Enregistrer le mot de passe"
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                Retour à la connexion
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
