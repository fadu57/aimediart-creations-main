import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AimediartBrandLogoBlock } from "@/components/AimediartBrandLogoBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UiLanguageSelector } from "@/components/UiLanguageSelector";
import { VisitorLinkCodeDialog } from "@/components/visitor/VisitorLinkCodeDialog";
import { VisitorPoolAvatarPicker } from "@/components/VisitorPoolAvatarPicker";
import { useUiLanguage } from "@/providers/UiLanguageProvider";
import { supabase } from "@/lib/supabase";
import { sanitizeTranslationOutput } from "@/lib/sanitizeTranslationOutput";
import {
  fetchExpoRowForVisitor,
  mapExpoRowToInfo,
  type VisitorExpoInfo,
} from "@/lib/visitorExpoFetch";
import { markVisitorExpoGateDone } from "@/lib/visitorExpoGateSession";
import {
  startVisitorExpoVisit,
  type VisitorExpoVisitEntrySource,
} from "@/lib/visitorExpoVisit";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";
import { reportVisitorError } from "@/lib/visitorErrorLogging";
import { prepareImageForSupabaseUpload } from "@/lib/imageUpload";
import {
  persistAnonymousVisitorIdentity,
  localizeVisitorAnonymousProfile,
  resolveReturningAnonymousVisitor,
} from "@/lib/registerAnonymousVisitorSession";
import { setVisitorAnonymousProfile, type VisitorAnonymousProfile } from "@/lib/visitorAnonymousProfile";
import type { VisitorPoolAvatar } from "@/lib/visitorAvatarPool";
import {
  formatVisitorRecoveryCodeDisplay,
  generateVisitorRecoveryCode,
  linkVisitorProfileByRecoveryCode,
  normalizeVisitorRecoveryCodeInput,
} from "@/lib/visitorRecoveryLink";
import { VisitorIndoorAudioGuard } from "@/components/visitor/VisitorIndoorAudioGuard";

function buildQuery(expoId: string): string {
  if (!expoId) return "";
  return `?expo_id=${encodeURIComponent(expoId)}`;
}

function buildPostGatePath(artworkId: string, expoId: string): string {
  if (artworkId) {
    const params = new URLSearchParams();
    if (expoId) params.set("expo_id", expoId);
    const query = params.toString();
    return `/artwork/${encodeURIComponent(artworkId)}${query ? `?${query}` : ""}`;
  }
  return `/scan-work1${buildQuery(expoId)}`;
}

type ExpoInfo = VisitorExpoInfo;

function formatExpoDates(du: string | null, au: string | null, locale: string): string {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(d),
    );
  if (du && au) return `${fmt(du)} – ${fmt(au)}`;
  if (du) return `${fmt(du)} →`;
  if (au) return `→ ${fmt(au)}`;
  return "";
}

function resolveExpoDescriptionText(
  raw: string | Record<string, string> | null | undefined,
  lang: string,
): string | null {
  if (!raw) return null;
  let text: string | null = null;
  if (typeof raw === "object") {
    text = raw[lang] ?? raw["fr"] ?? Object.values(raw)[0] ?? null;
  } else {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      text = parsed[lang] ?? parsed["fr"] ?? Object.values(parsed)[0] ?? raw;
    } catch {
      text = raw;
    }
  }
  if (!text?.trim()) return null;
  return sanitizeTranslationOutput(text.trim());
}

function truncateExpoDescription(text: string, maxChars = 1000): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

type GateStep = "gate" | "avatar" | "welcome_back" | "recover";

const RECOVERY_ERROR_KEYS: Record<string, string> = {
  invalid_code_format: "visitor_gate.recover.errors.invalid_format",
  code_not_found: "visitor_gate.recover.errors.not_found",
  profile_incomplete: "visitor_gate.recover.errors.incomplete",
  missing_client_id: "visitor_gate.recover.errors.generic",
};

