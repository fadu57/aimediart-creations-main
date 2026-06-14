import { supabase } from "@/lib/supabase";

export type AudioTextType = "bio" | "mediation";
export type AudioGender = "F" | "M";
export type AudioFileStatus = "pending" | "generating" | "ready" | "error";

export type AudioFile = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  text_id: string;
  text_type: AudioTextType;
  lang: string;
  prompt_style_id: string;
  voice_id: string | null;
  gender: AudioGender;
  storage_path: string | null;
  duration_sec: number | null;
  file_size_bytes: number | null;
  provider: string | null;
  model: string | null;
  input_chars: number | null;
  input_tokens: number | null;
  cost_usd: number | null;
  status: AudioFileStatus;
  error_message: string | null;
};

const AUDIO_BUCKET = "audio-guides";
const SIGNED_URL_TTL_SEC = 3600;
/** Appels parallèles vers generate-audio (16 voix/langue ≈ 3–4 vagues à 5). */
const AUDIO_GEN_CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(import.meta.env.VITE_AUDIO_GEN_CONCURRENCY) || 5),
);
const STALE_GENERATING_MS = 3 * 60 * 1000;
const INVOKE_TIMEOUT_MS = 120_000;
const CANCELLED_ERROR_MSG = "Génération annulée — relancez si besoin.";

function normLangCode(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 2);
}

type AudioGenJob = {
  text_id: string;
  text_type: AudioTextType;
  lang: string;
  prompt_style_id: string;
  gender: AudioGender;
  model?: string;
  /** Clé JSON persona (enfant, poetique, …) — fiabilise l'extraction côté Edge Function. */
  mediation_style_key?: string;
};

type QueuedAudioGenJob = AudioGenJob & {
  resolve: () => void;
  reject: (reason?: unknown) => void;
  /** Compteur client déjà décrémenté à l'annulation (évite double décrément au finally). */
  cancelled?: boolean;
};

const audioJobQueue: QueuedAudioGenJob[] = [];
const runningAudioJobs = new Set<QueuedAudioGenJob>();
let audioJobsRunning = 0;
const pendingJobsByLang = new Map<string, number>();
/** File + invocations en cours, par œuvre × langue × style vocal. */
const pendingJobsByScope = new Map<string, number>();
/** Invokes Edge encore actifs mais annulés côté UI — réécriture en erreur à la fin. */
const cancelledAudioScopes = new Set<string>();
const queueListeners = new Set<() => void>();

function jobScopeKey(job: Pick<AudioGenJob, "text_id" | "lang" | "prompt_style_id">): string {
  return `${job.text_id.trim()}|${normLangCode(job.lang)}|${job.prompt_style_id.trim()}`;
}

type AudioJobFilter = {
  text_id?: string;
  lang?: string;
  prompt_style_id?: string;
};

function audioJobMatchesFilter(job: AudioGenJob, filter?: AudioJobFilter): boolean {
  if (!filter) return true;
  if (filter.text_id?.trim() && job.text_id.trim() !== filter.text_id.trim()) return false;
  if (filter.lang && normLangCode(job.lang) !== normLangCode(filter.lang)) return false;
  if (filter.prompt_style_id?.trim() && job.prompt_style_id.trim() !== filter.prompt_style_id.trim()) {
    return false;
  }
  return true;
}

function notifyAudioQueue(): void {
  queueListeners.forEach((fn) => fn());
}

/** Abonnement aux changements de la file de génération audio. */
export function subscribeAudioQueue(listener: () => void): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

/** Jobs encore en file ou en cours d'exécution, par code langue. */
export function getPendingAudioJobsByLang(): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [k, v] of pendingJobsByLang) {
    if (v > 0) out[k] = v;
  }
  return out;
}

/** Jobs en file ou en cours pour une œuvre, clé UI `${lang}|${prompt_style_id}`. */
export function getPendingAudioJobsByCell(text_id: string): Readonly<Record<string, number>> {
  const prefix = `${text_id.trim()}|`;
  const out: Record<string, number> = {};
  for (const [scopeKey, count] of pendingJobsByScope) {
    if (count <= 0 || !scopeKey.startsWith(prefix)) continue;
    const [, lang, promptStyleId] = scopeKey.split("|");
    if (!lang || !promptStyleId) continue;
    out[audioVoiceCellKey(lang, promptStyleId)] = count;
  }
  return out;
}

