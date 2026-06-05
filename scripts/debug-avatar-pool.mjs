const url = process.env.VITE_SUPABASE_URL || "https://ladhkvghtnzpnqolxybb.supabase.co";
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!key) {
  console.error("VITE_SUPABASE_ANON_KEY manquant");
  process.exit(1);
}

const h = { apikey: key, Authorization: `Bearer ${key}` };

function storageKey(row) {
  const adj = String(row.adjective_en ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const noun = String(row.noun_en ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return adj && noun ? `${adj}_${noun}` : null;
}

const catRes = await fetch(`${url}/rest/v1/avatars?select=adjective_en,noun_en,full_pseudo_fr&limit=1000`, {
  headers: { ...h, Range: "0-999" },
});
const rows = await catRes.json();
const keys = new Set(rows.map(storageKey).filter(Boolean));

const stRes = await fetch(`${url}/storage/v1/object/list/avatars`, {
  method: "POST",
  headers: { ...h, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix: "", limit: 1000, offset: 0 }),
});
const listed = await stRes.json();
const files = listed
  .filter((f) => f.id != null && /^[a-z0-9]+_[a-z0-9]+\.(jpg|png)$/i.test(f.name))
  .map((f) => f.name.toLowerCase().replace(/\.(jpe?g|png)$/i, ""));

const match = files.filter((p) => keys.has(p));
console.log({ catalogRows: rows.length, catalogKeys: keys.size, storageFiles: files.length, intersection: match.length, samples: match.slice(0, 8) });
