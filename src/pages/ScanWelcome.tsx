import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStoredFingerprintJsId, loadOrCreateFingerprintJsId } from "@/lib/fingerprintConsent";
import { getOrCreateVisitorUuid, getVisitorLocaleMetadata } from "@/lib/visitorIdentity";
import { setCurrentExpoId } from "@/lib/expoContext";
import { supabase } from "@/lib/supabase";

type ExpoRow = Record<string, unknown>;

type EdgeIpResponse = {
  ip_address?: string | null;
};

/** Texte exploitable depuis la DB (certains drivers renvoient autre chose qu'une string brute). */
function coerceDisplayCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim();
  return "";
}

/** Libellés possibles dans `public.expos` — `expo_name` en premier (source métier canonique). */
function pickExpoDisplayName(row: ExpoRow | null): string {
  if (!row) return "";
  const keys = ["expo_name", "title", "nom", "name", "expo_title", "label", "expo_label"];
  for (const k of keys) {
    const v = coerceDisplayCell(row[k]);
    if (v) return v;
  }
  return "";
}

async function fetchExpoRowForVisitor(expoIdRaw: string): Promise<ExpoRow | null> {
  const raw = expoIdRaw.trim();
  if (!raw) return null;

  const attempts: Array<{ label: string; run: () => Promise<{ data: unknown; error: { code?: string; message?: string } | null }> }> =
    [
      {
        label: "id.eq + deleted_at is null",
        run: () => supabase.from("expos").select("*").eq("id", raw).is("deleted_at", null).maybeSingle(),
      },
      {
        label: "id.eq",
        run: () => supabase.from("expos").select("*").eq("id", raw).maybeSingle(),
      },
      {
        label: "expo_id.eq + deleted_at is null",
        run: () => supabase.from("expos").select("*").eq("expo_id", raw).is("deleted_at", null).maybeSingle(),
      },
      {
        label: "expo_id.eq",
        run: () => supabase.from("expos").select("*").eq("expo_id", raw).maybeSingle(),
      },
    ];

  for (const { label, run } of attempts) {
    const { data, error } = await run();
    if (import.meta.env.DEV && error) {
      console.warn(`[ScanWelcome] expos (${label}):`, error.code ?? "", error.message);
    }
    if (error) continue;
    if (data && typeof data === "object") return data as ExpoRow;
  }

  return null;
}

