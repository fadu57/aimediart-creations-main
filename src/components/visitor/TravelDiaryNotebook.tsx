import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import HTMLFlipBook from "react-pageflip";
import { ChevronLeft, ChevronRight, Download, Heart, Loader2, Share2 } from "lucide-react";
import "page-flip/src/Style/stPageFlip.css";

import { AimediartBrandLogoBlock } from "@/components/AimediartBrandLogoBlock";
import { AIMEDIART_WEBSITE_URL } from "@/lib/aimediartBrandLogo";
import { VisitorMediationMarkdown } from "@/components/VisitorMediationMarkdown";
import { Button } from "@/components/ui/button";
import {
  exportTravelDiaryPdf,
  prepareTravelDiaryExportPages,
  travelDiaryPdfFilename,
} from "@/lib/travelDiaryBrowserPdf";
import type { TravelDiaryPackage } from "@/lib/visitorTravelDiary";
import {
  buildArtistPageViews,
  buildArtworkPageViews,
  buildStatsPageConfigs,
  type StatsPageConfig,
} from "@/lib/travelDiaryPagination";
import { buildTravelDiaryShareUrl, createTravelDiaryShareLink } from "@/lib/travelDiaryShare";
import { ensureStPageFlipPortraitBackPatch } from "@/lib/stPageFlipPortraitBackPatch";
import { cn } from "@/lib/utils";

type FlipBookBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
  pageWidth: number;
};

type FlipBookController = {
  flip: (point: { x: number; y: number }) => void;
};

type PageFlipInstance = {
  flipNext: (corner?: "top" | "bottom") => void;
  flipPrev: (corner?: "top" | "bottom") => void;
  getCurrentPageIndex: () => number;
  turnToPage: (pageNum: number) => void;
  turnToNextPage: () => void;
  turnToPrevPage: () => void;
  getBoundsRect: () => FlipBookBounds;
  getFlipController: () => FlipBookController;
  getPageCollection: () => unknown;
  getRender: () => object;
  getOrientation: () => string;
};

type FlipBookHandle = {
  pageFlip: () => PageFlipInstance | null;
};

const FLIPBOOK_WIDTH = 392;
const FLIPBOOK_HEIGHT = 792;

/** page-flip : bord droit, milieu vertical (page suivante). */
function flipDiaryPageForward(pageFlip: {
  getBoundsRect: () => FlipBookBounds;
  getFlipController: () => FlipBookController;
}) {
  const rect = pageFlip.getBoundsRect();
  pageFlip.getFlipController().flip({
    x: rect.left + 2 * rect.pageWidth - 10,
    y: rect.top + rect.height / 2,
  });
}

/** page-flip : bord gauche, milieu vertical — retour arrière (gauche → droite). */
function flipDiaryPageBack(pageFlip: {
  getBoundsRect: () => FlipBookBounds;
  getFlipController: () => FlipBookController;
}) {
  const rect = pageFlip.getBoundsRect();
  pageFlip.getFlipController().flip({
    x: rect.left + 10,
    y: rect.top + rect.height / 2,
  });
}

function parseDiaryPageParam(raw: string | null, slideCount: number): number {
  const parsed = raw ? parseInt(raw, 10) : 1;
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.min(parsed - 1, Math.max(0, slideCount - 1));
}

/** onFlip → data: number ; onInit/onUpdate → data: { page, mode }. */
function resolveFlipBookPageIndex(data: unknown): number {
  if (typeof data === "number" && Number.isFinite(data)) return data;
  if (typeof data === "object" && data !== null && "page" in data) {
    const page = (data as { page: unknown }).page;
    if (typeof page === "number" && Number.isFinite(page)) return page;
  }
  return 0;
}

