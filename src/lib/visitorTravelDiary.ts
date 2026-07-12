import { supabase } from "@/lib/supabase";
import {
  mediationTextForStyleCodeAndLang,
  normalizeMediationStyleKeyForLookup,
  primaryBlurbFromArtworkDescription,
  resolveMediationUiLang,
  type MediationUiLang,
} from "@/lib/artworkDescriptionI18n";
import {
  getEmotionDisplayLabel,
  loadEmotionCatalog,
  type ExpoEmotionCatalogRow,
} from "@/lib/expoEmotions";
import { rowCanonicalMediationStyle } from "@/lib/mediationVisitorStyles";
import { getStyleLabelFromDb, type PromptStyleLabelFields } from "@/lib/promptStyleLabel";
import { resolveExpoLogoImgSrc, expoLogoRawFromRow } from "@/lib/expoLogo";
import { resolveVisitorExpoIdForDiary } from "@/lib/visitorExpoVisit";
import { emotionEmojiForPreview } from "@/lib/statisticsEmotions";

export type EmotionCommunityInsight = {
  emotionId: string;
  emotionLabel: string;
  emotionEmoji: string;
  sameEmotionPercentage: number;
  othersTotal: number;
  sameEmotionCount: number;
  isFirstVisitor: boolean;
};

export type ExpoDiaryVisitorOption = {
  visitorId: string;
  label: string;
  isAnonymous: boolean;
  lastActivityAt: string | null;
};

export type TravelDiaryCover = {
  expoLogoUrl: string | null;
  expoName: string;
  visitDateLabel: string;
  visitorFirstName: string;
  visitorLastName: string;
  sponsorLogoUrls: string[];
};

export type TravelDiaryCrossColumn = { id: string; label: string };

export type TravelDiaryCrossRow = {
  artworkId: string;
  artworkTitle: string;
  cells: Record<string, boolean>;
};

export type TravelDiaryRankingRow = {
  rank: number;
  artworkTitle: string;
  hearts: number;
  emotionLabel: string;
};

function normalizeArtworkTitleKey(title: string): string {
  return title.trim() || "—";
}

/** Fusionne les lignes de tableaux croisés par titre d'œuvre (cases cochées en OU). */
function groupCrossRowsByArtworkTitle(rows: TravelDiaryCrossRow[]): TravelDiaryCrossRow[] {
  const byTitle = new Map<string, TravelDiaryCrossRow>();

  for (const row of rows) {
    const titleKey = normalizeArtworkTitleKey(row.artworkTitle);
    const existing = byTitle.get(titleKey);
    if (!existing) {
      byTitle.set(titleKey, {
        artworkId: row.artworkId,
        artworkTitle: titleKey,
        cells: { ...row.cells },
      });
      continue;
    }
    for (const [colId, checked] of Object.entries(row.cells)) {
      if (checked) existing.cells[colId] = true;
    }
  }

  return [...byTitle.values()].sort((a, b) => a.artworkTitle.localeCompare(b.artworkTitle));
}