export function hasPendingAudioForArtwork(text_id: string): boolean {
  const id = text_id.trim();
  if (!id) return false;
  const prefix = `${id}|`;
  for (const [scopeKey, count] of pendingJobsByScope) {
    if (count > 0 && scopeKey.startsWith(prefix)) return true;
  }
  return false;
}

/** Œuvres avec au moins un job audio en file ou en cours d'invocation. */
export function getArtworkIdsWithPendingAudio(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [scopeKey, count] of pendingJobsByScope) {
    if (count <= 0) continue;
    const artworkId = scopeKey.split("|")[0]?.trim();
    if (artworkId) ids.add(artworkId);
  }
  return ids;
}

function bumpMapCount(map: Map<string, number>, key: string, delta: number): void {
  const next = (map.get(key) ?? 0) + delta;
  if (next <= 0) map.delete(key);
  else map.set(key, next);
}

function bumpPendingForJob(job: AudioGenJob, delta: number): void {
  bumpMapCount(pendingJobsByScope, jobScopeKey(job), delta);
  bumpMapCount(pendingJobsByLang, normLangCode(job.lang), delta);
  notifyAudioQueue();
}

function markJobCancelled(job: QueuedAudioGenJob, isRunning: boolean): void {
  if (job.cancelled) return;
  job.cancelled = true;
  bumpPendingForJob(job, -1);
  if (isRunning) {
    cancelledAudioScopes.add(jobScopeKey(job));
  }
}

/**
 * Retire les jobs correspondant au filtre (file + invocations déjà lancées).
 * Les appels Edge en cours ne sont pas interrompus côté réseau ; l'UI se met à jour tout de suite.
 */
export function clearAudioGenerationJobs(filter?: AudioJobFilter): number {
  let removed = 0;
  const kept: QueuedAudioGenJob[] = [];

  for (const job of audioJobQueue) {
    if (!audioJobMatchesFilter(job, filter)) {
      kept.push(job);
      continue;
    }
    removed += 1;
    markJobCancelled(job, false);
    job.reject(new Error(CANCELLED_ERROR_MSG));
  }

  audioJobQueue.length = 0;
  audioJobQueue.push(...kept);

  for (const job of runningAudioJobs) {
    if (!audioJobMatchesFilter(job, filter)) continue;
    removed += 1;
    markJobCancelled(job, true);
  }

  notifyAudioQueue();
  return removed;
}

/** @deprecated Préférer `clearAudioGenerationJobs({ lang })`. */
export function clearAudioGenerationQueue(lang?: string): number {
  return clearAudioGenerationJobs(lang ? { lang } : undefined);
}

