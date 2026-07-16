import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Layers,
  ListOrdered,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArtworkGroupStackPreview } from "@/components/expo/ArtworkGroupStackPreview";
import { saveArtworkGroupMemberOrder } from "@/lib/artworkGroupFetch";
import {
  CATALOGUE_CARD_HEIGHT_CLASS,
  CATALOGUE_DECK_SLIDE_GAP_PX,
  CATALOGUE_DECK_SLIDE_STRIDE_PX,
  CATALOGUE_DECK_VIEWPORT_PX,
  CATALOGUE_GROUP_DECK_GRID_CLASS,
} from "@/lib/catalogueCardLayout";
import { cn } from "@/lib/utils";
import type { ArtworkGroupWithMembers } from "@/lib/artworkGroupFetch";

export type CatalogueDeckCardMeta = {
  /** Index 0-based dans le carrousel du regroupement. */
  index: number;
  total: number;
};

type CatalogueArtworkGroupDeckProps<T extends { artwork_id: string; artwork_image_url?: string | null; artwork_photo_url?: string | null }> = {
  group: ArtworkGroupWithMembers;
  artworks: T[];
  renderCard: (artwork: T, deck?: CatalogueDeckCardMeta) => ReactNode;
  onOrderChange?: () => void;
  onPrintCartel?: () => void;
  /** Positionne le carrousel sur cette œuvre (ex. résultat de recherche). */
  focusArtworkId?: string;
};

function artworkThumbUrl<T extends { artwork_image_url?: string | null; artwork_photo_url?: string | null }>(
  aw: T,
): string {
  return (aw.artwork_image_url || aw.artwork_photo_url || "").trim();
}

