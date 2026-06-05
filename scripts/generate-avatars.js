/**
 * generate-avatars.js — Génération progressive de 2 500 avatars (50×50)
 *
 * Fonctionnalités :
 *   • Filtre strict des doublons (inventaire Storage avant génération)
 *   • Ordre aléatoire Fisher-Yates sur les combinaisons manquantes
 *   • Requêtes HTTP via axios (Hugging Face + upload Storage Supabase)
 *   • Throttle aléatoire (défaut 5–40 s) entre chaque requête Hugging Face réussie
 *   • Email de progression toutes les 250 uploads réussis (session en cours)
 *   • Email final quand le bucket atteint 2 500/2 500
 *
 * Prérequis (.env à la racine) :
 *   SUPABASE_URL              — ou VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   HF_TOKEN
 *   HF_MODEL_URL              — optionnel (défaut : router.huggingface.co/hf-inference/…)
 *   EMAIL_USER                — compte Gmail expéditeur
 *   EMAIL_APP_PASSWORD        — mot de passe d'application Gmail
 *   AVATAR_NOTIFY_EMAIL       — destinataire (défaut : fadu57@gmail.com)
 *
 * Usage Windows (cross-env) :
 *   npm run generate:avatars
 *   npm run generate:avatars:test
 *   npx cross-env LIMIT=10 START_INDEX=0 npm run generate:avatars
 */

import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({ path: path.join(ROOT, ".env.local"), override: false });

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HF_TOKEN = process.env.HF_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;
const DEFAULT_NOTIFY_EMAIL = "fadu57@gmail.com";
const AVATAR_NOTIFY_EMAIL = process.env.AVATAR_NOTIFY_EMAIL ?? DEFAULT_NOTIFY_EMAIL;

const HF_MODEL_ID = "black-forest-labs/FLUX.1-schnell";
const HF_MODEL_URL =
  process.env.HF_MODEL_URL ??
  `https://router.huggingface.co/hf-inference/models/${HF_MODEL_ID}`;
const STORAGE_BUCKET = "avatars";
const REALTIME_REVIEW_CHANNEL = "avatar-review-live";
const THROTTLE_MIN_MS =
  Number.parseInt(process.env.HF_THROTTLE_MIN_MS ?? process.env.HF_THROTTLE_MS ?? "5000", 10) ||
  5_000;
const THROTTLE_MAX_MS =
  Number.parseInt(process.env.HF_THROTTLE_MAX_MS ?? "40000", 10) || 40_000;
const HF_ERROR_BACKOFF_BASE_MS =
  Number.parseInt(process.env.HF_ERROR_BACKOFF_BASE_MS ?? "300000", 10) || 300_000;
const HF_ERROR_BACKOFF_MAX_MS =
  Number.parseInt(process.env.HF_ERROR_BACKOFF_MAX_MS ?? "3600000", 10) || 3_600_000;
const HF_MAX_CONSECUTIVE_ERRORS =
  Number.parseInt(process.env.HF_MAX_CONSECUTIVE_ERRORS ?? "5", 10) || 5;
const LIST_PAGE_SIZE = 1000;
const EXPECTED_ADJECTIVES = 50;
const EXPECTED_NOUNS = 50;
const EXPECTED_TOTAL = EXPECTED_ADJECTIVES * EXPECTED_NOUNS;
const PROGRESS_EMAIL_BATCH = 250;
const HF_MAX_RETRIES = 4;
const HF_RETRY_BASE_MS = 60_000;
const EMAIL_TIMEOUT_MS = 20_000;
const BROADCAST_TIMEOUT_MS = 5_000;

const START_INDEX = Number.parseInt(process.env.START_INDEX ?? "0", 10) || 0;
const LIMIT = process.env.LIMIT ? Number.parseInt(process.env.LIMIT, 10) : null;