async function markCancelledAudioRowsInDb(params: {
  text_id: string;
  text_type: AudioTextType;
  lang?: string;
  prompt_style_id?: string;
}): Promise<void> {
  const text_id = params.text_id.trim();
  const langKey = params.lang ? normLangCode(params.lang) : null;
  const promptStyleId = params.prompt_style_id?.trim() ?? null;
  if (!text_id) return;

  let query = supabase
    .from("audio_files")
    .select("id, lang, prompt_style_id, status")
    .eq("text_id", text_id)
    .eq("text_type", params.text_type)
    .in("status", ["generating", "pending"]);

  if (promptStyleId) {
    query = query.eq("prompt_style_id", promptStyleId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[audioService] markCancelledAudioRowsInDb:", error);
    return;
  }

  const ids = (data ?? [])
    .filter((row) => {
      if (langKey && normLangCode(String(row.lang ?? "")) !== langKey) return false;
      if (promptStyleId && String(row.prompt_style_id ?? "").trim() !== promptStyleId) return false;
      return true;
    })
    .map((row) => row.id as string);

  if (ids.length === 0) return;

  const { error: updateError } = await supabase
    .from("audio_files")
    .update({
      status: "error",
      error_message: CANCELLED_ERROR_MSG,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (updateError) {
    console.error("[audioService] markCancelledAudioRowsInDb update:", updateError);
  }
}

/**
 * Annule une cellule persona × langue (file client + statuts DB + compteur UI).
 */
export async function cancelAudioGenerationForCell(params: {
  text_id: string;
  text_type: AudioTextType;
  lang: string;
  prompt_style_id: string;
}): Promise<void> {
  const text_id = params.text_id?.trim();
  const langKey = normLangCode(params.lang);
  const prompt_style_id = params.prompt_style_id?.trim();
  if (!text_id || !langKey || !prompt_style_id) return;

  clearAudioGenerationJobs({ text_id, lang: langKey, prompt_style_id });
  await markCancelledAudioRowsInDb({
    text_id,
    text_type: params.text_type,
    lang: langKey,
    prompt_style_id,
  });
}

/**
 * Annule la file + marque en base les voix « generating/pending » de la langue.
 * Permet de relancer via ↻ sans attendre le timeout (3 min).
 */
export async function cancelAudioGenerationForLang(params: {
  text_id: string;
  text_type: AudioTextType;
  lang: string;
}): Promise<void> {
  const text_id = params.text_id?.trim();
  const langKey = normLangCode(params.lang);
  if (!text_id || !langKey) return;

  clearAudioGenerationJobs({ text_id, lang: langKey });
  await markCancelledAudioRowsInDb({
    text_id,
    text_type: params.text_type,
    lang: langKey,
  });
}

function pumpAudioQueue(): void {
  while (audioJobsRunning < AUDIO_GEN_CONCURRENCY && audioJobQueue.length > 0) {
    const job = audioJobQueue.shift()!;
    audioJobsRunning++;
    runningAudioJobs.add(job);
    void invokeGenerateAudio(job)
      .then(() => {
        if (!job.cancelled) job.resolve();
      })
      .catch((e) => {
        if (!job.cancelled) {
          console.error("[audioService] invokeGenerateAudio:", e);
          job.reject(e);
        }
      })
      .finally(() => {
        audioJobsRunning--;
        runningAudioJobs.delete(job);
        if (!job.cancelled) bumpPendingForJob(job, -1);

        const scopeKey = jobScopeKey(job);
        if (cancelledAudioScopes.has(scopeKey)) {
          void markCancelledAudioRowsInDb({
            text_id: job.text_id,
            text_type: job.text_type,
            lang: job.lang,
            prompt_style_id: job.prompt_style_id,
          }).finally(() => {
            let stillRunning = false;
            for (const running of runningAudioJobs) {
              if (jobScopeKey(running) === scopeKey) {
                stillRunning = true;
                break;
              }
            }
            if (!stillRunning) cancelledAudioScopes.delete(scopeKey);
          });
        }

        pumpAudioQueue();
      });
  }
  notifyAudioQueue();
}

function enqueueAudioGenerationJob(job: AudioGenJob): Promise<void> {
  return new Promise((resolve, reject) => {
    audioJobQueue.push({ ...job, resolve, reject });
    bumpPendingForJob(job, 1);
    pumpAudioQueue();
  });
}

/** Enfile plusieurs jobs sans attendre (génération batch par langue). */
function enqueueAudioGenerationJobs(jobs: AudioGenJob[]): void {
  if (jobs.length === 0) return;
  for (const job of jobs) {
    audioJobQueue.push({
      ...job,
      resolve: () => {},
      reject: (e) => console.error("[audioService] enqueueAudioGenerationJobs:", e),
    });
    bumpPendingForJob(job, 1);
  }
  pumpAudioQueue();
}

function collectMediationVoiceJobs(
  artworkId: string,
  lang: string,
  styleKey: string,
  prompt_style_id: string,
): AudioGenJob[] {
  return (["F", "M"] as const).map((gender) => ({
    text_id: artworkId,
    text_type: "mediation" as const,
    lang,
    prompt_style_id,
    gender,
    mediation_style_key: styleKey,
  }));
}

let cachedBioPromptStyleId: string | null = null;

/** Style vocal par défaut pour les bios (premier `prompt_style` « simple » ou le plus bas ordonnancement). */
export async function resolveBioPromptStyleId(): Promise<string | null> {
  if (cachedBioPromptStyleId) return cachedBioPromptStyleId;

  const { data: simpleRows } = await supabase
    .from("prompt_style")
    .select("id")
    .eq("code", "simple")
    .limit(1);

  const simpleId = (simpleRows?.[0] as { id?: string } | undefined)?.id;
  if (simpleId) {
    cachedBioPromptStyleId = String(simpleId);
    return cachedBioPromptStyleId;
  }

  const { data: orderedRows } = await supabase
    .from("prompt_style")
    .select("id")
    .order("ordonnancement", { ascending: true })
    .limit(1);

  const fallbackId = (orderedRows?.[0] as { id?: string } | undefined)?.id;
  if (fallbackId) {
    cachedBioPromptStyleId = String(fallbackId);
    return cachedBioPromptStyleId;
  }

  return null;
}

async function invokeGenerateAudio(job: AudioGenJob): Promise<void> {
  const invokePromise = supabase.functions.invoke("generate-audio", { body: job });
  const timeoutPromise = new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new Error("Délai dépassé (120 s) — Edge Function ou OpenAI TTS")),
      INVOKE_TIMEOUT_MS,
    );
  });

  const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
  if (error) throw error;

  const body = data as { success?: boolean; error?: string } | null;
  if (body && body.success === false) {
    throw new Error(body.error?.trim() || "Génération audio échouée");
  }
}

