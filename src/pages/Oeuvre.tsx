import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Play } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getOrCreateVisitorUuid, getVisitorLocaleMetadata } from "@/lib/visitorIdentity";
import { getCurrentExpoId, setCurrentExpoId } from "@/lib/expoContext";
import aimediartLogoUrl from "@/assets/aimediart-logo.png";
import { isImageAnalysisPromptStyleName } from "@/lib/inferPromptStyleKey";
import { SETTINGS_KEYS, type SettingsVisitorsBehavior, DEFAULT_VISITORS, parseJsonSetting } from "@/lib/settingsKeys";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type PromptStyleRow = {
  id: string | number;
  name?: string | null;
  nom?: string | null;
  style_name?: string | null;
  icon?: string | null;
  label?: string | null;
  libelle?: string | null;
};

type EmotionRow = {
  id: string | number;
  name_emotion?: string | null;
  name?: string | null;
  nom?: string | null;
  emotion_name?: string | null;
  label?: string | null;
  libelle?: string | null;
};

type ArtistRow = {
  artist_id: string | number;
  artist_prenom?: string | null;
  artist_name?: string | null;
  artist_bio?: string | null;
  artist_photo_url?: string | null;
  artist_agency_details?: Array<{
    agency_specific_bio?: string | null;
  }> | null;
};

type ArtworkRow = {
  artwork_id: string;
  artwork_title?: string | null;
  artwork_description?: Record<string, string | null> | string | null;
  artwork_photo_url?: string | null;
  artwork_image_url?: string | null;
  artwork_qr_code_url?: string | null;
  artwork_qrcode_image?: string | null;
  artwork_dimensions?: string | null;
  artwork_technique?: string | null;
  dimensions?: string | null;
  technique?: string | null;
  artwork_artist_id?: string | null;
  artwork_agency_id?: string | null;
  artwork_expo_id?: string | null;
  agency_id?: string | null;
  expo_id?: string | null;
};

