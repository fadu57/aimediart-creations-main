# Génère src/content/creationEntreprise/docs.fr.ts depuis les HTML.
from __future__ import annotations

import json
from pathlib import Path

fr = Path(__file__).resolve().parent.parent / "src" / "content" / "creationEntreprise" / "fr"
catalog = json.loads((fr / "catalog.json").read_text(encoding="utf-8"))

lines = [
    "/** Contenu HTML FR des documents création entreprise (généré). */",
    "",
]
exports: list[str] = []
for d in catalog:
    slug = d["slug"]
    html = (fr / d["htmlFile"]).read_text(encoding="utf-8")
    var = "HTML_" + slug.upper()
    lines.append(f"export const {var} = {json.dumps(html)};")
    lines.append("")
    exports.append(
        "  "
        + slug
        + ": {\n"
        + f"    title: {json.dumps(d['title'], ensure_ascii=False)},\n"
        + f"    short: {json.dumps(d['short'], ensure_ascii=False)},\n"
        + f"    html: {var},\n"
        + "  },"
    )

lines.append("export const CREATION_ENTREPRISE_DOCS = {")
lines.extend(exports)
lines.append("} as const;")
lines.append("")
lines.append("export type CreationEntrepriseSlug = keyof typeof CREATION_ENTREPRISE_DOCS;")
lines.append("")
lines.append(
    "export const CREATION_ENTREPRISE_SLUGS = Object.keys(CREATION_ENTREPRISE_DOCS) as CreationEntrepriseSlug[];"
)
lines.append("")

out = Path(__file__).resolve().parent.parent / "src" / "content" / "creationEntreprise" / "docs.fr.ts"
out.write_text("\n".join(lines), encoding="utf-8")
print("wrote", out, out.stat().st_size)
