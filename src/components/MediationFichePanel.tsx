import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  type MediationDescriptionKey,
  type MediationUiLang,
  MEDIATION_DESCRIPTION_KEYS,
  MEDIATION_UI_LANGS,
  createEmptyDescriptionsByLang,
  normalizeArtworkDescriptionToByLang,
  resolveMediationUiLang,
  serializeMediationDescriptionsByLang,
} from "@/lib/artworkDescriptionI18n";
import { invokeAiWorker } from "@/lib/aiJobs/invokeAiWorker";
import { pollAiJobUntilDone } from "@/lib/aiJobs/pollAiJobUntilDone";

/** Texte de médiation par langue (une entrée = un bloc éditable). */
export type DescriptionsByLang = Record<string, string>;

type AiCreateJobResponse = {
  job?: { id?: string };
  error?: string;
};

export type MediationFichePanelProps = {
  /**
   * Identifiant de l’œuvre (`artworks.artwork_id`).
   * (Pas de table `mediations` : la persistance utilise `artwork_description_i18n`.)
   */
  artworkId: string;
  /** Langue cible du job IA et du textarea (ex. `fr`, `en`). */
  activeLang: string;
  /**
   * Clé de style JSONB qui reçoit le texte IA (défaut `simple`).
   * Les autres styles de la même langue sont conservés à la sauvegarde.
   */
  targetStyleKey?: MediationDescriptionKey;
};

function extractSimpleDescriptionsByLang(
  nested: Record<MediationUiLang, Record<MediationDescriptionKey, string>>,
  styleKey: MediationDescriptionKey,
): DescriptionsByLang {
  const out: DescriptionsByLang = {};
  for (const L of MEDIATION_UI_LANGS) {
    out[L] = nested[L][styleKey] ?? "";
  }
  return out;
}

function mergeSimpleIntoNested(
  nested: Record<MediationUiLang, Record<MediationDescriptionKey, string>>,
  simple: DescriptionsByLang,
  styleKey: MediationDescriptionKey,
): Record<MediationUiLang, Record<MediationDescriptionKey, string>> {
  const out = createEmptyDescriptionsByLang();
  for (const L of MEDIATION_UI_LANGS) {
    for (const k of MEDIATION_DESCRIPTION_KEYS) {
      out[L][k] = nested[L][k] ?? "";
    }
    const simpleText = simple[L];
    if (typeof simpleText === "string") {
      out[L][styleKey] = simpleText.trim();
    }
  }
  return out;
}

