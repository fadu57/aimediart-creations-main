/**
 * Génère en/de/es/it/privacy.json à partir de fr/privacy.json : mêmes clés, valeurs TODO.
 * meta.languageRef : courte phrase traduite (pas un TODO).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const frPath = path.join(root, "src/i18n/locales/fr/privacy.json");

const LANGUAGE_REF = {
  en: "Translations are provided for information only. The reference language and the legally prevailing version is French, subject to mandatory applicable provisions.",
  de: "Die Übersetzungen dienen nur zur Information. Referenzsprache und rechtlich maßgebliche Fassung ist Französisch, vorbehaltlich zwingender anwendbarer Vorschriften.",
  es: "Las traducciones se ofrecen solo a título informativo. La lengua de referencia y la versión jurídicamente prevalente es el francés, sin perjuicio de las disposiciones imperativas aplicables.",
  it: "Le traduzioni sono fornite a scopo informativo. La lingua di riferimento e la versione legalmente prevalente è il francese, salvo disposizioni imperative applicabili.",
};

function todoize(value) {
  if (typeof value === "string") return "TODO: translate from French";
  if (Array.isArray(value)) return value.map(todoize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = todoize(v);
    }
    return out;
  }
  return value;
}

const fr = JSON.parse(fs.readFileSync(frPath, "utf8"));

for (const lng of ["en", "de", "es", "it"]) {
  const data = todoize(fr);
  if (data.meta?.languageRef) {
    data.meta.languageRef = LANGUAGE_REF[lng];
  }
  const outPath = path.join(root, "src/i18n/locales", lng, "privacy.json");
  fs.writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("wrote", outPath);
}
