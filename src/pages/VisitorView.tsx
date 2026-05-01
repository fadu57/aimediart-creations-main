import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BarChart3, Building2, ChevronLeft, ChevronRight, GalleryVerticalEnd, Heart, House, Loader2, LogIn, LogOut, Menu, Search, Settings, UserPlus, Users, X } from "lucide-react";
import confetti from "canvas-confetti";
import type { Swiper as SwiperInstance } from "swiper";
import { FreeMode, Thumbs } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/free-mode";
import "swiper/css/thumbs";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { hasFullDataAccess } from "@/lib/authUser";
import { HEADER_NAV_ITEMS } from "@/lib/navigationMatrix";
import { supabase } from "@/lib/supabase";
import { inferJsonKeyFromDisplayName, isImageAnalysisPromptStyleName } from "@/lib/inferPromptStyleKey";
import { parseArtworkIdFromInput } from "@/lib/oeuvrePublicUrl";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";

type ArtworkRow = {
  artwork_id: string;
  artwork_title?: string | null;
  artwork_description?: string | Record<string, string | null> | null;
  artwork_photo_url?: string | null;
  artwork_image_url?: string | null;
  artwork_artist_id?: string | null;
  artwork_artisi_id?: string | null;
  artwork_artist_name?: string | null;
  artwork_artist_prenom?: string | null;
  artwork_artist_firstname?: string | null;
  artwork_artist_lastname?: string | null;
  artwork_artist_photo_url?: string | null;
  artist_photo_url?: string | null;
  artists?: ArtistRow | ArtistRow[] | null;
  artwork_agency_id?: string | null;
  artwork_expo_id?: string | null;
  /** PostgREST peut renvoyer un objet ou un tableau selon la relation */
  agencies?: AgencyRow | AgencyRow[] | null;
};

type AgencyRow = {
  name_agency?: string | null;
};

type ArtistRow = {
  artist_id: string;
  id?: string | null;
  artist_prenom?: string | null;
  artist_name?: string | null;
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_bio?: string | null;
  artist_photo_url?: string | null;
  artist_image?: string | null;
};

type EmotionRow = {
  id: string | number;
  icone_emotion?: string | null;
  name_emotion?: string | null;
};

type PromptStyleRow = {
  id: string | number;
  name?: string | null;
  icon?: string | null;
};

function stringFromObj(obj: Record<string, string | null | undefined>, key: string): string {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v : "";
}

/** Ordre de repli si aucune clé ne correspond au style : d’abord Simple, puis les autres, puis toute valeur restante. */
const MEDIATION_FALLBACK_ORDER = [
  "simple",
  "neutre",
  "enfant",
  "expert",
  "poetique",
  "ado",
  "conteur",
  "rap",
] as const;