/** Déclenche la génération audio F + M via la file (concurrence limitée). */
export async function triggerAudioGeneration(params: {
  text_id: string;
  text_type: AudioTextType;
  lang: string;
  prompt_style_id: string;
  model?: string;
}): Promise<void> {
  const { text_id, text_type, lang, prompt_style_id, model } = params;
  if (!text_id?.trim() || !lang?.trim() || !prompt_style_id?.trim()) return;

  const results = await Promise.allSettled(
    (["F", "M"] as const).map((gender) =>
      enqueueAudioGenerationJob({ text_id, text_type, lang, prompt_style_id, gender, model }),
    ),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed?.status === "rejected") {
    console.error("[audioService] triggerAudioGeneration:", failed.reason);
  }
}

/** Déclenche F + M pour une cellule persona × langue. */
export function triggerMediationAudioForPersonaLang(params: {
  artworkId: string;
  lang: string;
  styleKey: string;
  prompt_style_id: string;
}): void {
  const { artworkId, lang, styleKey, prompt_style_id } = params;
  if (!artworkId?.trim() || !prompt_style_id?.trim()) return;
  enqueueAudioGenerationJobs(
    collectMediationVoiceJobs(artworkId, lang, styleKey, prompt_style_id),
  );
}

function triggerMediationAudioCell(
  artworkId: string,
  lang: string,
  styleKey: string,
  prompt_style_id: string,
): void {
  enqueueAudioGenerationJobs(collectMediationVoiceJobs(artworkId, lang, styleKey, prompt_style_id));
}

/** Déclenche l'audio pour toutes les médiations non vides d'une œuvre. */
export function triggerMediationAudioBatch(params: {
  artworkId: string;
  descriptionsByLang: Record<string, Record<string, string>>;
  stylePromptStyleIds: Record<string, string>;
}): void {
  const { artworkId, descriptionsByLang, stylePromptStyleIds } = params;
  if (!artworkId?.trim()) return;

  for (const [lang, byStyle] of Object.entries(descriptionsByLang)) {
    if (!byStyle || typeof byStyle !== "object") continue;
    for (const [styleKey, rawText] of Object.entries(byStyle)) {
      const text = (rawText ?? "").trim();
      if (!text) continue;
      const prompt_style_id = stylePromptStyleIds[styleKey];
      if (!prompt_style_id) continue;
      triggerMediationAudioCell(artworkId, lang, styleKey, prompt_style_id);
    }
  }
}

/** Déclenche l'audio uniquement pour les cellules lang×persona modifiées depuis la baseline. */
export function triggerMediationAudioBatchForChanges(params: {
  artworkId: string;
  descriptionsByLang: Record<string, Record<string, string>>;
  baselineByLang: Record<string, Record<string, string>>;
  stylePromptStyleIds: Record<string, string>;
}): void {
  const { artworkId, descriptionsByLang, baselineByLang, stylePromptStyleIds } = params;
  if (!artworkId?.trim()) return;

  for (const [lang, byStyle] of Object.entries(descriptionsByLang)) {
    if (!byStyle || typeof byStyle !== "object") continue;
    const baselineStyle = baselineByLang[lang] ?? {};
    for (const [styleKey, rawText] of Object.entries(byStyle)) {
      const text = (rawText ?? "").trim();
      if (!text) continue;
      const baselineText = (baselineStyle[styleKey] ?? "").trim();
      if (text === baselineText) continue;
      const prompt_style_id = stylePromptStyleIds[styleKey];
      if (!prompt_style_id) continue;
      triggerMediationAudioCell(artworkId, lang, styleKey, prompt_style_id);
    }
  }
}

