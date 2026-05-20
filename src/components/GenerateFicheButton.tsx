import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 2000;

type AiCreateJobResponse = {
  job?: { id?: string };
  error?: string;
};

type AiJobPollRow = {
  status: string;
  result: { text?: string } | null;
  error?: { message?: string } | null;
};

export type GenerateFicheButtonProps = {
  oeuvreId: string;
};

/** Client sans typage `ai_jobs` (table absente des types générés pour l'instant). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseUntyped = supabase as any;

export function GenerateFicheButton({ oeuvreId }: GenerateFicheButtonProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [generatedFiche, setGeneratedFiche] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGeneratedFiche(null);
    setJobId(null);

    try {
      const { data: artwork, error: artworkErr } = await supabase
        .from("artworks")
        .select("artwork_title, artwork_source_material")
        .eq("artwork_id", oeuvreId)
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
        .trim() || `Œuvre ${oeuvreId}`;

      const { data, error: invokeError } = await supabase.functions.invoke<AiCreateJobResponse>(
        "ai-create-job",
        {
          body: {
            job_type: "generate_fiche",
            payload: {
              ficheId: oeuvreId,
              langue: "fr",
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
        const apiErr =
          typeof data?.error === "string" ? data.error : "Réponse invalide : job.id manquant.";
        setError(apiErr);
        setLoading(false);
        return;
      }

      setJobId(newJobId);

      const { invokeAiWorker } = await import("@/lib/aiJobs/invokeAiWorker");
      const workerRun = await invokeAiWorker(newJobId);
      if (!workerRun.ok) {
        console.warn("[GenerateFicheButton] ai-worker:", workerRun.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
      setLoading(false);
    }
  }, [oeuvreId]);

  useEffect(() => {
    if (!jobId || generatedFiche !== null) return;

    let cancelled = false;

    const poll = async () => {
      const { data, error: pollError } = await supabaseUntyped
        .from("ai_jobs")
        .select("status, result, error")
        .eq("id", jobId)
        .single();

      if (cancelled) return;

      if (pollError) {
        setError(pollError.message || "Erreur lors du suivi du job.");
        setLoading(false);
        setJobId(null);
        return;
      }

      const row = data as AiJobPollRow | null;
      if (!row) {
        setError("Job introuvable.");
        setLoading(false);
        setJobId(null);
        return;
      }

      if (row.status === "done") {
        const text =
          row.result && typeof row.result.text === "string" ? row.result.text.trim() : "";
        setGeneratedFiche(text || "(Aucun texte renvoyé par l'IA.)");
        setLoading(false);
        setJobId(null);
        return;
      }

      if (row.status === "error") {
        const msg =
          row.error && typeof row.error.message === "string"
            ? row.error.message
            : "Le job IA a échoué.";
        setError(msg);
        setLoading(false);
        setJobId(null);
      }
    };

    void poll();
    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [jobId, generatedFiche]);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <Button type="button" onClick={() => void handleGenerate()} disabled={loading}>
        Générer la fiche
      </Button>

      {loading && !generatedFiche && (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Génération en cours…
        </p>
      )}

      {error && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {generatedFiche !== null && (
        <textarea
          readOnly
          value={generatedFiche}
          rows={12}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Fiche de médiation générée"
        />
      )}
    </div>
  );
}