const PROMPT_TEMPLATE =
  "A detailed tight close-up 3D claymation animated app icon focusing only on the head and face of an adorable [AdjectiveNoun]. The head is sculpted from smooth, colorful modeling clay with a subtle tactile matte finish, showing no fingerprints. Its fur or coat is a solid, warm color, completely clean and free of any flowers, leaves, or decoration. The animal has a warm, gentle smile and large, kind eyes. The composition is tightly centered and minimalist, with absolutely no background elements, no neck, no shoulders, and no body parts visible. Clean, defined straight edges define the face structure within a perfect square frame. The image must be rendered within a strict square border with 90-degree squared corners (no rounded outer corners). The entire scene is isolated on a solid, uniform, pure white background (#FFFFFF). Rendered at 512x512 pixels.";

function requireEnv(name, value) {
  if (!value?.trim()) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

function getHfHttpStatus(error) {
  if (axios.isAxiosError(error) && error.response?.status) {
    return error.response.status;
  }
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Hugging Face API error \((\d{3})\)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function isRateLimitHfError(error) {
  return getHfHttpStatus(error) === 429;
}

function isFatalHfCreditsError(error) {
  const status = getHfHttpStatus(error);
  if (status === 402) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /depleted your monthly included credits/i.test(message);
}

function computeErrorBackoffMs(error, consecutiveErrors) {
  const attempt = Math.max(1, consecutiveErrors);
  let waitMs = HF_ERROR_BACKOFF_BASE_MS * 2 ** (attempt - 1);
  if (isRateLimitHfError(error)) {
    waitMs = Math.max(waitMs, 600_000);
  }
  return Math.min(waitMs, HF_ERROR_BACKOFF_MAX_MS);
}

async function waitBeforeNextAttempt(reason, waitMs, channel = null) {
  console.log(`⏸ Pause ${formatDuration(waitMs)} (${reason})…`);
  notifyPauseStarted(channel, waitMs, reason);
  await sleep(waitMs);
  notifyPauseEnded(channel);
}

function randomSuccessThrottleMs() {
  const min = Math.min(THROTTLE_MIN_MS, THROTTLE_MAX_MS);
  const max = Math.max(THROTTLE_MIN_MS, THROTTLE_MAX_MS);
  if (min === max) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function normalizeWord(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function toPascalCase(value) {
  return normalizeWord(value)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function buildPrompt(adjective, noun) {
  const adjectiveNoun = `${toPascalCase(adjective)} ${toPascalCase(noun)}`;
  return PROMPT_TEMPLATE.replace("[AdjectiveNoun]", adjectiveNoun);
}

function buildStoragePath(adjective, noun) {
  const adj = normalizeWord(adjective).toLowerCase();
  const nounToken = normalizeWord(noun).toLowerCase();
  if (!adj || !nounToken) {
    throw new Error(`Combinaison invalide : "${adjective}" + "${noun}"`);
  }
  return `${adj}_${nounToken}.jpg`;
}

function fisherYatesShuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function cartesianProduct(adjectives, nouns) {
  const combinations = [];
  for (const adjective of adjectives) {
    for (const noun of nouns) {
      combinations.push({ adjective, noun });
    }
  }
  return combinations;
}

function buildCombinationsFromRows(rows) {
  if (!rows?.length) {
    throw new Error("Aucune ligne retournée par la base.");
  }

  const sample = rows[0];
  const keys = Object.keys(sample);

  if (keys.includes("adjective") && keys.includes("noun")) {
    return rows.map((row) => ({
      adjective: normalizeWord(row.adjective),
      noun: normalizeWord(row.noun),
    }));
  }

  const typeKey = keys.includes("type") ? "type" : keys.includes("word_type") ? "word_type" : null;
  const labelKey =
    keys.find((key) => ["label_en", "full_pseudo_en", "label", "word", "name"].includes(key)) ??
    "label_en";

  if (!typeKey) {
    throw new Error(
      `Schéma avatars.full_pseudo_en non reconnu. Colonnes reçues : ${keys.join(", ")}`,
    );
  }

  const adjectives = rows
    .filter((row) => String(row[typeKey]).toLowerCase() === "adjective")
    .map((row) => normalizeWord(row[labelKey]))
    .filter(Boolean);

  const nouns = rows
    .filter((row) => String(row[typeKey]).toLowerCase() === "noun")
    .map((row) => normalizeWord(row[labelKey]))
    .filter(Boolean);

  if (!adjectives.length || !nouns.length) {
    throw new Error("Impossible d'extraire adjectifs et noms depuis avatars.full_pseudo_en.");
  }

  return cartesianProduct(adjectives, nouns);
}

async function fetchCombinationPatterns(supabase) {
  console.log("Chargement des combinaisons depuis avatars.full_pseudo_en…");

  const { data, error } = await supabase.schema("avatars").from("full_pseudo_en").select("*");

  if (!error && data?.length) {
    const combinations = buildCombinationsFromRows(data);
    console.log(
      `Source avatars.full_pseudo_en : ${combinations.length} combinaison(s) construite(s).`,
    );
    return combinations;
  }

  if (error) {
    console.warn(
      `avatars.full_pseudo_en indisponible (${error.message}). Repli sur public.pseudo_pool…`,
    );
  } else {
    console.warn("avatars.full_pseudo_en vide. Repli sur public.pseudo_pool…");
  }

  const [{ data: adjectiveRows, error: adjError }, { data: nounRows, error: nounError }] =
    await Promise.all([
      supabase.from("pseudo_pool").select("label_en").eq("type", "adjective"),
      supabase.from("pseudo_pool").select("label_en").eq("type", "noun"),
    ]);

  if (adjError) throw new Error(`pseudo_pool (adjectives) : ${adjError.message}`);
  if (nounError) throw new Error(`pseudo_pool (nouns) : ${nounError.message}`);

  const adjectives = (adjectiveRows ?? [])
    .map((row) => normalizeWord(row.label_en))
    .filter(Boolean);
  const nouns = (nounRows ?? []).map((row) => normalizeWord(row.label_en)).filter(Boolean);

  if (!adjectives.length || !nouns.length) {
    throw new Error("pseudo_pool ne contient pas assez de label_en (adjective / noun).");
  }

  const combinations = cartesianProduct(adjectives, nouns);
  console.log(`Source pseudo_pool : ${combinations.length} combinaison(s) construite(s).`);
  return combinations;
}

async function listStorageFolder(supabase, folder = "") {
  const fileNames = new Set();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(folder, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Storage list (${folder || "root"}) : ${error.message}`);
    }

    if (!data?.length) {
      break;
    }

    for (const entry of data) {
      const entryPath = folder ? `${folder}/${entry.name}` : entry.name;

      if (entry.id == null) {
        const nested = await listStorageFolder(supabase, entryPath);
        nested.forEach((name) => fileNames.add(name));
      } else {
        fileNames.add(entry.name);
        fileNames.add(entryPath);
      }
    }

    if (data.length < LIST_PAGE_SIZE) {
      break;
    }

    offset += LIST_PAGE_SIZE;
  }

  return fileNames;
}

function countPresentCombinations(allCombinations, existingFiles) {
  let count = 0;
  for (const combo of allCombinations) {
    if (existingFiles.has(buildStoragePath(combo.adjective, combo.noun))) {
      count += 1;
    }
  }
  return count;
}

async function sendSuccessEmail({ subject, text, html }) {
  if (!EMAIL_USER?.trim() || !EMAIL_APP_PASSWORD?.trim()) {
    console.warn("Email non configuré (EMAIL_USER / EMAIL_APP_PASSWORD) — notification ignorée.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER.trim(),
      pass: EMAIL_APP_PASSWORD.trim(),
    },
    connectionTimeout: EMAIL_TIMEOUT_MS,
    greetingTimeout: EMAIL_TIMEOUT_MS,
    socketTimeout: EMAIL_TIMEOUT_MS,
  });

  const recipient = AVATAR_NOTIFY_EMAIL.trim();

  await Promise.race([
    transporter.sendMail({
      from: EMAIL_USER.trim(),
      to: recipient,
      subject,
      text,
      html,
    }),
    sleep(EMAIL_TIMEOUT_MS).then(() => {
      throw new Error(`timeout email (${EMAIL_TIMEOUT_MS} ms)`);
    }),
  ]);

  console.log(`Email envoyé à ${recipient} : « ${subject} »`);
}

function notifyProgressEmail(totalInBucket) {
  void sendProgressEmail(totalInBucket).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Échec envoi email de progression (${totalInBucket}/${EXPECTED_TOTAL}) : ${message}`);
  });
}

async function sendProgressEmail(totalInBucket) {
  const subject = `🚀 [SaaS Avatars] Progression : ${totalInBucket}/${EXPECTED_TOTAL} images générées`;
  const body = `Bravo ! Un nouveau lot vient d'être complété. Le bucket contient désormais ${totalInBucket} images sur les ${EXPECTED_TOTAL} théoriques. Le script continue de tourner...`;

  await sendSuccessEmail({
    subject,
    text: body,
    html: `<p>${body}</p>`,
  });
}

async function sendFinalEmail() {
  const subject = "🎉 [SaaS Avatars] Génération terminée";
  const body = `🎉 Toutes les ${EXPECTED_TOTAL} images ont déjà été générées et sont présentes dans le bucket ! Fin du script.`;

  await sendSuccessEmail({
    subject,
    text: body,
    html: `<p>${body}</p>`,
  });
}

async function fetchExistingAvatarFiles(supabase) {
  console.log(`Inventaire des fichiers existants dans le bucket « ${STORAGE_BUCKET} »…`);
  const files = await listStorageFolder(supabase);
  console.log(`${files.size} entrée(s) trouvée(s) dans le bucket.`);
  return files;
}

function filterMissingCombinations(allCombinations, existingFiles) {
  const missing = [];

  for (const combo of allCombinations) {
    const objectPath = buildStoragePath(combo.adjective, combo.noun);
    if (!existingFiles.has(objectPath)) {
      missing.push(combo);
    }
  }

  return missing;
}

function decodeAxiosResponseData(data) {
  if (data == null) return "";
  if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    if (Array.isArray(data.data) && data.type === "Buffer") {
      return Buffer.from(data.data).toString("utf8");
    }
    return JSON.stringify(data);
  }
  return String(data);
}

async function generateImageBuffer(prompt) {
  let lastError = null;

  for (let attempt = 1; attempt <= HF_MAX_RETRIES; attempt += 1) {
    try {
      const response = await axios.post(
        HF_MODEL_URL,
        {
          inputs: prompt,
          parameters: {
            width: 512,
            height: 512,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
            Accept: "image/jpeg",
          },
          responseType: "arraybuffer",
          timeout: 120_000,
          validateStatus: (status) => status >= 200 && status < 300,
        },
      );

      const contentType = response.headers["content-type"] ?? "";

      if (contentType.includes("application/json")) {
        const payload = JSON.parse(Buffer.from(response.data).toString("utf8"));
        throw new Error(`Réponse JSON inattendue de Hugging Face : ${JSON.stringify(payload)}`);
      }

      if (!response.data?.byteLength) {
        throw new Error("Réponse Hugging Face vide.");
      }

      return Buffer.from(response.data);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableHfError(error);
      const isLastAttempt = attempt === HF_MAX_RETRIES;

      if (!retryable || isLastAttempt) {
        break;
      }

      let waitMs = HF_RETRY_BASE_MS * attempt;
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const retryAfter = error.response.headers["retry-after"];
        const retryAfterSec = retryAfter ? Number.parseInt(String(retryAfter), 10) : NaN;
        if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
          waitMs = Math.max(waitMs, retryAfterSec * 1000);
        } else {
          waitMs = Math.max(waitMs, 300_000);
        }
      }

      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        `HF tentative ${attempt}/${HF_MAX_RETRIES} échouée — nouvel essai dans ${formatDuration(waitMs)} : ${detail}`,
      );
      await sleep(waitMs);
    }
  }

  if (axios.isAxiosError(lastError)) {
    const status = lastError.response?.status;

    if (lastError.response?.data) {
      const raw = decodeAxiosResponseData(lastError.response.data);
      let detail = raw.slice(0, 800);

      try {
        const json = JSON.parse(raw);
        detail = json.error ?? json.message ?? JSON.stringify(json);
      } catch {
        /* plain text */
      }

      throw new Error(`Hugging Face API error (${status ?? "unknown"}) : ${detail}`);
    }

    throw new Error(`Hugging Face API error: ${lastError.message}`);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isRetryableHfError(error) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 402 || status === 401 || status === 403) return false;
    if (status === 429 || status === 503 || status === 502 || status === 504) return true;
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return true;
  }
  if (error instanceof Error) {
    if (/Hugging Face API error \(402\)|depleted your monthly included credits/i.test(error.message)) {
      return false;
    }
    return /timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(error.message);
  }
  return false;
}