/** Déclenche l'audio pour tous les personas non vides d'une langue. */
export function triggerMediationAudioForLang(params: {
  artworkId: string;
  lang: string;
  descriptionsByLang: Record<string, Record<string, string>>;
  stylePromptStyleIds: Record<string, string>;
}): void {
  const { artworkId, lang, descriptionsByLang, stylePromptStyleIds } = params;
  const byStyle = descriptionsByLang[lang];
  if (!artworkId?.trim() || !byStyle) return;

  const jobs: AudioGenJob[] = [];
  for (const [styleKey, rawText] of Object.entries(byStyle)) {
    const text = (rawText ?? "").trim();
    if (!text) continue;
    const prompt_style_id = stylePromptStyleIds[styleKey];
    if (!prompt_style_id) continue;
    jobs.push(...collectMediationVoiceJobs(artworkId, lang, styleKey, prompt_style_id));
  }
  enqueueAudioGenerationJobs(jobs);
}

/** True si au moins un persona de la langue a du texte mais pas F+M prêts. */
export async function mediationLangNeedsAudioGeneration(
  artworkId: string,
  lang: string,
  descriptionsByLang: Record<string, Record<string, string>>,
  stylePromptStyleIds: Record<string, string>,
): Promise<boolean> {
  if (!artworkId?.trim()) return false;
  const langKey = normLangCode(lang);
  const byStyle = descriptionsByLang[lang] ?? descriptionsByLang[langKey] ?? {};
  const files = await getAudioFiles(artworkId, "mediation");

  for (const [styleKey, rawText] of Object.entries(byStyle)) {
    const text = (rawText ?? "").trim();
    const prompt_style_id = stylePromptStyleIds[styleKey];
    if (!text || !prompt_style_id) continue;

    for (const gender of ["F", "M"] as const) {
      const file = files.find(
        (f) =>
          normLangCode(f.lang) === langKey &&
          f.prompt_style_id === prompt_style_id &&
          f.gender === gender,
      );
      if (!file || file.status !== "ready" || !file.storage_path) return true;
    }
  }
  return false;
}

export type MediationPersonaRef = {
  key: string;
  promptStyleId?: string | null;
};

export type MediationVoiceTarget = AudioVoiceLangTarget & {
  styleKey: string;
};

/** Cibles persona × langue avec texte de médiation non vide. */
export function buildMediationVoiceTargets(
  artworkId: string,
  personas: readonly MediationPersonaRef[],
  descriptionsByLang: Record<string, Record<string, string>>,
  languages: readonly string[],
): MediationVoiceTarget[] {
  const targets: MediationVoiceTarget[] = [];
  for (const persona of personas) {
    const promptStyleId = persona.promptStyleId?.trim();
    if (!promptStyleId) continue;
    for (const lng of languages) {
      const langKey = normLangCode(lng);
      const text = (descriptionsByLang[langKey]?.[persona.key] ?? descriptionsByLang[lng]?.[persona.key] ?? "").trim();
      if (!text) continue;
      targets.push({
        lang: langKey,
        text_id: artworkId,
        prompt_style_id: promptStyleId,
        styleKey: persona.key,
      });
    }
  }
  return targets;
}

function isAudioJobQueued(
  job: Pick<AudioGenJob, "text_id" | "lang" | "prompt_style_id" | "gender">,
): boolean {
  const matches = (j: AudioGenJob) =>
    j.text_id.trim() === job.text_id.trim()
    && normLangCode(j.lang) === normLangCode(job.lang)
    && j.prompt_style_id.trim() === job.prompt_style_id.trim()
    && j.gender === job.gender;
  if (audioJobQueue.some(matches)) return true;
  for (const running of runningAudioJobs) {
    if (matches(running)) return true;
  }
  return false;
}

type VoiceSlotFilePick = Pick<AudioFile, "status" | "storage_path" | "updated_at" | "created_at">;

function voiceSlotNeedsGeneration(
  file: VoiceSlotFilePick | undefined,
  queuedJob?: Pick<AudioGenJob, "text_id" | "lang" | "prompt_style_id" | "gender">,
): boolean {
  if (queuedJob && isAudioJobQueued(queuedJob)) return false;
  const status = fileToVoiceStatus(file);
  if (status === "ready") return false;
  if (status === "generating" || status === "pending") return false;
  return true;
}

export type MediationVoiceFillState = {
  totalExpected: number;
  readyCount: number;
  missingCount: number;
  inProgressCount: number;
  allReady: boolean;
};

