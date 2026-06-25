/**
 * cursor-git-stats — commits GitHub Co-authored-by Cursor + fichiers créés.
 * POST /functions/v1/cursor-git-stats { dateFrom, dateTo }
 */
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { requireAdminUser } from "../_shared/adminAuth.ts";
import { getServiceRoleClient } from "../_shared/supabaseAdmin.ts";

const CURSOR_COAUTHOR_RE = /co-authored-by:\s*cursor\s*</i;
const GITHUB_API = "https://api.github.com";

type GithubCommitListItem = {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { date?: string };
  };
};

type GithubCommitFile = {
  filename?: string;
  status?: string;
};

type GithubCommitDetail = {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { date?: string };
  };
  files?: GithubCommitFile[];
};

function clampIsoDate(iso: string): string {
  return iso.slice(0, 10);
}

function rangeToGithubIso(dateFrom: string, dateTo: string): { since: string; until: string } {
  const from = clampIsoDate(dateFrom);
  const to = clampIsoDate(dateTo);
  return {
    since: `${from}T00:00:00Z`,
    until: `${to}T23:59:59Z`,
  };
}

function isCursorCoauthoredCommit(message: string): boolean {
  return CURSOR_COAUTHOR_RE.test(message);
}

function commitTitle(message: string): string {
  return message.split("\n")[0]?.trim() || "(sans titre)";
}

function commitDateIso(item: GithubCommitListItem): string {
  const raw = item.commit?.author?.date ?? "";
  return raw ? raw.slice(0, 10) : "";
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "aimediart-cursor-git-stats",
  };
}

async function githubGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} — ${body.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

async function listCommitsInRange(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  since: string,
  until: string,
): Promise<GithubCommitListItem[]> {
  const all: GithubCommitListItem[] = [];
  let page = 1;

  while (page <= 20) {
    const path =
      `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&per_page=100&page=${page}`;
    const batch = await githubGet<GithubCommitListItem[]>(token, path);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  return all;
}

async function fetchCommitDetail(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<GithubCommitDetail> {
  return githubGet<GithubCommitDetail>(token, `/repos/${owner}/${repo}/commits/${sha}`);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    const admin = getServiceRoleClient();
    const auth = await requireAdminUser(req, admin);
    if (!auth.authorized) {
      return jsonResponse({ error: "forbidden", details: auth.reason }, 403);
    }

    const token = Deno.env.get("GITHUB_TOKEN")?.trim() ?? "";
    if (!token) {
      return jsonResponse({
        error: "not_configured",
        message: "Secret GITHUB_TOKEN manquant sur la Edge Function.",
      }, 503);
    }

    const owner = Deno.env.get("GITHUB_REPO_OWNER")?.trim() || "fadu57";
    const repo = Deno.env.get("GITHUB_REPO_NAME")?.trim() || "aimediart-creations-main";
    const branch = Deno.env.get("GITHUB_BRANCH")?.trim() || "main";

    let body: { dateFrom?: string; dateTo?: string } = {};
    try {
      body = (await req.json()) as { dateFrom?: string; dateTo?: string };
    } catch {
      body = {};
    }

    const today = new Date();
    const todayIso = clampIsoDate(today.toISOString());
    let dateTo = clampIsoDate(body.dateTo ?? todayIso);
    let dateFrom = clampIsoDate(body.dateFrom ?? dateTo);
    if (dateFrom > dateTo) {
      const tmp = dateFrom;
      dateFrom = dateTo;
      dateTo = tmp;
    }

    const { since, until } = rangeToGithubIso(dateFrom, dateTo);
    const listed = await listCommitsInRange(token, owner, repo, branch, since, until);
    const cursorListed = listed.filter((item) =>
      isCursorCoauthoredCommit(String(item.commit?.message ?? ""))
    );

    const details = await mapPool(cursorListed, 6, (item) =>
      fetchCommitDetail(token, owner, repo, item.sha)
    );

    const commits = details.map((detail) => {
      const message = String(detail.commit?.message ?? "");
      const filesAdded = (detail.files ?? [])
        .filter((f) => f.status === "added" && String(f.filename ?? "").trim())
        .map((f) => String(f.filename));

      return {
        sha: detail.sha,
        short_sha: detail.sha.slice(0, 7),
        date: String(detail.commit?.author?.date ?? "").slice(0, 10) || commitDateIso(detail),
        title: commitTitle(message),
        url: detail.html_url ?? `https://github.com/${owner}/${repo}/commit/${detail.sha}`,
        files_added: filesAdded,
      };
    }).sort((a, b) => b.date.localeCompare(a.date) || b.sha.localeCompare(a.sha));

    const filesCreatedCount = commits.reduce((sum, c) => sum + c.files_added.length, 0);
    const uniqueFiles = new Set(commits.flatMap((c) => c.files_added));

    const dailyMap = new Map<string, { commits: number; files_created: number }>();
    for (const commit of commits) {
      const key = commit.date || dateFrom;
      const row = dailyMap.get(key) ?? { commits: 0, files_created: 0 };
      row.commits += 1;
      row.files_created += commit.files_added.length;
      dailyMap.set(key, row);
    }

    const daily = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({ date, ...row }));

    return jsonResponse({
      repo: `${owner}/${repo}`,
      branch,
      commit_count: commits.length,
      files_created_count: filesCreatedCount,
      unique_files_created: uniqueFiles.size,
      commits,
      daily,
      range: { dateFrom, dateTo },
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cursor-git-stats]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