const Oeuvre = () => {
  const { artworkId: artworkIdFromPath } = useParams<{ artworkId?: string }>();
  const { session, role_id, agency_id, expo_id, loading: authLoading } = useAuthUser();
  const [styles, setStyles] = useState<PromptStyleRow[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);
  const [emotions, setEmotions] = useState<EmotionRow[]>([]);
  const [emotionsLoading, setEmotionsLoading] = useState(true);
  const [artwork, setArtwork] = useState<ArtworkRow | null>(null);
  const [styleSelectionne, setStyleSelectionne] = useState<string | null>(null);
  const [emotionSelectionnee, setEmotionSelectionnee] = useState<string | null>(null);
  const [note, setNote] = useState(0);
  const [artistName, setArtistName] = useState<string>("");
  const [artistBio, setArtistBio] = useState<string>("");
  const [artistPhotoUrl, setArtistPhotoUrl] = useState<string>("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [visitorUuid, setVisitorUuid] = useState<string>("");
  const [isArtistPhotoModalOpen, setIsArtistPhotoModalOpen] = useState(false);
  const [showAudioButton, setShowAudioButton] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [artworkNotFound, setArtworkNotFound] = useState(false);
  const [artworkLoadError, setArtworkLoadError] = useState<string | null>(null);
  const trackedVisitKeyRef = useRef<string | null>(null);
  const requestedArtworkId = artworkIdFromPath?.trim() || null;
  const expoIdFromUrl = new URLSearchParams(window.location.search).get("expo_id")?.trim() || null;

  useEffect(() => {
    // Prépare l'identifiant anonyme persistant dès la première visite/scanne.
    setVisitorUuid(getOrCreateVisitorUuid());
  }, []);

  useEffect(() => {
    const syncAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      setIsAuthenticated(Boolean(data.user));
    };

    void syncAuthUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncAuthUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const chargerOptionAudio = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SETTINGS_KEYS.visitorsBehavior)
        .maybeSingle();

      const rawValue = data?.value != null ? String(data.value) : "";
      const visitors = parseJsonSetting<SettingsVisitorsBehavior & Record<string, unknown>>(rawValue, DEFAULT_VISITORS);
      const enabled =
        visitors.enable_audio_button === true ||
        visitors.show_audio_button === true ||
        visitors.audio_enabled === true ||
        visitors.enable_audio_analysis === true;
      setShowAudioButton(enabled);
    };

    void chargerOptionAudio();
  }, []);

  useEffect(() => {
    const chargerStyles = async () => {
      setStylesLoading(true);
      let res = await supabase
        .from("prompt_style")
        .select("id, name, icon, ordonnancement")
        .order("ordonnancement", { ascending: true });
      if (res.error) {
        res = await supabase.from("prompt_style").select("*").order("id", { ascending: true });
      }

      if (res.error) {
        setStyles([]);
      } else {
        const raw = (res.data as PromptStyleRow[]) ?? [];
        setStyles(raw.filter((s) => !isImageAnalysisPromptStyleName(s.name ?? s.nom)));
      }
      setStylesLoading(false);
    };

    void chargerStyles();
  }, []);

  useEffect(() => {
    const chargerArtisteParId = async (artistId: string) => {
      const selectedArtistId = artistId;
      const currentUserAgencyId = agency_id ?? null;
      let query = supabase
        .from("artists")
        .select(`
          artist_id,
          artist_prenom,
          artist_name,
          artist_bio,
          artist_photo_url,
          artist_agency_details (
            agency_specific_bio
          )
        `)
        .eq("artist_id", selectedArtistId);

      // On filtre la jointure sur l'agence de l'utilisateur actuel.
      if (currentUserAgencyId) {
        query = query.eq("artist_agency_details.agency_id", currentUserAgencyId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        setArtistName("");
        setArtistBio("");
        setArtistPhotoUrl("");
        return;
      }

      const first = (data as ArtistRow | null) ?? null;
      const prenom = first?.artist_prenom?.trim() ?? "";
      const nom = first?.artist_name?.trim() ?? "";
      const bioToDisplay = first?.artist_agency_details?.[0]?.agency_specific_bio || first?.artist_bio;
      setArtistName([prenom, nom].filter(Boolean).join(" "));
      setArtistBio((bioToDisplay ?? "").trim());
      setArtistPhotoUrl(first?.artist_photo_url?.trim() ?? "");
    };

    const chargerOeuvreEtArtiste = async () => {
      setArtworkLoadError(null);
      setArtworkNotFound(false);
      let query = supabase
        .from("artworks")
        .select("*")
        .is("artwork_deleted_at", null)
        .limit(1);

      if (requestedArtworkId) {
        query = supabase
          .from("artworks")
          .select("*")
          .eq("artwork_id", requestedArtworkId)
          .is("artwork_deleted_at", null)
          .limit(1);
      } else if (role_id === 4 && agency_id) {
        query = query.eq("artwork_agency_id", agency_id);
      } else if ((role_id === 5 || role_id === 6) && expo_id) {
        query = query.eq("artwork_expo_id", expo_id);
      }

      const { data, error } = await query;
      if (error) {
        setArtwork(null);
        setArtworkNotFound(false);
        setArtworkLoadError(error.message || "Impossible de charger cette œuvre.");
        setArtistName("");
        setArtistBio("");
        setArtistPhotoUrl("");
        return;
      }

      const firstRaw = ((data as ArtworkRow[] | null) ?? [])[0] ?? null;
      if (!firstRaw) {
        setArtwork(null);
        setArtworkNotFound(true);
        setArtistName("");
        setArtistBio("");
        setArtistPhotoUrl("");
        return;
      }
      const firstArtwork = firstRaw
        ? {
            ...firstRaw,
            agency_id: firstRaw.artwork_agency_id ?? null,
            expo_id: firstRaw.artwork_expo_id ?? null,
          }
        : null;
      setArtwork(firstArtwork);

      const artistId = firstArtwork?.artwork_artist_id?.trim();
      if (artistId) {
        await chargerArtisteParId(artistId);
      } else {
        setArtistName("");
        setArtistBio("");
        setArtistPhotoUrl("");
      }
    };

    void chargerOeuvreEtArtiste();
  }, [requestedArtworkId, role_id, agency_id, expo_id]);

  useEffect(() => {
    const chargerEmotions = async () => {
      setEmotionsLoading(true);
      const { data, error } = await supabase.from("emotions").select("*").order("id", {
        ascending: true,
      });

      if (error) {
        setEmotions([]);
      } else {
        setEmotions((data as EmotionRow[]) ?? []);
      }
      setEmotionsLoading(false);
    };

    void chargerEmotions();
  }, []);

  const getNomStyle = (style: PromptStyleRow): string => {
    // Important: libellé = `prompt_style.name` (colonne "Name" dans Supabase).
    // Si absent, on affiche l'id pour éviter d'afficher un autre champ.
    const n = (style.name ?? "").trim();
    return n || String(style.id);
  };

  const getNomEmotion = (emotion: EmotionRow): string => {
    return (
      emotion.name_emotion ??
      emotion.name ??
      emotion.nom ??
      emotion.emotion_name ??
      emotion.label ??
      emotion.libelle ??
      String(emotion.id)
    );
  };

  const colonnesEmotions = Math.min(4, Math.max(1, Math.ceil(emotions.length / 2)));
  const artistBioLimited = (() => {
    const bio = (artistBio ?? "").trim();
    if (!bio) return "Biographie de l'artiste indisponible pour le moment.";
    if (bio.length <= 400) return bio;
    return `${bio.slice(0, 400).trimEnd()}...`;
  })();
  const artworkId = artwork?.artwork_id ?? requestedArtworkId ?? "w2";
  const artworkDescriptionText = (() => {
    const raw = artwork?.artwork_description;
    if (!raw) return "Description de l'œuvre indisponible pour le moment.";
    if (typeof raw === "string") return raw;
    return (
      raw.enfant ||
      raw.simple ||
      raw.neutre ||
      raw.expert ||
      raw.ado ||
      raw.conteur ||
      raw.rap ||
      raw.poetique ||
      "Description de l'œuvre indisponible pour le moment."
    );
  })();
  const artworkDimensions = (artwork?.artwork_dimensions ?? artwork?.dimensions ?? "").trim();
  const artworkTechnique = (artwork?.artwork_technique ?? artwork?.technique ?? "").trim();
  const artworkMainImage =
    artwork?.artwork_photo_url?.trim() ||
    artwork?.artwork_image_url?.trim() ||
    "https://images.unsplash.com/photo-1635776062043-223faf322554";
  const artistPhoto = artistPhotoUrl;
  const expoId =
    artwork?.expo_id?.trim() ||
    expoIdFromUrl ||
    getCurrentExpoId() ||
    expo_id ||
    import.meta.env.VITE_DEFAULT_EXPO_ID ||
    null;
  const agencyId = agency_id ?? import.meta.env.VITE_DEFAULT_AGENCY_ID ?? null;
  const canValidate = Boolean(emotionSelectionnee && note > 0);
  const isAnonymousVisitor = !isAuthenticated;

  useEffect(() => {
    if (expoId) setCurrentExpoId(expoId);
  }, [expoId]);

  useEffect(() => {
    const trackAnonymousExpoVisit = async () => {
      if (session) return;
      if (!visitorUuid || !expoId) return;

      const visitKey = `${visitorUuid}:${expoId}:${artworkId}`;
      if (trackedVisitKeyRef.current === visitKey) return;

      const { language, timezone } = getVisitorLocaleMetadata();
      const payload = {
        visitor_uuid: visitorUuid,
        expo_id: expoId,
        language,
        timezone,
        ip_address: null as string | null,
        gdpr_consent: false,
        consent_date: null as string | null,
      };

      const { error } = await supabase.from("expos_visits").insert(payload);
      if (error) {
        if (import.meta.env.DEV) {
          console.warn("[tracking] insert expos_visits :", error.message);
        }
        return;
      }
      trackedVisitKeyRef.current = visitKey;
    };

    void trackAnonymousExpoVisit();
  }, [session, visitorUuid, expoId, artworkId]);

  /**
   * Préparation RGPD : fonction prête pour une future case/bannière de consentement.
   * Non affichée pour l'instant côté UI.
   */
  const handleConsent = async () => {
    if (!visitorUuid) return;
    const { error } = await supabase
      .from("expos_visits")
      .update({
        gdpr_consent: true,
        consent_date: new Date().toISOString(),
      })
      .eq("visitor_uuid", visitorUuid);
    if (error && import.meta.env.DEV) {
      console.warn("[tracking] update consent expos_visits :", error.message);
    }
  };

  const ensureAnonymousVisitor = async () => {
    const possibleNameColumns = ["name", "visitor_name", "name_visitor", "full_name"];

    for (const column of possibleNameColumns) {
      const { data, error } = await supabase
        .from("visitors")
        .select("id")
        .eq(column, "Anonymous")
        .limit(1)
        .maybeSingle();

      if (!error && data?.id) {
        return String(data.id);
      }
    }

    for (const column of possibleNameColumns) {
      const payload = { [column]: "Anonymous" };
      const { data, error } = await supabase.from("visitors").insert(payload).select("id").maybeSingle();
      if (!error && data?.id) {
        return String(data.id);
      }
    }

    throw new Error("Impossible de créer ou retrouver le visiteur Anonymous dans `visitors`.");
  };

  const handleValidate = async () => {
    if (!emotionSelectionnee || note < 1) return;

    setSavingFeedback(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      if (!expoId || !agencyId) {
        throw new Error("expo_id ou agency_id manquant pour enregistrer le feedback.");
      }

      if (!session) {
        await ensureAnonymousVisitor();
      }

      const { error } = await supabase.from("visitor_feedback").insert({
        artwork_id: artworkId,
        emotion_id: emotionSelectionnee,
        heart_rating: note,
        expo_id: expoId,
        agency_id: agencyId,
      });

      if (error) {
        throw new Error(error.message);
      }

      setFeedbackSuccess("Merci, votre ressenti a bien été enregistré.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue lors de l'enregistrement.";
      setFeedbackError(message);
    } finally {
      setSavingFeedback(false);
    }
  };

  const handleSignupClick = () => {
    window.location.href = "/register";
  };

  const handleAuthAffordanceClick = async () => {
    if (isAuthenticated) {
      await supabase.auth.signOut({ scope: "local" });
      setIsAuthenticated(false);
      window.location.href = "/home";
      return;
    }
    window.location.href = "/login";
  };

  const handleBackHome = () => {
    window.location.href = "/";
  };

  if (!authLoading && artworkNotFound) {
    return (
      <div className="flex min-h-screen justify-center bg-gray-200">
        <div className="min-h-screen w-full max-w-[375px] bg-white shadow-md">
          <header className="sticky top-0 z-20 mx-auto flex w-full max-w-[375px] items-center justify-between border-b border-gray-200 bg-white/95 px-5 py-3 backdrop-blur-sm">
            <img src={aimediartLogoUrl} alt="AIMEDIArt" className="h-7 w-auto object-contain" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAuthAffordanceClick()}
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-[0_4px_10px_rgba(0,0,0,0.12)] transition hover:bg-gray-50"
            >
              {isAuthenticated ? "Déconnexion" : "Se connecter"}
            </button>
            {!isAuthenticated && (
              <button
                type="button"
                onClick={handleSignupClick}
                className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] transition hover:bg-red-700"
              >
                S&apos;inscrire
              </button>
            )}
          </div>
          </header>
          <main className="px-5 py-10">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
              <p className="text-5xl">🎨</p>
              <h1 className="mt-3 font-serif text-2xl font-semibold text-gray-800">Œuvre introuvable</h1>
              <p className="mt-2 text-sm leading-[1.6] text-gray-600">
                Cette œuvre n&apos;est pas disponible ou n&apos;est plus accessible pour le moment.
              </p>
              <button
                type="button"
                onClick={handleBackHome}
                className="mt-6 w-full rounded-full bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition hover:bg-black"
              >
                Retour à l&apos;accueil
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 flex justify-center">
      
      {/* CONTAINER MOBILE STRICT */}
      <div className="w-full max-w-[375px] min-h-screen bg-white shadow-md">
        <header className="sticky top-0 z-20 mx-auto flex w-full max-w-[375px] items-center justify-between border-b border-gray-200 bg-white/95 px-5 py-3 backdrop-blur-sm">
          <img src={aimediartLogoUrl} alt="AIMEDIArt" className="h-7 w-auto object-contain" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAuthAffordanceClick()}
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-[0_4px_10px_rgba(0,0,0,0.12)] transition hover:bg-gray-50"
            >
              {isAuthenticated ? "Déconnexion" : "Se connecter"}
            </button>
            {isAnonymousVisitor && (
              <button
                type="button"
                onClick={handleSignupClick}
                className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] transition hover:bg-red-700"
              >
                S&apos;inscrire
              </button>
            )}
          </div>
        </header>
        {/* CONTENU */}
        <div className="pt-4 font-sans leading-relaxed">
          {/* TITRE */}
          <div className="mb-4 px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-right">
                <h2 className="font-serif text-xl font-semibold text-gray-800">
                  {artwork?.artwork_title || "Œuvre sans titre"}
                </h2>
                <p className="text-sm italic text-gray-500">
                  {artistName || "Artiste inconnu"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsArtistPhotoModalOpen(true)}
                disabled={!artistPhoto}
                aria-label="Ouvrir la photo de l'artiste"
                className="h-[70px] w-[70px] shrink-0 overflow-hidden rounded-full border border-gray-300 bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {artistPhoto ? (
                  <img src={artistPhoto} alt={artistName || "Artiste"} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] text-gray-500">Aucune photo</span>
                )}
              </button>
            </div>
            {showAudioButton && (
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/45 bg-white/25 px-4 py-2.5 text-sm font-medium text-gray-800 shadow-[0_10px_30px_rgba(0,0,0,0.10)] backdrop-blur-md"
              >
                <Play className="h-4 w-4" aria-hidden />
                Écouter l&apos;analyse
              </button>
            )}
          </div>

          {/* IMAGE */}
          <div className="w-full m-0 p-0">
            <img
              src={artworkMainImage}
              alt="œuvre"
              className="block w-full h-56 object-cover m-0 p-0 border-0 rounded-none"
              style={{ imageRendering: "auto" }}
            />
          </div>

          {/* TEXTE */}
          <div className="mb-0 block h-auto flow-root bg-white px-5 pb-0 pt-0">
            <p className="text-[14px] text-gray-600 leading-[1.6]" style={{ textAlign: "justify" }}>
              {artistBioLimited}
            </p>
          </div>

          <div className="mb-4 px-5">
            <h3 className="mb-1 font-semibold text-gray-700">🧾 Détails de l'œuvre</h3>
            <p className="text-sm text-gray-600 leading-[1.6]">
              <span className="font-semibold">Dimensions :</span> {artworkDimensions || "Non renseignées"}
            </p>
            <p className="text-sm text-gray-600 leading-[1.6]">
              <span className="font-semibold">Technique :</span> {artworkTechnique || "Non renseignée"}
            </p>
          </div>

          {/* STYLES */}
          <div className="mx-5 mb-6 rounded-xl border-2 border-yellow-500 pb-4 pl-[10px] pr-[10px] pt-1">
            <h3 className="mb-2 text-sm font-semibold">
              Comment veux-tu que l'IA te parle ?
            </h3>
            <div className="w-full grid grid-cols-4 gap-[6px]">
              {styles.slice(0, 8).map((style) => {
                const nomStyle = getNomStyle(style);
                const nomNormalise = nomStyle.trim().toLowerCase();
                const expertClass =
                  nomNormalise === "l'expert" || nomNormalise === "l’expert"
                    ? "whitespace-nowrap"
                    : "whitespace-normal";
                const icone = (style.icon ?? "").trim();
                return (
                <button
                  key={String(style.id)}
                  onClick={() => setStyleSelectionne(String(style.id))}
                  className={`w-full min-h-[65px] rounded-lg p-[2px] text-[11px] leading-[1.1] text-center break-words flex flex-col items-center justify-center gap-0.5 ${expertClass} transition ${
                    styleSelectionne === String(style.id)
                      ? "bg-yellow-400 text-white border border-yellow-500"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {icone ? (
                    <span className="text-base leading-none" aria-hidden>
                      {icone}
                    </span>
                  ) : null}
                  {nomStyle}
                </button>
              )})}
            </div>
            {stylesLoading && <p className="text-xs text-gray-500 mt-2">Chargement des styles…</p>}
          </div>

          {/* À PROPOS */}
          <div className="-mt-4 mb-6 !h-auto px-5" style={{ height: "auto" }}>
            <h3 className="mb-0 font-semibold text-gray-700">
              📖 À propos de cette œuvre
            </h3>
            <p className="text-sm text-gray-600 leading-[1.6]">
              {artworkDescriptionText}
            </p>
          </div>

          {/* EMOTIONS */}
          <div className="-mt-4 mb-6 px-5">
            <h3 className="mb-1 font-semibold text-gray-700">
              💛 Quel est ton ressenti devant cette œuvre ?
            </h3>

            <div
              className="grid gap-[6px] mt-0 w-full"
              style={{ gridTemplateColumns: `repeat(${colonnesEmotions}, minmax(0, 1fr))` }}
            >
              {emotions.map((emotion) => {
                const nomEmotion = getNomEmotion(emotion);
                return (
                  <button
                    key={String(emotion.id)}
                    onClick={() =>
                      setEmotionSelectionnee((current) =>
                        current === String(emotion.id) ? null : String(emotion.id),
                      )
                    }
                    className={`w-full min-h-[65px] rounded-lg p-[2px] text-[12px] font-bold leading-[1.1] text-center break-words whitespace-normal flex flex-col items-center justify-center transition ${
                      emotionSelectionnee === String(emotion.id)
                        ? "bg-yellow-400 text-white border border-yellow-500"
                        : "bg-gray-100 hover:bg-gray-200"
                    }`}
                  >
                    {nomEmotion}
                  </button>
                );
              })}
            </div>
            {emotionsLoading && <p className="text-xs text-gray-500 mt-2">Chargement des émotions…</p>}
          </div>

          {/* NOTE */}
          <div className="-mt-4 px-5 pb-8 text-center">
            <p className="mb-2 text-sm leading-[1.6]">
              Donnez <span className="font-bold">VOTRE</span> note en cœurs
            </p>
            <p className="-mt-2 mb-0 text-xs italic text-gray-500 leading-[1.6]">
              Ici, c'est votre ressenti qui compte avant tout.
            </p>

            <div className="flex w-full justify-between -mt-7 cursor-pointer">
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  onClick={() => setNote(i)}
                  className={`inline-flex h-[100px] w-[100px] items-center justify-center text-[72px] ${
                    i <= note ? "text-red-500" : "text-gray-300"
                  }`}
                >
                  ♥
                </span>
              ))}
            </div>

            {canValidate && (
              <button
                type="button"
                onClick={() => void handleValidate()}
                disabled={savingFeedback}
                className="-mt-4 w-full rounded-lg bg-yellow-400 border border-yellow-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {savingFeedback ? "Validation..." : "Valider"}
              </button>
            )}
            {feedbackError && <p className="mt-2 text-xs text-red-600">{feedbackError}</p>}
            {feedbackSuccess && <p className="mt-2 text-xs text-green-600">{feedbackSuccess}</p>}
            {artworkLoadError && <p className="mt-2 text-xs text-red-600">{artworkLoadError}</p>}
          </div>

        </div>
      </div>
      <Dialog open={isArtistPhotoModalOpen} onOpenChange={setIsArtistPhotoModalOpen}>
        <DialogContent className="w-[92vw] max-w-[560px] border-none bg-transparent p-0 shadow-none">
          {artistPhoto ? (
            <img
              src={artistPhoto}
              alt={artistName || "Artiste"}
              className="max-h-[82vh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Oeuvre;