/** Regroupe le classement par titre d'œuvre (meilleure note conservée). */
function groupRankingByArtworkTitle(rows: TravelDiaryRankingRow[]): TravelDiaryRankingRow[] {
  const byTitle = new Map<string, { hearts: number; emotionLabel: string }>();

  for (const row of rows) {
    const titleKey = normalizeArtworkTitleKey(row.artworkTitle);
    const existing = byTitle.get(titleKey);
    if (!existing || row.hearts > existing.hearts) {
      byTitle.set(titleKey, { hearts: row.hearts, emotionLabel: row.emotionLabel });
    }
  }

  return [...byTitle.entries()]
    .map(([artworkTitle, { hearts, emotionLabel }]) => ({
      rank: 0,
      artworkTitle,
      hearts,
      emotionLabel,
    }))
    .sort((a, b) => b.hearts - a.hearts || a.artworkTitle.localeCompare(b.artworkTitle))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export type TravelDiaryVisitStats = {
  dominantEmotionLabel: string;
  dominantEmotionEmoji: string;
  averageHearts: number;
  artworksScanned: number;
  visitDurationLabel: string;
  emotionColumns: TravelDiaryCrossColumn[];
  emotionCrossRows: TravelDiaryCrossRow[];
  personaColumns: TravelDiaryCrossColumn[];
  personaCrossRows: TravelDiaryCrossRow[];
  artworkRanking: TravelDiaryRankingRow[];
};

export type TravelDiaryArtistPage = {
  artistId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  bioText: string;
};

export type TravelDiaryArtworkPage = {
  feedbackId: string;
  artworkId: string;
  artworkTitle: string;
  artistName: string;
  artworkImageUrl: string | null;
  mediationText: string;
  mediationPersonaLabel: string;
  mediationPersonaIcon: string;
  emotionLabel: string;
  emotionEmoji: string;
  heartRating: number;
  submittedAt: string;
  commentText: string | null;
  communityInsight: EmotionCommunityInsight | null;
};

export type TravelDiaryPackage = {
  cover: TravelDiaryCover;
  stats: TravelDiaryVisitStats;
  artistPages: TravelDiaryArtistPage[];
  artworkPages: TravelDiaryArtworkPage[];
};

const EMPTY_DIARY_STATS: TravelDiaryVisitStats = {
  dominantEmotionLabel: "—",
  dominantEmotionEmoji: "",
  averageHearts: 0,
  artworksScanned: 0,
  visitDurationLabel: "—",
  emotionColumns: [],
  emotionCrossRows: [],
  personaColumns: [],
  personaCrossRows: [],
  artworkRanking: [],
};

/** Limite le carnet à la couverture, stats et N œuvres (aperçu fin de visite). */
export function sliceDiaryForPreview(diary: TravelDiaryPackage, maxArtworks = 3): TravelDiaryPackage {
  return {
    ...diary,
    artistPages: [],
    artworkPages: diary.artworkPages.slice(0, maxArtworks),
  };
}

/** Carnet générique (sans expo) — dernier recours pour l'aperçu. */
export function buildGenericDiaryPreviewShell(options: {
  lang?: string;
  visitorFirstName?: string;
  visitorLastName?: string;
}): TravelDiaryPackage {
  const lang = resolveMediationUiLang(options.lang ?? "fr");
  return {
    cover: {
      expoLogoUrl: null,
      expoName: "",
      visitDateLabel: new Date().toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }),
      visitorFirstName: options.visitorFirstName?.trim() || "",
      visitorLastName: options.visitorLastName?.trim() || "",
      sponsorLogoUrls: [],
    },
    stats: { ...EMPTY_DIARY_STATS },
    artistPages: [],
    artworkPages: [],
  };
}

/** Carnet minimal (couverture + stats vides) quand le visiteur n'a pas encore de feedback. */
export async function fetchExpoDiaryPreviewShell(options: {
  expoId?: string | null;
  lang?: string;
  visitorFirstName?: string;
  visitorLastName?: string;
}): Promise<TravelDiaryPackage> {
  const expoId = options.expoId?.trim() || "";
  const lang = resolveMediationUiLang(options.lang ?? "fr");
  const shellOpts = {
    lang,
    visitorFirstName: options.visitorFirstName,
    visitorLastName: options.visitorLastName,
  };

  if (!expoId) return buildGenericDiaryPreviewShell(shellOpts);

  try {
    const [{ data: expoData }, { data: sponsorRows }] = await Promise.all([
      supabase.from("expos").select("expo_name, logo_expo, logo2_expo").eq("id", expoId).maybeSingle(),
      supabase
        .from("sponsors")
        .select("url_logo_sponsor")
        .eq("id_expo", expoId)
        .not("url_logo_sponsor", "is", null)
        .order("created_at", { ascending: true }),
    ]);

    const expoRecord = (expoData ?? null) as Record<string, unknown> | null;
    const expoLogoRaw = expoRecord ? expoLogoRawFromRow(expoRecord) : null;
    const sponsorLogoUrls = ((sponsorRows ?? []) as Array<{ url_logo_sponsor?: string | null }>)
      .map((row) => asTrimmed(row.url_logo_sponsor))
      .filter(Boolean);

    return {
      cover: {
        expoLogoUrl: expoLogoRaw ? resolveExpoLogoImgSrc(expoLogoRaw) : null,
        expoName: asTrimmed(expoRecord?.expo_name) || "",
        visitDateLabel: new Date().toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" }),
        visitorFirstName: options.visitorFirstName?.trim() || "",
        visitorLastName: options.visitorLastName?.trim() || "",
        sponsorLogoUrls,
      },
      stats: { ...EMPTY_DIARY_STATS },
      artistPages: [],
      artworkPages: [],
    };
  } catch {
    return buildGenericDiaryPreviewShell(shellOpts);
  }
}

function mergeDiaryCoverNames(
  diary: TravelDiaryPackage,
  firstName: string,
  lastName: string,
): TravelDiaryPackage {
  return {
    ...diary,
    cover: {
      ...diary.cover,
      visitorFirstName: firstName || diary.cover.visitorFirstName,
      visitorLastName: lastName || diary.cover.visitorLastName,
    },
  };
}

