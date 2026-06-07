import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { VisitorMediationMarkdown } from "@/components/VisitorMediationMarkdown";
import { TtsPlayButton } from "@/components/TtsPlayButton";
import { TtsConsentModal } from "@/components/TtsConsentModal";
import { VoiceSelector } from "@/components/VoiceSelector";
import { useTextToSpeechWithVoices } from "@/hooks/useTextToSpeechWithVoices";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BarChart3, Building2, ChevronDown, ChevronLeft, ChevronRight, GalleryVerticalEnd, Heart, House, Loader2, LogIn, LogOut, Menu, Search, Settings, UserPlus, Users, X } from "lucide-react";
import confetti from "canvas-confetti";
import type { Swiper as SwiperInstance } from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNavigationMatrix } from "@/hooks/useNavigationMatrix";
import { hasFullDataAccess } from "@/lib/authUser";
import { HEADER_NAV_ITEMS } from "@/lib/navigationMatrix";
import { supabase } from "@/lib/supabase";
import { isImageAnalysisPromptStyleRow } from "@/lib/inferPromptStyleKey";
import {
  resolveVisitorMediationText,
  rowCanonicalMediationStyle,
} from "@/lib/mediationVisitorStyles";
import { getMediationFilledUiLangs, normalizeMediationStyleKeyForLookup } from "@/lib/artworkDescriptionI18n";
import {
  expandSlidesForInfiniteCarousel,
  mediationCarouselLogicalIndex,
  type MediationCarouselSlide,
} from "@/lib/mediationSwiperLoop";
import { parseArtworkIdFromInput } from "@/lib/oeuvrePublicUrl";
import { getStyleLabelFromDb, type PromptStyleLabelFields } from "@/lib/promptStyleLabel";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";
import { getVisitorAnonymousProfile, getVisitorAnonymousPseudo } from "@/lib/visitorAnonymousProfile";
import { useTranslation } from "react-i18next";
import { useUiLanguage, type UiLanguage } from "@/providers/UiLanguageProvider";

type QuickFeedbackHint = "both" | "emotion" | "heart";

type ArtworkRow = {
  artwork_id: string;
  artwork_title?: string | null;
  artwork_description_i18n?: string | Record<string, string | null> | null;
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
  /** Libellé FR canonique (source de vérité et fallback toutes langues). */
  name_emotion?: string | null;
  /** Forme masculine FR (ex. "Ému") — préférée pour l'affichage FR. */
  Emotion_M?: string | null;
  /** Forme féminine FR (ex. "Émue") — réservé usage futur. */
  Emotion_F?: string | null;
  name_emotion_en?: string | null;
  name_emotion_de?: string | null;
  name_emotion_es?: string | null;
  name_emotion_it?: string | null;
};

type PromptStyleRow = PromptStyleLabelFields & {
  id: string | number;
  icon?: string | null;
  ordonnancement?: number | null;
};

type MediationAiSlide = {
  /** Identifiant stable pour sélection / Swiper (prompt_style.id). */
  sid: string;
  /** Clé utilisée pour lire `artwork_description_i18n.<lang>[clé]`. */
  jsonLookupKey: string;
  canonicalCode: ReturnType<typeof rowCanonicalMediationStyle>;
  label: string;
  icon: string;
  text: string;
};

/**
 * Résout le label d'affichage d'une émotion depuis les colonnes multilingues de la table `emotions`.
 *
 * Ordre de priorité :
 *   FR  → Emotion_M (forme masculine propre) → name_emotion
 *   EN  → name_emotion_en → name_emotion
 *   DE  → name_emotion_de → name_emotion
 *   ES  → name_emotion_es → name_emotion
 *   IT  → name_emotion_it → name_emotion
 *   Autre/inconnu → name_emotion (fallback universel)
 */
function getEmotionLabel(emo: EmotionRow, currentLang: string): string {
  const lang = currentLang.split("-")[0].toLowerCase();
  const fallback = (emo.name_emotion ?? "").trim();

  switch (lang) {
    case "fr":
      return (emo.Emotion_M ?? emo.name_emotion ?? "").trim() || fallback;
    case "en":
      return (emo.name_emotion_en ?? emo.name_emotion ?? "").trim() || fallback;
    case "de":
      return (emo.name_emotion_de ?? emo.name_emotion ?? "").trim() || fallback;
    case "es":
      return (emo.name_emotion_es ?? emo.name_emotion ?? "").trim() || fallback;
    case "it":
      return (emo.name_emotion_it ?? emo.name_emotion ?? "").trim() || fallback;
    default:
      return fallback;
  }
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
  { value: "de", label: "DE", flagClass: "fi fi-de" },
  { value: "en", label: "EN", flagClass: "fi fi-gb" },
  { value: "es", label: "ES", flagClass: "fi fi-es" },
  { value: "it", label: "IT", flagClass: "fi fi-it" },
];

