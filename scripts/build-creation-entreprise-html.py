# Convertit les TXT extraits en HTML structurés + catalogue TS.
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TXT_DIR = Path(__file__).resolve().parent / "_creation_entreprise_pdfs" / "text"
OUT_DIR = ROOT / "src" / "content" / "creationEntreprise" / "fr"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DOCS = [
    {
        "file": "CONTRAT DE MISE À DISPOSITION DE LOCAUX.txt",
        "slug": "contrat_mise_disposition_locaux",
        "title": "Contrat de mise à disposition de locaux",
        "short": "Mise à disposition de locaux",
    },
    {
        "file": "PACTE D'ASSOCIÉS.txt",
        "slug": "pacte_associes",
        "title": "Pacte d'associés",
        "short": "Pacte d'associés",
    },
    {
        "file": "DÉCLARATION DE NON-CONDAMNATION ET DE FILIATION.txt",
        "slug": "declaration_non_condamnation",
        "title": "Déclaration de non-condamnation et de filiation",
        "short": "Non-condamnation & filiation",
    },
    {
        "file": "ÉTAT DES ACTES ACCOMPLIS POUR LE COMPTE DE LA SOCIÉTÉ EN FORMATION.txt",
        "slug": "etat_actes_formation",
        "title": "État des actes accomplis pour le compte de la société en formation",
        "short": "État des actes (formation)",
    },
    {
        "file": "LISTE DES SOUSCRIPTEURS D_ACTIONS.txt",
        "slug": "liste_souscripteurs",
        "title": "Liste des souscripteurs d'actions",
        "short": "Liste des souscripteurs",
    },
    {
        "file": "CONVENTION D_ASSOCIES REM DIRIGEANTS.txt",
        "slug": "convention_associes_remuneration",
        "title": "Convention d'associés — rémunération des dirigeants",
        "short": "Rémunération dirigeants",
    },
    {
        "file": "STATUTS DE LA SAS.txt",
        "slug": "statuts_sas",
        "title": "Statuts de la SAS",
        "short": "Statuts SAS",
    },
]


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def clean_raw(text: str) -> str:
    # Retire marqueurs de page
    text = re.sub(r"--- page \d+ ---\n?", "\n", text)
    text = re.sub(r"^\s*\d+\s*/\s*\d+\s*$", "", text, flags=re.M)
    # Normalise espaces
    text = text.replace("\r\n", "\n").replace("\u00a0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def paragraphize(text: str) -> str:
    lines = [ln.strip() for ln in text.split("\n")]
    blocks: list[str] = []
    buf: list[str] = []

    def flush():
        nonlocal buf
        if not buf:
            return
        joined = " ".join(buf)
        joined = re.sub(r"\s+", " ", joined).strip()
        if joined:
            # Titres ARTICLE / sections
            if re.match(r"^(ARTICLE|Article)\s+\d+", joined) or re.match(
                r"^[A-ZÉÈÊÀÂÙÛÔÎÇ0-9][A-ZÉÈÊÀÂÙÛÔÎÇ0-9\s\-''']{8,}$", joined
            ):
                if len(joined) < 120 and not joined.endswith("."):
                    blocks.append(f"<h2>{esc(joined)}</h2>")
                    buf = []
                    return
            if joined.startswith("•") or joined.startswith("●") or joined.startswith("- "):
                items = [joined]
                # already one item
                blocks.append(f"<ul><li>{esc(joined.lstrip('•●- ').strip())}</li></ul>")
            else:
                blocks.append(f"<p>{esc(joined)}</p>")
        buf = []

    for ln in lines:
        if not ln:
            flush()
            continue
        # Bullet alone
        if ln.startswith("•") or ln.startswith("●") or ln.startswith("- "):
            flush()
            blocks.append(f"<ul><li>{esc(ln.lstrip('•●- ').strip())}</li></ul>")
            continue
        # Merge hyphenated line breaks typical of PDF
        if buf and buf[-1].endswith("-") and ln and ln[0].islower():
            buf[-1] = buf[-1][:-1] + ln
            continue
        buf.append(ln)
    flush()

    # Merge consecutive <ul>
    html = "\n".join(blocks)
    html = re.sub(r"</ul>\s*<ul>", "\n", html)
    return html


def build_doc_html(title: str, body_html: str) -> str:
    return (
        f'<h1 class="font-serif text-3xl font-bold tracking-tight text-[#1f1f1f]">{esc(title)}</h1>\n'
        f'<p class="mt-2 text-sm text-neutral-600">Société ALTIVART — document de création d’entreprise '
        f"(brouillon à faire valider).</p>\n"
        f'<article class="legal-article mt-6 space-y-3 text-[15px] leading-relaxed text-[#1f1f1f]">\n'
        f"{body_html}\n"
        f"</article>\n"
    )


catalog = []
for doc in DOCS:
    raw = (TXT_DIR / doc["file"]).read_text(encoding="utf-8")
    cleaned = clean_raw(raw)
    body = paragraphize(cleaned)
    html = build_doc_html(doc["title"], body)
    out_path = OUT_DIR / f"{doc['slug']}.html"
    out_path.write_text(html, encoding="utf-8")
    catalog.append(
        {
            "slug": doc["slug"],
            "title": doc["title"],
            "short": doc["short"],
            "route": f"/juridique/{doc['slug'].replace('_', '-')}",
            "htmlFile": f"{doc['slug']}.html",
        }
    )
    print("wrote", out_path.name, len(html))

(OUT_DIR / "catalog.json").write_text(
    json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print("catalog ok")
