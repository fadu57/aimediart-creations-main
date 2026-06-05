import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import {
  clearVisitorAvatarPseudoIndexCache,
  fetchRandomVisitorPoolAvatar,
  type VisitorPoolAvatar,
} from "@/lib/visitorAvatarPool";

export const MAX_POOL_AVATAR_PROPOSALS = 3;

/** Avatar déjà attribué au visiteur (reconnaissance / session précédente). */
export type PreservedPoolAvatar = {
  imageUrl: string;
  objectPath: string;
  pseudo: string;
};

export type VisitorPoolAvatarPickerProps = {
  locale: string;
  /** Charge le premier avatar quand true (ex. étape 2 inscription ou écran visite rapide). */
  active?: boolean;
  /** Affiche le rond selfie à côté du carrousel pool. */
  showSelfie?: boolean;
  /** Avatar actuel à proposer en premier + bouton « Garder cet avatar ». */
  preservedAvatar?: PreservedPoolAvatar | null;
  disabled?: boolean;
  visitorPhotoFile?: File | null;
  /** URL d’aperçu du selfie uniquement (pas l’avatar pool). */
  userPhotoUrl?: string;
  onSelfieCapture?: (e: ChangeEvent<HTMLInputElement>) => void;
  uploadingPhoto?: boolean;
  onActiveAvatarChange?: (avatar: VisitorPoolAvatar | null) => void;
  /** Synchronise l’URL pool (inscription OAuth, etc.) — ne pas brancher sur l’aperçu selfie. */
  onPoolPhotoUrlChange?: (url: string) => void;
  onClearSelfie?: () => void;
  selfieInputId?: string;
  className?: string;
};

const AVATAR_CIRCLE_CLASS =
  "relative flex h-[96px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background/50 shadow-sm";

function toPoolAvatar(preserved: PreservedPoolAvatar): VisitorPoolAvatar {
  return {
    id: preserved.objectPath,
    pseudo: preserved.pseudo,
    objectPath: preserved.objectPath,
    imageUrl: preserved.imageUrl,
  };
}

function AvatarCircleContent({
  avatar,
  loading,
  emptyLabel,
  alt,
}: {
  avatar: VisitorPoolAvatar | null;
  loading: boolean;
  emptyLabel: string;
  alt: string;
}) {
  return (
    <div className={AVATAR_CIRCLE_CLASS}>
      {loading && !avatar ? (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      ) : avatar ? (
        <img src={avatar.imageUrl} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="px-3 text-center text-[10px] text-muted-foreground">{emptyLabel}</span>
      )}
    </div>
  );
}

/**
 * Bloc « Photo de profil » : pool (gauche) + rond capture selfie (droite).
 * Carrousel uniquement s’il y a 2+ propositions (évite les boucles Embla avec 1 slide).
 */
