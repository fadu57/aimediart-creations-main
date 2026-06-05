import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

const CATALOG_SELECT =
  "id, storage_bucket, adjective_en, noun_en, full_pseudo_fr, full_pseudo_en, full_pseudo_de, full_pseudo_es, full_pseudo_it";
const AVATAR_OBJECT_PATH_RE = /^[a-z0-9]+_[a-z0-9]+\.(jpg|png)$/i;

function normalizeToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function storageBaseKeyFromRow(row) {
  const adj = normalizeToken(row.adjective_en);
  const noun = normalizeToken(row.noun_en);
  return adj && noun ? `${adj}_${noun}` : null;
}

const index = new Map();
let offset = 0;
while (true) {
  const { data, error } = await supabase.from("avatars").select(CATALOG_SELECT).range(offset, offset + 999);
  if (error) {
    console.log("catalog error", error);
    break;
  }
  if (!data?.length) break;
  for (const row of data) {
    const k = storageBaseKeyFromRow(row);
    if (k) index.set(k, row);
  }
  if (data.length < 1000) break;
  offset += 1000;
}

const paths = [];
offset = 0;
while (true) {
  const { data, error } = await supabase.storage.from("avatars").list("", {
    limit: 1000,
    offset,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    console.log("storage error", error);
    break;
  }
  if (!data?.length) break;
  for (const entry of data) {
    if (entry.id != null && AVATAR_OBJECT_PATH_RE.test(entry.name)) {
      paths.push(entry.name.toLowerCase());
    }
  }
  if (data.length < 1000) break;
  offset += 1000;
}

const pool = paths
  .map((path) => ({ path, row: index.get(path.replace(/\.(jpe?g|png)$/i, "")) }))
  .filter((e) => e.row && e.row.full_pseudo_fr);

console.log({
  catalogSize: index.size,
  storagePaths: paths.length,
  poolSize: pool.length,
  sample: pool[0],
});
