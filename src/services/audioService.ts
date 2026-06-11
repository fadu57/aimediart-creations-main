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
const AUDIO_GEN_CONCURRENCY = 2;
const STALE_GENERATING_MS = 3 * 60 * 1000;

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
};

const audioJobQueue: QueuedAudioGenJob[] = [];
let audioJobsRunning = 0;
const pendingJobsByLang = new Map<string, number>();
const queueListeners = new Set<() => void>();

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

function bumpPendingLang(lang: string, delta: number): void {
  const key = normLangCode(lang);
  const next = (pendingJobsByLang.get(key) ?? 0) + delta;
  if (next <= 0) pendingJobsByLang.delete(key);
  else pendingJobsByLang.set(key, next);
  notifyAudioQueue();
}

function pumpAudioQueue(): void {
  while (audioJobsRunning < AUDIO_GEN_CONCURRENCY && audioJobQueue.length > 0) {
    const job = audioJobQueue.shift()!;
    audioJobsRunning++;
    void invokeGenerateAudio(job)
      .then(() => job.resolve())
      .catch((e) => {
        console.error("[audioService] invokeGenerateAudio:", e);
        job.reject(e);
      })
      .finally(() => {
        audioJobsRunning--;
        bumpPendingLang(job.lang, -1);
        pumpAudioQueue();
      });
  }
  notifyAudioQueue();
}

function enqueueAudioGenerationJob(job: AudioGenJob): Promise<void> {
  return new Promise((resolve, reject) => {
    audioJobQueue.push({ ...job, resolve, reject });
    bumpPendingLang(job.lang, 1);
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
    bumpPendingLang(job.lang, 1);
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
  const { data, error } = await supabase.functions.invoke("generate-audio", { body: job });
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

/** URL signée (1 h) pour lecture du MP3. */
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

export type VoiceGenderStatus = "ready" | "generating" | "pending" | "error" | "none";

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
  if (slots.some((s) => s === "ready")) return "pending";
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