const VisitorView = () => {
  const { t } = useTranslation("visitor");
  const { t: tHeader } = useTranslation("header");
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
  const { session, loading: authLoading, role_id, role_name, first_name } = useAuthUser();
  const { language, setLanguage } = useUiLanguage();
  const { can, loading: navMatrixLoading } = useNavigationMatrix();
  const tts = useTextToSpeechWithVoices();
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
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingCommentText, setPendingCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [sameArtistArtworkIds, setSameArtistArtworkIds] = useState<string[]>([]);
  const [quickFeedbackHint, setQuickFeedbackHint] = useState<QuickFeedbackHint | null>(null);
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const sameArtistNavRef = useRef<HTMLDivElement | null>(null);
  const emotionSectionRef = useRef<HTMLDivElement | null>(null);
  const mediationMainSwiperRef = useRef<SwiperInstance | null>(null);
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
        .is("deleted_at", null)
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
          .is("deleted_at", null)
          .limit(1);

        if (artworkId?.trim()) {
          artworkQuery = supabase
            .from("artworks")
            .select("*")
            .eq("artwork_id", artworkId.trim())
            .is("deleted_at", null)
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
        setEmotionsError(error.message || t("emotions_db_error"));
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
        setEmotionsError(t("emotions_columns_empty"));
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
        // Colonnes incluant les labels multilingues (name_fr/en/de/es/it) et le code stable.
        // Si une colonne manque (ex. schéma plus ancien), le 2e essai en select('*') récupère quand même les lignes.
        let res = await supabase
          .from("prompt_style")
          .select("id, code, name_fr, name_en, name_de, name_es, name_it, icon, ordonnancement")
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
        setPromptStylesDb(raw.filter((s) => !isImageAnalysisPromptStyleRow(s)));
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

  const artworkDescriptionResolved = useMemo(
    () => artwork?.artwork_description_i18n,
    [artwork?.artwork_description_i18n],
  );

  const availableMediationLangs = useMemo(
    () => getMediationFilledUiLangs(artworkDescriptionResolved),
    [artworkDescriptionResolved],
  );

  const languageOptionsForArtwork = useMemo(() => {
    const filtered = UI_LANGUAGE_OPTIONS.filter((o) => availableMediationLangs.includes(o.value));
    return filtered.length > 0 ? filtered : [UI_LANGUAGE_OPTIONS[0]];
  }, [availableMediationLangs]);

  const aiSlides = useMemo((): MediationAiSlide[] => {
    const ordered = [...promptStylesDb].sort((a, b) => {
      const oa =
        typeof a.ordonnancement === "number" && !Number.isNaN(a.ordonnancement) ? a.ordonnancement : 9999;
      const ob =
        typeof b.ordonnancement === "number" && !Number.isNaN(b.ordonnancement) ? b.ordonnancement : 9999;
      if (oa !== ob) return oa - ob;
      const ida = Number(a.id);
      const idb = Number(b.id);
      if (Number.isFinite(ida) && Number.isFinite(idb)) return ida - idb;
      return String(a.id).localeCompare(String(b.id));
    });

    return ordered.map((row) => {
      const canonical = rowCanonicalMediationStyle(row);
      const fromCode = normalizeMediationStyleKeyForLookup(row.code?.trim() ?? "");
      const jsonLookupKey =
        canonical ?? (fromCode || (row.id != null ? String(row.id).trim() : "") || "");

      const sid = row.id != null && String(row.id).trim() ? String(row.id) : `code:${jsonLookupKey || "row"}`;

      // Libellé + icône : strictement `prompt_style` (name_* + icon) selon la langue UI du visiteur.
      const label = getStyleLabelFromDb(row, language).trim() || sid;
      const icon = (row.icon ?? "").trim();

      // Texte : `artworks.artwork_description_i18n` pour `artwork_id` courant et langue `language` (repli `fr` déjà géré dans mediationTextForStyleCodeAndLang).
      const rawText = resolveVisitorMediationText(artworkDescriptionResolved, jsonLookupKey, language, row).trim();
      const text = rawText || t("mediation_text_missing");

      return {
        sid,
        jsonLookupKey,
        canonicalCode: canonical,
        label,
        icon,
        text,
      };
    });
  }, [promptStylesDb, artworkDescriptionResolved, language, t]);

  const mediationSlideCount = aiSlides.length;
  const mediationSwiperLoop = mediationSlideCount > 1;

  /** Copies DOM pour boucle infinie (Swiper clone + assez de slides pour `auto`). */
  const carouselSlides = useMemo(
    (): MediationCarouselSlide<MediationAiSlide>[] =>
      mediationSwiperLoop ? expandSlidesForInfiniteCarousel(aiSlides) : aiSlides.map((s) => ({ ...s, loopSlideKey: s.sid })),
    [aiSlides, mediationSwiperLoop],
  );

  const resolveLogicalSlide = useCallback(
    (swiperIndex: number) => {
      const idx = mediationCarouselLogicalIndex(swiperIndex, mediationSlideCount);
      return aiSlides[idx] ?? null;
    },
    [aiSlides, mediationSlideCount],
  );

  const goMediationPrev = useCallback(() => {
    const main = mediationMainSwiperRef.current;
    if (main && !main.destroyed && mediationSlideCount > 1) main.slidePrev();
  }, [mediationSlideCount]);

  const goMediationNext = useCallback(() => {
    const main = mediationMainSwiperRef.current;
    if (main && !main.destroyed && mediationSlideCount > 1) main.slideNext();
  }, [mediationSlideCount]);

  useEffect(() => {
    if (!aiSlides.length) return;
    const ids = new Set(aiSlides.map((s) => s.sid));
    if (!selectedPromptStyleId || !ids.has(selectedPromptStyleId)) {
      setSelectedPromptStyleId(aiSlides[0].sid);
    }
  }, [aiSlides, selectedPromptStyleId]);

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

  const artworkTitle = artwork?.artwork_title?.trim() || t("artwork_no_title");
  const artistDisplayName =
    `${artist?.artist_firstname ?? artist?.artist_prenom ?? artwork?.artwork_artist_firstname ?? artwork?.artwork_artist_prenom ?? ""} ${
      artist?.artist_lastname ?? artist?.artist_name ?? artwork?.artwork_artist_lastname ?? artwork?.artwork_artist_name ?? ""
    }`.trim() || t("artist_unknown");
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
  /** Rôles globaux SaaS (1–3) : accès page Configuration, comme le header backoffice. */
  const canSeeSettings = typeof role_id === "number" && role_id >= 1 && role_id <= 3;
  const activeLanguage =
    languageOptionsForArtwork.find((option) => option.value === language) ?? languageOptionsForArtwork[0];
  const userMeta = (session?.user?.user_metadata as Record<string, unknown> | undefined) ?? {};
  const headerFirstName =
    (first_name?.trim() || "") ||
    (typeof userMeta.first_name === "string" ? userMeta.first_name.trim() : "") ||
    (typeof userMeta.firstname === "string" ? userMeta.firstname.trim() : "") ||
    (typeof userMeta.full_name === "string" ? userMeta.full_name.trim().split(/\s+/)[0] ?? "" : "");
  const headerIdentityLabel = isAnonymousVisitor
    ? t("header_anon")
    : t("header_greeting", { name: headerFirstName || t("header_visitor") });
  const anonymousPseudo = getVisitorAnonymousPseudo()?.trim() || "";

  useEffect(() => {
    if (!isAuthenticated) {
      const anon = getVisitorAnonymousProfile();
      const url = anon?.selfieUrl?.trim() || anon?.avatarUrl?.trim() || null;
      setHeaderAvatarUrl(url);
      return;
    }
    const userId = session?.user?.id?.trim();
    if (!userId) {
      setHeaderAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle();
      if (cancelled) return;
      const row = data as { avatar_url?: string | null } | null;
      const profileUrl = row?.avatar_url?.trim() || "";
      if (profileUrl) {
        setHeaderAvatarUrl(profileUrl);
        return;
      }
      const meta = session?.user?.user_metadata as Record<string, unknown> | undefined;
      const metaUrl =
        (typeof meta?.avatar_url === "string" && meta.avatar_url.trim()) ||
        (typeof meta?.picture === "string" && meta.picture.trim()) ||
        null;
      setHeaderAvatarUrl(metaUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, session?.user?.id, session?.user?.user_metadata]);
  const expoId = searchParams.get("expo_id")?.trim() || "";

  useEffect(() => {
    if (!artwork || availableMediationLangs.length === 0) return;
    if (!availableMediationLangs.includes(language)) {
      setLanguage(availableMediationLangs[0]);
    }
  }, [artwork, availableMediationLangs, language, setLanguage]);

  useEffect(() => {
    if (!canSubmitFeedback) return;
    actionBarRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [canSubmitFeedback]);

  useEffect(() => {
    if (!quickFeedbackHint || !canSubmitFeedback) return;
    setQuickFeedbackHint(null);
  }, [canSubmitFeedback, quickFeedbackHint]);

  const handleAuthAffordanceClick = async () => {
    if (isAuthenticated) {
      await supabase.auth.signOut({ scope: "local" });
      setIsAuthenticated(false);
      navigate("/visitor", { replace: true });
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

  const openCommentModal = () => {
    setCommentDraft(pendingCommentText);
    setCommentError(null);
    setIsCommentModalOpen(true);
  };

  const closeCommentModal = () => {
    setIsCommentModalOpen(false);
    setCommentError(null);
  };

  const handleSaveCommentDraft = () => {
    const text = commentDraft.trim();
    if (!text) {
      setCommentError(t("comment_empty"));
      return;
    }
    setPendingCommentText(text);
    closeCommentModal();
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
      alert(t("error_missing_data"));
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

    const trimmedComment = pendingCommentText.trim();
    const payload: Record<string, unknown> = {
      agency_id: validAgencyId,
      artwork_id: resolvedArtworkId,
      visitor_id: visitorId,
      emotion_id: emotionId,
      heart_rating: heartRating,
      expo_id: validExpoId,
    };
    if (trimmedComment) {
      payload.comment_text = trimmedComment;
    }
    console.log("Tentative d'insertion avec :", payload);

    setSubmittingFeedback(true);
    const { error } = await supabase.from("visitor_feedback" as never).insert([payload] as never);
    setSubmittingFeedback(false);

    if (error) {
      console.error("ERREUR SUPABASE RÉELLE :", error.message, error.details, error.hint);
      alert(t("error_insert", { message: error.message }));
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
      alert(t("error_verify_insert"));
      return;
    }

    const persisted = Array.isArray(persistedRows) && persistedRows.length > 0;
    console.log("Résultat vérification persistance :", persistedRows);
    if (!persisted) {
      alert(t("error_no_row"));
      return;
    }

    setPendingCommentText("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    triggerHeartConfetti();
    if (isSameArtistNavigation) {
      window.parent?.postMessage({ type: "artworks-artist-next" }, window.location.origin);
      return;
    }
    setIsValidationPopupOpen(true);
  };

  const handleResetFeedbackSelection = () => {
    setSelectedEmotion(null);
    setHeartRating(0);
    setHoverRating(0);
    setPendingCommentText("");
    setCommentDraft("");
    setIsCommentModalOpen(false);
    setCommentError(null);
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
    navigate(`/artwork/${encodeURIComponent(nextArtworkId)}${query}`);
  };

  const sameArtistNavMeta = useMemo(() => {
    if (!isSameArtistNavigation || sameArtistArtworkIds.length === 0) return null;
    const currentId = artwork?.artwork_id?.trim() || artworkId?.trim() || "";
    const index = sameArtistArtworkIds.findIndex((id) => id === currentId);
    const safeIndex = index >= 0 ? index : 0;
    return {
      current: safeIndex + 1,
      total: sameArtistArtworkIds.length,
    };
  }, [isSameArtistNavigation, sameArtistArtworkIds, artwork?.artwork_id, artworkId]);

  const quickFeedbackHintMessageKey = useMemo((): string | null => {
    if (!quickFeedbackHint) return null;
    if (quickFeedbackHint === "emotion") return "quick_feedback_missing_emotion";
    if (quickFeedbackHint === "heart") return "quick_feedback_missing_heart";
    return "quick_feedback_missing";
  }, [quickFeedbackHint]);

  const showQuickFeedbackHint = (hint: QuickFeedbackHint) => {
    setQuickFeedbackHint(hint);
    if (quickFeedbackTimerRef.current != null) {
      window.clearTimeout(quickFeedbackTimerRef.current);
    }
    quickFeedbackTimerRef.current = window.setTimeout(() => {
      setQuickFeedbackHint(null);
      quickFeedbackTimerRef.current = null;
    }, 4500);
  };

  const handleSameArtistNavigationClick = (direction: -1 | 1) => {
    const hasNoEmotion = !selectedEmotion;
    const hasNoHeart = heartRating === 0;
    if (hasNoEmotion || hasNoHeart) {
      showQuickFeedbackHint(hasNoEmotion && hasNoHeart ? "both" : hasNoEmotion ? "emotion" : "heart");
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
    return <div className="mx-auto w-full max-w-[320px] px-4 py-6 text-sm text-muted-foreground">{t("loading")}</div>;
  }

  if (!artwork) {
    return (
      <div className="mx-auto w-full max-w-[375px] px-4 py-8">
        <div className="rounded-2xl border border-white/15 bg-[#1E1E1E] p-6 text-center shadow-sm">
          <p className="text-5xl">🎨</p>
          <h2 className="mt-3 text-2xl font-bold text-[#F0F0F0]">{t("artwork_unavailable_title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#F0F0F0]/85">
            {t("artwork_unavailable_desc")}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => navigate("/artwork", { replace: true })}
              className="w-full rounded-full"
            >
              {t("btn_see_another")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/scan", { replace: true })}
              className="w-full rounded-full"
            >
              {t("btn_back_home")}
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
              <p className="text-[10px] font-semibold italic text-[#E63946]">{t("tagline")}</p>
            </div>
          </div>
          <div className="flex min-w-0 grow basis-auto flex-col items-center justify-center gap-1 px-2">
            {isAnonymousVisitor && (
              <button
                type="button"
                onClick={handleSignupClick}
                className="rounded-full bg-[#E63946] px-3 py-1.5 text-xs font-semibold text-white shadow-[0_4px_10px_rgba(0,0,0,0.25)] transition hover:bg-red-700"
              >
                {t("btn_register")}
              </button>
            )}
            <div className="flex max-w-[220px] items-center justify-end gap-2">
              <p className="min-w-0 flex-1 whitespace-normal break-words text-right text-[10px] font-semibold italic text-[#F0F0F0]">
                {authLoading ? (
                  <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-[#F0F0F0]" aria-hidden />
                ) : isAnonymousVisitor ? (
                  anonymousPseudo ? t("header_anon_named", { name: anonymousPseudo }) : t("anon_cta_header")
                ) : (
                  headerIdentityLabel
                )}
              </p>
              {headerAvatarUrl ? (
                <img
                  src={headerAvatarUrl}
                  alt={t("header_avatar_alt", {
                    name: headerFirstName || anonymousPseudo || t("header_visitor"),
                  })}
                  className="h-10 w-10 shrink-0 rounded-full border-2 border-[#E63946]/75 object-cover shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
                />
              ) : null}
            </div>
          </div>
          {!isEmbedded && (
          <div className={`fab-container œuvre-navi basis-auto shrink-0 grow-0 ${isFabOpen ? "active" : ""}`}>
            <button
              type="button"
              className="fab-main shrink-0"
              aria-label={isFabOpen ? t("aria_close_menu") : t("aria_open_menu")}
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
              {isAuthenticated && !isVisitorMenuRestricted && canSeeSettings && (
                <NavLink
                  to="/settings"
                  className="fab-item fab-nav-link"
                  aria-label={tHeader("settings")}
                  title={tHeader("settings")}
                  target={isEmbedded ? "_top" : undefined}
                  rel={isEmbedded ? "noopener noreferrer" : undefined}
                  onClick={() => setIsFabOpen(false)}
                >
                  <Settings className="h-5 w-5 text-[#121212]" aria-hidden />
                  <span className="fab-item-label">{tHeader("settings")}</span>
                </NavLink>
              )}
              <div className="fab-item fab-language-item px-2" aria-label={t("aria_language")}>
                <div className="fab-language-selector-wrap inline-flex w-full items-center gap-2 rounded-md border px-2">
                  <span className={activeLanguage.flagClass} aria-hidden />
                  <select
                    id="languageSelector"
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value as UiLanguage);
                      setIsFabOpen(false);
                    }}
                    className="fab-language-selector h-8 w-full bg-transparent text-xs font-semibold outline-none"
                    aria-label={t("aria_language")}
                    title={t("aria_language")}
                  >
                    {languageOptionsForArtwork.map((option) => (
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
                aria-label={isAuthenticated ? t("btn_logout") : t("btn_login")}
                onClick={() => {
                  setIsFabOpen(false);
                  void handleAuthAffordanceClick();
                }}
              >
                {isAuthenticated ? (
                  <>
                    <LogOut className="h-5 w-5 text-[#121212]" aria-hidden />
                    <span className="fab-item-label">{t("btn_logout")}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5 text-[#121212]" aria-hidden />
                    <span className="fab-item-label">{t("btn_login")}</span>
                  </>
                )}
              </button>
              {isAnonymousVisitor && (
                <button
                  type="button"
                  className="fab-item fab-signup-item"
                  aria-label={t("btn_register")}
                  onClick={() => {
                    setIsFabOpen(false);
                    handleSignupClick();
                  }}
                >
                  <UserPlus className="h-5 w-5 text-[#121212]" aria-hidden />
                  <span className="fab-item-label">{t("btn_register")}</span>
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
        {isSameArtistNavigation && sameArtistNavMeta && (
          <div className="œuvre-full-width-box mb-3 mt-0 px-4">
            <div
              ref={sameArtistNavRef}
              className="flex overflow-hidden rounded-2xl border border-white/10 bg-[#181818] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <button
                type="button"
                aria-label={t("aria_prev_artwork")}
                title={t("title_prev_artwork")}
                className="group flex min-w-0 flex-1 items-center gap-2 border-r border-white/10 px-3 py-3 text-left transition-colors hover:bg-white/[0.04] active:bg-[#E63946]/15"
                onClick={() => handleSameArtistNavigationClick(-1)}
              >
                <ChevronLeft
                  className="h-5 w-5 shrink-0 text-[#E63946] transition-transform group-hover:-translate-x-0.5"
                  strokeWidth={2.5}
                  aria-hidden
                />
                <span className="min-w-0 truncate text-[10px] font-semibold leading-tight text-[#F0F0F0]/85">
                  {t("same_artist_nav_prev_short")}
                </span>
              </button>

              <div className="flex shrink-0 flex-col items-center justify-center px-3 py-2.5 sm:px-4">
                <span className="text-sm font-bold tabular-nums leading-none text-[#E63946]">
                  {t("same_artist_nav_position", {
                    current: sameArtistNavMeta.current,
                    total: sameArtistNavMeta.total,
                  })}
                </span>
                <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#F0F0F0]/40">
                  {t("same_artist_nav_hub")}
                </span>
              </div>

              <button
                type="button"
                aria-label={t("aria_next_artwork")}
                title={t("title_next_artwork")}
                className="group flex min-w-0 flex-1 items-center justify-end gap-2 border-l border-white/10 px-3 py-3 text-right transition-colors hover:bg-white/[0.04] active:bg-[#E63946]/15"
                onClick={() => handleSameArtistNavigationClick(1)}
              >
                <span className="min-w-0 truncate text-[10px] font-semibold leading-tight text-[#F0F0F0]/85">
                  {t("same_artist_nav_next_short")}
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-[#E63946] transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.5}
                  aria-hidden
                />
              </button>
            </div>
          </div>
        )}
        {/* Artwork title */}
        <div className="œuvre-full-width-box px-5 text-right -mt-1 mb-[10px]">
          <h2 className="m-0 text-xl font-bold leading-tight text-[#F0F0F0]">{artworkTitle}</h2>
          <div className="mt-1 flex items-center justify-end gap-2">
            <span className="text-[11px] italic text-[#E63946]">{t("see_artist_bio")}</span>
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

        {/* Résultats IA — navigation par flèches */}
        <div className="œuvre-full-width-box mb-[16px] rounded-2xl bg-[rgba(18,18,18,0.65)] px-0 pb-3 pt-2">
          <div className="mb-2 flex items-center gap-2 px-5">
            <span className="text-xl">📖</span>
            <h3 className="font-bold text-[14px] text-[#F0F0F0]">{t("ai_select_style")}</h3>
          </div>
          {tts.supported && !tts.isLoadingVoices && (
            <VoiceSelector
              lang={language}
              voices={tts.availableVoices}
              preferredVoiceName={tts.preferredVoices[language.split(/[-_]/)[0]]}
              onChange={(name) => tts.setPreferredVoice(language, name)}
              className="mb-2 px-5"
            />
          )}
          {stylesQueryError ? (
            <p className="mb-2 text-center text-xs text-red-600">{stylesQueryError}</p>
          ) : null}
          {promptStylesLoading ? (
            <div className="flex min-h-[120px] items-center justify-center" aria-busy="true" aria-label={t("aria_loading_styles")}>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : (
            <>
              <div className="relative mt-1 px-0.5">
                {/* Zone cliquable gauche — toute la hauteur du carrousel */}
                <button
                  type="button"
                  disabled={mediationSlideCount <= 1}
                  aria-label={t("aria_mediation_prev")}
                  onClick={goMediationPrev}
                  className="absolute left-0 top-0 bottom-0 z-10 w-8 flex items-start justify-center pt-3 text-[#E63946]/50 transition-all duration-200 hover:text-[#E63946] hover:bg-[#E63946]/8 rounded-l-2xl disabled:pointer-events-none disabled:opacity-20"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                </button>

                <div className="min-w-0 px-8">
                  <Swiper
                    key={`med-main-${artwork?.artwork_id ?? "none"}-${mediationSlideCount}`}
                    onSwiper={(swiper) => {
                      mediationMainSwiperRef.current = swiper;
                    }}
                    loop={mediationSwiperLoop}
                    loopAdditionalSlides={2}
                    watchSlidesProgress
                    centeredSlides
                    autoHeight
                    slidesPerView={1}
                    spaceBetween={10}
                    className="px-0"
                    onSlideChange={(swiper) => {
                      const raw = swiper.params.loop ? swiper.realIndex : swiper.activeIndex;
                      const active = resolveLogicalSlide(raw);
                      if (active) setSelectedPromptStyleId(active.sid);
                    }}
                  >
                    {carouselSlides.map((slide) => {
                      const isConteur = slide.canonicalCode === "conteur";
                      return (
                        <SwiperSlide key={`main-ai-${slide.loopSlideKey}`}>
                          <article className="rounded-2xl border border-white/15 bg-[#1E1E1E] p-3 text-left text-sm leading-5 text-[#F0F0F0]/90 w-full">
                            <div className="mb-2 flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5">
                                {slide.icon ? (
                                  <span
                                    className={`shrink-0 text-2xl leading-none ${isConteur ? "text-[#E63946]" : ""}`}
                                    aria-hidden
                                  >
                                    {slide.icon}
                                  </span>
                                ) : null}
                                <span className="inline whitespace-nowrap rounded-full bg-white/10 px-2 py-0 text-sm font-semibold leading-5 text-white">
                                  {slide.label}
                                </span>
                              </div>
                              <TtsPlayButton
                                isPlaying={tts.isSpeaking && tts.speakingText === slide.text}
                                onPress={() => tts.speak(slide.text, language)}
                                supported={tts.supported}
                              />
                            </div>
                            <VisitorMediationMarkdown
                              text={slide.text}
                              verseMode={slide.canonicalCode === "poetique"}
                              className="text-left"
                            />
                          </article>
                        </SwiperSlide>
                      );
                    })}
                  </Swiper>
                </div>

                {/* Zone cliquable droite — toute la hauteur du carrousel */}
                <button
                  type="button"
                  disabled={mediationSlideCount <= 1}
                  aria-label={t("aria_mediation_next")}
                  onClick={goMediationNext}
                  className="absolute right-0 top-0 bottom-0 z-10 w-8 flex items-start justify-center pt-3 text-[#E63946]/50 transition-all duration-200 hover:text-[#E63946] hover:bg-[#E63946]/8 rounded-r-2xl disabled:pointer-events-none disabled:opacity-20"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                </button>
              </div>

            </>
          )}
        </div>

        {quickFeedbackHint && quickFeedbackHintMessageKey ? (
          <div
            className="mx-4 mt-4 animate-in fade-in zoom-in-95 slide-in-from-top-3 duration-300 sm:mx-5"
            role="status"
            aria-live="assertive"
            aria-label={t("aria_missing_selection")}
          >
            <div className="relative overflow-hidden rounded-2xl border-[3px] border-[#E63946] bg-white px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_0_6px_rgba(230,57,70,0.18)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E63946] via-[#ff6b6b] to-[#E63946]" aria-hidden />
              <div className="flex items-start gap-3">
                <span
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E63946] text-xl text-white shadow-md"
                  aria-hidden
                >
                  💛
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold leading-tight tracking-tight text-[#E63946] sm:text-lg">
                    {t("quick_feedback_title")}
                  </p>
                  <p className="mt-1.5 text-sm font-medium leading-snug text-[#1a1a1a] sm:text-[15px]">
                    {t(quickFeedbackHintMessageKey)}
                  </p>
                </div>
                <ChevronDown
                  className="mt-0.5 h-7 w-7 shrink-0 animate-bounce text-[#E63946]"
                  strokeWidth={2.5}
                  aria-hidden
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Emotion feedback */}
        <div
          ref={emotionSectionRef}
          className={`œuvre-full-width-box mt-2 space-y-3 px-5 rounded-xl transition-all duration-300 ${
            quickFeedbackHint === "both" || quickFeedbackHint === "emotion"
              ? "border-2 border-[#E63946] bg-[#E63946]/10 shadow-[0_0_0_4px_rgba(230,57,70,0.12)]"
              : "border-2 border-transparent"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center">
              <Heart className="h-3.5 w-3.5 text-[#E63946]" fill="none" strokeWidth={2} />
            </span>
            <h3 className="font-bold text-[13px] whitespace-nowrap text-[#F0F0F0]">{t("emotion_section_title")}</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {emotionsDb.map((emo) => {
              // name_emotion = référence canonique pour la comparaison d'icône (valeur brute DB)
              const emotionNameRaw = (emo.name_emotion ?? "").trim();
              // Label affiché : colonne multilingue DB selon langue active, fallback name_emotion
              const emotionDisplayLabel = getEmotionLabel(emo, language);
              const displayedEmotionIcon = emotionNameRaw.toLowerCase() === "troublé" ? "😵‍💫" : (emo.icone_emotion ?? "");
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
                    <span>{emotionDisplayLabel}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {emotionsError && <p className="text-[11px] text-red-600">{emotionsError}</p>}
          {!emotionsError && emotionsDb.length === 0 && (
            <p className="text-[11px] text-red-600">
              {t("emotions_empty_error")}
            </p>
          )}
        </div>

        {/* Heart rating */}
        <div
          className={`œuvre-full-width-box !mt-[10px] space-y-2 px-5 rounded-xl transition-all duration-300 ${
            quickFeedbackHint === "both" || quickFeedbackHint === "heart"
              ? "border-2 border-[#E63946] bg-[#E63946]/10 shadow-[0_0_0_4px_rgba(230,57,70,0.12)]"
              : "border-2 border-transparent"
          }`}
        >
          <p className="font-bold text-[14px] text-[#F0F0F0]">{t("heart_rating_title")}</p>
          <p className="text-xs italic text-[#F0F0F0]/85" style={{ whiteSpace: "pre-line" }}>
            {t("heart_rating_subtitle")}
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
                {t("btn_correct")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openCommentModal}
                className={`w-[100px] h-12 shadow-none border-white/35 bg-[#1E1E1E] text-center text-sm font-semibold text-white transition-colors duration-150 hover:border-[#E63946] hover:bg-[#2A2A2A] hover:text-white ${
                  pendingCommentText ? "border-[#E63946]/70" : ""
                }`}
                aria-label={t("btn_comment")}
                title={pendingCommentText ? t("comment_saved_hint") : t("btn_comment")}
              >
                {t("btn_comment")}
              </Button>
              <Button
                type="button"
                onClick={handleValidateFeeling}
                disabled={submittingFeedback || !canSubmitFeedback}
                className="w-[100px] h-12 text-base leading-tight shadow-none transition-all duration-200 gradient-gold gradient-gold-hover-bg text-primary-foreground hover:brightness-105 hover:saturate-125"
              >
                {submittingFeedback ? t("btn_saving") : t("btn_validate")}
              </Button>
            </div>
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
            aria-label={t("aria_artist_dialog")}
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
                {t("artist_photo_unavailable")}
              </div>
            )}
            <div className="mt-3 max-h-[220px] overflow-y-auto rounded border border-gray-200 bg-gray-50 p-[15px]">
              <p className="text-xs leading-relaxed text-gray-700 break-words [word-wrap:break-word]">
                {artistBioText || t("artist_bio_unavailable")}
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
              {t("btn_close")}
            </button>
          </div>
        </div>
      )}

      {isCommentModalOpen && (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 px-4"
          onClick={closeCommentModal}
          role="presentation"
        >
          <div
            className="relative w-full max-w-[320px] rounded-lg border border-white/15 bg-[#1E1E1E] p-4 pt-10 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("aria_comment_dialog")}
          >
            <button
              type="button"
              onClick={closeCommentModal}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-[#F0F0F0]/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t("btn_close")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <h2 className="pr-6 text-base font-semibold text-[#F0F0F0]">{t("comment_modal_title")}</h2>
            <p className="mt-1 text-xs text-[#F0F0F0]/75">{t("comment_modal_hint")}</p>
            <Textarea
              value={commentDraft}
              onChange={(e) => {
                setCommentDraft(e.target.value);
                if (commentError) setCommentError(null);
              }}
              placeholder={t("comment_placeholder")}
              className="mt-3 min-h-[120px] resize-y border-white/25 bg-[#121212] text-sm text-[#F0F0F0] placeholder:text-[#F0F0F0]/45 focus-visible:ring-[#E63946]"
              maxLength={2000}
              aria-label={t("comment_placeholder")}
            />
            {commentError && (
              <p className="mt-2 text-xs font-medium text-[#E63946]" role="alert">
                {commentError}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
                onClick={handleSaveCommentDraft}
              >
                {t("comment_btn_save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/35 bg-transparent text-[#F0F0F0] hover:border-[#E63946] hover:bg-[#2A2A2A] hover:text-white"
                onClick={closeCommentModal}
              >
                {t("btn_close")}
              </Button>
            </div>
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
            aria-label={t("aria_validation_dialog")}
          >
            <p className="text-sm font-semibold leading-relaxed text-gray-900" style={{ whiteSpace: "pre-line" }}>
              {t("validation_thanks", { name: isAnonymousVisitor ? "Anonymous" : (headerFirstName || t("header_visitor")) })}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                className="w-full gradient-gold gradient-gold-hover-bg text-primary-foreground transition-all duration-200 hover:brightness-105 hover:saturate-125"
                onClick={handleScanAnotherArtwork}
              >
                {t("btn_scan_another")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-primary hover:bg-primary/10 hover:text-primary"
                onClick={handleExitExpo}
              >
                {t("btn_exit_expo")}
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
            aria-label={t("aria_exit_dialog")}
          >
            <p className="text-sm font-semibold leading-relaxed text-black">
              {hasAgencyThanksName
                ? t("exit_thanks_with_agency", { agency: agencyThanksName })
                : t("exit_thanks_solo")}
              <br />
              {t("exit_message")}
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
              {t("btn_close")}
            </Button>
          </div>
        </div>
      )}

      {tts.showConsentModal && (
        <TtsConsentModal
          onGrant={tts.grantConsent}
          onDismiss={tts.dismissConsent}
        />
      )}
    </div>
  );
};

export default VisitorView;