function countMediationVoiceSlots(
  targets: MediationVoiceTarget[],
  files: AudioFile[],
): MediationVoiceFillState {
  let totalExpected = 0;
  let readyCount = 0;
  let missingCount = 0;
  let inProgressCount = 0;

  for (const target of targets) {
    const langKey = normLangCode(target.lang);
    for (const gender of ["F", "M"] as const) {
      totalExpected += 1;
      const jobRef = {
        text_id: target.text_id,
        lang: langKey,
        prompt_style_id: target.prompt_style_id,
        gender,
      };
      const file = files.find(
        (f) =>
          f.text_id === target.text_id
          && normLangCode(f.lang) === langKey
          && f.prompt_style_id === target.prompt_style_id
          && f.gender === gender,
      );

      const status = fileToVoiceStatus(file);
      if (status === "ready") {
        readyCount += 1;
      } else if (status === "generating" || status === "pending" || isAudioJobQueued(jobRef)) {
        inProgressCount += 1;
      } else if (voiceSlotNeedsGeneration(file, jobRef)) {
        missingCount += 1;
      }
    }
  }

  return {
    totalExpected,
    readyCount,
    missingCount,
    inProgressCount,
    allReady: totalExpected > 0 && readyCount === totalExpected,
  };
}

/** État de complétion des voix médiation (F+M par persona × langue). */
export async function fetchMediationVoiceFillState(params: {
  artworkId: string;
  personas: readonly MediationPersonaRef[];
  languages: readonly string[];
  descriptionsByLang: Record<string, Record<string, string>>;
}): Promise<MediationVoiceFillState> {
  const { artworkId, personas, languages, descriptionsByLang } = params;
  const targets = buildMediationVoiceTargets(artworkId, personas, descriptionsByLang, languages);
  if (targets.length === 0) {
    return { totalExpected: 0, readyCount: 0, missingCount: 0, inProgressCount: 0, allReady: false };
  }

  const files = await getAudioFiles(artworkId, "mediation");
  return countMediationVoiceSlots(targets, files);
}

/** Enfile uniquement les voix F/M manquantes (ignore les ✓ et celles déjà en cours). */
export async function triggerMissingMediationVoices(params: {
  artworkId: string;
  personas: readonly MediationPersonaRef[];
  languages: readonly string[];
  descriptionsByLang: Record<string, Record<string, string>>;
}): Promise<{ jobCount: number; cellKeys: string[] }> {
  const { artworkId, personas, languages, descriptionsByLang } = params;
  const targets = buildMediationVoiceTargets(artworkId, personas, descriptionsByLang, languages);
  if (targets.length === 0) return { jobCount: 0, cellKeys: [] };

  const files = await getAudioFiles(artworkId, "mediation");
  const jobs: AudioGenJob[] = [];
  const cellKeys = new Set<string>();

  for (const target of targets) {
    const langKey = normLangCode(target.lang);
    for (const gender of ["F", "M"] as const) {
      const job: AudioGenJob = {
        text_id: target.text_id,
        text_type: "mediation",
        lang: langKey,
        prompt_style_id: target.prompt_style_id,
        gender,
        mediation_style_key: target.styleKey,
      };
      const file = files.find(
        (f) =>
          f.text_id === target.text_id
          && normLangCode(f.lang) === langKey
          && f.prompt_style_id === target.prompt_style_id
          && f.gender === gender,
      );
      if (!voiceSlotNeedsGeneration(file, job)) continue;
      jobs.push(job);
      cellKeys.add(audioVoiceCellKey(langKey, target.prompt_style_id));
    }
  }

  if (jobs.length > 0) enqueueAudioGenerationJobs(jobs);
  return { jobCount: jobs.length, cellKeys: [...cellKeys] };
}

export function buildMediationStylePromptStyleMap(
  styleTabs: Array<{ key: string; promptStyleId?: string | null }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tab of styleTabs) {
    const id = tab.promptStyleId?.trim();
    if (id) map[tab.key] = id;
  }
  return map;
}

/** URL signée (1 h) pour lecture du fichier audio (M4A/AAC). */
export async function getAudioUrl(storage_path: string): Promise<string> {
  const path = storage_path.trim();
  if (!path) throw new Error("storage_path vide");

  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    throw error ?? new Error("URL signée indisponible");
  }
  return data.signedUrl;
}

export type VoiceGenderStatus = "ready" | "generating" | "pending" | "partial" | "error" | "none";