type Props = {
  diary: TravelDiaryPackage;
  className?: string;
  secondaryAction?: ReactNode;
  /** Identifiant visiteur pour générer un lien de partage public. */
  visitorId?: string | null;
  /** Expo filtrée (optionnelle) pour le lien de partage. */
  expoId?: string | null;
  /** Jeton de partage actif (préservé dans l'URL). */
  shareToken?: string | null;
  /** Barre partage / PDF sous le carnet. */
  showToolbar?: boolean;
  /** Synchronise la page courante dans l'URL. */
  syncUrl?: boolean;
};

function CrossTable({
  columns,
  rows,
  artworkHeader,
}: {
  columns: Array<{ id: string; label: string }>;
  rows: Array<{ artworkTitle: string; cells: Record<string, boolean> }>;
  artworkHeader: string;
}) {
  if (columns.length === 0 || rows.length === 0) return null;
  return (
    <div className="overflow-hidden">
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr>
            <th className="border border-neutral-300/80 bg-neutral-100/80 px-1 py-1 text-left font-semibold text-neutral-700">
              {artworkHeader}
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="border border-neutral-300/80 bg-neutral-100/80 px-1 py-1 text-center font-medium text-neutral-600"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.artworkTitle}>
              <td className="border border-neutral-300/60 px-1 py-1 text-neutral-800">{row.artworkTitle}</td>
              {columns.map((col) => (
                <td key={col.id} className="border border-neutral-300/60 px-1 py-1 text-center text-[#E63946]">
                  {row.cells[col.id] ? "✓" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DiaryNavContextValue = {
  activeIndex: number;
  slideCount: number;
  onPrev: () => void;
  onNext: () => void;
};

const DiaryNavContext = createContext<DiaryNavContextValue | null>(null);

function DiaryPageFooter() {
  const { t } = useTranslation("visitor");
  const nav = useContext(DiaryNavContext);

  return (
    <div className="travel-diary-page-footer shrink-0 pt-2">
      {nav && nav.slideCount > 1 ? (
        <div className="mb-1 flex items-center justify-center gap-2" aria-live="polite">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="travel-diary-export-hide h-7 w-7 border-neutral-400/40 bg-white/55 text-neutral-800 shadow-none hover:bg-white/75"
            onClick={nav.onPrev}
            disabled={nav.activeIndex <= 0}
            aria-label={t("diary.prev_page")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-neutral-600">
            {nav.activeIndex + 1} / {nav.slideCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="travel-diary-export-hide h-7 w-7 border-neutral-400/40 bg-white/55 text-neutral-800 shadow-none hover:bg-white/75"
            onClick={nav.onNext}
            disabled={nav.activeIndex >= nav.slideCount - 1}
            aria-label={t("diary.next_page")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      <p className="text-center text-[10px]">
        <a
          href={AIMEDIART_WEBSITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline underline-offset-2 transition-colors hover:text-blue-800"
        >
          AIMEDIArt.com
        </a>
      </p>
    </div>
  );
}

function CoverSponsorLogos({ logos }: { logos: string[] }) {
  if (logos.length === 0) return null;

  return (
    <div className="mb-2 flex w-full max-w-[360px] shrink-0 justify-center self-center">
      <div className="flex w-full flex-wrap justify-center gap-1.5 rounded-[7px] p-1.5">
        {logos.map((logoUrl, index) => (
          <div
            key={`${logoUrl}-${index}`}
            className="flex h-8 w-[calc((100%-1.5rem)/5)] max-w-[56px] items-center justify-center"
          >
            <img
              src={logoUrl}
              alt=""
              className="max-h-8 max-w-full object-contain"
              crossOrigin="anonymous"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CoverPage({ diary }: { diary: TravelDiaryPackage }) {
  const { t } = useTranslation("visitor");
  const { cover } = diary;
  const visitorName = [cover.visitorFirstName, cover.visitorLastName].filter(Boolean).join(" ").trim();

  return (
    <div className="travel-diary-page-inner flex h-full flex-col overflow-hidden px-4 py-4 text-center sm:px-6 sm:py-6">
      <AimediartBrandLogoBlock
        size="sm"
        href={AIMEDIART_WEBSITE_URL}
        className="mx-auto shrink-0 opacity-90"
      />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full flex-col items-center gap-4">
            {cover.expoName ? (
              <h2 className="font-serif text-xl font-bold text-neutral-900">{cover.expoName}</h2>
            ) : null}
            {cover.expoLogoUrl ? (
              <img
                src={cover.expoLogoUrl}
                alt={cover.expoName || t("diary.cover_expo_fallback")}
                className="max-h-24 max-w-[200px] object-contain"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">
                {t("diary.no_expo_logo")}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center space-y-2">
            <h1 className="travel-diary-cover-title-box grid place-content-center rounded-[7px] border border-black font-sans text-2xl font-bold leading-tight text-neutral-900">
              {t("diary.cover_title_line1")}
              <br />
              {t("diary.cover_title_line2")}
            </h1>
            <p className="font-serif text-lg font-semibold text-[#E63946]">{cover.visitDateLabel || "—"}</p>
            {visitorName ? (
              <p className="font-serif text-2xl font-bold italic text-neutral-900">{visitorName}</p>
            ) : null}
          </div>
        </div>
      </div>

      <CoverSponsorLogos logos={cover.sponsorLogoUrls} />
      <DiaryPageFooter />
    </div>
  );
}

function StatsPage({ diary, config }: { diary: TravelDiaryPackage; config: StatsPageConfig }) {
  const { t } = useTranslation("visitor");
  const { stats } = diary;
  const rankingSlice = stats.artworkRanking.slice(config.rankingFrom, config.rankingTo);

  return (
    <div className="travel-diary-page-inner flex h-full flex-col overflow-hidden px-4 py-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <h3 className="shrink-0 border-b border-[#E63946]/20 pb-2 text-center font-serif text-base font-bold text-[#E63946]">
          {t("diary.stats_title")}
        </h3>

        {config.showSummary ? (
          <div className="grid shrink-0 grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg border border-neutral-200/80 bg-white/50 px-2 py-2">
              <p className="text-[10px] uppercase text-neutral-500">{t("diary.stat_dominant_emotion")}</p>
              <p className="mt-1 font-semibold text-neutral-900">
                <span aria-hidden>{stats.dominantEmotionEmoji}</span> {stats.dominantEmotionLabel}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200/80 bg-white/50 px-2 py-2">
              <p className="text-[10px] uppercase text-neutral-500">{t("diary.stat_avg_hearts")}</p>
              <p className="mt-1 font-serif text-lg font-bold tabular-nums text-[#E63946]">{stats.averageHearts}</p>
            </div>
            <div className="rounded-lg border border-neutral-200/80 bg-white/50 px-2 py-2">
              <p className="text-[10px] uppercase text-neutral-500">{t("diary.stat_artworks")}</p>
              <p className="mt-1 font-serif text-lg font-bold tabular-nums text-neutral-900">{stats.artworksScanned}</p>
            </div>
            <div className="rounded-lg border border-neutral-200/80 bg-white/50 px-2 py-2">
              <p className="text-[10px] uppercase text-neutral-500">{t("diary.stat_duration")}</p>
              <p className="mt-1 font-semibold text-neutral-900">{stats.visitDurationLabel}</p>
            </div>
          </div>
        ) : null}

        {config.showEmotionCross ? (
          <div className="shrink-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
              {t("diary.cross_emotions_title")}
            </p>
            <CrossTable
              columns={stats.emotionColumns}
              rows={stats.emotionCrossRows}
              artworkHeader={t("diary.col_artwork")}
            />
          </div>
        ) : null}

        {config.showPersonaCross ? (
          <div className="shrink-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
              {t("diary.cross_personae_title")}
            </p>
            <CrossTable
              columns={stats.personaColumns}
              rows={stats.personaCrossRows}
              artworkHeader={t("diary.col_artwork")}
            />
          </div>
        ) : null}

        {rankingSlice.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
              {t("diary.ranking_title")}
            </p>
            <ol className="space-y-1 text-[10px]">
              {rankingSlice.map((row) => (
                <li
                  key={`${row.rank}-${row.artworkTitle}`}
                  className="flex items-center justify-between gap-2 rounded border border-neutral-200/60 bg-white/40 px-2 py-1"
                >
                  <span className="font-semibold text-[#E63946]">#{row.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-800">{row.artworkTitle}</span>
                  <span className="flex items-center gap-0.5 tabular-nums text-neutral-600">
                    <Heart className="h-3 w-3 fill-[#E63946] text-[#E63946]" aria-hidden />
                    {row.hearts}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
      <DiaryPageFooter />
    </div>
  );
}

const DIARY_ARTIST_PHOTO_CLASS = "h-[calc(var(--diary-h)*144/840)] w-[calc(var(--diary-h)*144/840)] max-h-36 max-w-36 shrink-0";

type DiarySlideDescriptor =
  | { kind: "cover" }
  | { kind: "stats"; statsPageIndex: number }
  | { kind: "section"; titleKey: "diary.section_artists" | "diary.section_artworks" }
  | { kind: "artist"; index: number; partIndex: number }
  | { kind: "artwork"; index: number; partIndex: number };

function buildDiarySlideDescriptors(diary: TravelDiaryPackage): DiarySlideDescriptor[] {
  const slides: DiarySlideDescriptor[] = [{ kind: "cover" }];

  buildStatsPageConfigs(diary.stats).forEach((_, statsPageIndex) => {
    slides.push({ kind: "stats", statsPageIndex });
  });

  if (diary.artistPages.length > 0) {
    slides.push({ kind: "section", titleKey: "diary.section_artists" });
    diary.artistPages.forEach((artist, index) => {
      buildArtistPageViews(artist).forEach((_, partIndex) => {
        slides.push({ kind: "artist", index, partIndex });
      });
    });
  }

  if (diary.artworkPages.length > 0) {
    slides.push({ kind: "section", titleKey: "diary.section_artworks" });
    diary.artworkPages.forEach((artwork, index) => {
      buildArtworkPageViews(artwork).forEach((_, partIndex) => {
        slides.push({ kind: "artwork", index, partIndex });
      });
    });
  }

  return slides;
}

function SectionDividerPage({ title }: { title: string }) {
  return (
    <div className="travel-diary-page-inner flex h-full flex-col overflow-hidden px-6 py-4">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white">
        <h2 className="text-center font-serif text-2xl font-bold text-neutral-900">{title}</h2>
      </div>
      <DiaryPageFooter />
    </div>
  );
}

function ArtistPage({
  page,
  partIndex,
}: {
  page: TravelDiaryPackage["artistPages"][number];
  partIndex: number;
}) {
  const { t } = useTranslation("visitor");
  const artistName = [page.firstName, page.lastName].filter(Boolean).join(" ").trim();
  const pageView = buildArtistPageViews(page)[partIndex] ?? buildArtistPageViews(page)[0];

  return (
    <div className="travel-diary-page-inner flex h-full flex-col overflow-hidden px-4 py-4">
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden">
        {pageView.showPortrait ? (
          <>
            {page.photoUrl ? (
              <img
                src={page.photoUrl}
                alt={artistName || t("diary.artist_fallback")}
                className={cn(DIARY_ARTIST_PHOTO_CLASS, "rounded-full border border-neutral-200/80 object-cover shadow-sm")}
                crossOrigin="anonymous"
              />
            ) : (
              <div
                className={cn(
                  DIARY_ARTIST_PHOTO_CLASS,
                  "flex items-center justify-center rounded-full border border-dashed border-neutral-300 text-xs text-neutral-400",
                )}
              >
                {t("diary.no_artist_photo")}
              </div>
            )}
            {artistName ? (
              <h3 className="mt-4 shrink-0 text-center font-serif text-xl font-bold text-neutral-900">{artistName}</h3>
            ) : null}
          </>
        ) : artistName ? (
          <h3 className="shrink-0 text-center font-serif text-sm font-semibold italic text-neutral-700">{artistName}</h3>
        ) : null}

        <div className="mt-4 min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-neutral-200/60 bg-white/50 px-3 py-2">
          {pageView.bioText ? (
            <p className="text-[11px] leading-relaxed text-neutral-800">{pageView.bioText}</p>
          ) : (
            <p className="text-[11px] italic leading-relaxed text-neutral-500">{t("diary.no_artist_bio")}</p>
          )}
        </div>
      </div>
      <DiaryPageFooter />
    </div>
  );
}

function ArtworkImageWatermark() {
  return <div className="travel-diary-artwork-watermark" aria-hidden />;
}

function ArtworkPage({
  page,
  partIndex,
}: {
  page: TravelDiaryPackage["artworkPages"][number];
  partIndex: number;
}) {
  const { t } = useTranslation("visitor");
  const view = buildArtworkPageViews(page)[0];

  return (
    <div className="travel-diary-page-inner flex h-full flex-col overflow-hidden px-4 py-4">
      {view.showImage ? (
        page.artworkImageUrl ? (
          <div className="travel-diary-artwork-frame relative mt-2 w-full overflow-hidden rounded-lg border border-neutral-200/80 shadow-sm">
            <img
              src={page.artworkImageUrl}
              alt={page.artworkTitle || t("artwork_no_title")}
              className="box-content h-full w-full rounded-[7px] object-cover"
              crossOrigin="anonymous"
            />
            <ArtworkImageWatermark />
          </div>
        ) : (
          <div className="travel-diary-artwork-frame mt-2 flex w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">
            {t("diary.no_image")}
          </div>
        )
      ) : null}

      {view.showTitle ? (
        <div className="-mt-px shrink-0 text-center">
          <h3 className="line-clamp-2 font-serif text-base font-bold leading-snug text-neutral-900">
            {page.artworkTitle || t("artwork_no_title")}
          </h3>
          {page.artistName ? <p className="text-sm italic text-neutral-600">{page.artistName}</p> : null}
        </div>
      ) : null}

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="travel-diary-mediation-block min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-200/60 bg-white/50 px-2 py-2">
          {page.mediationPersonaLabel ? (
            <p className="mb-1 shrink-0 text-[9px] font-semibold leading-tight text-neutral-800">
              {t("diary.mediation_guide_prefix")}
              {page.mediationPersonaIcon ? (
                <span className="mx-0.5" aria-hidden>
                  {page.mediationPersonaIcon}
                </span>
              ) : null}
              {page.mediationPersonaLabel}
            </p>
          ) : null}
          {view.mediationText ? (
            <VisitorMediationMarkdown
              text={view.mediationText}
              paperTone
              className="line-clamp-[7]"
            />
          ) : (
            <p className="text-[9px] italic leading-[12px] text-neutral-500">{t("mediation_text_missing")}</p>
          )}
        </div>

        <div className="travel-diary-comment-block mt-2 flex shrink-0 flex-col overflow-hidden rounded-md border border-black">
          <p className="shrink-0 border-b border-black bg-white px-2 py-0 text-[11px] font-semibold text-neutral-900">
            {t("diary.comment_block_title")}
          </p>
          <div className="overflow-hidden px-2 py-2">
            {view.commentText ? (
              <p className="line-clamp-4 text-[10px] italic leading-4 text-neutral-800">{view.commentText}</p>
            ) : (
              <p className="text-[11px] italic leading-4 text-neutral-400">{t("diary.comment_block_empty")}</p>
            )}
          </div>
        </div>

        {view.showEmotion ? (
          <div className="mt-1.5 shrink-0 border-t border-[#E63946]/15 pt-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <p className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-neutral-500">
                  {t("diary.felt_emotion")}
                </p>
                <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-neutral-900">
                  <span aria-hidden>{page.emotionEmoji}</span>
                  {page.emotionLabel}
                </p>
              </div>
              {page.heartRating > 0 ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Heart
                      key={i}
                      className={cn(
                        "h-3.5 w-3.5",
                        i < page.heartRating ? "fill-[#E63946] text-[#E63946]" : "text-neutral-300",
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            {page.communityInsight ? (
              page.communityInsight.isFirstVisitor ? (
                <p className="mt-1 text-left text-[10px] italic leading-snug text-neutral-500">
                  {t("diary.community_first", { emotion: page.communityInsight.emotionLabel })}
                </p>
              ) : page.communityInsight.sameEmotionPercentage > 0 ? (
                <p className="mt-1 text-left text-[10px] font-semibold italic text-neutral-500">
                  {t("diary.community_percentage_inline", {
                    percent: page.communityInsight.sameEmotionPercentage,
                  })}
                </p>
              ) : (
                <p className="mt-1 text-left text-[10px] italic leading-snug text-neutral-500">
                  {t("diary.community_no_same_emotion")}
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      <DiaryPageFooter />
    </div>
  );
}

export function TravelDiaryNotebook({
  diary,
  className = "",
  secondaryAction,
  visitorId = null,
  expoId = null,
  shareToken = null,
  showToolbar = true,
  syncUrl = true,
}: Props) {
  const { t } = useTranslation("visitor");
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeIndex, setActiveIndex] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sharingLink, setSharingLink] = useState(false);
  const flipBookRef = useRef<FlipBookHandle | null>(null);
  const bookHostRef = useRef<HTMLDivElement | null>(null);
  const [bookDims, setBookDims] = useState({ width: FLIPBOOK_WIDTH, height: FLIPBOOK_HEIGHT });

  useLayoutEffect(() => {
    const host = bookHostRef.current;
    if (!host) return;

    const syncDims = () => {
      const height = Math.round(host.clientHeight);
      const width = Math.round(host.clientWidth);
      if (height < 320 || width < 200) return;
      setBookDims((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    syncDims();
    const observer = new ResizeObserver(syncDims);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const slideDescriptors = buildDiarySlideDescriptors(diary);
  const statsPageConfigs = useMemo(() => buildStatsPageConfigs(diary.stats), [diary.stats]);
  const slideCount = slideDescriptors.length;

  const startPage = useMemo(() => {
    if (!syncUrl || shareToken?.trim()) return 0;
    return parseDiaryPageParam(searchParams.get("page"), slideCount);
  }, [searchParams, shareToken, slideCount, syncUrl]);

  const syncPageInUrl = useCallback(
    (pageIndex: number) => {
      if (!syncUrl) return;
      const next = new URLSearchParams(searchParams);
      if (shareToken?.trim()) {
        next.set("share", shareToken.trim());
        next.delete("expo_id");
        next.delete("visitor_id");
        next.delete("admin");
        next.delete("page");
      } else {
        next.set("page", String(pageIndex + 1));
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, syncUrl, shareToken],
  );

  const applyPageFlipPortraitBackPatch = useCallback((pageFlip?: PageFlipInstance) => {
    const instance = pageFlip ?? flipBookRef.current?.pageFlip();
    if (!instance) return;
    ensureStPageFlipPortraitBackPatch(instance);
  }, []);

  const handleFlip = useCallback(
    (event: { data: unknown }) => {
      const pageIndex = resolveFlipBookPageIndex(event.data);
      setActiveIndex(pageIndex);
      syncPageInUrl(pageIndex);
    },
    [syncPageInUrl],
  );

  const handleCopyShareUrl = useCallback(async () => {
    const ownerVisitorId = visitorId?.trim();
    if (!ownerVisitorId) {
      toast.error(t("diary.toolbar_share_failed"));
      return;
    }

    setSharingLink(true);
    try {
      const link = shareToken?.trim()
        ? { token: shareToken.trim(), expiresAt: "" }
        : await createTravelDiaryShareLink(ownerVisitorId, expoId);
      if (!link?.token) {
        toast.error(t("diary.toolbar_share_failed"));
        return;
      }

      const shareUrl = buildTravelDiaryShareUrl(link.token);
      const shareTitle = diary.cover.expoName?.trim() || t("diary.share_default_title");
      const shareNotice = t("diary.toolbar_share_public_notice");
      const shareText = `${t("diary.share_text")} — ${shareNotice}`;

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
          toast.success(shareNotice);
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") return;
        }
      }

      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("diary.toolbar_share_copied"));
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      toast.error(t("diary.toolbar_share_failed"));
    } finally {
      setSharingLink(false);
    }
  }, [diary.cover.expoName, expoId, shareToken, t, visitorId]);

  const handleDownloadPdf = useCallback(async () => {
    const host = bookHostRef.current;
    if (!host || exportingPdf) return;

    const sourcePages = Array.from(host.querySelectorAll<HTMLElement>(".travel-diary-flip-page"));
    if (sourcePages.length === 0) return;

    const visiblePage = sourcePages.find((page) => page.getBoundingClientRect().height > 0) ?? sourcePages[0];
    const { width: pageWidth, height: pageHeight } = visiblePage.getBoundingClientRect();

    setExportingPdf(true);
    let exportRoot: HTMLDivElement | null = null;
    try {
      const prepared = await prepareTravelDiaryExportPages(sourcePages, pageWidth, pageHeight);
      exportRoot = prepared.exportRoot;

      const visitorLabel = [diary.cover.visitorFirstName, diary.cover.visitorLastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      await exportTravelDiaryPdf(prepared.exportPages, travelDiaryPdfFilename(visitorLabel));
      toast.success(t("diary.toolbar_pdf_ready"));
    } catch {
      toast.error(t("diary.toolbar_pdf_failed"));
    } finally {
      exportRoot?.remove();
      setExportingPdf(false);
    }
  }, [diary.cover.visitorFirstName, diary.cover.visitorLastName, exportingPdf, t]);

  const renderSlide = (index: number) => {
    const slide = slideDescriptors[index];
    if (!slide) return null;

    switch (slide.kind) {
      case "cover":
        return <CoverPage diary={diary} />;
      case "stats": {
        const config = statsPageConfigs[slide.statsPageIndex];
        if (!config) return null;
        return <StatsPage diary={diary} config={config} />;
      }
      case "section":
        return <SectionDividerPage title={t(slide.titleKey)} />;
      case "artist":
        return (
          <ArtistPage
            page={diary.artistPages[slide.index]}
            partIndex={slide.partIndex}
          />
        );
      case "artwork":
        return (
          <ArtworkPage
            page={diary.artworkPages[slide.index]}
            partIndex={slide.partIndex}
          />
        );
      default:
        return null;
    }
  };

  const flipDiaryNext = useCallback(() => {
    const pageFlip = flipBookRef.current?.pageFlip();
    if (!pageFlip) return;
    if (pageFlip.getCurrentPageIndex() >= slideCount - 1) return;
    flipDiaryPageForward(pageFlip);
  }, [slideCount]);

  const flipDiaryPrev = useCallback(() => {
    const pageFlip = flipBookRef.current?.pageFlip();
    if (!pageFlip) return;
    if (pageFlip.getCurrentPageIndex() <= 0) return;
    ensureStPageFlipPortraitBackPatch(pageFlip);
    flipDiaryPageBack(pageFlip);
  }, []);

  const diaryNav = useMemo<DiaryNavContextValue>(
    () => ({
      activeIndex,
      slideCount,
      onPrev: flipDiaryPrev,
      onNext: flipDiaryNext,
    }),
    [activeIndex, flipDiaryNext, flipDiaryPrev, slideCount],
  );

  return (
    <DiaryNavContext.Provider value={diaryNav}>
    <div
      className={cn(
        "travel-diary-root flex flex-col gap-2 sm:gap-4",
        showToolbar && "travel-diary-root--with-toolbar",
        className,
      )}
    >
      <div className="travel-diary-notebook relative mx-auto w-full max-w-[416px]">
        <div className="travel-diary-spiral" aria-hidden />
        <div
          ref={bookHostRef}
          className="travel-diary-page travel-diary-flipbook-host overflow-hidden rounded-r-2xl shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
        >
          <HTMLFlipBook
            ref={flipBookRef}
            className="travel-diary-flipbook"
            width={bookDims.width}
            height={bookDims.height}
            size="stretch"
            minWidth={bookDims.width}
            maxWidth={bookDims.width}
            minHeight={bookDims.height}
            maxHeight={bookDims.height}
            showCover
            usePortrait
            mobileScrollSupport
            drawShadow
            useMouseEvents={false}
            showPageCorners={false}
            flippingTime={700}
            startPage={startPage}
            onFlip={handleFlip}
            onInit={(event) => {
              applyPageFlipPortraitBackPatch(event.object as PageFlipInstance);
              setActiveIndex(resolveFlipBookPageIndex(event.data));
            }}
            onUpdate={(event) => {
              applyPageFlipPortraitBackPatch(event.object as PageFlipInstance);
              setActiveIndex(resolveFlipBookPageIndex(event.data));
            }}
          >
            {slideDescriptors.map((slide, index) => (
              <div key={`${slide.kind}-${index}`} className="travel-diary-flip-page">
                {renderSlide(index)}
              </div>
            ))}
          </HTMLFlipBook>

          {slideCount > 1 ? (
            <div className="travel-diary-flip-edge-zones">
              <button
                type="button"
                className="travel-diary-flip-edge-zone travel-diary-flip-edge-zone--prev"
                aria-label={t("diary.prev_page")}
                disabled={activeIndex <= 0}
                onClick={flipDiaryPrev}
              />
              <button
                type="button"
                className="travel-diary-flip-edge-zone travel-diary-flip-edge-zone--next"
                aria-label={t("diary.next_page")}
                disabled={activeIndex >= slideCount - 1}
                onClick={flipDiaryNext}
              />
            </div>
          ) : null}
        </div>
      </div>

      {showToolbar ? (
      <div className="mx-auto flex w-full max-w-[416px] items-stretch gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-10 min-w-0 flex-1 flex-col gap-0.5 px-1 py-1.5 whitespace-normal border-white/20 bg-transparent text-[#F0F0F0] hover:bg-white/10"
          onClick={() => void handleCopyShareUrl()}
          disabled={sharingLink}
        >
          {sharingLink ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4 shrink-0" />
          )}
          <span className="w-full text-center text-[10px] leading-[1.2] line-clamp-2 sm:text-xs">
            {t("diary.toolbar_share")}
          </span>
        </Button>
        <Button
          type="button"
          className="h-auto min-h-10 min-w-0 flex-1 flex-col gap-0.5 px-1 py-1.5 whitespace-normal gradient-gold gradient-gold-hover-bg text-primary-foreground"
          onClick={() => void handleDownloadPdf()}
          disabled={exportingPdf}
        >
          {exportingPdf ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <Download className="h-4 w-4 shrink-0" />
          )}
          <span className="w-full text-center text-[10px] leading-[1.2] whitespace-pre-line line-clamp-2 sm:text-xs">
            {t("diary.toolbar_download_pdf")}
          </span>
        </Button>
        {secondaryAction}
      </div>
      ) : null}
    </div>
    </DiaryNavContext.Provider>
  );
}