function shouldStopAfterConsecutiveErrors(consecutiveErrors) {
  return consecutiveErrors >= HF_MAX_CONSECUTIVE_ERRORS;
}

async function uploadAvatar(objectPath, imageBuffer) {
  const baseUrl = SUPABASE_URL.replace(/\/$/, "");
  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `${baseUrl}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`;

  try {
    await axios.post(url, imageBuffer, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60_000,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail =
        error.response?.data != null
          ? typeof error.response.data === "object"
            ? JSON.stringify(error.response.data)
            : String(error.response.data)
          : error.message;
      throw new Error(`Upload Supabase Storage : ${detail}`);
    }
    throw error;
  }
}

async function connectReviewBroadcastChannel(supabase) {
  const channel = supabase.channel(REALTIME_REVIEW_CHANNEL, {
    config: { broadcast: { self: false } },
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout Realtime")), 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve(undefined);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`Realtime : ${status}`));
      }
    });
  });

  return channel;
}

async function broadcastAvatarUploaded(channel, objectPath) {
  if (!channel) return;

  await Promise.race([
    channel.send({
      type: "broadcast",
      event: "avatar-uploaded",
      payload: { path: objectPath, at: new Date().toISOString() },
    }),
    sleep(BROADCAST_TIMEOUT_MS).then(() => {
      throw new Error(`timeout broadcast (${BROADCAST_TIMEOUT_MS} ms)`);
    }),
  ]);
}