export function MediationFichePanel({
  artworkId,
  activeLang,
  targetStyleKey = "simple",
}: MediationFichePanelProps) {
  const resolvedLang = resolveMediationUiLang(activeLang);

  const [descriptionsByLang, setDescriptionsByLang] = useState<DescriptionsByLang>({});
  const [generatedFiche, setGeneratedFiche] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error: loadErr } = await supabase
        .from("artworks")
        .select("artwork_description_i18n")
        .eq("artwork_id", artworkId)
        .maybeSingle();

      if (cancelled) return;

      if (loadErr) {
        setError(loadErr.message || "Impossible de charger les médiations.");
        setInitialLoaded(true);
        return;
      }

      const nested = normalizeArtworkDescriptionToByLang(
        (data as { artwork_description_i18n?: unknown } | null)?.artwork_description_i18n,
      );
      setDescriptionsByLang(extractSimpleDescriptionsByLang(nested, targetStyleKey));
      setInitialLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [artworkId, targetStyleKey]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveError(null);
    setGeneratedFiche(null);
    setJobId(null);

    try {
      const { data: artwork, error: artworkErr } = await supabase
        .from("artworks")
        .select("artwork_title, artwork_source_material")
        .eq("artwork_id", artworkId)
        .maybeSingle();

      if (artworkErr) {
        setError(artworkErr.message || "Impossible de charger l'œuvre.");
        setLoading(false);
        return;
      }

      const contenuSource = [
        artwork?.artwork_title?.trim() ? `Titre: ${artwork.artwork_title.trim()}` : "",
        artwork?.artwork_source_material?.trim() ?? "",
      ]
        .filter(Boolean)
        .join("\n")
        .trim() || `Œuvre ${artworkId}`;

      const { data, error: invokeError } = await supabase.functions.invoke<AiCreateJobResponse>(
        "ai-create-job",
        {
          body: {
            job_type: "generate_fiche",
            payload: {
              ficheId: artworkId,
              langue: resolvedLang,
              contenuSource,
            },
          },
        },
      );

      if (invokeError) {
        setError(invokeError.message || "Erreur lors de l'appel à ai-create-job.");
        setLoading(false);
        return;
      }

      const newJobId = data?.job?.id;
      if (!newJobId) {
        setError(
          typeof data?.error === "string" ? data.error : "Réponse invalide : job.id manquant.",
        );
        setLoading(false);
        return;
      }

      setJobId(newJobId);

      const workerRun = await invokeAiWorker(newJobId);
      if (workerRun.ok === false) {
        console.warn("[MediationFichePanel] ai-worker:", workerRun.message);
      }

      const pollResult = await pollAiJobUntilDone(newJobId, { timeoutMs: 120_000 });
      if (pollResult.ok === false) {
        setError(pollResult.message);
        setLoading(false);
        setJobId(null);
        return;
      }

      const text = pollResult.text || "";
      setGeneratedFiche(text);
      setDescriptionsByLang((prev) => ({
        ...prev,
        [resolvedLang]: text,
      }));
      setLoading(false);
      setJobId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
      setLoading(false);
      setJobId(null);
    }
  }, [artworkId, resolvedLang]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const { data: existing, error: loadErr } = await supabase
        .from("artworks")
        .select("artwork_description_i18n")
        .eq("artwork_id", artworkId)
        .maybeSingle();

      if (loadErr) {
        setSaveError(loadErr.message || "Impossible de lire l'œuvre.");
        setSaving(false);
        return;
      }

      const nested = normalizeArtworkDescriptionToByLang(
        (existing as { artwork_description_i18n?: unknown } | null)?.artwork_description_i18n,
      );
      const merged = mergeSimpleIntoNested(nested, descriptionsByLang, targetStyleKey);
      const serialized = serializeMediationDescriptionsByLang(merged);

      const { data: updatedRows, error: updateErr } = await supabase
        .from("artworks")
        .update({ artwork_description_i18n: serialized })
        .eq("artwork_id", artworkId)
        .select("artwork_id");

      if (updateErr) {
        setSaveError(updateErr.message || "Échec de la sauvegarde.");
        setSaving(false);
        return;
      }

      if (!updatedRows?.length) {
        setSaveError("Aucune ligne mise à jour (vérifiez RLS ou l'identifiant œuvre).");
        setSaving(false);
        return;
      }

      setSaving(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur inattendue.");
      setSaving(false);
    }
  }, [artworkId, descriptionsByLang, targetStyleKey]);

  const textareaValue = descriptionsByLang[resolvedLang] ?? "";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={loading || saving || !initialLoaded}
        >
          Générer la fiche
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleSave()}
          disabled={loading || saving || !initialLoaded}
        >
          {saving ? "Sauvegarde…" : "Sauver la médiation"}
        </Button>
      </div>

      {loading && !generatedFiche && (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Génération en cours…
          {jobId ? ` (job ${jobId.slice(0, 8)}…)` : ""}
        </p>
      )}

      {(error || saveError) && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error ?? saveError}
        </div>
      )}

      <textarea
        value={textareaValue}
        onChange={(e) => {
          const value = e.target.value;
          setDescriptionsByLang((prev) => ({
            ...prev,
            [resolvedLang]: value,
          }));
        }}
        disabled={loading || saving || !initialLoaded}
        rows={12}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Médiation (${resolvedLang})`}
        placeholder={
          initialLoaded ? `Texte de médiation (${resolvedLang.toUpperCase()})` : "Chargement…"
        }
      />
    </div>
  );
}
