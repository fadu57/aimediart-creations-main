import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getOrCreateVisitorUuid, getVisitorLocaleMetadata } from "@/lib/visitorIdentity";
import { setCurrentExpoId } from "@/lib/expoContext";
import { supabase } from "@/lib/supabase";

type ExpoRow = {
  id?: string | null;
  expo_name?: string | null;
  title?: string | null;
  nom?: string | null;
};

type EdgeIpResponse = {
  ip_address?: string | null;
};

const ScanWelcome = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuthUser();
  const [searchParams] = useSearchParams();
  const [expoName, setExpoName] = useState<string>("");
  const [visitorUuid, setVisitorUuid] = useState<string>("");

  const expoId = useMemo(() => searchParams.get("expo_id")?.trim() || "", [searchParams]);

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
      const { data } = await supabase.from("expos").select("*").eq("id", expoId).limit(1).maybeSingle();
      const row = (data as ExpoRow | null) ?? null;
      const value =
        row?.expo_name?.trim() ||
        row?.title?.trim() ||
        row?.nom?.trim() ||
        "Exposition en cours";
      setExpoName(value);
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
      const payload = {
        visitor_uuid: visitorUuid,
        expo_id: expoId,
        language,
        timezone,
        // Stockage propre RGPD-ready : string normalisée ou NULL.
        ip_address: rawIp || null,
      };
      await supabase.from("guest_visits").insert(payload);
    };
    void trackGuestVisit();
  }, [visitorUuid, expoId]);

  if (loading) return null;

  if (session) {
    const target = expoId ? `/scan-work1?expo_id=${encodeURIComponent(expoId)}` : "/scan-work1";
    return <Navigate to={target} replace />;
  }

  const œuvreLink = expoId ? `/scan-work1?expo_id=${encodeURIComponent(expoId)}` : "/scan-work1";
  const registerLink = expoId ? `/register?expo_id=${encodeURIComponent(expoId)}` : "/register";

  const handleContinueAnonymous = () => {
    console.log("Redirection vers /scan-work1...", œuvreLink);
    navigate(œuvreLink);
  };

  return (
    <div className="flex w-full flex-1 flex-col items-center px-4 pb-8 pt-0">
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
              onClick={handleContinueAnonymous}
            >
              Continuer en mode visiteur anonyme
            </Button>
          </div>

          <p className="pt-1 text-center text-[11px] leading-snug text-muted-foreground">
            Votre inscription nous permet de personnaliser tout votre parcours d'exposition.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScanWelcome;