function notifyAvatarUploaded(channel, objectPath) {
  void broadcastAvatarUploaded(channel, objectPath).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Broadcast Realtime ignoré (${objectPath}) : ${message}`);
  });
}

async function broadcastPauseEvent(channel, event, payload) {
  if (!channel) return;

  await Promise.race([
    channel.send({
      type: "broadcast",
      event,
      payload,
    }),
    sleep(BROADCAST_TIMEOUT_MS).then(() => {
      throw new Error(`timeout broadcast (${BROADCAST_TIMEOUT_MS} ms)`);
    }),
  ]);
}

function notifyPauseStarted(channel, durationMs, reason) {
  void broadcastPauseEvent(channel, "pause-started", {
    durationMs,
    endsAt: new Date(Date.now() + durationMs).toISOString(),
    reason,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Broadcast pause-started ignoré : ${message}`);
  });
}

function notifyPauseEnded(channel) {
  void broadcastPauseEvent(channel, "pause-ended", {
    at: new Date().toISOString(),
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Broadcast pause-ended ignoré : ${message}`);
  });
}

function logStartupSummary() {
  console.log("--- generate-avatars.js ---");
  console.log(`Bucket       : ${STORAGE_BUCKET}`);
  console.log(`Objectif     : ${EXPECTED_TOTAL} combinaisons (${EXPECTED_ADJECTIVES}×${EXPECTED_NOUNS})`);
  console.log(`Doublons     : filtrés avant génération (list Storage)`);
  console.log(`Ordre        : aléatoire (Fisher-Yates)`);
  console.log(`Notifications: ${AVATAR_NOTIFY_EMAIL} — toutes les ${PROGRESS_EMAIL_BATCH} uploads + email final à ${EXPECTED_TOTAL}/${EXPECTED_TOTAL}`);
  console.log(`Endpoint HF  : ${HF_MODEL_URL}`);
  console.log(
    `Pause OK       : aléatoire ${formatDuration(Math.min(THROTTLE_MIN_MS, THROTTLE_MAX_MS))} → ${formatDuration(Math.max(THROTTLE_MIN_MS, THROTTLE_MAX_MS))} après chaque upload`,
  );
  console.log(
    `Pause erreur   : ${formatDuration(HF_ERROR_BACKOFF_BASE_MS)} → ${formatDuration(HF_ERROR_BACKOFF_MAX_MS)} (backoff)`,
  );
  console.log(`Stop auto      : crédits HF épuisés (402) ou ${HF_MAX_CONSECUTIVE_ERRORS} échecs consécutifs`);
  if (LIMIT != null) console.log(`Mode test    : LIMIT=${LIMIT}, START_INDEX=${START_INDEX}`);
  console.log("---------------------------");
}

async function main() {
  requireEnv("SUPABASE_URL", SUPABASE_URL);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
  requireEnv("HF_TOKEN", HF_TOKEN);

  logStartupSummary();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let reviewChannel = null;
  try {
    reviewChannel = await connectReviewBroadcastChannel(supabase);
    console.log(`Canal Realtime « ${REALTIME_REVIEW_CHANNEL} » connecté (review-avatars.html).`);
  } catch (realtimeError) {
    const message = realtimeError instanceof Error ? realtimeError.message : String(realtimeError);
    console.warn(`Realtime review indisponible — pas de mise à jour live dans le navigateur : ${message}`);
  }

  const allCombinations = await fetchCombinationPatterns(supabase);

  if (allCombinations.length !== EXPECTED_TOTAL) {
    console.warn(
      `Attention : ${allCombinations.length} combinaisons au lieu de ${EXPECTED_TOTAL} attendues (${EXPECTED_ADJECTIVES}×${EXPECTED_NOUNS}).`,
    );
  }

  const existingFiles = await fetchExistingAvatarFiles(supabase);
  const missingCombinations = filterMissingCombinations(allCombinations, existingFiles);
  const alreadyPresent = allCombinations.length - missingCombinations.length;

  console.log(
    `${alreadyPresent}/${allCombinations.length} combinaison(s) déjà présentes — ${missingCombinations.length} restante(s) à générer.`,
  );

  if (missingCombinations.length === 0) {
    console.log("Rien à générer. Toutes les combinaisons ont déjà une image.");
    if (alreadyPresent >= allCombinations.length && alreadyPresent === EXPECTED_TOTAL) {
      try {
        await sendFinalEmail();
      } catch (emailError) {
        const message = emailError instanceof Error ? emailError.message : String(emailError);
        console.error(`Échec envoi email final : ${message}`);
      }
    }
    if (reviewChannel) {
      await supabase.removeChannel(reviewChannel);
    }
    return;
  }

  fisherYatesShuffle(missingCombinations);
  console.log("Liste des combinaisons manquantes mélangée aléatoirement (Fisher-Yates).");

  const sliceEnd = LIMIT != null ? START_INDEX + LIMIT : missingCombinations.length;
  const batch = missingCombinations.slice(START_INDEX, sliceEnd);
  const pendingTotal = missingCombinations.length;

  console.log(
    `Démarrage : tâches ${START_INDEX + 1} → ${Math.min(sliceEnd, pendingTotal)} / ${pendingTotal} manquante(s).`,
  );

  let generatedCount = 0;
  let errorCount = 0;
  let runUploadedCount = 0;
  let consecutiveErrors = 0;
  let stoppedEarly = false;
  let stopReason = "";

  for (let offset = 0; offset < batch.length; offset += 1) {
    const taskNumber = START_INDEX + offset + 1;
    const { adjective, noun } = batch[offset];
    const objectPath = buildStoragePath(adjective, noun);
    const taskLabel = `[${taskNumber}/${pendingTotal} traitées]`;
    const isLastInBatch = offset === batch.length - 1;

    try {
      const prompt = buildPrompt(adjective, noun);
      console.log(`${taskLabel} génération HF → ${objectPath}…`);

      const imageBuffer = await generateImageBuffer(prompt);
      await uploadAvatar(objectPath, imageBuffer);

      generatedCount += 1;
      runUploadedCount += 1;
      consecutiveErrors = 0;
      existingFiles.add(objectPath);
      const totalInBucket = countPresentCombinations(allCombinations, existingFiles);
      console.log(
        `${taskLabel} ✓ upload OK — bucket ${totalInBucket}/${EXPECTED_TOTAL} (session : ${generatedCount} upload(s))`,
      );

      notifyAvatarUploaded(reviewChannel, objectPath);

      if (runUploadedCount % PROGRESS_EMAIL_BATCH === 0) {
        if (totalInBucket < EXPECTED_TOTAL) {
          notifyProgressEmail(totalInBucket);
        }
      }

      if (!isLastInBatch) {
        const waitMs = randomSuccessThrottleMs();
        await waitBeforeNextAttempt(`upload réussi — pause aléatoire HF`, waitMs, reviewChannel);
      }
    } catch (error) {
      errorCount += 1;
      consecutiveErrors += 1;
      const message = error instanceof Error ? error.message : String(error);
      const totalInBucket = countPresentCombinations(allCombinations, existingFiles);
      console.error(
        `${taskLabel} ✗ ERREUR (${objectPath}) : ${message}\n` +
          `   Session : ${generatedCount} upload(s) OK, ${errorCount} erreur(s) — bucket ${totalInBucket}/${EXPECTED_TOTAL}`,
      );

      if (isFatalHfCreditsError(error)) {
        stopReason = "crédits Hugging Face épuisés (402)";
        console.error(
          "\n⛔ Crédits Hugging Face épuisés. Arrêt immédiat — rechargez des crédits HF puis relancez le script.",
        );
        stoppedEarly = true;
        break;
      }

      if (shouldStopAfterConsecutiveErrors(consecutiveErrors)) {
        stopReason = `${HF_MAX_CONSECUTIVE_ERRORS} échecs HF consécutifs`;
        console.error(
          `\n⛔ ${HF_MAX_CONSECUTIVE_ERRORS} échecs consécutifs. Arrêt — relancez plus tard (quota / réseau).`,
        );
        stoppedEarly = true;
        break;
      }

      if (!isLastInBatch) {
        const waitMs = computeErrorBackoffMs(error, consecutiveErrors);
        const reason = isRateLimitHfError(error)
          ? `quota / rate-limit HF (${consecutiveErrors} échec(s) d'affilée)`
          : `erreur HF (${consecutiveErrors} échec(s) d'affilée)`;
        await waitBeforeNextAttempt(reason, waitMs, reviewChannel);
      }
    }
  }

  console.log("---");
  const finalBucketTotal = countPresentCombinations(allCombinations, existingFiles);
  console.log(
    `Terminé. Session : ${generatedCount} upload(s), ${errorCount} erreur(s). Bucket : ${finalBucketTotal}/${EXPECTED_TOTAL}.`,
  );
  if (stoppedEarly && stopReason) {
    console.log(`Arrêt anticipé : ${stopReason}.`);
  }
  if (finalBucketTotal >= allCombinations.length && finalBucketTotal === EXPECTED_TOTAL) {
    try {
      await sendFinalEmail();
    } catch (emailError) {
      const message = emailError instanceof Error ? emailError.message : String(emailError);
      console.error(`Échec envoi email final (${finalBucketTotal}/${EXPECTED_TOTAL}) : ${message}`);
    }
  }

  if (stoppedEarly) {
    process.exitCode = 2;
  } else if (errorCount > 0) {
    process.exitCode = 1;
  }

  if (reviewChannel) {
    await supabase.removeChannel(reviewChannel);
  }
}

main().catch((error) => {
  console.error("Échec fatal :", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