function firstNonEmptyMediationText(obj: Record<string, string | null | undefined>): string {
  for (const k of MEDIATION_FALLBACK_ORDER) {
    const t = stringFromObj(obj, k);
    if (t) return t;
  }
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/**
 * Texte de médiation pour le style sélectionné : clé exacte, clé inférée depuis le nom, id, puis repli simple / premier disponible.
 */
function mediationTextForStyle(
  artworkDescription: ArtworkRow["artwork_description"],
  style: PromptStyleRow | undefined,
): string {
  if (!style) return "";
  const raw = artworkDescription;
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();

  const obj = raw as Record<string, string | null | undefined>;

  const nameKey = style.name;
  if (nameKey != null && nameKey !== "") {
    const direct = stringFromObj(obj, nameKey);
    if (direct) return direct;
  }

  const inferred = inferJsonKeyFromDisplayName(style.name);
  if (inferred) {
    const t = stringFromObj(obj, inferred);
    if (t) return t;
  }

  const byId = stringFromObj(obj, String(style.id));
  if (byId) return byId;

  const simple = stringFromObj(obj, "simple");
  if (simple) return simple;

  return firstNonEmptyMediationText(obj);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function triggerHeartConfetti(): void {
  const heartShape = confetti.shapeFromText({ text: "❤️", scalar: 20 });
  void confetti({
    shapes: [heartShape],
    particleCount: 70,
    spread: 110,
    startVelocity: 45,
    gravity: 0.9,
    scalar: 3,
    zIndex: 9999,
    origin: { y: 0.6 },
  });
}

const UI_LANGUAGE_OPTIONS: Array<{ value: UiLanguage; label: string; flagClass: string }> = [
  { value: "fr", label: "FR", flagClass: "fi fi-fr" },
  { value: "en", label: "EN", flagClass: "fi fi-gb" },
  { value: "es", label: "ES", flagClass: "fi fi-es" },
  { value: "de", label: "DE", flagClass: "fi fi-de" },
  { value: "it", label: "IT", flagClass: "fi fi-it" },
];

const VisitorView = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEmbedded = searchParams.get("embed") === "1";
  const navModeFromQuery = searchParams.get("nav_mode")?.trim() || "";
  const [œuvresNavigationMode, setOeuvresNavigationMode] = useState("");
  const isSameArtistNavigation =
    navModeFromQuery === "same_artist_all_works" || œuvresNavigationMode === "same_artist_all_works";
  const { artworkId: artworkIdParam } = useParams<{ artworkId?: string }>();
  /** Corrige les URLs cassées du type /œuvre/http%3A%2F%2F... (QR mal lu ou double encodage). */
  const artworkId = useMemo(() => {
    const raw = artworkIdParam?.trim();
    if (!raw) return undefined;
    const parsed = parseArtworkIdFromInput(raw);
    return parsed || raw;
  }, [artworkIdParam]);
  const { session, loading: authLoading, role_id, role_name, user_prenom } = useAuthUser();
  const { language, setLanguage } = useUiLanguage();
  const { can, loading: navMatrixLoading } = useNavigationMatrix();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [artwork, setArtwork] = useState<ArtworkRow | null>(null);
  const [artist, setArtist] = useState<ArtistRow | null>(null);
  const [artistAgencyBio, setArtistAgencyBio] = useState("");
  const [emotionsDb, setEmotionsDb] = useState<EmotionRow[]>([]);
  const [emotionsError, setEmotionsError] = useState<string | null>(null);
  const [loadingArtwork, setLoadingArtwork] = useState(true);
  const [promptStylesDb, setPromptStylesDb] = useState<PromptStyleRow[]>([]);
  const [promptStylesLoading, setPromptStylesLoading] = useState(true);
  /** Message d’erreur renvoyé par Supabase pour la requête `prompt_style` (si échec). */
  const [stylesQueryError, setStylesQueryError] = useState<string | null>(null);
  const [selectedPromptStyleId, setSelectedPromptStyleId] = useState<string>("");
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [heartRating, setHeartRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [heartPulse, setHeartPulse] = useState<number | null>(null);
  const [isArtistPhotoOpen, setIsArtistPhotoOpen] = useState(false);
  const [isArtistPhotoClosing, setIsArtistPhotoClosing] = useState(false);
  const [artistPhotoError, setArtistPhotoError] = useState(false);
  const [isArtworkZooming, setIsArtworkZooming] = useState(false);
  const [artworkZoomOrigin, setArtworkZoomOrigin] = useState("50% 50%");
  const [isValidationPopupOpen, setIsValidationPopupOpen] = useState(false);
  const [isExitPopupOpen, setIsExitPopupOpen] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperInstance | null>(null);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [sameArtistArtworkIds, setSameArtistArtworkIds] = useState<string[]>([]);
  const [quickFeedbackMessage, setQuickFeedbackMessage] = useState<string | null>(null);
  const [quickFeedbackTop, setQuickFeedbackTop] = useState<number>(92);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const sameArtistNavRef = useRef<HTMLDivElement | null>(null);
  const emotionSectionRef = useRef<HTMLDivElement | null>(null);
  const thumbsSectionRef = useRef<HTMLDivElement | null>(null);
  const artistPhotoCloseTimerRef = useRef<number | null>(null);
  const quickFeedbackTimerRef = useRef<number | null>(null);

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
    let cancelled = false;
    const loadSameArtistArtworks = async () => {
      if (!isSameArtistNavigation) {
        setSameArtistArtworkIds([]);
        return;
      }
      const artistId =
        artwork?.artwork_artist_id?.trim() ||
        artwork?.artwork_artisi_id?.trim() ||
        "";
      if (!artistId) {
        setSameArtistArtworkIds([]);
        return;
      }

      const { data, error } = await supabase
        .from("artworks")
        .select("artwork_id")
        .eq("artwork_artist_id", artistId)
        .is("artwork_deleted_at", null)
        .order("artwork_created_at", { ascending: true });

      if (cancelled || error) return;
      const ids =
        ((data as Array<{ artwork_id?: string | null }> | null) ?? [])
          .map((row) => (row.artwork_id ?? "").trim())
          .filter(Boolean);
      setSameArtistArtworkIds(ids);
    };

    void loadSameArtistArtworks();
    return () => {
      cancelled = true;
    };
  }, [isSameArtistNavigation, artwork?.artwork_artist_id, artwork?.artwork_artisi_id]);

  useEffect(() => {
    let cancelled = false;
    const loadOeuvresNavigationMode = async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "œuvres_navigation_type")
        .maybeSingle();
      if (cancelled || error) return;
      const raw = typeof data?.value === "string" ? data.value.trim() : "";
      if (!raw) {
        setOeuvresNavigationMode("");
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { mode?: string };
        const mode = typeof parsed?.mode === "string" ? parsed.mode.trim() : "";
        setOeuvresNavigationMode(mode || raw);
      } catch {
        setOeuvresNavigationMode(raw);
      }
    };
    void loadOeuvresNavigationMode();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadArtworkAndArtist = async () => {
      setLoadingArtwork(true);
      setArtistPhotoError(false);

      try {
        // IMPORTANT: on charge d'abord l'œuvre sans AUCUNE jointure pour éviter
        // qu'une policy RLS sur artists/agencies casse toute la page visiteur.
        let artworkQuery = supabase
          .from("artworks")
          .select("*")
          .is("artwork_deleted_at", null)
          .limit(1);

        if (artworkId?.trim()) {
          artworkQuery = supabase
            .from("artworks")
            .select("*")
            .eq("artwork_id", artworkId.trim())
            .is("artwork_deleted_at", null)
            .limit(1);
        }

        const { data, error } = await artworkQuery;

        if (cancelled) return;

        if (error) {
          setArtwork(null);
          setArtist(null);
          return;
        }

        const firstArtwork = ((data as ArtworkRow[] | null) ?? [])[0] ?? null;
        setArtwork(firstArtwork);

        // Enrichissement optionnel du nom d'agence (tolérant RLS)
        const agencyId = firstArtwork?.artwork_agency_id?.trim() || "";
        if (agencyId) {
          const { data: agencyData } = await supabase
            .from("agencies")
            .select("name_agency")
            .eq("id", agencyId)
            .limit(1)
            .maybeSingle();
          if (!cancelled) {
            const agencyRow = agencyData as { name_agency?: string | null } | null;
            if (agencyRow?.name_agency?.trim()) {
              setArtwork((prev) =>
                prev
                  ? {
                      ...prev,
                      agencies: { name_agency: agencyRow.name_agency },
                    }
                  : prev,
              );
            }
          }
        }

        const joinedArtist = Array.isArray(firstArtwork?.artists)
          ? firstArtwork?.artists?.[0] ?? null
          : (firstArtwork?.artists ?? null);

        const artistId =
          joinedArtist?.artist_id?.trim() ||
          joinedArtist?.id?.trim() ||
          firstArtwork?.artwork_artist_id?.trim() ||
          firstArtwork?.artwork_artisi_id?.trim() ||
          "";
        if (!artistId) {
          setArtistAgencyBio("");
          setArtist(joinedArtist);
          return;
        }

        const candidateColumns = ["artist_id", "id", "artist_uuid"];
        let fetchedArtist: ArtistRow | null = joinedArtist;
        const needsArtistEnrichment = Boolean(
          !joinedArtist ||
            !joinedArtist.artist_bio?.trim() ||
            !((joinedArtist.artist_photo_url ?? joinedArtist.artist_image ?? "").trim()),
        );

        if (needsArtistEnrichment) {
          for (const column of candidateColumns) {
            const { data: artistData, error: artistError } = await supabase
              .from("artists")
              .select("*")
              .eq(column, artistId)
              .limit(1);

            if (!artistError) {
              const first = ((artistData as ArtistRow[] | null) ?? [])[0] ?? null;
              if (first) {
                fetchedArtist = first;
                break;
              }
            }
          }
        }

        if (cancelled) return;
        setArtist(fetchedArtist);

        const agencyIdForBio = firstArtwork?.artwork_agency_id?.trim() || "";
        if (agencyIdForBio) {
          const { data: agencyBioData } = await supabase
            .from("artist_agency_details")
            .select("agency_specific_bio")
            .eq("artist_id", artistId)
            .eq("agency_id", agencyIdForBio)
            .limit(1)
            .maybeSingle();
          if (!cancelled) {
            const row = agencyBioData as { agency_specific_bio?: string | null } | null;
            setArtistAgencyBio(row?.agency_specific_bio?.trim() || "");
          }
        } else {
          setArtistAgencyBio("");
        }
      } catch (e) {
        console.error("VisitorView loadArtworkAndArtist:", e);
        setArtwork(null);
        setArtist(null);
        setArtistAgencyBio("");
      } finally {
        if (!cancelled) setLoadingArtwork(false);
      }
    };

    void loadArtworkAndArtist();
    return () => {
      cancelled = true;
    };
  }, [artworkId]);

  useEffect(() => {
    let cancelled = false;
    const loadEmotions = async () => {
      setEmotionsError(null);
      // Table principale attendue: `emotions`
      let { data, error } = await supabase
        .from("emotions")
        .select("*")
        .order("id", { ascending: true });

      // Fallback si la table est nommée `emotion` dans ce projet.
      if (error) {
        const fallback = await supabase
          .from("emotion")
          .select("*")
          .order("id", { ascending: true });
        data = fallback.data;
        error = fallback.error;
      }

      if (cancelled) return;
      if (error) {
        setEmotionsDb([]);
        setEmotionsError(error.message || "Impossible de lire les émotions depuis la base.");
        return;
      }
      const rows = (data as EmotionRow[] | null) ?? [];
      const validRows = rows.filter((row) => {
        const icon = (row.icone_emotion ?? "").trim();
        const name = (row.name_emotion ?? "").trim();
        return icon.length > 0 && name.length > 0;
      });
      setEmotionsDb(validRows);
      if (rows.length > 0 && validRows.length === 0) {
        setEmotionsError("Les colonnes icone_emotion / name_emotion sont vides dans la base.");
      }
    };

    void loadEmotions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPromptStyles = async () => {
      setPromptStylesLoading(true);
      setStylesQueryError(null);
      try {
        // Colonnes explicites (id, name, icon, ordonnancement) — alignées sur le schéma réel.
        // Si une colonne manque, le 2e essai en select('*') + tri par id peut quand même récupérer des lignes.
        let res = await supabase
          .from("prompt_style")
          .select("id, name, icon, ordonnancement")
          .order("ordonnancement", { ascending: true });

        if (res.error) {
          res = await supabase.from("prompt_style").select("*").order("id", { ascending: true });
        }

        if (cancelled) return;

        if (res.error) {
          setStylesQueryError(res.error.message);
          setPromptStylesDb([]);
          return;
        }

        setStylesQueryError(null);
        const raw = (res.data as PromptStyleRow[]) ?? [];
        setPromptStylesDb(raw.filter((s) => !isImageAnalysisPromptStyleName(s.name)));
      } finally {
        // Toujours débloquer l’UI (évite spinner infini si Strict Mode / cleanup).
        setPromptStylesLoading(false);
      }
    };
    void loadPromptStyles();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!promptStylesDb.length) return;
    const ids = new Set(promptStylesDb.map((s) => String(s.id)));
    if (!selectedPromptStyleId || !ids.has(selectedPromptStyleId)) {
      setSelectedPromptStyleId(String(promptStylesDb[0].id));
    }
  }, [promptStylesDb, selectedPromptStyleId]);

  const aiSlides = useMemo(
    () =>
      promptStylesDb.map((style) => {
        const sid = String(style.id);
        return {
          sid,
          label: style.name ?? sid,
          icon: style.icon ?? "",
          text: mediationTextForStyle(artwork?.artwork_description, style).trim() || "—",
        };
      }),
    [promptStylesDb, artwork?.artwork_description],
  );

  useEffect(() => {
    return () => {
      if (artistPhotoCloseTimerRef.current != null) {
        window.clearTimeout(artistPhotoCloseTimerRef.current);
      }
      if (quickFeedbackTimerRef.current != null) {
        window.clearTimeout(quickFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!quickFeedbackMessage) return;

    const updateQuickFeedbackPosition = () => {
      const targetRect = thumbsSectionRef.current?.getBoundingClientRect();
      if (!targetRect) return;
      // Positionne le popup à la base (bas) du bloc thumbs-swiper.
      const nextTop = Math.max(68, Math.round(targetRect.bottom - 106));
      setQuickFeedbackTop(nextTop);
    };

    updateQuickFeedbackPosition();
    window.addEventListener("scroll", updateQuickFeedbackPosition, { passive: true });
    window.addEventListener("resize", updateQuickFeedbackPosition);
    return () => {
      window.removeEventListener("scroll", updateQuickFeedbackPosition);
      window.removeEventListener("resize", updateQuickFeedbackPosition);
    };
  }, [quickFeedbackMessage]);

  const artworkTitle = artwork?.artwork_title?.trim() || "Œuvre sans titre";
  const artistDisplayName =
    `${artist?.artist_firstname ?? artist?.artist_prenom ?? artwork?.artwork_artist_firstname ?? artwork?.artwork_artist_prenom ?? ""} ${
      artist?.artist_lastname ?? artist?.artist_name ?? artwork?.artwork_artist_lastname ?? artwork?.artwork_artist_name ?? ""
    }`.trim() || "Artiste inconnu";
  const artistPhotoUrl =
    artist?.artist_photo_url?.trim() ||
    artist?.artist_image?.trim() ||
    artwork?.artwork_artist_photo_url?.trim() ||
    artwork?.artist_photo_url?.trim() ||
    "";
  const normalizedArtistPhotoUrl = (() => {
    const value = artistPhotoUrl.trim();
    if (!value) return "";
    // Empêche d'utiliser par erreur un texte (nom/prénom) comme URL image.
    if (/^(https?:\/\/|data:image\/|blob:)/i.test(value)) return value;
    return "";
  })();
  const canShowArtistPhoto = Boolean(normalizedArtistPhotoUrl) && !artistPhotoError;
  const artworkImageUrl = artwork?.artwork_photo_url?.trim() || artwork?.artwork_image_url?.trim() || "";
  const artistBioText = artistAgencyBio || artist?.artist_bio?.trim() || "";
  const agencyThanksName = (
    Array.isArray(artwork?.agencies)
      ? artwork?.agencies?.[0]?.name_agency
      : artwork?.agencies?.name_agency
  )?.trim() || "";
  const hasAgencyThanksName =
    agencyThanksName.length > 0 && agencyThanksName.toUpperCase() !== "NOM_DE_L_AGENCE_INTROUVABLE";
  /** Même entrée Accueil que le header large (NavLink maison), pour rôles 1–3 ou admin JWT si `role_id` absent. */
  const showOeuvreHomeNav =
    Boolean(session) &&
    !authLoading &&
    ((typeof role_id === "number" && role_id >= 1 && role_id <= 3) ||
      (role_id == null && hasFullDataAccess(role_name)));
  const canSubmitFeedback = Boolean(selectedEmotion && heartRating > 0);
  const isAnonymousVisitor = !isAuthenticated;
  const isVisitorMenuRestricted = !isAuthenticated || role_id === 7;
  const activeLanguage = UI_LANGUAGE_OPTIONS.find((option) => option.value === language) ?? UI_LANGUAGE_OPTIONS[0];
  const userMeta = (session?.user?.user_metadata as Record<string, unknown> | undefined) ?? {};
  const headerFirstName =
    (user_prenom?.trim() || "") ||
    (typeof userMeta.full_name === "string" ? userMeta.full_name.trim() : "") ||
    (typeof userMeta.user_prenom === "string" ? userMeta.user_prenom.trim() : "") ||
    (typeof userMeta.first_name === "string" ? userMeta.first_name.trim() : "") ||
    (typeof userMeta.firstname === "string" ? userMeta.firstname.trim() : "") ||
    (typeof userMeta.prenom === "string" ? userMeta.prenom.trim() : "");
  const headerLastName =
    (typeof userMeta.user_nom === "string" ? userMeta.user_nom.trim() : "") ||
    (typeof userMeta.nom === "string" ? userMeta.nom.trim() : "") ||
    (typeof userMeta.last_name === "string" ? userMeta.last_name.trim() : "");
  const headerDisplayName = `${headerFirstName} ${headerLastName}`.trim();
  const headerIdentityLabel = isAnonymousVisitor ? "Hey anonymous, on s'inscrit ?" : `Bonjour ${headerDisplayName || "Visiteur"}`;
  const expoId = searchParams.get("expo_id")?.trim() || "";

  useEffect(() => {
    if (!canSubmitFeedback) return;
    actionBarRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [canSubmitFeedback]);

  const handleAuthAffordanceClick = async () => {
    if (isAuthenticated) {
      await supabase.auth.signOut({ scope: "local" });
      setIsAuthenticated(false);
      navigate("/home", { replace: true });
      return;
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem("redirectAfterLogin", window.location.href);
    }
    navigate("/login");
  };

  const handleSignupClick = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("redirectAfterAuth", window.location.href);
    }
    navigate("/register");
  };

  const handleValidateFeeling = async () => {
    if (!canSubmitFeedback) return;
    if (submittingFeedback) return;

    const agencyIdRaw = artwork?.artwork_agency_id?.trim() || "";
    const resolvedExpoIdRaw = expoId || artwork?.artwork_expo_id?.trim() || "";
    const resolvedArtworkId = artwork?.artwork_id?.trim() || artworkId?.trim() || "";
    const emotionId = selectedEmotion?.trim() || "";
    const fingerprintId = getOrCreateVisitorUuid().trim();
    const rawVisitorId = session?.user?.id?.trim() || fingerprintId;
    const visitorId =
      rawVisitorId && isUuidLike(rawVisitorId)
        ? rawVisitorId
        : (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : "");

    if (!resolvedArtworkId || !emotionId || !heartRating || !visitorId) {
      // Donnée critique absente : on n'envoie rien.
      alert("Erreur technique : données manquantes pour l'enregistrement (visitor_id/artwork_id/emotion/note).");
      return;
    }

    // Vérifie les FK optionnelles avant insert pour éviter les 23503.
    let validAgencyId: string | null = null;
    if (agencyIdRaw) {
      const { data: agencyExists } = await supabase
        .from("agencies")
        .select("id")
        .eq("id", agencyIdRaw)
        .maybeSingle();
      const agencyRow = agencyExists as { id?: string | null } | null;
      if (agencyRow?.id) {
        validAgencyId = String(agencyRow.id);
      }
    }

    let validExpoId: string | null = null;
    if (resolvedExpoIdRaw) {
      const { data: expoExists } = await supabase
        .from("expos")
        .select("id")
        .eq("id", resolvedExpoIdRaw)
        .maybeSingle();
      const expoRow = expoExists as { id?: string | null } | null;
      if (expoRow?.id) {
        validExpoId = String(expoRow.id);
      }
    }

    const payload = {
      agency_id: validAgencyId,
      artwork_id: resolvedArtworkId,
      visitor_id: visitorId,
      emotion_id: emotionId,
      heart_rating: heartRating,
      expo_id: validExpoId,
    };
    console.log("Tentative d'insertion avec :", payload);

    setSubmittingFeedback(true);
    const { error } = await supabase.from("visitor_feedback" as never).insert([payload] as never);
    setSubmittingFeedback(false);

    if (error) {
      console.error("ERREUR SUPABASE RÉELLE :", error.message, error.details, error.hint);
      alert("Erreur technique : " + error.message);
      return;
    }
    console.log("SUCCÈS INSERT (sans erreur). Vérification de persistance...");

    // Vérifie qu'une ligne existe réellement après insertion (preuve d'écriture).
    const { data: persistedRows, error: persistedError } = await supabase
      .from("visitor_feedback" as never)
      .select("artwork_id, visitor_id, emotion_id, heart_rating")
      .eq("artwork_id", resolvedArtworkId)
      .eq("visitor_id", visitorId)
      .order("submitted_at", { ascending: false })
      .limit(1);

    if (persistedError) {
      console.error("ERREUR VÉRIFICATION INSERT :", persistedError.message, persistedError.details, persistedError.hint);
      alert("Insertion incertaine : impossible de vérifier la persistance en base.");
      return;
    }

    const persisted = Array.isArray(persistedRows) && persistedRows.length > 0;
    console.log("Résultat vérification persistance :", persistedRows);
    if (!persisted) {
      alert("Aucune ligne retrouvée après insertion. Vérifiez que vous consultez le bon projet Supabase et la bonne table.");
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    triggerHeartConfetti();
    if (isSameArtistNavigation) {
      window.parent?.postMessage({ type: "œuvres-artiste-next" }, window.location.origin);
      return;
    }
    setIsValidationPopupOpen(true);
  };

  const handleResetFeedbackSelection = () => {
    setSelectedEmotion(null);
    setHeartRating(0);
    setHoverRating(0);
  };

  const handleScanAnotherArtwork = () => {
    setIsValidationPopupOpen(false);
    const artworkIdForQuery = artwork?.artwork_id?.trim() || artworkId?.trim() || "";
    const queryParts: string[] = [];
    if (expoId) queryParts.push(`expo_id=${encodeURIComponent(expoId)}`);
    if (artworkIdForQuery) queryParts.push(`artwork_id=${encodeURIComponent(artworkIdForQuery)}`);
    const target = queryParts.length > 0 ? `/scan-work2?${queryParts.join("&")}` : "/scan-work2";
    navigate(target);
  };

  const handleExitExpo = () => {
    setIsValidationPopupOpen(false);
    setIsExitPopupOpen(true);
  };

  const navigateSameArtistArtwork = (direction: -1 | 1) => {
    if (!isSameArtistNavigation || sameArtistArtworkIds.length === 0) return;
    const currentId = artwork?.artwork_id?.trim() || artworkId?.trim() || "";
    const currentIndex = sameArtistArtworkIds.findIndex((id) => id === currentId);
    if (currentIndex < 0) return;

    const nextIndex = (currentIndex + direction + sameArtistArtworkIds.length) % sameArtistArtworkIds.length;
    const nextArtworkId = sameArtistArtworkIds[nextIndex];
    if (!nextArtworkId) return;

    const query = expoId ? `?expo_id=${encodeURIComponent(expoId)}` : "";
    navigate(`/œuvre/${encodeURIComponent(nextArtworkId)}${query}`);
  };

  const showQuickFeedbackMessage = (message: string) => {
    setQuickFeedbackMessage(message);
    if (quickFeedbackTimerRef.current != null) {
      window.clearTimeout(quickFeedbackTimerRef.current);
    }
    quickFeedbackTimerRef.current = window.setTimeout(() => {
      setQuickFeedbackMessage(null);
      quickFeedbackTimerRef.current = null;
    }, 2800);
  };

  const handleSameArtistNavigationClick = (direction: -1 | 1) => {
    const hasNoEmotionAndNoHeart = !selectedEmotion && heartRating === 0;
    if (hasNoEmotionAndNoHeart) {
      showQuickFeedbackMessage("Vous n'avez pas saisi d'émotion et de cœur.");
      window.setTimeout(() => {
        emotionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return;
    }
    handleResetFeedbackSelection();
    navigateSameArtistArtwork(direction);
  };

  const updateArtworkZoomOrigin = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));
    setArtworkZoomOrigin(`${clampedX}% ${clampedY}%`);
  };

  const openArtistPhotoModal = () => {
    if (artistPhotoCloseTimerRef.current != null) {
      window.clearTimeout(artistPhotoCloseTimerRef.current);
      artistPhotoCloseTimerRef.current = null;
    }
    setIsArtistPhotoClosing(false);
    setIsArtistPhotoOpen(true);
  };

  const closeArtistPhotoModal = () => {
    if (!isArtistPhotoOpen || isArtistPhotoClosing) return;
    setIsArtistPhotoClosing(true);
    artistPhotoCloseTimerRef.current = window.setTimeout(() => {
      setIsArtistPhotoOpen(false);
      setIsArtistPhotoClosing(false);
      artistPhotoCloseTimerRef.current = null;
    }, 500);
  };

  if (loadingArtwork) {
    return <div className="mx-auto w-full max-w-[320px] px-4 py-6 text-sm text-muted-foreground">Chargement...</div>;
  }

  if (!artwork) {
    return (
      <div className="mx-auto w-full max-w-[375px] px-4 py-8">
        <div className="rounded-2xl border border-white/15 bg-[#1E1E1E] p-6 text-center shadow-sm">
          <p className="text-5xl">🎨</p>
          <h2 className="mt-3 text-2xl font-bold text-[#F0F0F0]">Œuvre indisponible</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#F0F0F0]/85">
            Cette œuvre n&apos;est pas accessible pour le moment dans votre session.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => navigate("/œuvre", { replace: true })}
              className="w-full rounded-full"
            >
              Voir une autre œuvre
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/scan", { replace: true })}
              className="w-full rounded-full"
            >
              Retour à l&apos;accueil
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`visitor-page-shell ${isEmbedded ? "embedded-view" : ""} min-h-screen overflow-x-hidden bg-[#121212] text-[#F0F0F0]`}>
      {/* Mobile header */}
      <div className={`œuvre-fixed-header overflow-hidden border-b border-white/10 ${isEmbedded ? "py-1" : "py-1.5"}`}>
        <div className="flex min-w-0 w-full items-center justify-between px-[15px]">
          <div className="flex basis-auto shrink-0 grow-0 items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[15%] bg-accent shadow-sm">
              <span className="inline-flex animate-logo-heart">
                <Heart className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.25} />
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#E63946]">AIMEDIArt.com</p>
              <p className="text-[10px] font-semibold italic text-[#E63946]">Art-mediation with AI</p>
            </div>
          </div>
          <div className="flex min-w-0 grow basis-auto flex-col items-center gap-1 px-2">
            {isAnonymousVisitor && (
              <button
                type="button"
                onClick={handleSignupClick}
                className="rounded-full bg-[#E63946] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_4px_10px_rgba(0,0,0,0.25)] transition hover:bg-red-700"
              >
                S&apos;inscrire
              </button>
            )}
            <p className="max-w-[170px] whitespace-normal break-words text-center text-[10px] font-semibold italic text-[#F0F0F0]">
              {isAnonymousVisitor ? (
                <>
                  Hey &quot;Anonymous&quot;
                  <br />
                  on s&apos;inscrit ?
                </>
              ) : (
                <>
                  {authLoading ? (
                    <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-[#F0F0F0]" aria-hidden />
                  ) : (
                    headerIdentityLabel
                  )}
                </>
              )}
            </p>
          </div>
          {!isEmbedded && (
          <div className={`fab-container œuvre-navi basis-auto shrink-0 grow-0 ${isFabOpen ? "active" : ""}`}>
            <button
              type="button"
              className="fab-main shrink-0"
              aria-label={isFabOpen ? "Fermer le menu flottant" : "Ouvrir le menu flottant"}
              onClick={() => {
                setIsFabOpen((prev) => !prev);
                if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
                  navigator.vibrate(50);
                }
              }}
            >
              {isFabOpen ? <X className="h-6 w-6 text-white" aria-hidden /> : <Menu className="h-6 w-6 text-white" aria-hidden />}
            </button>
            <div className={`fab-links ${isFabOpen && isVisitorMenuRestricted ? "visitor-mode" : ""}`}>
              {isAuthenticated &&
                !isVisitorMenuRestricted &&
                HEADER_NAV_ITEMS.map((item) => {
                  if (!navMatrixLoading && !can(item.key)) return null;
                  const icon =
                    item.key === "menu_home" ? (
                      <House className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_agence" ? (
                      <Building2 className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_user" ? (
                      <Users className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_expos" ? (
                      <GalleryVerticalEnd className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_artiste" ? (
                      <UserPlus className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : item.key === "menu_catalogue" ? (
                      <GalleryVerticalEnd className="h-5 w-5 text-[#121212]" aria-hidden />
                    ) : (
                      <BarChart3 className="h-5 w-5 text-[#121212]" aria-hidden />
                    );
                  return (
                    <NavLink
                      key={`œuvre-fab-nav-${item.key}`}
                      to={item.to}
                      className="fab-item fab-nav-link"
                      aria-label={item.label}
                      target={isEmbedded ? "_top" : undefined}
                      rel={isEmbedded ? "noopener noreferrer" : undefined}
                      onClick={() => setIsFabOpen(false)}
                    >
                      {icon}
                      <span className="fab-item-label">{item.label}</span>
                    </NavLink>
                  );
                })}
              <div className="fab-item fab-language-item px-2" aria-label="Choix de langue">
                <div className="fab-language-selector-wrap inline-flex w-full items-center gap-2 rounded-md border px-2">
                  <span className={activeLanguage.flagClass} aria-hidden />
                  <select
                    id="languageSelector"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                    className="fab-language-selector h-8 w-full bg-transparent text-xs font-semibold outline-none"
                    aria-label="Langue de l'interface"
                    title="Langue de l'interface"
                  >
                    {UI_LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                className="fab-item fab-auth-item"
                aria-label={isAuthenticated ? "Déconnexion" : "Connexion"}
                onClick={() => {
                  setIsFabOpen(false);
                  void handleAuthAffordanceClick();
                }}
              >
                {isAuthenticated ? (
                  <>
                    <LogOut className="h-5 w-5 text-[#121212]" aria-hidden />
                    <span className="fab-item-label">Déconnexion</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5 text-[#121212]" aria-hidden />
                    <span className="fab-item-label">Connexion</span>
                  </>
                )}
              </button>
              {isAnonymousVisitor && (
                <button
                  type="button"
                  className="fab-item fab-signup-item"
                  aria-label="S'inscrire"
                  onClick={() => {
                    setIsFabOpen(false);
                    handleSignupClick();
                  }}
                >
                  <UserPlus className="h-5 w-5 text-[#121212]" aria-hidden />
                  <span className="fab-item-label">S&apos;inscrire</span>
                </button>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
      <div
        className={`œuvre-page-container ${
          isEmbedded ? "pt-[58px]" : isSameArtistNavigation ? "pt-[68px]" : "pt-[92px]"
        } space-y-0 pb-6`}
      >
        {isSameArtistNavigation && (
          <div className="œuvre-full-width-box mb-2 mt-0 px-5">
            <div ref={sameArtistNavRef} className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2">
              <button
                type="button"
                aria-label="Oeuvre precedente"
                title="Oeuvre précédente du même artiste"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white transition hover:bg-white/20"
                onClick={() => handleSameArtistNavigationClick(-1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <span aria-hidden />
              <button
                type="button"
                aria-label="Oeuvre suivante"
                title="Oeuvre suivante du même artiste"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white transition hover:bg-white/20"
                onClick={() => handleSameArtistNavigationClick(1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
        {/* Artwork title */}
        <div className="œuvre-full-width-box px-5 text-right -mt-1 mb-[10px]">
          <h2 className="m-0 text-xl font-bold leading-tight text-[#F0F0F0]">{artworkTitle}</h2>
          <div className="mt-1 flex items-center justify-end gap-2">
            <span className="text-[11px] italic text-[#E63946]">Voir la photo et la bio de l&apos;artiste</span>
            <button
              type="button"
              className="m-0 border-0 bg-transparent p-0 italic leading-none text-[#F0F0F0] underline decoration-[#E63946] underline-offset-2 shadow-none"
              onClick={openArtistPhotoModal}
            >
              {artistDisplayName}
            </button>
          </div>
        </div>

        {/* Artwork image */}
        <div className="œuvre-full-width-box relative -mt-[2px]">
          <div className="œuvre-full-width-box overflow-hidden">
            <img
              src={artworkImageUrl}
              alt={artworkTitle}
              className="w-full h-[200px] object-cover transition-transform duration-75"
              style={{
                transform: isArtworkZooming ? "scale(2.5)" : "scale(1)",
                transformOrigin: artworkZoomOrigin,
              }}
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                updateArtworkZoomOrigin(e.clientX, e.clientY, rect);
                setIsArtworkZooming(true);
              }}
              onMouseMove={(e) => {
                if (!isArtworkZooming) return;
                const rect = e.currentTarget.getBoundingClientRect();
                updateArtworkZoomOrigin(e.clientX, e.clientY, rect);
              }}
              onMouseUp={() => setIsArtworkZooming(false)}
              onMouseLeave={() => setIsArtworkZooming(false)}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                if (!touch) return;
                const rect = e.currentTarget.getBoundingClientRect();
                updateArtworkZoomOrigin(touch.clientX, touch.clientY, rect);
                setIsArtworkZooming(true);
              }}
              onTouchMove={(e) => {
                const touch = e.touches[0];
                if (!touch) return;
                const rect = e.currentTarget.getBoundingClientRect();
                updateArtworkZoomOrigin(touch.clientX, touch.clientY, rect);
              }}
              onTouchEnd={() => setIsArtworkZooming(false)}
            />
          </div>
          {artworkImageUrl && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white backdrop-blur-sm shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
            >
              <Search className="h-4 w-4" aria-hidden />
            </span>
          )}
        </div>

        {/* Résultats IA — Swiper Thumbs Gallery */}
        <div className="œuvre-full-width-box mb-[16px] rounded-2xl bg-[rgba(18,18,18,0.65)] px-0 pb-3 pt-2">
          <div className="mb-2 flex items-center gap-2 px-5">
            <span className="text-xl">📖</span>
            <h3 className="font-bold text-[14px] text-[#F0F0F0]">Sélectionnez comment l&apos;IA doit vous parler</h3>
          </div>
          {stylesQueryError ? (
            <p className="mb-2 text-center text-xs text-red-600">{stylesQueryError}</p>
          ) : null}
          {promptStylesLoading ? (
            <div className="flex min-h-[120px] items-center justify-center" aria-busy="true" aria-label="Chargement des styles">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : !aiSlides.length ? (
            <div className="space-y-1 px-5 text-center text-xs text-red-600">
              <p className="font-semibold">ALERTE : aucune ligne dans prompt_style (ou accès refusé).</p>
              <p className="font-normal text-muted-foreground">
                Vérifiez les politiques RLS Supabase pour la table <code className="rounded bg-muted px-1">prompt_style</code>.
              </p>
            </div>
          ) : (
            <>
              <Swiper
                modules={[Thumbs]}
                loop
                centeredSlides
                autoHeight
                slidesPerView={1}
                spaceBetween={10}
                className="px-5"
                thumbs={{
                  swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
                }}
                onSlideChange={(swiper) => {
                  const active = aiSlides[swiper.realIndex];
                  if (active) setSelectedPromptStyleId(active.sid);
                }}
              >
                {aiSlides.map((slide) => (
                  <SwiperSlide key={`main-ai-${slide.sid}`}>
                    <article className="rounded-2xl border border-white/15 bg-[#1E1E1E] p-3 text-sm leading-relaxed text-[#F0F0F0]/90">
                      <p className="text-sm leading-relaxed text-[#F0F0F0]/90">
                        <span className="mr-2 inline whitespace-nowrap rounded-full bg-white/10 px-2 py-0 text-sm font-semibold leading-relaxed text-white align-baseline">
                          <span>{slide.label}</span>
                        </span>
                        {slide.text}
                      </p>
                    </article>
                  </SwiperSlide>
                ))}
              </Swiper>

              <div ref={thumbsSectionRef}>
                <Swiper
                  modules={[Thumbs, FreeMode]}
                  onSwiper={setThumbsSwiper}
                  loop
                  centeredSlides
                  freeMode
                  watchSlidesProgress
                  slidesPerView="auto"
                  spaceBetween={8}
                  className="thumbs-swiper mt-[5px] px-0 pb-1"
                >
                  {aiSlides.map((slide) => {
                    const isConteur = (slide.label ?? "").toLowerCase().includes("conteur");
                    return (
                      <SwiperSlide key={`thumb-ai-${slide.sid}`} className="thumbs-slide">
                        <button
                          type="button"
                          className="persona-card flex snap-center flex-col items-stretch justify-center gap-0.5 p-1 text-xs font-semibold leading-tight text-[#F0F0F0]"
                          onClick={() => setSelectedPromptStyleId(slide.sid)}
                        >
                          <span className={`text-2xl leading-none ${isConteur ? "text-[#E63946]" : ""}`} aria-hidden>
                            {slide.icon}
                          </span>
                          <span className="w-full whitespace-normal break-words text-center leading-tight">{slide.label}</span>
                        </button>
                      </SwiperSlide>
                    );
                  })}
                </Swiper>
              </div>
            </>
          )}
        </div>

        {/* Emotion feedback */}
        <div
          ref={emotionSectionRef}
          className={`œuvre-full-width-box mt-2 space-y-3 px-5 rounded-xl transition-all duration-200 ${
            quickFeedbackMessage ? "border-2 border-[#E63946] bg-[#E63946]/5" : "border-2 border-transparent"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center">
              <Heart className="h-3.5 w-3.5 text-[#E63946]" fill="none" strokeWidth={2} />
            </span>
            <h3 className="font-bold text-[13px] whitespace-nowrap text-[#F0F0F0]">L'émotion ressentie devant cette oeuvre</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {emotionsDb.map((emo) => {
              const emotionName = (emo.name_emotion ?? "").trim();
              const displayedEmotionIcon = emotionName.toLowerCase() === "troublé" ? "😵‍💫" : (emo.icone_emotion ?? "");
              return (
                <button
                  key={String(emo.id)}
                  onClick={() =>
                    setSelectedEmotion((current) => (current === String(emo.id) ? null : String(emo.id)))
                  }
                  className={`h-[60px] w-full rounded-xl border px-1 py-1 text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis transition-all duration-150 ${
                    selectedEmotion === String(emo.id)
                      ? "border-[#E63946] bg-[#E63946] text-white shadow-none"
                      : "border-white/70 bg-white text-black hover:border-[#E63946]/85 hover:bg-white hover:text-black shadow-none"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <span className="text-xl leading-none" aria-hidden>
                      {displayedEmotionIcon}
                    </span>
                    <span>{emotionName}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {emotionsError && <p className="text-[11px] text-red-600">{emotionsError}</p>}
          {!emotionsError && emotionsDb.length === 0 && (
            <p className="text-[11px] text-red-600">
              Aucun bouton affiché: la table emotions ne renvoie pas de lignes avec icone_emotion et name_emotion.
            </p>
          )}
        </div>

        {/* Heart rating */}
        <div
          className={`œuvre-full-width-box !mt-[10px] space-y-2 px-5 rounded-xl transition-all duration-200 ${
            quickFeedbackMessage ? "border-2 border-[#E63946] bg-[#E63946]/5" : "border-2 border-transparent"
          }`}
        >
          <p className="font-bold text-[14px] text-[#F0F0F0]">Attribuez VOTRE note en CŒURS</p>
          <p className="text-xs italic text-[#F0F0F0]/85">
            Ce n&apos;est pas la qualité de l&apos;œuvre qui est notée,
            <br />
            juste VOTRE ressenti
          </p>
          <div className="flex justify-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => {
                  setHeartRating(n);
                  setHeartPulse(n);
                  window.setTimeout(() => setHeartPulse((current) => (current === n ? null : current)), 140);
                }}
                className="border-0 bg-transparent p-0 shadow-none transition-all duration-150 hover:scale-125 hover:drop-shadow-md"
              >
                <Heart
                  className={`h-10 w-10 transition-all duration-150 ${
                    heartPulse === n ? "scale-125" : "scale-100"
                  } ${
                    n <= (hoverRating || heartRating)
                      ? "fill-red-500 text-red-500"
                      : "fill-white text-red-500"
                  } drop-shadow-[1px_1px_2px_rgba(0,0,0,0.35)]`}
                />
              </button>
            ))}
          </div>
        </div>

      </div>

      {canSubmitFeedback && (
        <div
          ref={actionBarRef}
          className="œuvre-action-bar -mt-3 border-t border-white/10 bg-[rgba(18,18,18,0.9)] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md"
        >
          <div className="œuvre-action-row w-full min-w-0 flex flex-row justify-between items-center px-4">
            <div className="flex flex-row space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleResetFeedbackSelection}
                className="w-[100px] h-12 shadow-none border-white/35 bg-[#1E1E1E] text-center text-sm font-semibold text-white transition-colors duration-150 hover:border-[#E63946] hover:bg-[#2A2A2A] hover:text-white"
              >
                Corriger
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-[100px] h-12 shadow-none border-white/35 bg-[#1E1E1E] text-center text-sm font-semibold text-white transition-colors duration-150 hover:border-[#E63946] hover:bg-[#2A2A2A] hover:text-white"
              >
                Commenter
              </Button>
              <Button
                type="button"
                onClick={handleValidateFeeling}
                disabled={submittingFeedback || !canSubmitFeedback}
                className="w-[100px] h-12 text-base leading-tight shadow-none transition-all duration-200 gradient-gold gradient-gold-hover-bg text-primary-foreground hover:brightness-105 hover:saturate-125"
              >
                {submittingFeedback ? "Enregistrement..." : "Valider"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {quickFeedbackMessage && (
        <div
          className="pointer-events-none fixed left-1/2 z-[130] w-full max-w-[360px] -translate-x-1/2 px-4"
          style={{ top: `${quickFeedbackTop}px` }}
        >
          <div
            className="rounded-xl border border-black/10 bg-white px-4 py-3 text-center shadow-xl"
            role="status"
            aria-live="polite"
            aria-label="Message de sélection manquante"
          >
            <p className="text-sm font-semibold text-[#9D2525]">{quickFeedbackMessage}</p>
            <p
              className="mt-1 block w-full overflow-hidden whitespace-nowrap text-xs font-bold leading-none tracking-tight text-[#E63946]"
              aria-hidden
            >
              {"↓ ".repeat(80)}
            </p>
          </div>
        </div>
      )}

      {isArtistPhotoOpen && (
        <div
          className={`fixed inset-0 z-[100] flex justify-center bg-black/70 px-0 ${
            isEmbedded ? "items-start pt-[58px]" : "items-center"
          }`}
          onClick={closeArtistPhotoModal}
          role="presentation"
        >
          <div
            className={`mx-auto w-full max-w-[320px] rounded-lg bg-white p-2 ${
              isArtistPhotoClosing
                ? "animate-out zoom-out-75 fade-out duration-500"
                : "animate-in zoom-in-75 fade-in duration-500"
            }`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Photo et bio de l'artiste"
          >
            {canShowArtistPhoto ? (
              <div className="relative w-full overflow-hidden rounded shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
                <img
                  src={normalizedArtistPhotoUrl}
                  alt={artistDisplayName}
                  className="h-auto w-full object-cover"
                  onError={() => setArtistPhotoError(true)}
                />
                <div className="absolute inset-x-0 bottom-0 bg-black/45 px-3 py-2">
                  <p className="text-sm font-semibold text-white">{artistDisplayName}</p>
                </div>
              </div>
            ) : (
              <div className="flex h-[180px] items-center justify-center rounded bg-gray-100 text-center text-sm text-gray-500">
                Photo artiste indisponible
              </div>
            )}
            <div className="mt-3 max-h-[220px] overflow-y-auto rounded border border-gray-200 bg-gray-50 p-[15px]">
              <p className="text-xs leading-relaxed text-gray-700 break-words [word-wrap:break-word]">
                {artistBioText || "Biographie de l'artiste non disponible."}
              </p>
            </div>
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm text-black transition-colors duration-150 hover:border-primary hover:bg-primary/15 hover:text-black"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeArtistPhotoModal();
              }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {isValidationPopupOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setIsValidationPopupOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-[320px] rounded-lg border border-gray-200 bg-white p-4 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmation de ressenti"
          >
            <p className="text-sm font-semibold leading-relaxed text-gray-900">
              Merci {isAnonymousVisitor ? "Anonymous" : (headerFirstName || "Visiteur")}, c&apos;est enregistré.
              <br />
              On scanne le qrcode d&apos;une autre œuvre ?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground transition-all duration-200 hover:brightness-105 hover:saturate-125"
                onClick={handleScanAnotherArtwork}
              >
                Scanner une autre œuvre
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-primary hover:bg-primary/10 hover:text-primary"
                onClick={handleExitExpo}
              >
                Non je quitte l'expo
              </Button>
            </div>
          </div>
        </div>
      )}

      {isExitPopupOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setIsExitPopupOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-[320px] rounded-lg bg-white p-4 text-center"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Message de fin de visite"
          >
            <p className="text-sm font-semibold leading-relaxed text-black">
              {hasAgencyThanksName ? (
                <>
                  <span className="text-[#E63946]">AIMEDIArt.com</span> et{" "}
                  <span className="text-[hsl(0_65%_48%)]">{agencyThanksName}</span>{" "}
                  <span className="whitespace-nowrap">
                    vous remercient
                    <br />
                    pour votre visite.
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[#E63946]">AIMEDIArt.com</span>{" "}
                  <span className="whitespace-nowrap">
                    vous remercie
                    <br />
                    pour votre visite.
                  </span>
                </>
              )}
              <br />
              Nous avons été ravi de vous présenter cette exposition.
              <br />
              Nous espérons vous revoir très bientôt ! Au plaisir !
            </p>
            <Button
              type="button"
              className="mt-4 w-full transition-colors duration-150 hover:bg-primary/90"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.assign("https://www.aimediart.com");
              }}
            >
              Fermer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitorView;
