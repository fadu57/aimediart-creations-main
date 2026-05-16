/**
 * Génère terms.json, ai_policy.json, legal_pack.json pour en/de/es/it :
 * même structure que fr, valeurs "TODO: translate from French",
 * sauf meta.languageRef en anglais pour en/ (aligné sur privacy EN).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOCALES = path.join(ROOT, "src", "i18n", "locales");

const EN_LANGUAGE_REF =
  "Translations are provided for information only. The reference language and the legally prevailing version is French, subject to mandatory applicable provisions.";

const TODO = "TODO: translate from French";

function deepTodo(value, lang, keyPath) {
  if (typeof value === "string") {
    if (lang === "en" && keyPath.join(".") === "meta.languageRef") {
      return EN_LANGUAGE_REF;
    }
    return TODO;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => deepTodo(item, lang, [...keyPath, String(i)]));
  }
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepTodo(v, lang, [...keyPath, k]);
    }
    return out;
  }
  return value;
}

const files = ["terms.json", "ai_policy.json", "legal_pack.json"];
const langs = ["en", "de", "es", "it"];

for (const lang of langs) {
  for (const file of files) {
    const src = path.join(LOCALES, "fr", file);
    const dest = path.join(LOCALES, lang, file);
    const data = JSON.parse(fs.readFileSync(src, "utf8"));
    const out = deepTodo(data, lang, []);
    fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  }
}

console.log("OK:", langs.join(", "), "×", files.join(", "));