export function VisitorPoolAvatarPicker({
  locale,
  active = true,
  showSelfie = false,
  preservedAvatar = null,
  disabled = false,
  visitorPhotoFile = null,
  userPhotoUrl = "",
  onSelfieCapture,
  uploadingPhoto = false,
  onActiveAvatarChange,
  onPoolPhotoUrlChange,
  onClearSelfie,
  selfieInputId = "visitor-pool-selfie",
  className,
}: VisitorPoolAvatarPickerProps) {
  const { t } = useTranslation("auth", { keyPrefix: "register_visitor" });
  const [poolAvatarProposals, setPoolAvatarProposals] = useState<VisitorPoolAvatar[]>([]);
  const [selectedPoolAvatarIndex, setSelectedPoolAvatarIndex] = useState(0);
  const [poolAvatarCarouselApi, setPoolAvatarCarouselApi] = useState<CarouselApi | null>(null);
  const [poolAvatarLoading, setPoolAvatarLoading] = useState(false);
  const seenPoolAvatarPathsRef = useRef<Set<string>>(new Set());
  const onActiveAvatarChangeRef = useRef(onActiveAvatarChange);
  const onPoolPhotoUrlChangeRef = useRef(onPoolPhotoUrlChange);

  onActiveAvatarChangeRef.current = onActiveAvatarChange;
  onPoolPhotoUrlChangeRef.current = onPoolPhotoUrlChange;

  const activePoolAvatar = poolAvatarProposals[selectedPoolAvatarIndex] ?? null;
  const poolAvatarProposalCount = poolAvatarProposals.length;
  const canShufflePoolAvatar = poolAvatarProposalCount > 0 && poolAvatarProposalCount < MAX_POOL_AVATAR_PROPOSALS;
  const hasSelfiePreview = Boolean(userPhotoUrl?.trim() || visitorPhotoFile);
  const preservedPoolAvatar = useMemo(
    () => (preservedAvatar ? toPoolAvatar(preservedAvatar) : null),
    [preservedAvatar?.imageUrl, preservedAvatar?.objectPath, preservedAvatar?.pseudo],
  );
  const isOnPreservedAvatar =
    preservedPoolAvatar != null && activePoolAvatar?.objectPath === preservedPoolAvatar.objectPath;
  const useCarousel = poolAvatarProposalCount > 1;

  useEffect(() => {
    onActiveAvatarChangeRef.current?.(activePoolAvatar);
  }, [activePoolAvatar]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    seenPoolAvatarPathsRef.current = new Set();
    setSelectedPoolAvatarIndex(0);

    if (preservedPoolAvatar) {
      seenPoolAvatarPathsRef.current.add(preservedPoolAvatar.objectPath);
      setPoolAvatarProposals([preservedPoolAvatar]);
      setPoolAvatarLoading(false);
      onPoolPhotoUrlChangeRef.current?.(preservedPoolAvatar.imageUrl);
      return;
    }

    setPoolAvatarProposals([]);
    setPoolAvatarLoading(true);

    const loadPoolAvatar = async () => {
      try {
        clearVisitorAvatarPseudoIndexCache();
        const pick = await fetchRandomVisitorPoolAvatar(locale, {
          excludeObjectPaths: [...seenPoolAvatarPathsRef.current],
        });
        if (cancelled) return;
        if (pick) {
          seenPoolAvatarPathsRef.current.add(pick.objectPath);
          setPoolAvatarProposals([pick]);
          setSelectedPoolAvatarIndex(0);
          onPoolPhotoUrlChangeRef.current?.(pick.imageUrl);
        } else if (import.meta.env.DEV) {
          console.warn("[VisitorPoolAvatarPicker] Aucun avatar pool disponible pour", locale);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[VisitorPoolAvatarPicker] Erreur chargement pool :", err);
        }
      } finally {
        if (!cancelled) setPoolAvatarLoading(false);
      }
    };

    void loadPoolAvatar();
    return () => {
      cancelled = true;
    };
  }, [active, locale, preservedPoolAvatar?.objectPath]);

  useEffect(() => {
    if (!useCarousel || !poolAvatarCarouselApi) return;
    poolAvatarCarouselApi.scrollTo(selectedPoolAvatarIndex, true);
  }, [useCarousel, poolAvatarCarouselApi, selectedPoolAvatarIndex]);

  useEffect(() => {
    if (!useCarousel || !poolAvatarCarouselApi) return;
    const onSelect = () => {
      const idx = poolAvatarCarouselApi.selectedScrollSnap();
      setSelectedPoolAvatarIndex((prev) => (prev === idx ? prev : idx));
      const avatar = poolAvatarProposals[idx];
      if (avatar) onPoolPhotoUrlChangeRef.current?.(avatar.imageUrl);
    };
    poolAvatarCarouselApi.on("select", onSelect);
    return () => {
      poolAvatarCarouselApi.off("select", onSelect);
    };
  }, [useCarousel, poolAvatarCarouselApi, poolAvatarProposals]);

  const handleKeepPreservedAvatar = () => {
    if (!preservedPoolAvatar) return;
    setPoolAvatarProposals([preservedPoolAvatar]);
    setSelectedPoolAvatarIndex(0);
    if (useCarousel) poolAvatarCarouselApi?.scrollTo(0, true);
    onPoolPhotoUrlChangeRef.current?.(preservedPoolAvatar.imageUrl);
  };

  const handleShufflePoolAvatar = async () => {
    if (poolAvatarProposalCount >= MAX_POOL_AVATAR_PROPOSALS) return;
    setPoolAvatarLoading(true);
    try {
      const pick = await fetchRandomVisitorPoolAvatar(locale, {
        excludeObjectPaths: [...seenPoolAvatarPathsRef.current],
      });
      if (!pick) {
        toast.error(t("toast_pool_avatar_failed"));
        return;
      }
      seenPoolAvatarPathsRef.current.add(pick.objectPath);
      setPoolAvatarProposals((prev) => {
        const next = [...prev, pick].slice(0, MAX_POOL_AVATAR_PROPOSALS);
        setSelectedPoolAvatarIndex(next.length - 1);
        return next;
      });
      onPoolPhotoUrlChangeRef.current?.(pick.imageUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast_pool_avatar_failed");
      toast.error(msg);
    } finally {
      setPoolAvatarLoading(false);
    }
  };

  const renderAvatarSlide = (avatar: VisitorPoolAvatar) => (
    <div className="flex flex-col items-center gap-1">
      <AvatarCircleContent
        avatar={avatar}
        loading={false}
        emptyLabel={t("pool_avatar_empty")}
        alt={t("pool_avatar_alt", { pseudo: avatar.pseudo })}
      />
      <p className="max-w-[120px] truncate text-center text-xs font-semibold text-foreground">{avatar.pseudo}</p>
    </div>
  );

  const avatarBlock =
    poolAvatarProposalCount === 1 ? (
      <div className={cn("flex w-full flex-col items-center", showSelfie ? "max-w-[140px]" : "max-w-[280px]")}>
        {renderAvatarSlide(poolAvatarProposals[0]!)}
      </div>
    ) : poolAvatarProposalCount > 1 ? (
      <Carousel
        className={cn("w-full", showSelfie ? "max-w-[140px]" : "max-w-[280px]")}
        opts={{ startIndex: selectedPoolAvatarIndex, watchDrag: true }}
        setApi={setPoolAvatarCarouselApi}
      >
        <CarouselContent className="-ml-2">
          {poolAvatarProposals.map((avatar) => (
            <CarouselItem key={avatar.objectPath} className="basis-full pl-2">
              {renderAvatarSlide(avatar)}
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-0 top-[48px] h-6 w-6 -translate-y-1/2 border-border/80 bg-background/90" />
        <CarouselNext className="right-0 top-[48px] h-6 w-6 -translate-y-1/2 border-border/80 bg-background/90" />
        <div
          className="mt-1 flex justify-center gap-1.5"
          role="tablist"
          aria-label={t("pool_avatar_carousel_dots")}
        >
          {poolAvatarProposals.map((avatar, idx) => (
            <button
              key={avatar.objectPath}
              type="button"
              role="tab"
              aria-selected={idx === selectedPoolAvatarIndex}
              aria-label={t("pool_avatar_carousel_dot", {
                index: idx + 1,
                max: poolAvatarProposals.length,
              })}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                idx === selectedPoolAvatarIndex ? "bg-primary" : "bg-muted-foreground/35",
              )}
              onClick={() => {
                setSelectedPoolAvatarIndex(idx);
                poolAvatarCarouselApi?.scrollTo(idx, true);
                onPoolPhotoUrlChangeRef.current?.(poolAvatarProposals[idx]?.imageUrl ?? "");
              }}
            />
          ))}
        </div>
      </Carousel>
    ) : (
      <div className="flex flex-col items-center gap-1">
        <AvatarCircleContent
          avatar={null}
          loading={poolAvatarLoading}
          emptyLabel={t("pool_avatar_empty")}
          alt=""
        />
      </div>
    );

  const selfieBlock = showSelfie ? (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <p className="text-center text-[11px] font-medium text-muted-foreground">{t("selfie_capture_label")}</p>
      <label
        htmlFor={selfieInputId}
        className={cn(
          AVATAR_CIRCLE_CLASS,
          "cursor-pointer border-dashed hover:border-primary/60",
          hasSelfiePreview && "border-solid",
        )}
        title={t("btn_take_selfie")}
      >
        {uploadingPhoto ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        ) : hasSelfiePreview ? (
          <img src={userPhotoUrl} alt={t("selfie_preview_alt")} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-muted-foreground">
            <Camera className="h-7 w-7" strokeWidth={1.5} aria-hidden />
            <span className="text-center text-[10px] font-medium leading-tight">{t("btn_take_selfie")}</span>
          </span>
        )}
      </label>
      <input
        id={selfieInputId}
        type="file"
        accept="image/*"
        capture="user"
        onChange={onSelfieCapture}
        disabled={disabled || uploadingPhoto || poolAvatarLoading}
        className="hidden"
      />
      {hasSelfiePreview && onClearSelfie ? (
        <button
          type="button"
          className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          disabled={disabled || uploadingPhoto}
          onClick={() => onClearSelfie()}
        >
          {t("btn_clear_selfie")}
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className={cn("rounded-md border border-dashed border-border/80 bg-muted/25 p-2", className)}>
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t("selfie_section")}</p>
      <div className="flex flex-col items-center gap-2">
        <div className={cn("flex w-full items-start justify-center", showSelfie ? "gap-3" : "flex-col")}>
          <div className={cn("flex flex-col items-center", showSelfie ? "min-w-0 flex-1" : "w-full")}>
            {showSelfie ? (
              <p className="mb-1 text-center text-[11px] font-medium text-muted-foreground">
                {t("pool_avatar_column_label")}
              </p>
            ) : null}
            {avatarBlock}
          </div>
          {selfieBlock}
        </div>

        <div className="flex w-full flex-col gap-2">
          {preservedPoolAvatar && !isOnPreservedAvatar ? (
            <Button
              type="button"
              variant="secondary"
              className="h-9 w-full text-xs"
              disabled={disabled || uploadingPhoto || poolAvatarLoading}
              onClick={handleKeepPreservedAvatar}
            >
              {t("btn_keep_current_avatar")}
            </Button>
          ) : null}
          {poolAvatarProposalCount > 0 ? (
            <p className="text-center text-[10px] text-muted-foreground">
              {poolAvatarProposalCount >= MAX_POOL_AVATAR_PROPOSALS
                ? t("pool_avatar_shuffle_limit", { max: MAX_POOL_AVATAR_PROPOSALS })
                : t("pool_avatar_shuffle_hint", {
                    current: poolAvatarProposalCount,
                    max: MAX_POOL_AVATAR_PROPOSALS,
                  })}
            </p>
          ) : null}
          {canShufflePoolAvatar ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full text-xs"
              disabled={disabled || uploadingPhoto || poolAvatarLoading}
              onClick={() => void handleShufflePoolAvatar()}
            >
              {poolAvatarLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("btn_pool_avatar_loading")}
                </>
              ) : (
                t("btn_pool_avatar_shuffle")
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
