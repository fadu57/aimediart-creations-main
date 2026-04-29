import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { hasFullDataAccess, normalizeRoleName, ROLE_ADMIN_AGENCY } from "@/lib/authUser";

export default function Parametres() {
  const { role_id, role_name } = useAuthUser();
  // Admins autorisés à éditer les settings applicatifs.
  // 1=admin_general, 2=super_admin, 4=admin_agency
  // Important: `role_id` peut être `null` si la lecture DB est bloquée (RLS).
  // On autorise donc aussi via `role_name` (JWT) quand il indique un rôle "full access".
  const canEdit =
    role_id === 1 ||
    role_id === 2 ||
    role_id === 4 ||
    hasFullDataAccess(role_name) ||
    normalizeRoleName(role_name) === normalizeRoleName(ROLE_ADMIN_AGENCY);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "analysis_prompt")
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setPrompt("");
      } else {
        setPrompt((data?.value as string | undefined) ?? "");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const value = prompt.trim();
      const { error } = await supabase.from("app_settings").upsert(
        { key: "analysis_prompt", value },
        { onConflict: "key" },
      );
      if (error) throw error;
      toast.success("Prompt enregistré.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Enregistrement impossible.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container py-8 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold">Paramètres</h2>
          <p className="text-muted-foreground">Prompt d’analyse d’image (Gemini) utilisé par l’Edge Function.</p>
        </div>
        <Button
          className="gradient-gold gradient-gold-hover-bg text-primary-foreground"
          disabled={!canEdit || saving || loading}
          onClick={() => void handleSave()}
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>

      {!canEdit && (
        <p className="text-sm text-destructive">
          Accès réservé aux administrateurs (role_id 1/2/4).
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Rôle détecté : <code className="rounded bg-muted px-1 py-0.5">{String(role_name ?? "null")}</code>{" "}
        / role_id : <code className="rounded bg-muted px-1 py-0.5">{String(role_id ?? "null")}</code>
      </p>

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={!canEdit || loading}
        className="min-h-[280px] text-sm leading-relaxed"
        placeholder="Saisissez le prompt d'analyse..."
      />

      <p className="text-xs text-muted-foreground">
        Variable disponible : <code className="rounded bg-muted px-1 py-0.5">{`{{artist_name}}`}</code>
      </p>
    </div>
  );
}