export type LangVoiceStatus = {
  F: VoiceGenderStatus;
  M: VoiceGenderStatus;
};

export type LangVoiceProgress = {
  ready: number;
  total: number;
  generating: number;
  error: number;
};

export type AudioVoiceErrorDetail = {
  gender: AudioGender;
  prompt_style_id: string;
  message: string;
};

export type LangVoiceAggregate = LangVoiceStatus & {
  progress: LangVoiceProgress;
  errors: AudioVoiceErrorDetail[];
};

const STALE_GENERATING_ERROR_MSG =
  "Génération expirée : aucune réponse après 3 minutes (timeout).";

export type AudioVoiceLangTarget = {
  lang: string;
  text_id: string;
  prompt_style_id: string;
};

function fileToVoiceStatus(
  file: Pick<AudioFile, "status" | "storage_path" | "updated_at" | "created_at"> | undefined,
): VoiceGenderStatus {
  if (!file) return "none";
  if (file.status === "ready" && file.storage_path) return "ready";
  if (file.status === "generating" || file.status === "pending") {
    const ts = file.updated_at ?? file.created_at;
    if (!ts || Date.now() - new Date(ts).getTime() > STALE_GENERATING_MS) return "error";
    return file.status;
  }
  if (file.status === "error") return "error";
  return "none";
}

function aggregateGenderStatus(slots: VoiceGenderStatus[]): VoiceGenderStatus {
  if (slots.some((s) => s === "generating" || s === "pending")) return "generating";
  if (slots.length > 0 && slots.every((s) => s === "ready")) return "ready";
  if (slots.some((s) => s === "error")) return "error";
  if (slots.some((s) => s === "ready")) return "partial";
  return "none";
}

function countProgressSlot(progress: LangVoiceProgress, status: VoiceGenderStatus): void {
  progress.total += 1;
  if (status === "ready") progress.ready += 1;
  else if (status === "generating" || status === "pending") progress.generating += 1;
  else if (status === "error") progress.error += 1;
}

function isStaleGeneratingFile(
  file: Pick<AudioFile, "status" | "updated_at" | "created_at">,
): boolean {
  if (file.status !== "generating" && file.status !== "pending") return false;
  const ts = file.updated_at ?? file.created_at;
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > STALE_GENERATING_MS;
}

function resolveSlotErrorMessage(
  file:
    | Pick<AudioFile, "status" | "error_message" | "updated_at" | "created_at">
    | undefined,
  status: VoiceGenderStatus,
): string {
  if (!file) return "Voix non générée";
  if (isStaleGeneratingFile(file)) return STALE_GENERATING_ERROR_MSG;
  const msg = (file.error_message ?? "").trim();
  if (msg) return msg;
  if (file.status === "error") return "Échec de génération audio";
  return STALE_GENERATING_ERROR_MSG;
}

/** Statut F/M + progression par langue pour une liste de cibles audio. */
export async function fetchAudioVoiceStatusMap(
  text_type: AudioTextType,
  targets: AudioVoiceLangTarget[],
): Promise<Record<string, LangVoiceAggregate>> {
  const validTargets = targets.filter(
    (t) => t.text_id?.trim() && t.prompt_style_id?.trim() && t.lang?.trim(),
  );
  if (validTargets.length === 0) return {};

  const textIds = [...new Set(validTargets.map((t) => t.text_id))];
  const { data, error } = await supabase
    .from("audio_files")
    .select(
      "text_id, lang, prompt_style_id, gender, status, storage_path, updated_at, created_at, error_message",
    )
    .eq("text_type", text_type)
    .in("text_id", textIds);

  if (error) {
    console.error("[audioService] fetchAudioVoiceStatusMap:", error);
    return {};
  }

  const files = (data ?? []) as Array<{
    text_id: string;
    lang: string;
    prompt_style_id: string;
    gender: AudioGender;
    status: AudioFileStatus;
    storage_path: string | null;
    updated_at: string | null;
    created_at: string | null;
    error_message: string | null;
  }>;

  const buckets: Record<
    string,
    {
      fSlots: VoiceGenderStatus[];
      mSlots: VoiceGenderStatus[];
      progress: LangVoiceProgress;
      errors: AudioVoiceErrorDetail[];
    }
  > = {};

  for (const target of validTargets) {
    const langKey = normLangCode(target.lang);
    const bucket = buckets[langKey] ?? {
      fSlots: [],
      mSlots: [],
      progress: { ready: 0, total: 0, generating: 0, error: 0 },
      errors: [],
    };

    for (const gender of ["F", "M"] as const) {
      const match = files.find(
        (f) =>
          f.text_id === target.text_id &&
          normLangCode(f.lang) === langKey &&
          f.prompt_style_id === target.prompt_style_id &&
          f.gender === gender,
      );
      const status = fileToVoiceStatus(match);
      countProgressSlot(bucket.progress, status);
      if (status === "error") {
        bucket.errors.push({
          gender,
          prompt_style_id: target.prompt_style_id,
          message: resolveSlotErrorMessage(match, status),
        });
      }
      if (gender === "F") bucket.fSlots.push(status);
      else bucket.mSlots.push(status);
    }

    buckets[langKey] = bucket;
  }

  const result: Record<string, LangVoiceAggregate> = {};
  for (const [langKey, bucket] of Object.entries(buckets)) {
    result[langKey] = {
      F: aggregateGenderStatus(bucket.fSlots),
      M: aggregateGenderStatus(bucket.mSlots),
      progress: bucket.progress,
      errors: bucket.errors,
    };
  }

  return result;
}