/** Charge l'aperçu flipbook (couverture + stats + max N œuvres). */
export async function loadTravelDiaryPreviewPackage(options: {
  expoId?: string | null;
  visitorId?: string | null;
  lang?: string;
  visitorFirstName?: string;
  visitorLastName?: string;
  maxArtworks?: number;
}): Promise<TravelDiaryPackage> {
  const lang = resolveMediationUiLang(options.lang ?? "fr");
  const firstName = options.visitorFirstName?.trim() || "";
  const lastName = options.visitorLastName?.trim() || "";
  const visitorId = options.visitorId?.trim() || "";
  const maxArtworks = options.maxArtworks ?? 3;
  const loadOpts = { lang, visitorFirstName: firstName, visitorLastName: lastName };

  const effectiveExpoId = await resolveVisitorExpoIdForDiary({ hint: options.expoId, visitorId });

  if (visitorId) {
    if (effectiveExpoId) {
      const { diary } = await fetchVisitorTravelDiaryPackage(visitorId, { ...loadOpts, expoId: effectiveExpoId });
      if (diary) return sliceDiaryForPreview(mergeDiaryCoverNames(diary, firstName, lastName), maxArtworks);
    }

    const { diary } = await fetchVisitorTravelDiaryPackage(visitorId, loadOpts);
    if (diary) return sliceDiaryForPreview(mergeDiaryCoverNames(diary, firstName, lastName), maxArtworks);
  }

  return fetchExpoDiaryPreviewShell({ ...loadOpts, expoId: effectiveExpoId });
}

type FeedbackRow = {
  id?: number | string | null;
  artwork_id?: string | null;
  emotion_id?: string | null;
  heart_rating?: number | string | null;
  comment_text?: string | null;
  submitted_at?: string | null;
  expo_id?: string | null;
  visitor_id?: string | null;
  visit_id?: string | null;
};

/** Un seul feedback par œuvre (le plus récent), ordre de première rencontre conservé. */
function pickLatestFeedbackPerArtwork(rows: FeedbackRow[]): FeedbackRow[] {
  const latestByArtwork = new Map<string, FeedbackRow>();
  const firstSeenOrder: string[] = [];

  for (const row of rows) {
    const awId = asTrimmed(row.artwork_id);
    if (!awId) continue;

    if (!latestByArtwork.has(awId)) {
      firstSeenOrder.push(awId);
    }

    const existing = latestByArtwork.get(awId);
    const rowAt = asTrimmed(row.submitted_at);
    const existingAt = existing ? asTrimmed(existing.submitted_at) : "";
    if (!existing || rowAt.localeCompare(existingAt) >= 0) {
      latestByArtwork.set(awId, row);
    }
  }

  return firstSeenOrder
    .map((awId) => latestByArtwork.get(awId))
    .filter((row): row is FeedbackRow => row != null);
}

type ArtworkJoin = {
  artwork_id?: string | null;
  artwork_title?: string | null;
  artwork_photo_url?: string | null;
  artwork_image_url?: string | null;
  artwork_description_i18n?: unknown;
  artwork_artist_id?: string | null;
  artists?:
    | {
        artist_id?: string | null;
        artist_firstname?: string | null;
        artist_lastname?: string | null;
        artist_photo_url?: string | null;
      }
    | Array<{
        artist_id?: string | null;
        artist_firstname?: string | null;
        artist_lastname?: string | null;
        artist_photo_url?: string | null;
      }>;
};

type PromptStyleRow = PromptStyleLabelFields & {
  id?: string | number | null;
  code?: string | null;
  ordonnancement?: number | null;
  icon?: string | null;
};