const VisitorWelcomeCore = () => {
  const { t } = useTranslation("landing");
  const { language: uiLanguage } = useUiLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const expoId = useMemo(() => searchParams.get("expo_id")?.trim() ?? "", [searchParams]);
  const artworkId = useMemo(
    () => searchParams.get("artwork_id")?.trim() ?? searchParams.get("artworkId")?.trim() ?? "",
    [searchParams],
  );
  const [activeExpoId, setActiveExpoId] = useState("");
  const [expoInfoLoading, setExpoInfoLoading] = useState(false);
  const effectiveExpoId = expoId || activeExpoId;
  const qs = buildQuery(effectiveExpoId);
  const hasExpoLandingContext = Boolean(expoId || artworkId);
  const postGatePath = useMemo(
    () => buildPostGatePath(artworkId, effectiveExpoId),
    [artworkId, effectiveExpoId],
  );

  const [autoDetecting, setAutoDetecting] = useState(true);
  const [step, setStep] = useState<GateStep>("gate");
  const [selectedAvatar, setSelectedAvatar] = useState<VisitorPoolAvatar | null>(null);
  const [returningProfile, setReturningProfile] = useState<VisitorAnonymousProfile | null>(null);
  const [returningIsAuth, setReturningIsAuth] = useState(false);
  const [returningDisplayPseudo, setReturningDisplayPseudo] = useState("");
  const [quickVisitBusy, setQuickVisitBusy] = useState(false);
  const [visitorPhotoFile, setVisitorPhotoFile] = useState<File | null>(null);
  const [userPhotoUrl, setUserPhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  /** Profil connu quand l’utilisateur choisit « un autre avatar » depuis l’écran de retour. */
  const [avatarChangeFromProfile, setAvatarChangeFromProfile] = useState<VisitorAnonymousProfile | null>(null);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [linkCodeDialogOpen, setLinkCodeDialogOpen] = useState(false);
  const [freshLinkCode, setFreshLinkCode] = useState<{ code: string; display: string } | null>(null);
  const [pendingScanNavigate, setPendingScanNavigate] = useState(false);
  const [expoInfo, setExpoInfo] = useState<ExpoInfo | null>(null);
  const [descriptionPopupOpen, setDescriptionPopupOpen] = useState(false);

  const fullExpoDescription = useMemo(
    () => resolveExpoDescriptionText(expoInfo?.expo_descript_i18n, uiLanguage.slice(0, 2)),
    [expoInfo, uiLanguage],
  );
  const expoDescriptionPreview = useMemo(
    () => (fullExpoDescription ? truncateExpoDescription(fullExpoDescription, 450) : null),
    [fullExpoDescription],
  );
  const expoDescriptionTruncated = Boolean(fullExpoDescription && fullExpoDescription.length > 450);
  const showExpoWelcome = Boolean(hasExpoLandingContext || effectiveExpoId || expoInfo);

  const visitStartRef = useRef<string | null>(null);

  const navigateAfterGate = useCallback(
    async (entrySource: VisitorExpoVisitEntrySource, navOptions?: { replace?: boolean }) => {
      const expo = effectiveExpoId.trim();
      if (expo && visitStartRef.current !== expo) {
        const visitId = await startVisitorExpoVisit({ expoId: expo, entrySource });
        if (visitId) {
          visitStartRef.current = expo;
        }
      }
      navigate(postGatePath, { replace: navOptions?.replace ?? false });
    },
    [effectiveExpoId, navigate, postGatePath],
  );

  const handleLinkCodeDialogOpenChange = (open: boolean) => {
    setLinkCodeDialogOpen(open);
    if (!open && pendingScanNavigate) {
      setPendingScanNavigate(false);
      void navigateAfterGate("visitor_welcome");
    }
  };

  // Auto-détection au montage : session auth puis visiteur anonyme connu
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // 1. Vérifier une session Supabase Auth active
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name, avatar_url")
            .eq("id", session.user.id)
            .maybeSingle();
          const displayName =
            profile?.first_name?.trim() ||
            profile?.last_name?.trim() ||
            session.user.email?.split("@")[0] ||
            "";
          if (displayName && !cancelled) {
            setReturningProfile({
              pseudo: displayName,
              avatarUrl: profile?.avatar_url?.trim() ?? "",
              avatarObjectPath: "",
              selfieUrl: "",
              selfieObjectPath: "",
            });
            setReturningIsAuth(true);
            if (hasExpoLandingContext) {
              // Visiteur reconnu avec contexte expo → bypass gate
              markVisitorExpoGateDone();
              getOrCreateVisitorUuid();
              const path = buildPostGatePath(artworkId, expoId);
              if (expoId.trim()) {
                const visitId = await startVisitorExpoVisit({
                  expoId: expoId.trim(),
                  entrySource: "direct_link",
                });
                if (visitId) {
                  visitStartRef.current = expoId.trim();
                }
              }
              navigate(path, { replace: true });
            } else {
              setStep("welcome_back");
            }
            return;
          }
        }
        // 2. Reconnaître un visiteur anonyme connu
        getOrCreateVisitorUuid();
        const known = await resolveReturningAnonymousVisitor();
        if (!cancelled && known) {
          setReturningProfile(known);
          setReturningIsAuth(false);
          if (hasExpoLandingContext) {
            // Visiteur reconnu avec contexte expo → bypass gate
            markVisitorExpoGateDone();
            getOrCreateVisitorUuid();
            const path = buildPostGatePath(artworkId, expoId);
            if (expoId.trim()) {
              const visitId = await startVisitorExpoVisit({
                expoId: expoId.trim(),
                entrySource: "resume",
              });
              if (visitId) {
                visitStartRef.current = expoId.trim();
              }
            }
            navigate(path, { replace: true });
          } else {
            setStep("welcome_back");
          }
        }
      } catch {
        // échec silencieux → afficher le portail
      } finally {
        if (!cancelled) setAutoDetecting(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExpoLandingContext, artworkId, expoId, navigate]);

  // Charger les infos de l'exposition (QR expo ou QR œuvre)
  useEffect(() => {
    let cancelled = false;
    setExpoInfoLoading(true);

    void (async () => {
      let resolvedExpoId = expoId;
      if (!resolvedExpoId && artworkId) {
        const { data: artworkRow } = await supabase
          .from("artworks")
          .select("artwork_expo_id")
          .eq("artwork_id", artworkId)
          .maybeSingle();
        if (cancelled) return;
        resolvedExpoId = (artworkRow as { artwork_expo_id?: string | null } | null)?.artwork_expo_id?.trim() ?? "";
      }
      if (!resolvedExpoId) {
        if (!cancelled) {
          setActiveExpoId("");
          setExpoInfo(null);
          setExpoInfoLoading(false);
        }
        return;
      }

      const row = await fetchExpoRowForVisitor(resolvedExpoId);
      if (cancelled) return;
      setActiveExpoId(resolvedExpoId);
      setExpoInfo(row ? mapExpoRowToInfo(row) : null);
      setExpoInfoLoading(false);
    })();

    return () => { cancelled = true; };
  }, [expoId, artworkId]);

  useEffect(() => {
    if (step !== "welcome_back" || !returningProfile) {
      setReturningDisplayPseudo("");
      return;
    }

    let cancelled = false;
    void localizeVisitorAnonymousProfile(returningProfile, uiLanguage).then((localized) => {
      if (!cancelled) setReturningDisplayPseudo(localized.pseudo);
    });

    return () => {
      cancelled = true;
    };
  }, [step, uiLanguage, returningProfile]);

  useEffect(() => {
    const raw = searchParams.get("recover")?.trim() ?? "";
    if (!raw) return;
    const norm = normalizeVisitorRecoveryCodeInput(raw);
    if (norm.length !== 8) return;
    setRecoveryCodeInput(formatVisitorRecoveryCodeDisplay(norm));
    setStep("recover");
  }, [searchParams]);

  const benefitClass =
    "flex gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground";

  const handleQuickVisitStart = async () => {
    markVisitorExpoGateDone();
    setQuickVisitBusy(true);
    try {
      getOrCreateVisitorUuid();
      const known = await resolveReturningAnonymousVisitor();
      if (known) {
        setReturningProfile(known);
        setStep("welcome_back");
      } else {
        setReturningProfile(null);
        setStep("avatar");
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[VisitorWelcome] reconnaissance visiteur :", err);
      }
      setReturningProfile(null);
      setStep("avatar");
    } finally {
      setQuickVisitBusy(false);
    }
  };

  const handleActiveAvatarChange = useCallback((avatar: VisitorPoolAvatar | null) => {
    setSelectedAvatar(avatar);
  }, []);

  const handleCaptureSelfie = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const prepared = await prepareImageForSupabaseUpload(file, {
        maxBytes: 350 * 1024,
        maxEdgePx: 800,
        forceFileType: "image/jpeg",
        initialQuality: 0.72,
      });
      setVisitorPhotoFile(prepared);
      setUserPhotoUrl(URL.createObjectURL(prepared));
      toast.success(t("visitor_gate.quick_avatar.toast_selfie_saved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("visitor_gate.quick_avatar.toast_selfie_failed");
      reportVisitorError({ message: msg, source: "visitor.app", stack: err instanceof Error ? err.stack : null });
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleWelcomeBackContinue = async () => {
    if (!returningProfile) return;

    const localizedPseudo = returningDisplayPseudo.trim() || returningProfile.pseudo;
    const profileToSave = { ...returningProfile, pseudo: localizedPseudo };

    setQuickVisitBusy(true);
    try {
      getOrCreateVisitorUuid();
      await persistAnonymousVisitorIdentity({
        pseudo: localizedPseudo,
        avatarUrl: profileToSave.avatarUrl,
        avatarObjectPath: profileToSave.avatarObjectPath,
        keepSelfieUrl: profileToSave.selfieUrl,
        keepSelfieObjectPath: profileToSave.selfieObjectPath,
      });
      setVisitorAnonymousProfile(profileToSave);
      markVisitorExpoGateDone();
      await navigateAfterGate("visitor_welcome");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("visitor_gate.welcome_back.toast_failed");
      reportVisitorError({ message: msg, source: "visitor.app", stack: err instanceof Error ? err.stack : null });
      toast.error(msg);
      if (import.meta.env.DEV) {
        console.warn("[VisitorWelcome] visite de retour :", err);
      }
    } finally {
      setQuickVisitBusy(false);
    }
  };

  const showRecoveryCodeAfterProfile = async (): Promise<boolean> => {
    const gen = await generateVisitorRecoveryCode(false);
    if (gen.ok) {
      setFreshLinkCode({ code: gen.code, display: gen.display });
      setPendingScanNavigate(true);
      setLinkCodeDialogOpen(true);
      return true;
    }
    if (gen.error !== "already_set" && import.meta.env.DEV) {
      console.warn("[VisitorWelcome] code liaison :", gen.error);
    }
    return false;
  };

  const handleRecoverSubmit = async () => {
    setRecoverBusy(true);
    try {
      getOrCreateVisitorUuid();
      const linked = await linkVisitorProfileByRecoveryCode(recoveryCodeInput);
      if (!linked.ok) {
        const key = RECOVERY_ERROR_KEYS[linked.error] ?? "visitor_gate.recover.errors.generic";
        const msg = t(key);
        reportVisitorError({ message: msg, source: "visitor.app", metadata: { code: linked.error } });
        toast.error(msg);
        return;
      }
      setReturningProfile(linked.profile);
      setStep("welcome_back");
    } catch (err) {
      const msg = t("visitor_gate.recover.errors.generic");
      reportVisitorError({ message: msg, source: "visitor.app", stack: err instanceof Error ? err.stack : null });
      toast.error(msg);
      if (import.meta.env.DEV) console.warn("[VisitorWelcome] liaison code :", err);
    } finally {
      setRecoverBusy(false);
    }
  };

  const handleQuickVisitConfirm = async () => {
    if (!selectedAvatar) {
      const msg = t("visitor_gate.quick_avatar.toast_pick_avatar");
      reportVisitorError({ message: msg, source: "visitor.app" });
      toast.error(msg);
      return;
    }

    setQuickVisitBusy(true);
    try {
      getOrCreateVisitorUuid();
      const profile = await persistAnonymousVisitorIdentity({
        pseudo: selectedAvatar.pseudo,
        avatarUrl: selectedAvatar.imageUrl,
        avatarObjectPath: selectedAvatar.objectPath,
        selfieFile: visitorPhotoFile,
      });
      setVisitorAnonymousProfile(profile);
      markVisitorExpoGateDone();
      const deferred = await showRecoveryCodeAfterProfile();
      if (!deferred) {
        await navigateAfterGate("visitor_welcome");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("visitor_gate.quick_avatar.toast_failed");
      reportVisitorError({ message: msg, source: "visitor.app", stack: err instanceof Error ? err.stack : null });
      toast.error(msg);
      if (import.meta.env.DEV) {
        console.warn("[VisitorWelcome] visite rapide :", err);
      }
    } finally {
      setQuickVisitBusy(false);
    }
  };

  if (autoDetecting) {
    return (
      <div className="flex w-full flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (step === "recover") {
    return (
      <div className="flex w-full flex-1 flex-col items-center px-4 pb-6 pt-0">
        <VisitorLinkCodeDialog
          open={linkCodeDialogOpen}
          onOpenChange={handleLinkCodeDialogOpenChange}
          initialCode={freshLinkCode?.code}
          initialDisplay={freshLinkCode?.display}
          allowRegenerate={false}
        />
        <Card className="mt-1 w-full max-w-[320px] border-border shadow-lg">
          <CardHeader className="space-y-1 px-3 pb-0 pt-2">
            <CardTitle className="text-center font-sans text-xl leading-snug">
              <span className="block font-black">{t("visitor_gate.recover.title")}</span>
              <span className="mt-1 block text-xs font-semibold leading-snug tracking-[3.5px]">
                {t("visitor_gate.recover.subtitle")}
              </span>
            </CardTitle>
            <CardDescription className="pt-2 text-center text-sm">
              {t("visitor_gate.recover.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-2 pt-1">
            <Input
              value={recoveryCodeInput}
              onChange={(e) => {
                const norm = normalizeVisitorRecoveryCodeInput(e.target.value);
                setRecoveryCodeInput(formatVisitorRecoveryCodeDisplay(norm));
              }}
              placeholder={t("visitor_gate.recover.placeholder")}
              className="text-center font-mono text-lg tracking-widest"
              autoComplete="off"
              spellCheck={false}
              maxLength={9}
              aria-label={t("visitor_gate.recover.input_aria")}
            />
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="h-11 w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
                disabled={recoverBusy || normalizeVisitorRecoveryCodeInput(recoveryCodeInput).length !== 8}
                onClick={() => void handleRecoverSubmit()}
              >
                {recoverBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    {t("visitor_gate.recover.btn_loading")}
                  </>
                ) : (
                  t("visitor_gate.recover.btn_submit")
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full text-xs text-muted-foreground"
                disabled={recoverBusy}
                onClick={() => setStep("gate")}
              >
                {t("visitor_gate.quick_avatar.btn_back")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "welcome_back" && returningProfile) {
    const greetingPseudo = returningDisplayPseudo.trim() || returningProfile.pseudo;
    const greetingKey = returningIsAuth
      ? "visitor_gate.welcome_back.greeting_auth"
      : "visitor_gate.welcome_back.greeting";
    const subtitleKey = returningIsAuth
      ? "visitor_gate.welcome_back.subtitle_auth"
      : "visitor_gate.welcome_back.subtitle";
    const expoDates = expoInfo
      ? formatExpoDates(expoInfo.date_expo_du, expoInfo.date_expo_au, uiLanguage)
      : "";
    return (
      <div className="flex w-full flex-1 flex-col items-center px-4 pb-6 pt-0">
        <Card className="mt-1 w-full max-w-[320px] border-border shadow-lg">
          <CardHeader className="space-y-1 px-3 pb-0 pt-2">
            <CardTitle className="text-center font-sans text-xl leading-snug">
              <span className="block font-black">
                <Trans
                  i18nKey={greetingKey}
                  ns="landing"
                  values={{ pseudo: greetingPseudo }}
                  components={{
                    pseudo: <span className="text-primary underline underline-offset-2" />,
                  }}
                />
              </span>
              <span className="mt-1 block text-xs font-semibold leading-snug tracking-[3.5px]">
                {expoInfo?.expo_name
                  ? t(subtitleKey, { expo_name: expoInfo.expo_name })
                  : t("visitor_gate.welcome_back.subtitle_no_expo")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-2 pt-1">
            {/* Avatars du visiteur */}
            <div className="flex flex-row items-center justify-center gap-3">
              {returningProfile.avatarUrl?.trim() ? (
                <div className="relative flex h-[96px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background/50 shadow-sm">
                  <img
                    src={returningProfile.avatarUrl}
                    alt={t("visitor_gate.welcome_back.avatar_alt", { pseudo: greetingPseudo })}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              {returningProfile.selfieUrl?.trim() ? (
                <div className="relative flex h-[96px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background/50 shadow-sm">
                  <img
                    src={returningProfile.selfieUrl}
                    alt={t("visitor_gate.welcome_back.selfie_alt", { pseudo: greetingPseudo })}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
            </div>

            {/* Infos de l'exposition */}
            {expoInfo && (
              <div className="space-y-1.5 border-t border-border pt-3 text-center">
                {expoInfo.logo_expo?.trim() ? (
                  <div className="mx-auto flex max-w-[220px] justify-center rounded-xl border border-border/60 bg-white px-3 py-2">
                    <img
                      src={expoInfo.logo_expo}
                      alt={expoInfo.expo_name}
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                ) : null}
                <p className="text-sm font-semibold leading-snug">{expoInfo.expo_name}</p>
                {expoDates ? (
                  <p className="text-xs text-muted-foreground">{expoDates}</p>
                ) : null}
                {fullExpoDescription ? (
                  <p className="line-clamp-6 text-left text-xs leading-relaxed text-muted-foreground">
                    {truncateExpoDescription(fullExpoDescription)}
                  </p>
                ) : null}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="h-11 w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
                disabled={quickVisitBusy}
                onClick={() => {
                  if (returningIsAuth) {
                    markVisitorExpoGateDone();
                    getOrCreateVisitorUuid();
                    void navigateAfterGate("resume");
                    return;
                  }
                  void handleWelcomeBackContinue();
                }}
              >
                {quickVisitBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    {t("visitor_gate.welcome_back.btn_loading")}
                  </>
                ) : (
                  t("visitor_gate.welcome_back.btn_continue")
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full text-xs text-muted-foreground"
                disabled={quickVisitBusy}
                onClick={() => {
                  setReturningIsAuth(false);
                  setStep("gate");
                }}
              >
                {t("visitor_gate.quick_avatar.btn_back")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "avatar") {
    return (
      <div className="flex w-full flex-1 flex-col items-center px-4 pb-6 pt-0">
        <Card className="mt-1 w-full max-w-[320px] border-border shadow-lg">
          <CardHeader className="space-y-1 px-3 pb-0 pt-2">
            <CardTitle className="text-center font-sans text-xl leading-snug">
              <span className="block font-black">{t("visitor_gate.quick_avatar.title")}</span>
              <span className="mt-1 block text-xs font-semibold leading-snug tracking-[3.5px]">
                {t("visitor_gate.quick_avatar.title_line2")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 px-3 pb-2 pt-1">
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleQuickVisitConfirm();
              }}
            >
              <VisitorPoolAvatarPicker
                active
                locale={uiLanguage}
                showSelfie
                preservedAvatar={
                  avatarChangeFromProfile
                    ? {
                        imageUrl: avatarChangeFromProfile.avatarUrl,
                        objectPath: avatarChangeFromProfile.avatarObjectPath,
                        pseudo: returningDisplayPseudo.trim() || avatarChangeFromProfile.pseudo,
                      }
                    : null
                }
                disabled={quickVisitBusy}
                visitorPhotoFile={visitorPhotoFile}
                userPhotoUrl={userPhotoUrl}
                onSelfieCapture={(e) => void handleCaptureSelfie(e)}
                uploadingPhoto={uploadingPhoto}
                onActiveAvatarChange={handleActiveAvatarChange}
                onClearSelfie={() => {
                  setVisitorPhotoFile(null);
                  setUserPhotoUrl("");
                }}
                selfieInputId="visitor-welcome-selfie"
              />
              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  className="h-11 w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
                  disabled={quickVisitBusy || !selectedAvatar}
                >
                  {quickVisitBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      {t("visitor_gate.quick_avatar.btn_loading")}
                    </>
                  ) : (
                    t("visitor_gate.quick_avatar.btn_continue")
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full text-xs text-muted-foreground"
                  disabled={quickVisitBusy}
                  onClick={() => {
                    setAvatarChangeFromProfile(null);
                    setStep(avatarChangeFromProfile ? "welcome_back" : "gate");
                  }}
                >
                  {t("visitor_gate.quick_avatar.btn_back")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  {
    const expoName = expoInfo?.expo_name?.trim() ?? "";
    const welcomeParts = expoName
      ? t("visitor_gate.welcome_expo", { expo_name: "\x00" }).split("\x00")
      : ["", ""];

    return (
      <div className="flex w-full flex-1 flex-col items-center">
        <VisitorLinkCodeDialog
          open={linkCodeDialogOpen}
          onOpenChange={handleLinkCodeDialogOpenChange}
          initialCode={freshLinkCode?.code}
          initialDisplay={freshLinkCode?.display}
          allowRegenerate={false}
        />
        <Dialog open={descriptionPopupOpen} onOpenChange={setDescriptionPopupOpen}>
          <DialogContent
            className="max-h-[80vh] w-[calc(100vw-2rem)] max-w-[360px] overflow-y-auto"
            aria-describedby={undefined}
          >
            <DialogTitle className="font-serif text-lg">
              {expoInfo?.expo_name?.trim() || t("visitor_gate.description_popup_title")}
            </DialogTitle>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {fullExpoDescription}
            </p>
          </DialogContent>
        </Dialog>

        {/* Header fixe : logo AIMEDIArt + boutons d'action */}
        <header className="sticky top-0 z-20 flex w-full max-w-[360px] items-center gap-3 border-b border-border/40 bg-[#121212]/95 px-4 py-2 backdrop-blur-md">
          <div className="flex min-w-0 flex-col gap-0.5">
            <AimediartBrandLogoBlock size="sm" animateHeart backdrop />
            <Link
              to={`/login${qs}`}
              className="pl-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            >
              {t("visitor_gate.login_existing")}
            </Link>
          </div>
          <div className="ml-auto flex shrink-0 flex-col gap-1.5">
            <Button
              type="button"
              variant="outline"
              className="h-8 w-[120px] px-3 text-[10px] !shadow-none"
              asChild
            >
              <Link to={`/register_visitor${qs}`} onClick={() => markVisitorExpoGateDone()}>
                {t("visitor_gate.btn_profile")}
              </Link>
            </Button>
          </div>
        </header>

        <div className="w-full max-w-[360px] px-4 pb-24 pt-3">
          <Card className="w-full border-border shadow-lg">
            <CardHeader className="space-y-3 pb-2">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div aria-hidden />
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide">{t("visitor_gate.badge")}</span>
                </div>
                <div className="flex justify-end">
                  <UiLanguageSelector />
                </div>
              </div>

              {showExpoWelcome ? (
                <div className="space-y-3 border-b border-border/60 pb-3">
                  {expoInfoLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                      <span className="text-sm text-muted-foreground">{t("visitor_gate.expo_loading")}</span>
                    </div>
                  ) : expoName ? (
                    <>
                      {/* Logo (gauche) + texte de bienvenue (droite) */}
                      <div className="flex items-center gap-3">
                        {expoInfo!.logo_expo?.trim() ? (
                          <div className="shrink-0 rounded-xl border border-border/60 bg-white p-0">
                            <img
                              src={expoInfo!.logo_expo}
                              alt={expoName}
                              className="h-16 w-20 object-contain"
                            />
                          </div>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="font-serif text-base font-semibold leading-snug text-foreground">
                            {welcomeParts[0]}
                            <span className="text-[#E63946]">{expoName}</span>
                            {welcomeParts[1]}
                          </p>
                          {formatExpoDates(expoInfo!.date_expo_du, expoInfo!.date_expo_au, uiLanguage) ? (
                            <p className="text-xs text-muted-foreground">
                              {formatExpoDates(expoInfo!.date_expo_du, expoInfo!.date_expo_au, uiLanguage)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {/* Description (pleine largeur) */}
                      {expoDescriptionPreview ? (
                        <div className="mt-0 space-y-2 leading-3 rounded-lg border border-[rgba(231,57,70,0.6)] bg-muted/50 px-3 py-3 shadow-[8px_8px_12px_0px_rgba(0,0,0,0.15)]">
                          <p className="text-sm leading-[18px] text-foreground">{expoDescriptionPreview}</p>
                          {expoDescriptionTruncated ? (
                            <button
                              type="button"
                              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                              onClick={() => setDescriptionPopupOpen(true)}
                            >
                              {t("visitor_gate.read_more")}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : effectiveExpoId ? (
                    <p className="text-center text-sm text-muted-foreground">{t("visitor_gate.expo_fallback")}</p>
                  ) : null}
                </div>
              ) : null}

              <CardTitle className="mt-0 text-left font-serif text-sm leading-snug">{t("visitor_gate.aha")}</CardTitle>
              <CardDescription className="text-center text-sm">{t("visitor_gate.lead")}</CardDescription>
            </CardHeader>
        <CardContent className="space-y-5 px-4 pb-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("visitor_gate.benefits_title")}
            </p>
            <ul className="space-y-2">
              <li className={benefitClass}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{t("visitor_gate.benefit_summary")}*</span>
              </li>
              <li className={benefitClass}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{t("visitor_gate.benefit_artist")}*</span>
              </li>
              <li className={benefitClass}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{t("visitor_gate.benefit_profile")}</span>
              </li>
            </ul>
            <Button
              type="button"
              className="mt-2 w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={() => {
                markVisitorExpoGateDone();
                getOrCreateVisitorUuid();
                setReturningProfile(null);
                setAvatarChangeFromProfile(null);
                setStep("avatar");
              }}
            >
              {t("visitor_gate.btn_start_visit")}
            </Button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            <Link to="/organisation" className="underline underline-offset-2 hover:text-foreground">
              {t("visitor_gate.link_organizer")}
            </Link>
          </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
};

/** Landing visiteur après scan QR — garde audio intérieur + premier heartbeat admin. */
const VisitorWelcome = () => {
  const { t } = useTranslation("visitor");
  const [searchParams] = useSearchParams();
  const expoId = searchParams.get("expo_id")?.trim() ?? "";
  const artworkId =
    searchParams.get("artwork_id")?.trim() ?? searchParams.get("artworkId")?.trim() ?? "";

  return (
    <VisitorIndoorAudioGuard
      expoId={expoId}
      artworkId={artworkId || undefined}
      artworkTitle={t("indoor_audio.welcome_presence_label")}
    >
      <VisitorWelcomeCore />
    </VisitorIndoorAudioGuard>
  );
};

export default VisitorWelcome;
