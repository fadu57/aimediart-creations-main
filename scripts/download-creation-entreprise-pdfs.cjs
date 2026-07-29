/* Télécharge les PDF création entreprise depuis Storage Supabase. */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
function get(key) {
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const url = get("VITE_SUPABASE_URL");
const service =
  get("SUPABASE_SERVICE_ROLE_KEY") ||
  get("VITE_SUPABASE_SERVICE_ROLE_KEY") ||
  get("SERVICE_ROLE_KEY");
const anon = get("VITE_SUPABASE_ANON_KEY");

if (!url || (!service && !anon)) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const key = service || anon;
const supabase = createClient(url, key, { auth: { persistSession: false } });
const outDir = path.join(root, "scripts", "_creation_entreprise_pdfs");
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  console.log("Using service key:", Boolean(service));

  const { data: docs, error: docsErr } = await supabase
    .from("aimediart_documents")
    .select("id, name, path, bucket, category")
    .or(
      "path.ilike.%creation-entreprise%,path.ilike.%creation_entreprise%,category.ilike.%creation%",
    )
    .order("name");
  console.log("docs query error:", docsErr?.message || null);
  console.log(
    "docs rows:",
    (docs || []).map((d) => ({ name: d.name, path: d.path, bucket: d.bucket, category: d.category })),
  );

  const { data: allLegalish } = await supabase
    .from("aimediart_documents")
    .select("id, name, path, bucket, category")
    .order("created_at", { ascending: false })
    .limit(50);
  console.log(
    "recent docs:",
    (allLegalish || []).map((d) => ({ name: d.name, path: d.path, category: d.category })),
  );

  const prefixes = [
    "aimediart-creation-entreprise",
    "creation-entreprise",
    "aimediart-creation-entreprise/root",
    "root",
  ];
  for (const p of prefixes) {
    const { data, error } = await supabase.storage.from("aimediart-ged").list(p, { limit: 100 });
    console.log("list", p, error?.message || null, (data || []).map((x) => x.name));
  }

  const { data: rootList, error: rootErr } = await supabase.storage
    .from("aimediart-ged")
    .list("", { limit: 100 });
  console.log("bucket root", rootErr?.message || null, (rootList || []).map((x) => x.name));

  const { data: sections } = await supabase
    .from("aimediart_ged_sections")
    .select("slug, name")
    .order("sort_order");
  console.log("sections:", sections);

  const targets = docs && docs.length ? docs : [];
  // Fallback: match by PDF names from UI
  if (!targets.length && allLegalish) {
    const needles = [
      "MISE À DISPOSITION",
      "MISE A DISPOSITION",
      "PACTE",
      "NON-CONDAMNATION",
      "ACTES ACCOMPLIS",
      "SOUSCRIPTEURS",
      "CONVENTION",
      "STATUTS",
    ];
    for (const d of allLegalish) {
      const up = d.name.toUpperCase();
      if (needles.some((n) => up.includes(n))) targets.push(d);
    }
  }

  for (const d of targets) {
    const { data: blob, error } = await supabase.storage.from(d.bucket).download(d.path);
    if (error) {
      console.error("download fail", d.name, error.message);
      continue;
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const safe = d.name.replace(/[\\/:*?"<>|]/g, "_");
    fs.writeFileSync(path.join(outDir, safe), buf);
    console.log("saved", safe, buf.length);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