function asTrimmed(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function parseHeartRating(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const parsed = Number.parseFloat(asTrimmed(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function emotionMeta(
  emotionId: string,
  catalog: ExpoEmotionCatalogRow[],
  lang: string,
): { label: string; emoji: string } {
  const row = catalog.find((e) => e.id === emotionId);
  if (!row) return { label: emotionId, emoji: "✨" };
  const label = getEmotionDisplayLabel(row, lang);
  const emoji = emotionEmojiForPreview(label, row.icone_emotion);
  return { label, emoji };
}

function resolveMediationForArtwork(
  artwork: ArtworkJoin | undefined,
  promptStyles: PromptStyleRow[],
  personaStyleId: string | null,
  lang: MediationUiLang,
): { text: string; personaLabel: string; personaId: string; personaIcon: string } {
  const raw = artwork?.artwork_description_i18n;
  const ordered = [...promptStyles].sort((a, b) => {
    const oa = typeof a.ordonnancement === "number" ? a.ordonnancement : 9999;
    const ob = typeof b.ordonnancement === "number" ? b.ordonnancement : 9999;
    if (oa !== ob) return oa - ob;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });

  const pickStyle = (row: PromptStyleRow) => {
    const canonical = rowCanonicalMediationStyle(row);
    const fromCode = normalizeMediationStyleKeyForLookup(row.code?.trim() ?? "");
    const jsonLookupKey = canonical ?? fromCode ?? "";
    const label = getStyleLabelFromDb(row, lang).trim() || jsonLookupKey;
    const text = jsonLookupKey ? mediationTextForStyleCodeAndLang(raw, jsonLookupKey, lang) : "";
    const sid = row.id != null ? String(row.id).trim() : jsonLookupKey;
    const personaIcon = asTrimmed(row.icon);
    return { text, personaLabel: label, personaId: sid, personaIcon };
  };

  const personaRow =
    personaStyleId != null
      ? ordered.find((r) => String(r.id ?? "").trim() === personaStyleId.trim())
      : undefined;

  if (personaRow) {
    const picked = pickStyle(personaRow);
    if (picked.text) return picked;
  }

  for (const row of ordered) {
    const picked = pickStyle(row);
    if (picked.text) return picked;
  }

  const blurb = primaryBlurbFromArtworkDescription(raw, lang);
  if (blurb) {
    const labelRow = personaRow ?? ordered[0];
    const picked = labelRow ? pickStyle(labelRow) : { personaLabel: "", personaId: "", personaIcon: "" };
    return {
      text: blurb,
      personaLabel: picked.personaLabel,
      personaId: picked.personaId,
      personaIcon: picked.personaIcon,
    };
  }

  if (personaRow) {
    const picked = pickStyle(personaRow);
    return { text: "", personaLabel: picked.personaLabel, personaId: picked.personaId, personaIcon: picked.personaIcon };
  }

  return { text: "", personaLabel: "", personaId: "", personaIcon: "" };
}

function formatDiaryDate(iso: string, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" });
}

function formatDurationMs(ms: number, lang: string): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) {
    return lang.startsWith("en")
      ? `${totalMin} min`
      : `${totalMin} min`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return lang.startsWith("en") ? `${h} h ${m} min` : `${h} h ${m} min`;
}

function resolveArtistBioText(
  bioByLang: Map<string, string>,
  lang: string,
): string {
  const normalized = lang.trim().toLowerCase().slice(0, 2);
  if (normalized && bioByLang.has(normalized)) return bioByLang.get(normalized) ?? "";
  if (bioByLang.has("fr")) return bioByLang.get("fr") ?? "";
  if (bioByLang.has("en")) return bioByLang.get("en") ?? "";
  const first = bioByLang.values().next().value;
  return typeof first === "string" ? first : "";
}

async function resolveVisitorPersonaStyleId(visitorId: string): Promise<string | null> {
  const vid = visitorId.trim();
  if (!vid) return null;

  const { data: byClient } = await supabase
    .from("visitors")
    .select("persona_defaut")
    .eq("visitor_client_id", vid)
    .maybeSingle();
  const fromClient = asTrimmed((byClient as { persona_defaut?: string | null } | null)?.persona_defaut);
  if (fromClient) return fromClient;

  const { data: byAuth } = await supabase
    .from("visitors")
    .select("persona_defaut")
    .eq("auth_user_id", vid)
    .maybeSingle();
  return asTrimmed((byAuth as { persona_defaut?: string | null } | null)?.persona_defaut) || null;
}

async function resolveVisitDurationLabel(
  visitorId: string,
  expoId: string | null,
  feedbackRows: FeedbackRow[],
  lang: string,
): Promise<string> {
  const timestamps = feedbackRows
    .map((r) => asTrimmed(r.submitted_at))
    .filter(Boolean)
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t));

  const visitId = feedbackRows.map((r) => asTrimmed(r.visit_id)).find(Boolean) ?? null;
  if (visitId) {
    const { data: visitRow } = await supabase
      .from("visitor_expo_visits")
      .select("entered_at, ended_at, last_activity_at")
      .eq("id", visitId)
      .maybeSingle();
    const entered = asTrimmed((visitRow as { entered_at?: string } | null)?.entered_at);
    const ended =
      asTrimmed((visitRow as { ended_at?: string } | null)?.ended_at) ||
      asTrimmed((visitRow as { last_activity_at?: string } | null)?.last_activity_at);
    if (entered && ended) {
      const ms = new Date(ended).getTime() - new Date(entered).getTime();
      if (Number.isFinite(ms) && ms > 0) return formatDurationMs(ms, lang);
    }
  }

  if (timestamps.length >= 2) {
    const ms = Math.max(...timestamps) - Math.min(...timestamps);
    return formatDurationMs(ms, lang);
  }
  if (timestamps.length === 1) return formatDurationMs(60_000, lang);
  return "—";
}

/** Visiteurs ayant laissé un feedback sur une expo (admin). */
export async function fetchExpoDiaryVisitors(
  expoId: string,
): Promise<{ visitors: ExpoDiaryVisitorOption[]; error: string | null }> {
  const id = expoId.trim();
  if (!id) return { visitors: [], error: "missing-expo-id" };

  const { data, error } = await supabase
    .from("visitor_feedback")
    .select("visitor_id, submitted_at")
    .eq("expo_id", id)
    .order("submitted_at", { ascending: false });

  if (error) return { visitors: [], error: error.message };

  const byVisitor = new Map<string, string>();
  for (const row of (data ?? []) as FeedbackRow[]) {
    const vid = asTrimmed(row.visitor_id);
    if (!vid || byVisitor.has(vid)) continue;
    byVisitor.set(vid, asTrimmed(row.submitted_at));
  }

  const visitorIds = [...byVisitor.keys()];
  if (visitorIds.length === 0) return { visitors: [], error: null };

  const [{ data: anonRows }, { data: profiles }] = await Promise.all([
    supabase.from("visitors").select("visitor_client_id, auth_user_id, visitor_pseudo").in("visitor_client_id", visitorIds),
    supabase.from("profiles").select("id, first_name, last_name").in("id", visitorIds),
  ]);

  const pseudoByClientId = new Map<string, string>();
  for (const row of (anonRows ?? []) as Array<{ visitor_client_id?: string; visitor_pseudo?: string }>) {
    const cid = asTrimmed(row.visitor_client_id);
    const pseudo = asTrimmed(row.visitor_pseudo);
    if (cid && pseudo) pseudoByClientId.set(cid, pseudo);
  }

  const nameByAuthId = new Map<string, string>();
  for (const row of (profiles ?? []) as Array<{ id?: string; first_name?: string; last_name?: string }>) {
    const pid = asTrimmed(row.id);
    const name = [row.first_name, row.last_name].map((p) => asTrimmed(p)).filter(Boolean).join(" ");
    if (pid && name) nameByAuthId.set(pid, name);
  }

  const visitors: ExpoDiaryVisitorOption[] = visitorIds.map((visitorId) => {
    const profileName = nameByAuthId.get(visitorId);
    const pseudo = pseudoByClientId.get(visitorId);
    const isAnonymous = !profileName;
    const label = profileName || pseudo || visitorId.slice(0, 8);
    return {
      visitorId,
      label,
      isAnonymous,
      lastActivityAt: byVisitor.get(visitorId) ?? null,
    };
  });

  visitors.sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
  return { visitors, error: null };
}

export async function fetchArtworkEmotionCommunityInsight(
  artworkId: string,
  userEmotionId: string,
  currentVisitorId: string | null,
  lang: string,
): Promise<EmotionCommunityInsight | null> {
  const { data, error } = await supabase
    .from("visitor_feedback")
    .select("emotion_id, visitor_id")
    .eq("artwork_id", artworkId.trim());

  if (error) return null;

  const catalog = await loadEmotionCatalog();
  const emotionId = userEmotionId.trim();
  const { label, emoji } = emotionMeta(emotionId, catalog, lang);

  let othersTotal = 0;
  let sameAmongOthers = 0;

  for (const row of (data ?? []) as FeedbackRow[]) {
    const rowEmotion = asTrimmed(row.emotion_id);
    if (!rowEmotion) continue;
    const rowVisitor = asTrimmed(row.visitor_id);
    if (currentVisitorId && rowVisitor === currentVisitorId) continue;
    othersTotal += 1;
    if (rowEmotion === emotionId) sameAmongOthers += 1;
  }

  const totalForPct = othersTotal > 0 ? othersTotal : (data ?? []).length;
  const sameForPct =
    othersTotal > 0
      ? sameAmongOthers
      : (data ?? []).filter((r) => asTrimmed((r as FeedbackRow).emotion_id) === emotionId).length;

  return {
    emotionId,
    emotionLabel: label,
    emotionEmoji: emoji,
    sameEmotionPercentage: totalForPct > 0 ? Math.round((sameForPct / totalForPct) * 100) : 0,
    othersTotal,
    sameEmotionCount: sameAmongOthers,
    isFirstVisitor: othersTotal === 0,
  };
}

export async function fetchVisitorTravelDiaryPackage(
  visitorId: string,
  options?: {
    expoId?: string | null;
    lang?: string;
    visitorFirstName?: string;
    visitorLastName?: string;
    shareToken?: string | null;
  },
): Promise<{ diary: TravelDiaryPackage | null; error: string | null; ownerVisitorId: string | null }> {
  const vid = visitorId.trim();
  if (!vid) return { diary: null, error: "missing-visitor-id", ownerVisitorId: null };

  const lang = resolveMediationUiLang(options?.lang ?? "fr");
  const expoFilter = options?.expoId?.trim() || null;
  const shareToken = options?.shareToken?.trim() || null;

  let feedbackData: FeedbackRow[] | null = null;
  let feedbackError: { message: string } | null = null;

  if (shareToken) {
    const { data, error } = await supabase.rpc("get_visitor_feedback_for_share", {
      p_token: shareToken,
    });
    feedbackData = (data as FeedbackRow[] | null) ?? null;
    feedbackError = error;
  } else {
    let query = supabase
      .from("visitor_feedback")
      .select("id, artwork_id, emotion_id, heart_rating, comment_text, submitted_at, expo_id, visitor_id, visit_id")
      .eq("visitor_id", vid)
      .order("submitted_at", { ascending: true })
      .limit(80);

    if (expoFilter) query = query.eq("expo_id", expoFilter);

    const result = await query;
    feedbackData = (result.data as FeedbackRow[] | null) ?? null;
    feedbackError = result.error;
  }

  if (feedbackError) return { diary: null, error: feedbackError.message, ownerVisitorId: null };

  let feedbackRows = feedbackData ?? [];
  if (expoFilter) {
    feedbackRows = feedbackRows.filter((row) => asTrimmed(row.expo_id) === expoFilter);
  }
  if (feedbackRows.length === 0) return { diary: null, error: null, ownerVisitorId: null };

  const ownerVisitorId = asTrimmed(feedbackRows[0]?.visitor_id) || vid;

  const uniqueFeedbackRows = pickLatestFeedbackPerArtwork(feedbackRows);

  const artworkIds = [...new Set(uniqueFeedbackRows.map((r) => asTrimmed(r.artwork_id)).filter(Boolean))];
  const resolvedExpoId = expoFilter || asTrimmed(feedbackRows[feedbackRows.length - 1]?.expo_id) || null;

  const [
    catalog,
    personaStyleId,
    { data: artworkData },
    expoRow,
    { data: promptStylesData },
    durationLabel,
    { data: sponsorRows },
  ] = await Promise.all([
    loadEmotionCatalog(),
    resolveVisitorPersonaStyleId(vid),
    supabase
      .from("artworks")
      .select(
        "artwork_id, artwork_title, artwork_photo_url, artwork_image_url, artwork_description_i18n, artwork_artist_id, artists!left(artist_id, artist_firstname, artist_lastname, artist_photo_url)",
      )
      .in("artwork_id", artworkIds),
    resolvedExpoId
      ? supabase.from("expos").select("expo_name, logo_expo, logo2_expo").eq("id", resolvedExpoId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("prompt_style").select("id, code, name_fr, name_en, name_de, name_es, name_it, ordonnancement, icon"),
    resolveVisitDurationLabel(vid, resolvedExpoId, feedbackRows, lang),
    resolvedExpoId
      ? supabase
          .from("sponsors")
          .select("url_logo_sponsor")
          .eq("id_expo", resolvedExpoId)
          .not("url_logo_sponsor", "is", null)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: null }),
  ]);

  const promptStyles = ((promptStylesData ?? []) as PromptStyleRow[]).filter((r) => r.id != null);
  const artworkById = new Map<string, ArtworkJoin>();
  for (const row of (artworkData ?? []) as ArtworkJoin[]) {
    const id = asTrimmed(row.artwork_id);
    if (id) artworkById.set(id, row);
  }

  const visitDateIso =
    asTrimmed(feedbackRows[feedbackRows.length - 1]?.submitted_at) ||
    asTrimmed(feedbackRows[0]?.submitted_at);
  const expoRecord = (expoRow?.data ?? null) as Record<string, unknown> | null;
  const expoLogoRaw = expoRecord ? expoLogoRawFromRow(expoRecord) : null;

  const sponsorLogoUrls = ((sponsorRows ?? []) as Array<{ url_logo_sponsor?: string | null }>)
    .map((row) => asTrimmed(row.url_logo_sponsor))
    .filter(Boolean);

  const cover: TravelDiaryCover = {
    expoLogoUrl: expoLogoRaw ? resolveExpoLogoImgSrc(expoLogoRaw) : null,
    expoName: asTrimmed(expoRecord?.expo_name) || "",
    visitDateLabel: formatDiaryDate(visitDateIso, lang),
    visitorFirstName: options?.visitorFirstName?.trim() || "",
    visitorLastName: options?.visitorLastName?.trim() || "",
    sponsorLogoUrls,
  };

  const emotionCounts = new Map<string, number>();
  let heartSum = 0;
  const emotionIdsUsed = new Set<string>();
  const personaIdsUsed = new Map<string, string>();

  const artworkPages: TravelDiaryArtworkPage[] = uniqueFeedbackRows.map((fb, index) => {
    const awId = asTrimmed(fb.artwork_id);
    const aw = artworkById.get(awId);
    const artistJoin = Array.isArray(aw?.artists) ? aw?.artists[0] : aw?.artists;
    const artistName = [artistJoin?.artist_firstname, artistJoin?.artist_lastname]
      .map((p) => asTrimmed(p))
      .filter(Boolean)
      .join(" ");
    const emId = asTrimmed(fb.emotion_id);
    const { label, emoji } = emotionMeta(emId, catalog, lang);
    const hearts = parseHeartRating(fb.heart_rating);
    heartSum += hearts;
    emotionCounts.set(emId, (emotionCounts.get(emId) ?? 0) + 1);
    emotionIdsUsed.add(emId);

    const mediation = resolveMediationForArtwork(aw, promptStyles, personaStyleId, lang);
    if (mediation.personaId) {
      personaIdsUsed.set(mediation.personaId, mediation.personaLabel);
    }

    const imageUrl = asTrimmed(aw?.artwork_photo_url) || asTrimmed(aw?.artwork_image_url) || null;

    return {
      feedbackId: asTrimmed(fb.id) || `${awId}-${index}`,
      artworkId: awId,
      artworkTitle: asTrimmed(aw?.artwork_title) || "",
      artistName,
      artworkImageUrl: imageUrl,
      mediationText: mediation.text,
      mediationPersonaLabel: mediation.personaLabel,
      mediationPersonaIcon: mediation.personaIcon,
      emotionLabel: label,
      emotionEmoji: emoji,
      heartRating: hearts,
      submittedAt: asTrimmed(fb.submitted_at),
      commentText: asTrimmed(fb.comment_text) || null,
    };
  });

  let dominantEmotionId = "";
  let dominantCount = 0;
  for (const [id, count] of emotionCounts.entries()) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantEmotionId = id;
    }
  }
  const dominantMeta = emotionMeta(dominantEmotionId, catalog, lang);

  const emotionColumns: TravelDiaryCrossColumn[] = [...emotionIdsUsed].map((id) => {
    const meta = emotionMeta(id, catalog, lang);
    return { id, label: meta.label };
  });

  const personaColumns: TravelDiaryCrossColumn[] = [...personaIdsUsed.entries()].map(([id, label]) => ({
    id,
    label,
  }));

  const emotionCrossRows = groupCrossRowsByArtworkTitle(
    uniqueFeedbackRows.map((fb) => {
      const awId = asTrimmed(fb.artwork_id);
      const aw = artworkById.get(awId);
      const emId = asTrimmed(fb.emotion_id);
      const cells: Record<string, boolean> = {};
      for (const col of emotionColumns) {
        cells[col.id] = col.id === emId;
      }
      return { artworkId: awId, artworkTitle: asTrimmed(aw?.artwork_title) || "", cells };
    }),
  );

  const personaCrossRows = groupCrossRowsByArtworkTitle(
    artworkPages.map((page) => {
      const cells: Record<string, boolean> = {};
      for (const col of personaColumns) {
        cells[col.id] = col.id === personaStyleId || col.label === page.mediationPersonaLabel;
      }
      return { artworkId: page.artworkId, artworkTitle: page.artworkTitle, cells };
    }),
  );

  const ranked = groupRankingByArtworkTitle(
    [...artworkPages]
      .sort((a, b) => b.heartRating - a.heartRating || a.artworkTitle.localeCompare(b.artworkTitle))
      .map((page, index) => ({
        rank: index + 1,
        artworkTitle: page.artworkTitle,
        hearts: page.heartRating,
        emotionLabel: page.emotionLabel,
      })),
  );

  const artistOrder: string[] = [];
  const artistMetaByKey = new Map<
    string,
    { artistId: string; firstName: string; lastName: string; photoUrl: string | null }
  >();

  for (const page of artworkPages) {
    const aw = artworkById.get(page.artworkId);
    const artistJoin = Array.isArray(aw?.artists) ? aw?.artists[0] : aw?.artists;
    const artistId = asTrimmed(aw?.artwork_artist_id) || asTrimmed(artistJoin?.artist_id);
    const firstName = asTrimmed(artistJoin?.artist_firstname);
    const lastName = asTrimmed(artistJoin?.artist_lastname);
    const artistKey = artistId || `name:${firstName}|${lastName}`;
    if ((!artistId && !firstName && !lastName) || !artistKey || artistMetaByKey.has(artistKey)) continue;

    artistOrder.push(artistKey);
    artistMetaByKey.set(artistKey, {
      artistId: artistId || artistKey,
      firstName,
      lastName,
      photoUrl: asTrimmed(artistJoin?.artist_photo_url) || null,
    });
  }

  const artistIdsForBio = [...artistMetaByKey.values()]
    .map((artist) => artist.artistId)
    .filter((id) => id && !id.startsWith("name:"));

  const bioTextByArtistId = new Map<string, Map<string, string>>();
  if (artistIdsForBio.length > 0) {
    const { data: artistBioRows } = await supabase
      .from("artist_bios")
      .select("artist_id, language, bio_text")
      .in("artist_id", artistIdsForBio);

    for (const row of (artistBioRows ?? []) as Array<{
      artist_id?: string | null;
      language?: string | null;
      bio_text?: string | null;
    }>) {
      const aid = asTrimmed(row.artist_id);
      const bioLang = asTrimmed(row.language).toLowerCase().slice(0, 2);
      const bioText = asTrimmed(row.bio_text);
      if (!aid || !bioLang || !bioText) continue;
      const bucket = bioTextByArtistId.get(aid) ?? new Map<string, string>();
      bucket.set(bioLang, bioText);
      bioTextByArtistId.set(aid, bucket);
    }
  }

  const artistPages: TravelDiaryArtistPage[] = artistOrder.map((artistKey) => {
    const meta = artistMetaByKey.get(artistKey)!;
    const bioByLang = bioTextByArtistId.get(meta.artistId) ?? new Map<string, string>();
    return {
      artistId: meta.artistId,
      firstName: meta.firstName,
      lastName: meta.lastName,
      photoUrl: meta.photoUrl,
      bioText: resolveArtistBioText(bioByLang, lang),
    };
  });

  const enrichedArtworkPages: TravelDiaryArtworkPage[] = await Promise.all(
    artworkPages.map(async (page) => {
      const fb = uniqueFeedbackRows.find((r) => asTrimmed(r.artwork_id) === page.artworkId);
      const emId = asTrimmed(fb?.emotion_id);
      const communityInsight = emId
        ? await fetchArtworkEmotionCommunityInsight(page.artworkId, emId, vid, lang)
        : null;
      return { ...page, communityInsight };
    }),
  );

  const stats: TravelDiaryVisitStats = {
    dominantEmotionLabel: dominantMeta.label,
    dominantEmotionEmoji: dominantMeta.emoji,
    averageHearts: artworkPages.length > 0 ? Math.round((heartSum / artworkPages.length) * 10) / 10 : 0,
    artworksScanned: artworkPages.length,
    visitDurationLabel: durationLabel,
    emotionColumns,
    emotionCrossRows,
    personaColumns,
    personaCrossRows,
    artworkRanking: ranked,
  };

  return {
    diary: { cover, stats, artistPages, artworkPages: enrichedArtworkPages },
    error: null,
    ownerVisitorId,
  };
}

/** @deprecated Utiliser fetchVisitorTravelDiaryPackage */
export async function fetchVisitorTravelDiary(
  visitorId: string,
  options?: { expoId?: string | null; lang?: string },
) {
  const { diary, error } = await fetchVisitorTravelDiaryPackage(visitorId, options);
  if (error || !diary) return { entries: [], error };
  const entries = diary.artworkPages.map((p) => ({
    feedbackId: p.feedbackId,
    artworkId: p.artworkId,
    artworkTitle: p.artworkTitle,
    artworkImageUrl: p.artworkImageUrl,
    artistName: p.artistName,
    emotionId: "",
    emotionLabel: p.emotionLabel,
    emotionEmoji: p.emotionEmoji,
    heartRating: p.heartRating,
    commentText: null as string | null,
    submittedAt: p.submittedAt,
    expoId: options?.expoId ?? null,
    communityInsight: null,
  }));
  return { entries, error: null };
}