/** Clé persona × langue pour le suivi audio granulaire. */
export function audioVoiceCellKey(lang: string, prompt_style_id: string): string {
  return `${normLangCode(lang)}|${prompt_style_id.trim()}`;
}

/** Statut F/M par cellule persona × langue (sans agrégation inter-personas). */
export async function fetchAudioVoiceStatusMapByCell(
  text_type: AudioTextType,
  targets: AudioVoiceLangTarget[],
): Promise<Record<string, LangVoiceAggregate>> {
  const validTargets = targets.filter(
    (t) => t.text_id?.trim() && t.prompt_style_id?.trim() && t.lang?.trim(),
  );
  if (validTargets.length === 0) return {};

  const textIds = [...new Set(validTargets.map((t) => t.text_id))];
  const { data, error } = await supabase
    .from("audio_files")
    .select(
      "text_id, lang, prompt_style_id, gender, status, storage_path, updated_at, created_at, error_message",
    )
    .eq("text_type", text_type)
    .in("text_id", textIds);

  if (error) {
    console.error("[audioService] fetchAudioVoiceStatusMapByCell:", error);
    return {};
  }

  const files = (data ?? []) as Array<{
    text_id: string;
    lang: string;
    prompt_style_id: string;
    gender: AudioGender;
    status: AudioFileStatus;
    storage_path: string | null;
    updated_at: string | null;
    created_at: string | null;
    error_message: string | null;
  }>;

  const result: Record<string, LangVoiceAggregate> = {};

  for (const target of validTargets) {
    const cellKey = audioVoiceCellKey(target.lang, target.prompt_style_id);
    const langKey = normLangCode(target.lang);
    const fSlots: VoiceGenderStatus[] = [];
    const mSlots: VoiceGenderStatus[] = [];
    const progress: LangVoiceProgress = { ready: 0, total: 0, generating: 0, error: 0 };
    const errors: AudioVoiceErrorDetail[] = [];

    for (const gender of ["F", "M"] as const) {
      const match = files.find(
        (f) =>
          f.text_id === target.text_id &&
          normLangCode(f.lang) === langKey &&
          f.prompt_style_id === target.prompt_style_id &&
          f.gender === gender,
      );
      const status = fileToVoiceStatus(match);
      countProgressSlot(progress, status);
      if (status === "error") {
        errors.push({
          gender,
          prompt_style_id: target.prompt_style_id,
          message: resolveSlotErrorMessage(match, status),
        });
      }
      if (gender === "F") fSlots.push(status);
      else mSlots.push(status);
    }

    result[cellKey] = {
      F: aggregateGenderStatus(fSlots),
      M: aggregateGenderStatus(mSlots),
      progress,
      errors,
    };
  }

  return result;
}

/** Tous les fichiers audio liés à un texte. */
export async function getAudioFiles(
  text_id: string,
  text_type: AudioTextType,
): Promise<AudioFile[]> {
  const { data, error } = await supabase
    .from("audio_files")
    .select("*")
    .eq("text_id", text_id)
    .eq("text_type", text_type)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[audioService] getAudioFiles:", error);
    return [];
  }
  return (data ?? []) as AudioFile[];
}
