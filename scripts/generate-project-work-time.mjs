/**
 * generate-project-work-time.mjs
 * Estime le temps git (indicatif) — la saisie manuelle en base est la source de vérité.
 *
 * Usage : node scripts/generate-project-work-time.mjs
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(ROOT, "src", "data", "projectWorkTime.json");

const TIMEZONE = "Europe/Paris";
const SESSION_GAP_MIN = 90;
const MIN_SESSION_MIN = 20;
const SESSION_TAIL_MIN = 10;

function dayKeyParis(date) {
  return date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function roundMinutes(ms) {
  return Math.round(ms / 60_000);
}

function estimateDayMinutes(timestamps) {
  if (timestamps.length === 0) return 0;

  const sorted = [...timestamps].sort((a, b) => a - b);
  const gapMs = SESSION_GAP_MIN * 60_000;
  const minMs = MIN_SESSION_MIN * 60_000;
  const tailMs = SESSION_TAIL_MIN * 60_000;

  let totalMs = 0;
  let sessionStart = sorted[0];
  let sessionLast = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const ts = sorted[i];
    if (ts - sessionLast > gapMs) {
      totalMs += Math.max(minMs, sessionLast - sessionStart + tailMs);
      sessionStart = ts;
    }
    sessionLast = ts;
  }

  totalMs += Math.max(minMs, sessionLast - sessionStart + tailMs);
  return roundMinutes(totalMs);
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function main() {
  const raw = execSync('git log --format="%ai"', {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();

  const byDay = new Map();

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const date = new Date(line.trim());
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKeyParis(date);
    const bucket = byDay.get(key) ?? { timestamps: [], commits: 0 };
    bucket.timestamps.push(date.getTime());
    bucket.commits += 1;
    byDay.set(key, bucket);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { timestamps, commits }]) => {
      const minutes = estimateDayMinutes(timestamps);
      return {
        date,
        minutes,
        hours: Math.round((minutes / 60) * 100) / 100,
        commits,
        duration_label: formatDuration(minutes),
      };
    });

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);

  const payload = {
    generated_at: new Date().toISOString(),
    timezone: TIMEZONE,
    method: "git_sessions",
    session_gap_minutes: SESSION_GAP_MIN,
    min_session_minutes: MIN_SESSION_MIN,
    total_minutes: totalMinutes,
    total_hours: Math.round((totalMinutes / 60) * 100) / 100,
    total_duration_label: formatDuration(totalMinutes),
    days,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Écrit ${OUT_FILE} — ${days.length} jours, ${payload.total_duration_label} total.`);
}

main();
