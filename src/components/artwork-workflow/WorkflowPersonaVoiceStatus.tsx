import { useEffect, useState } from "react";

import { getAudioFiles } from "@/services/audioService";
import { cn } from "@/lib/utils";

type WorkflowPersonaVoiceStatusProps = {
  artworkId: string;
  lang: string;
  promptStyleId?: string | null;
  hasText: boolean;
  refreshKey?: number;
};

function voiceLabel(status: string | undefined): { symbol: string; className: string } {
  if (status === "ready") return { symbol: "✓ générée", className: "text-emerald-700" };
  if (status === "generating" || status === "pending") {
    return { symbol: "… en cours", className: "text-amber-700" };
  }
  if (status === "error") return { symbol: "! erreur", className: "text-destructive" };
  return { symbol: "— non générée", className: "text-destructive" };
}

export function WorkflowPersonaVoiceStatus({
  artworkId,
  lang,
  promptStyleId,
  hasText,
  refreshKey = 0,
}: WorkflowPersonaVoiceStatusProps) {
  const [voices, setVoices] = useState<{ f: string; m: string }>({ f: "", m: "" });

  useEffect(() => {
    if (!artworkId?.trim() || !promptStyleId?.trim() || !hasText) {
      setVoices({ f: "", m: "" });
      return;
    }
    let cancelled = false;
    const langKey = lang.trim().toLowerCase().slice(0, 2);
    void getAudioFiles(artworkId, "mediation").then((files) => {
      if (cancelled) return;
      const match = (gender: "F" | "M") =>
        files.find(
          (f) =>
            f.prompt_style_id === promptStyleId &&
            f.gender === gender &&
            (f.lang ?? "").trim().toLowerCase().slice(0, 2) === langKey,
        )?.status;
      setVoices({ f: match("F") ?? "", m: match("M") ?? "" });
    });
    return () => {
      cancelled = true;
    };
  }, [artworkId, lang, promptStyleId, hasText, refreshKey]);

  if (!hasText || !promptStyleId?.trim()) return null;

  const f = voiceLabel(voices.f);
  const m = voiceLabel(voices.m);

  return (
    <p className="text-[11px] text-muted-foreground">
      Guides audio ({lang.toUpperCase()}) :{" "}
      <span className={cn("font-medium", f.className)}>F {f.symbol}</span>
      {" · "}
      <span className={cn("font-medium", m.className)}>M {m.symbol}</span>
    </p>
  );
}
