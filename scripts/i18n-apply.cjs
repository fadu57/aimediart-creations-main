/**
 * Fusionne des traductions dans les fichiers locales.
 * Entrée : scripts/i18n-translations.json au format { ns: { lang: { "cle.imbriquee": valeur } } }
 * - crée la structure imbriquée à partir des clés pointées
 * - n'écrase PAS une clé déjà présente (sauf si --force)
 */
const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "..", "src", "i18n", "locales");
const force = process.argv.includes("--force");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "i18n-translations.json"), "utf8"));

function setDeep(obj, dottedKey, value) {
  const parts = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  const last = parts[parts.length - 1];
  if (force || !(last in cur)) cur[last] = value;
}

let applied = 0;
let skipped = 0;
for (const ns of Object.keys(data)) {
  for (const lang of Object.keys(data[ns])) {
    const file = path.join(base, lang, ns + ".json");
    const json = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    for (const [k, v] of Object.entries(data[ns][lang])) {
      const before = JSON.stringify(json);
      setDeep(json, k, v);
      if (JSON.stringify(json) !== before) applied++;
      else skipped++;
    }
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  }
}
console.log(`Applied: ${applied}, skipped (existant): ${skipped}`);