export function CatalogueArtworkGroupDeck<T extends { artwork_id: string; artwork_image_url?: string | null; artwork_photo_url?: string | null }>({
  group,
  artworks,
  renderCard,
  onOrderChange,
  onPrintCartel,
  focusArtworkId,
}: CatalogueArtworkGroupDeckProps<T>) {
  const { t } = useTranslation("catalogue");
  const [activeIndex, setActiveIndex] = useState(0);
  const [reorderMode, setReorderMode] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);

  const artworkById = useMemo(() => {
    const map = new Map<string, T>();
    for (const aw of artworks) map.set(aw.artwork_id, aw);
    return map;
  }, [artworks]);

  const displayedArtworks = useMemo(() => {
    const ids = reorderMode ? draftIds : artworks.map((aw) => aw.artwork_id);
    return ids.map((id) => artworkById.get(id)).filter((aw): aw is T => Boolean(aw));
  }, [reorderMode, draftIds, artworks, artworkById]);

  const count = displayedArtworks.length;
  const safeIndex = count > 0 ? Math.min(activeIndex, count - 1) : 0;
  const activeArtwork = displayedArtworks[safeIndex];

  const typeLabel =
    group.group_type === "artist" ? t("group_deck_type_artist") : t("group_deck_type_theme");

  useEffect(() => {
    if (safeIndex !== activeIndex && count > 0) {
      setActiveIndex(safeIndex);
    }
  }, [safeIndex, activeIndex, count]);

  useEffect(() => {
    const focusId = (focusArtworkId ?? "").trim();
    if (!focusId || reorderMode || count === 0) return;
    const idx = displayedArtworks.findIndex((aw) => aw.artwork_id === focusId);
    if (idx >= 0) setActiveIndex(idx);
  }, [focusArtworkId, displayedArtworks, reorderMode, count]);

  const go = (direction: -1 | 1) => {
    if (count <= 1 || reorderMode) return;
    setActiveIndex((prev) => (prev + direction + count) % count);
  };

  const scrollToIndex = useCallback((index: number, smooth = true) => {
    const container = scrollRef.current;
    if (!container) return;
    programmaticScrollRef.current = true;
    container.scrollTo({
      top: index * CATALOGUE_DECK_SLIDE_STRIDE_PX,
      behavior: smooth ? "smooth" : "auto",
    });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, smooth ? 450 : 50);
  }, []);

  useEffect(() => {
    if (reorderMode || count <= 1) return;
    scrollToIndex(safeIndex);
  }, [safeIndex, reorderMode, count, scrollToIndex]);

  const handleDeckScroll = () => {
    if (programmaticScrollRef.current || reorderMode || count <= 1) return;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = scrollRef.current;
      if (!container) return;
      const nextIndex = Math.min(
        count - 1,
        Math.max(0, Math.round(container.scrollTop / CATALOGUE_DECK_SLIDE_STRIDE_PX)),
      );
      if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
    });
  };

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const startReorder = () => {
    setDraftIds(artworks.map((aw) => aw.artwork_id));
    setReorderMode(true);
  };

  const cancelReorder = () => {
    setReorderMode(false);
    setDraftIds([]);
  };

  const moveInDraft = (index: number, direction: -1 | 1) => {
    setDraftIds((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const saveReorder = async () => {
    if (draftIds.length === 0) return;
    setSavingOrder(true);
    try {
      await saveArtworkGroupMemberOrder(group.id, draftIds);
      toast.success(t("group_deck_reorder_saved"));
      setReorderMode(false);
      setDraftIds([]);
      setActiveIndex(0);
      onOrderChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("group_deck_reorder_fail"));
    } finally {
      setSavingOrder(false);
    }
  };

  if (!activeArtwork) return null;

  const previewUrls = displayedArtworks.map(artworkThumbUrl).filter(Boolean);

  const renderStackLayers = (cardIndex: number) => {
    const behind = Math.min(4, Math.max(0, count - cardIndex - 1));
    if (behind === 0) return null;
    return Array.from({ length: behind }).map((_, layer) => {
      const scale = 1 - (layer + 1) * 0.035;
      return (
        <div
          key={layer}
          className="pointer-events-none absolute inset-x-2 inset-y-0 rounded-xl border-2 border-amber-500/35 bg-[#141414] shadow-[0_14px_28px_rgba(0,0,0,0.55)]"
          style={{
            zIndex: layer + 1,
            transform: `translateY(${(layer + 1) * 20}px) scale(${scale})`,
            transformOrigin: "top center",
            opacity: 0.9 - layer * 0.15,
          }}
          aria-hidden
        />
      );
    });
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border-2 border-dashed bg-[#4f4040] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)] sm:p-4",
        CATALOGUE_GROUP_DECK_GRID_CLASS,
        reorderMode
          ? "border-amber-400/80 ring-2 ring-amber-500/50"
          : "border-amber-400/70 ring-2 ring-amber-600/35",
      )}
    >
      <div className="flex flex-col gap-3 rounded-xl border border-amber-500/45 bg-[#0a0a0a]/95 p-3 shadow-inner">
        <div className="flex items-start gap-3">
          <ArtworkGroupStackPreview
            imageUrls={previewUrls}
            totalCount={count}
            size="sm"
            className="shrink-0"
          />
          <div className={cn("relative min-w-0 flex-1", onPrintCartel && !reorderMode && "pr-[7.25rem]")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                <Layers className="h-3 w-3 shrink-0" aria-hidden />
                {t("group_deck_badge")}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  group.group_type === "artist"
                    ? "bg-amber-500/30 text-amber-100"
                    : "bg-sky-500/30 text-sky-100",
                )}
              >
                {typeLabel}
              </span>
              {group.group_display_number ? (
                <span className="text-xs font-semibold tabular-nums text-amber-200/80">
                  {t("group_deck_number", { number: group.group_display_number })}
                </span>
              ) : null}
            </div>
            <p className="mt-1 font-serif text-base font-semibold leading-snug text-[#F8F8F8] sm:text-lg">
              {group.group_label}
            </p>
            <p className="mt-0.5 text-xs text-amber-100/70">
              {reorderMode
                ? t("group_deck_reorder_hint")
                : `${t("group_deck_count", { count })} · ${t("group_deck_qr_hint")}`}
            </p>
            {onPrintCartel && !reorderMode ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute right-0 top-0 h-auto w-[6.75rem] flex-col items-center justify-center gap-0 whitespace-normal border-amber-500/50 bg-white px-2 py-1.5 text-center text-[11px] font-black leading-tight text-black hover:bg-white hover:text-black"
                onClick={onPrintCartel}
              >
                <span className="block w-full">{t("btn_print_cartel_group_line1")}</span>
                <span className="block w-full">{t("btn_print_cartel_group_line2")}</span>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-amber-500/30 pt-3 sm:flex-row sm:items-center sm:justify-between">
          {!reorderMode ? (
            <>
              {count > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 border-amber-500/60 bg-amber-500/20 text-xs font-medium text-amber-50 hover:bg-amber-500/30 hover:text-white sm:w-auto"
                  onClick={startReorder}
                >
                  <ListOrdered className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t("group_deck_reorder")}
                </Button>
              ) : (
                <span className="hidden sm:block" aria-hidden />
              )}
              <div className="flex items-center justify-center gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-amber-500/50 bg-[#1a1a1a] text-amber-100 hover:bg-amber-500/20"
                  aria-label={t("group_deck_prev")}
                  disabled={count <= 1}
                  onClick={() => go(-1)}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </Button>
                <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-amber-300">
                  {t("group_deck_position", { current: safeIndex + 1, total: count })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-amber-500/50 bg-[#1a1a1a] text-amber-100 hover:bg-amber-500/20"
                  aria-label={t("group_deck_next")}
                  disabled={count <= 1}
                  onClick={() => go(1)}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex w-full flex-wrap gap-2 sm:justify-end">
              <Button
                type="button"
                size="sm"
                className="w-full gap-1 sm:w-auto"
                disabled={savingOrder}
                onClick={() => void saveReorder()}
              >
                {savingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                {t("group_deck_reorder_save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full border-amber-500/50 bg-transparent text-amber-100 hover:bg-amber-500/15 sm:w-auto"
                disabled={savingOrder}
                onClick={cancelReorder}
              >
                {t("group_deck_reorder_cancel")}
              </Button>
            </div>
          )}
        </div>

        {count > 1 ? (
          <div
            className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1"
            role="tablist"
            aria-label={t("group_deck_filmstrip_label")}
          >
            {displayedArtworks.map((aw, index) => {
              const thumb = artworkThumbUrl(aw);
              const isActive = !reorderMode && index === safeIndex;
              return (
                <div key={aw.artwork_id} className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={t("group_deck_select_artwork", { n: index + 1 })}
                    disabled={reorderMode}
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "relative h-14 w-14 overflow-hidden rounded-lg border-2 transition-all sm:h-16 sm:w-16",
                      reorderMode
                        ? "border-amber-500/60 opacity-100"
                        : isActive
                          ? "border-amber-400 ring-2 ring-amber-500/70 scale-105 shadow-md"
                          : "border-white/20 opacity-75 hover:border-amber-400/50 hover:opacity-100",
                    )}
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-muted/40 to-muted/10" />
                    )}
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 px-1 text-[9px] font-bold tabular-nums",
                        reorderMode
                          ? "bg-amber-600 text-white"
                          : isActive
                            ? "bg-amber-500 text-black"
                            : "bg-black/80 text-white",
                      )}
                    >
                      {index + 1}
                    </span>
                  </button>
                  {reorderMode ? (
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 border-amber-500/50 bg-[#1a1a1a]"
                        aria-label={t("group_deck_move_left")}
                        disabled={index === 0}
                        onClick={() => moveInDraft(index, -1)}
                      >
                        <ArrowLeft className="h-3 w-3" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 border-amber-500/50 bg-[#1a1a1a]"
                        aria-label={t("group_deck_move_right")}
                        disabled={index === count - 1}
                        onClick={() => moveInDraft(index, 1)}
                      >
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {!reorderMode ? (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col rounded-xl p-2">
          {count > 1 ? (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 rounded-t-xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-14 rounded-b-xl bg-gradient-to-t from-[#241a0c] via-[#241a0c]/90 to-transparent"
                aria-hidden
              />
              <p className="relative z-10 mb-2 flex shrink-0 items-center justify-center gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-200/90 sm:text-xs">
                <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
                {t("group_deck_scroll_hint")}
                <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
              </p>
            </>
          ) : null}
          <div
            ref={scrollRef}
            onScroll={handleDeckScroll}
            style={{ height: count > 1 ? CATALOGUE_DECK_VIEWPORT_PX : undefined }}
            className={cn(
              "relative z-0 min-h-0 w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth",
              count > 1
                ? "cursor-ns-resize [scrollbar-width:thin] [scrollbar-color:rgba(217,150,60,0.7)_transparent]"
                : "overflow-y-hidden",
              count === 1 && CATALOGUE_CARD_HEIGHT_CLASS,
            )}
            aria-label={t("group_deck_scroll_label")}
          >
            {displayedArtworks.map((aw, index) => (
              <div
                key={aw.artwork_id}
                className={cn("relative shrink-0 snap-start snap-always px-1", CATALOGUE_CARD_HEIGHT_CLASS)}
                style={{ marginBottom: index < count - 1 ? CATALOGUE_DECK_SLIDE_GAP_PX : 0 }}
              >
                {renderStackLayers(index)}
                <div className="relative z-10 h-full">{renderCard(aw, { index, total: count })}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-center text-xs text-amber-100">
          {t("group_deck_reorder_active")}
        </p>
      )}
    </div>
  );
}
