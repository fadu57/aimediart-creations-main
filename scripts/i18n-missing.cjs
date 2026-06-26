const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "..", "src", "i18n", "locales");
const langs = ["en", "de", "es", "it"];
const EXCLUDE = new Set(["settings"]);

function flat(o, p = "", acc = {}) {
  for (const k in o) {
    const v = o[k];
    const nk = p ? p + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flat(v, nk, acc);
    else acc[nk] = v;
  }
  return acc;
}

const fr = "fr";
const nsList = fs
  .readdirSync(path.join(base, fr))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""))
  .filter((ns) => !EXCLUDE.has(ns));

const out = {};
for (const ns of nsList) {
  const frFlat = flat(JSON.parse(fs.readFileSync(path.join(base, fr, ns + ".json"), "utf8")));
  for (const lng of langs) {
    const p = path.join(base, lng, ns + ".json");
    const tgt = fs.existsSync(p) ? flat(JSON.parse(fs.readFileSync(p, "utf8"))) : {};
    const missing = {};
    for (const key of Object.keys(frFlat)) {
      if (!(key in tgt)) missing[key] = frFlat[key];
    }
    if (Object.keys(missing).length) {
      out[ns] = out[ns] || {};
      out[ns][lng] = missing;
    }
  }
}
fs.writeFileSync(path.join(__dirname, "i18n-missing-output.json"), JSON.stringify(out, null, 2), "utf8");
const summary = Object.entries(out).map(([ns, langsObj]) => `${ns}: ${Object.entries(langsObj).map(([l, m]) => l + "=" + Object.keys(m).length).join(", ")}`);
console.log(summary.join("\n"));