const ScanWelcome = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuthUser();
  const [searchParams] = useSearchParams();
  const [expoName, setExpoName] = useState<string>("");
  const [visitorUuid, setVisitorUuid] = useState<string>("");

  const [pseudoDialogOpen, setPseudoDialogOpen] = useState(false);
  const [pseudoValue, setPseudoValue] = useState("");
  const [anonymousBusy, setAnonymousBusy] = useState(false);
  const [pseudoActionBusy, setPseudoActionBusy] = useState(false);
  const [pseudoFlowError, setPseudoFlowError] = useState<string | null>(null);

  const expoId = useMemo(() => searchParams.get("expo_id")?.trim() || "", [searchParams]);

  const œuvreLink = useMemo(
    () => (expoId ? `/scan-work1?expo_id=${encodeURIComponent(expoId)}` : "/scan-work1"),
    [expoId],
  );
  const registerLink = useMemo(
    () => (expoId ? `/register?expo_id=${encodeURIComponent(expoId)}` : "/register"),
    [expoId],
  );

  const pseudoLocale = useMemo(
    () => (typeof navigator !== "undefined" ? (navigator.language ?? "fr").trim().slice(0, 10) : "fr") || "fr",
    [],
  );

  useEffect(() => {
    if (!expoId) return;
    setCurrentExpoId(expoId);
  }, [expoId]);

  useEffect(() => {
    setVisitorUuid(getOrCreateVisitorUuid());
  }, []);

  useEffect(() => {
    const loadExpoName = async () => {
      if (!expoId) {
        setExpoName("Exposition en cours");
        return;
      }
      const row = await fetchExpoRowForVisitor(expoId);
      const picked = pickExpoDisplayName(row);
      if (import.meta.env.DEV && row && !picked) {
        console.warn("[ScanWelcome] exposition trouvée mais aucun champ de nom exploitable (expo_name, title…). Clés:", Object.keys(row));
      }
      setExpoName(picked || "Exposition en cours");
    };
    void loadExpoName();
  }, [expoId]);

  useEffect(() => {
    const trackGuestVisit = async () => {
      if (!visitorUuid || !expoId) return;
      const { language, timezone } = getVisitorLocaleMetadata();
      const { data: ipData } = await supabase.functions.invoke<EdgeIpResponse>("get-client-ip", {
        body: { visitor_uuid: visitorUuid },
      });
      const rawIp = typeof ipData?.ip_address === "string" ? ipData.ip_address.trim() : "";
      const fp = getStoredFingerprintJsId();
      const payload = {
        visitor_uuid: visitorUuid,
        expo_id: expoId,
        language,
        timezone,
        ip_address: rawIp || null,
        ...(fp ? { device_fingerprint: fp } : {}),
      };
      await supabase.from("guest_visits").insert(payload);
    };
    void trackGuestVisit();
  }, [visitorUuid, expoId]);

  const fetchSuggestedPseudo = async (): Promise<string> => {
    const { data, error } = await supabase.rpc("generate_visitor_pseudo", { locale: pseudoLocale });
    if (error) throw new Error(error.message);
    if (typeof data !== "string" || !data.trim()) {
      throw new Error("Pseudo vide renvoyé par le serveur.");
    }
    return data.trim();
  };

  const handleContinueAnonymous = async () => {
    setPseudoFlowError(null);
    if (!visitorUuid) {
      setPseudoFlowError("Identifiant visiteur indisponible. Rechargez la page.");
      return;
    }

    setAnonymousBusy(true);
    try {
      const fpIdRaw = (await loadOrCreateFingerprintJsId())?.trim() || null;
      const { language, timezone } = getVisitorLocaleMetadata();

      let rawIp: string | null = null;
      try {
        const { data: ipData } = await supabase.functions.invoke<EdgeIpResponse>("get-client-ip", {
          body: { visitor_uuid: visitorUuid },
        });
        const s = typeof ipData?.ip_address === "string" ? ipData.ip_address.trim() : "";
        rawIp = s ? s.slice(0, 256) : null;
      } catch {
        rawIp = null;
      }

      const { error: regError } = await supabase.rpc("register_anonymous_visitor", {
        p_visitor_client_id: visitorUuid,
        p_fingerprint: fpIdRaw,
        p_fingerprint_source: fpIdRaw ? "fingerprintjs_visitor_id" : null,
        p_user_agent: null,
        p_client_locale: language,
        p_client_timezone: timezone,
        p_screen_resolution: null,
        p_ip_address: rawIp,
        p_browser_name: null,
        p_device_type: null,
        p_country: null,
        p_city: null,
      });

      if (regError) {
        throw new Error(regError.message);
      }

      try {
        const suggested = await fetchSuggestedPseudo();
        setPseudoFlowError(null);
        setPseudoValue(suggested);
        setPseudoDialogOpen(true);
      } catch (pseudoErr) {
        /* Si la fonction SQL ou la table pseudo_pool n’est pas encore déployée. */
        console.warn("[ScanWelcome] pseudonyme aléatoire indisponible :", pseudoErr);
        navigate(œuvreLink);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l’enregistrement du mode anonyme.";
      setPseudoFlowError(message);
      if (import.meta.env.DEV) {
        console.warn("[ScanWelcome] register_anonymous_visitor :", err);
      }
    } finally {
      setAnonymousBusy(false);
    }
  };

  const handlePseudoRegenerate = async () => {
    setPseudoActionBusy(true);
    setPseudoFlowError(null);
    try {
      const next = await fetchSuggestedPseudo();
      setPseudoValue(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de régénérer le pseudo.";
      setPseudoFlowError(message);
    } finally {
      setPseudoActionBusy(false);
    }
  };

  const handlePseudoConfirm = async () => {
    const trimmed = pseudoValue.trim();
    if (!trimmed) {
      setPseudoFlowError("Choisissez un pseudo ou régénérez-en un.");
      return;
    }

    setPseudoActionBusy(true);
    setPseudoFlowError(null);

    try {
      const { error } = await supabase.rpc("confirm_visitor_pseudo_from_client", {
        p_visitor_client_id: visitorUuid,
        p_pseudo: trimmed,
      });
      if (error) {
        throw new Error(error.message);
      }
      setPseudoDialogOpen(false);
      navigate(œuvreLink);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur lors de l’enregistrement du pseudo. Réessayez ou continuez depuis le scanner.";
      setPseudoFlowError(message);
      if (import.meta.env.DEV) {
        console.warn("[ScanWelcome] confirm_visitor_pseudo_from_client :", err);
      }
    } finally {
      setPseudoActionBusy(false);
    }
  };

  const handlePseudoSkipNavigate = () => {
    setPseudoDialogOpen(false);
    navigate(œuvreLink);
  };

  if (loading) return null;

  if (session) {
    return <Navigate to={œuvreLink} replace />;
  }

  return (
    <div className="flex w-full flex-1 flex-col items-center px-4 pb-8 pt-0">
      <Dialog open={pseudoDialogOpen} onOpenChange={(o) => setPseudoDialogOpen(o)}>
        <DialogContent hideCloseButton className="gap-3 px-5 py-6 sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>Votre pseudo anonyme</DialogTitle>
            <DialogDescription>
              Une proposition aléatoire (nom commun + qualificatif + 3 chiffres) — vous pouvez la modifier avant de poursuivre.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={pseudoValue}
            onChange={(e) => setPseudoValue(e.target.value)}
            placeholder="Pseudo"
            maxLength={80}
            autoCorrect="off"
            spellCheck={false}
            className="w-[250px] items-center justify-center gap-0 overflow-visible bg-gray-200 px-2 text-center text-lg font-black"
          />
          {pseudoFlowError ? <p className="text-sm text-destructive">{pseudoFlowError}</p> : null}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" className="w-full sm:w-auto" disabled={pseudoActionBusy} onClick={() => handlePseudoSkipNavigate()}>
              Plus tard
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={pseudoActionBusy} onClick={() => void handlePseudoRegenerate()}>
                {pseudoActionBusy ? "…" : "Autre suggestion"}
              </Button>
              <Button type="button" className="w-full sm:w-auto" disabled={pseudoActionBusy} onClick={() => void handlePseudoConfirm()}>
                Valider et continuer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="mt-5 w-full max-w-[320px] border-border shadow-lg">
        <CardContent className="space-y-4 px-3 pb-4 pt-4">
          <div className="space-y-1 text-center">
            <p className="text-sm text-muted-foreground">Bienvenue à l'exposition</p>
            <p className="font-serif text-xl font-bold leading-tight">{expoName || "Exposition en cours"}</p>
          </div>

          <div className="space-y-2">
            <Button asChild className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground">
              <Link to={registerLink}>S'inscrire pour une expérience complète</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full border-border bg-white text-sm"
              onClick={() => void handleContinueAnonymous()}
              disabled={anonymousBusy || !visitorUuid}
            >
              {anonymousBusy ? "Préparation…" : "Continuer en mode visiteur anonyme"}
            </Button>
          </div>

          {!pseudoDialogOpen && pseudoFlowError ? (
            <p className="text-center text-xs text-destructive">{pseudoFlowError}</p>
          ) : null}

          <p className="pt-1 text-center text-[11px] leading-snug text-muted-foreground">
            Votre inscription permet de{" "}
            <span className="underline underline-offset-[3px] decoration-foreground/70">personnaliser</span>
            <br />
            tout votre parcours d&apos;exposition.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScanWelcome;
