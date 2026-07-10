import type {
  TravelDiaryArtistPage,
  TravelDiaryArtworkPage,
  TravelDiaryVisitStats,
} from "@/lib/visitorTravelDiary";

/** Découpe un texte long en morceaux sans ascenseur (pages carnet). */
export function chunkTextByLength(text: string, maxChars: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  const paragraphs = normalized.split(/\n\n+/);
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) {
      chunks.push(buffer.trim());
      buffer = "";
    }
  };

  const splitLongParagraph = (para: string) => {
    const sentences = para.split(/(?<=[.!?…])\s+/);
    let part = "";
    for (const sentence of sentences) {
      const candidate = part ? `${part} ${sentence}` : sentence;
      if (candidate.length <= maxChars) {
        part = candidate;
        continue;
      }
      if (part) chunks.push(part);
      if (sentence.length <= maxChars) {
        part = sentence;
      } else {
        for (let i = 0; i < sentence.length; i += maxChars) {
          chunks.push(sentence.slice(i, i + maxChars));
        }
        part = "";
      }
    }
    if (part) chunks.push(part);
  };

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      continue;
    }
    flush();
    if (para.length <= maxChars) {
      buffer = para;
    } else {
      splitLongParagraph(para);
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [normalized];
}

export type StatsPageConfig = {
  showSummary: boolean;
  showEmotionCross: boolean;
  showPersonaCross: boolean;
  rankingFrom: number;
  rankingTo: number;
};

const RANKING_ROWS_PER_PAGE = 8;

export function buildStatsPageConfigs(stats: TravelDiaryVisitStats): StatsPageConfig[] {
  const pages: StatsPageConfig[] = [
    {
      showSummary: true,
      showEmotionCross: false,
      showPersonaCross: false,
      rankingFrom: 0,
      rankingTo: 0,
    },
  ];

  if (stats.emotionColumns.length > 0 && stats.emotionCrossRows.length > 0) {
    pages.push({
      showSummary: false,
      showEmotionCross: true,
      showPersonaCross: false,
      rankingFrom: 0,
      rankingTo: 0,
    });
  }

  if (stats.personaColumns.length > 0 && stats.personaCrossRows.length > 0) {
    pages.push({
      showSummary: false,
      showEmotionCross: false,
      showPersonaCross: true,
      rankingFrom: 0,
      rankingTo: 0,
    });
  }

  const ranking = stats.artworkRanking;
  for (let i = 0; i < ranking.length; i += RANKING_ROWS_PER_PAGE) {
    pages.push({
      showSummary: false,
      showEmotionCross: false,
      showPersonaCross: false,
      rankingFrom: i,
      rankingTo: Math.min(i + RANKING_ROWS_PER_PAGE, ranking.length),
    });
  }

  return pages;
}

export type ArtistPageView = {
  bioText: string;
  showPortrait: boolean;
};

const ARTIST_BIO_CHARS_PER_PAGE = 700;

export function buildArtistPageViews(artist: TravelDiaryArtistPage): ArtistPageView[] {
  const bioChunks = chunkTextByLength(artist.bioText, ARTIST_BIO_CHARS_PER_PAGE);
  if (bioChunks.length === 0) {
    return [{ bioText: "", showPortrait: true }];
  }
  return bioChunks.map((bioText, index) => ({
    bioText,
    showPortrait: index === 0,
  }));
}

export type ArtworkPageView = {
  showImage: boolean;
  showTitle: boolean;
  mediationText: string | null;
  commentText: string | null;
  showEmotion: boolean;
};

/** 1 œuvre = 1 page flipbook (pas de découpage médiation). */
export function buildArtworkPageViews(page: TravelDiaryArtworkPage): ArtworkPageView[] {
  return [
    {
      showImage: true,
      showTitle: true,
      mediationText: page.mediationText?.trim() || null,
      commentText: page.commentText?.trim() || null,
      showEmotion: true,
    },
  ];
}
