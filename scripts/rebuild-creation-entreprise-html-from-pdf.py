# -*- coding: utf-8 -*-
"""
Reconstruit le HTML des documents création entreprise à partir des PDF,
en préservant titres, gras, italique, listes et tableaux (pdfplumber).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = Path(__file__).resolve().parent / "_creation_entreprise_pdfs"
OUT_DIR = ROOT / "src" / "content" / "creationEntreprise" / "fr"
OUT_DIR.mkdir(parents=True, exist_ok=True)

LINE_Y_TOL = 3.5

DOCS = [
    {
        "pdf": "CONTRAT DE MISE À DISPOSITION DE LOCAUX.pdf",
        "slug": "contrat_mise_disposition_locaux",
        "title": "Contrat de mise à disposition de locaux",
        "short": "Mise à disposition de locaux",
    },
    {
        "pdf": "PACTE D'ASSOCIÉS.pdf",
        "slug": "pacte_associes",
        "title": "Pacte d'associés",
        "short": "Pacte d'associés",
    },
    {
        "pdf": "DÉCLARATION DE NON-CONDAMNATION ET DE FILIATION.pdf",
        "slug": "declaration_non_condamnation",
        "title": "Déclaration de non-condamnation et de filiation",
        "short": "Non-condamnation & filiation",
    },
    {
        "pdf": "ÉTAT DES ACTES ACCOMPLIS POUR LE COMPTE DE LA SOCIÉTÉ EN FORMATION.pdf",
        "slug": "etat_actes_formation",
        "title": "État des actes accomplis pour le compte de la société en formation",
        "short": "État des actes (formation)",
    },
    {
        "pdf": "LISTE DES SOUSCRIPTEURS D_ACTIONS.pdf",
        "slug": "liste_souscripteurs",
        "title": "Liste des souscripteurs d'actions",
        "short": "Liste des souscripteurs",
    },
    {
        "pdf": "CONVENTION D_ASSOCIES REM DIRIGEANTS.pdf",
        "slug": "convention_associes_remuneration",
        "title": "Convention d'associés — rémunération des dirigeants",
        "short": "Rémunération dirigeants",
    },
    {
        "pdf": "STATUTS DE LA SAS.pdf",
        "slug": "statuts_sas",
        "title": "Statuts de la SAS",
        "short": "Statuts SAS",
    },
]

BULLET_RE = re.compile(r"^[•●·▪◦]\s*")
ARTICLE_RE = re.compile(r"^ARTICLE\s+\d", re.I)
SECTION_NUM_RE = re.compile(r"^\d+(\.\d+)+\.?\s+")
PUNCT_NO_SPACE_BEFORE = set(",.;:)]}»")


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def is_bold(fontname: str) -> bool:
    return "bold" in (fontname or "").lower()


def is_italic(fontname: str) -> bool:
    fn = (fontname or "").lower()
    return "italic" in fn or "oblique" in fn


def is_page_number_line(text: str) -> bool:
    return bool(re.fullmatch(r"\d+\s*/\s*\d+", text.strip()))


def is_bullet_char(text: str) -> bool:
    t = (text or "").strip()
    return t in {"•", "●", "·", "▪", "◦"}


def word_in_any_bbox(w: dict, bboxes: list[tuple[float, float, float, float]]) -> bool:
    x0, x1 = float(w["x0"]), float(w["x1"])
    top, bottom = float(w["top"]), float(w.get("bottom", w["top"]) + float(w.get("size", 11)))
    cx = (x0 + x1) / 2
    cy = (top + bottom) / 2
    for bx0, btop, bx1, bbottom in bboxes:
        if bx0 - 1 <= cx <= bx1 + 1 and btop - 1 <= cy <= bbottom + 1:
            return True
    return False


def find_table_bboxes(page) -> list[tuple[float, float, float, float]]:
    out = []
    try:
        for t in page.find_tables() or []:
            x0, top, x1, bottom = t.bbox
            out.append((float(x0), float(top), float(x1), float(bottom)))
    except Exception:
        pass
    return out


def cluster_words_to_lines(words: list[dict]) -> list[dict]:
    if not words:
        return []

    sorted_words = sorted(words, key=lambda w: (float(w["top"]), float(w["x0"])))
    clusters: list[list[dict]] = []
    for w in sorted_words:
        top = float(w["top"])
        if not clusters or abs(top - float(clusters[-1][0]["top"])) > LINE_Y_TOL:
            clusters.append([w])
        else:
            clusters[-1].append(w)

    lines = []
    for cluster in clusters:
        row = sorted(cluster, key=lambda w: float(w["x0"]))
        raw_plain = " ".join(w["text"] for w in row).strip()
        if is_page_number_line(raw_plain):
            continue

        spans: list[dict] = []
        has_bullet = False
        for w in row:
            if is_bullet_char(w["text"]):
                has_bullet = True
                continue
            bold = is_bold(w.get("fontname", ""))
            italic = is_italic(w.get("fontname", ""))
            size = float(w.get("size") or 11)
            key = (bold, italic, round(size, 1))
            x0, x1 = float(w["x0"]), float(w["x1"])
            text = w["text"]

            if spans and spans[-1]["key"] == key:
                gap = x0 - float(spans[-1]["x1"])
                if gap > 1.0:
                    spans[-1]["text"] += " "
                spans[-1]["text"] += text
                spans[-1]["x1"] = x1
            else:
                if spans:
                    gap = x0 - float(spans[-1]["x1"])
                    if (
                        gap > 1.0
                        and not spans[-1]["text"].endswith((" ", "-"))
                        and text[:1] not in PUNCT_NO_SPACE_BEFORE
                    ):
                        spans[-1]["text"] += " "
                spans.append(
                    {
                        "key": key,
                        "bold": bold,
                        "italic": italic,
                        "size": size,
                        "text": text,
                        "x0": x0,
                        "x1": x1,
                    }
                )

        if not spans:
            continue

        meaningful = [s for s in spans if s["text"].strip()]
        plain = "".join(s["text"] for s in spans).strip()
        if not plain:
            continue

        lines.append(
            {
                "top": float(cluster[0]["top"]),
                "x0": spans[0]["x0"],
                "text": plain,
                "spans": spans,
                "max_size": max(s["size"] for s in spans),
                "all_bold": bool(meaningful) and all(s["bold"] for s in meaningful),
                "all_italic": bool(meaningful) and all(s["italic"] for s in meaningful),
                "has_bullet": has_bullet,
            }
        )
    return lines


def render_spans(spans: list[dict]) -> str:
    parts = []
    for s in spans:
        t = esc(s["text"])
        if not t:
            continue
        if not t.strip():
            parts.append(t)
            continue
        classes = []
        if s["bold"]:
            classes.append("pdf-b")
        if s["italic"]:
            classes.append("pdf-i")
        if abs(s["size"] - 11) > 1.5:
            classes.append(f"pdf-s{int(round(s['size']))}")
        if classes:
            parts.append(f'<span class="{" ".join(classes)}">{t}</span>')
        else:
            parts.append(t)
    return "".join(parts)


def looks_like_heading_continuation(prev: dict, nxt: dict) -> bool:
    """Suite d'un titre/article coupé (ex. ACTIONS, QUALITÉ D'ASSOCIÉ…)."""
    if not nxt["all_bold"]:
        return False
    if ARTICLE_RE.match(nxt["text"].strip()):
        return False
    if abs(nxt["max_size"] - prev["max_size"]) > 2:
        return False
    gap = float(nxt["top"]) - float(prev["top"])
    if gap > 36:
        return False
    t = nxt["text"].strip()
    # suite typique : majuscules, tiret, peu de mots
    if t.isupper() and len(t) < 90:
        return True
    if len(t.split()) <= 8 and not t.endswith(".") and nxt["max_size"] >= 13:
        return True
    return False


def classify_line(line: dict) -> str:
    text = line["text"].strip()
    size = line["max_size"]

    if line.get("has_bullet") or BULLET_RE.match(text):
        return "li"

    if ARTICLE_RE.match(text) and (line["all_bold"] or size >= 13):
        return "h2"
    if SECTION_NUM_RE.match(text) and line["all_bold"]:
        return "h3"

    if size >= 20 and line["all_bold"]:
        return "title"
    if size >= 15 and line["all_italic"] and not line["all_bold"]:
        return "subtitle"
    if size >= 15 and line["all_bold"] and line["all_italic"]:
        return "subtitle"
    if size >= 15 and line["all_bold"]:
        if text.isupper() and len(text) < 80:
            return "h2"
        return "title"

    # PRÉAMBULE / titres courts 14pt
    if line["all_bold"] and size >= 13 and text.isupper() and len(text) < 60 and not text.endswith("."):
        return "h2"

    if line["all_bold"] and len(text) < 100 and not text.endswith("."):
        if text.endswith(":") or (text.isupper() and len(text) < 40):
            return "h3"
        if ":" in text and len(text) < 70:
            return "h3"

    return "p"


def merge_line_spans(group: list[dict], joiner: str = " ") -> dict:
    merged_spans: list[dict] = []
    for gi, gl in enumerate(group):
        if gi > 0 and joiner:
            merged_spans.append(
                {
                    "key": (False, False, 11.0),
                    "bold": False,
                    "italic": False,
                    "size": 11.0,
                    "text": joiner,
                    "x0": 0,
                    "x1": 0,
                }
            )
        merged_spans.extend(gl["spans"])
    flat: list[dict] = []
    for s in merged_spans:
        if flat and flat[-1]["key"] == s["key"]:
            flat[-1]["text"] += s["text"]
            flat[-1]["x1"] = s.get("x1", flat[-1]["x1"])
        else:
            flat.append(dict(s))
    plain = "".join(s["text"] for s in flat).strip()
    return {
        "top": group[0]["top"],
        "x0": group[0]["x0"],
        "text": plain,
        "spans": flat,
        "max_size": group[0]["max_size"],
        "all_bold": group[0]["all_bold"],
        "all_italic": group[0]["all_italic"],
        "has_bullet": False,
    }


def merge_wrapped_headings(lines: list[dict]) -> list[dict]:
    out: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        kind = classify_line(line)
        if kind in {"title", "h2"}:
            group = [line]
            j = i + 1
            max_gap = 48 if kind == "title" else 36
            while j < len(lines):
                nxt = lines[j]
                nk = classify_line(nxt)
                gap = float(nxt["top"]) - float(group[-1]["top"])
                if gap > max_gap:
                    break
                if nk == kind or looks_like_heading_continuation(group[-1], nxt):
                    # ne pas avaler un nouvel ARTICLE
                    if nk == "h2" and ARTICLE_RE.match(nxt["text"].strip()) and ARTICLE_RE.match(
                        group[0]["text"].strip()
                    ):
                        break
                    if nk == "h2" and ARTICLE_RE.match(nxt["text"].strip()) and not ARTICLE_RE.match(
                        group[0]["text"].strip()
                    ):
                        # titre générique puis ARTICLE → stop
                        if kind == "title":
                            break
                    group.append(nxt)
                    j += 1
                    continue
                break
            merged = merge_line_spans(group)
            merged["_kind"] = kind if kind == "title" or ARTICLE_RE.match(merged["text"]) or merged["text"].isupper() else "h2"
            # PRÉAMBULE etc.
            if kind == "h2" or ARTICLE_RE.match(merged["text"]) or (
                merged["all_bold"] and merged["text"].isupper() and merged["max_size"] >= 13
            ):
                merged["_kind"] = "h2" if kind != "title" else "title"
            if kind == "title":
                merged["_kind"] = "title"
            out.append(merged)
            i = j
            continue

        if kind == "subtitle":
            # ne fusionne PAS deux sous-titres distincts (convention / société)
            out.append({**line, "_kind": "subtitle"})
            i += 1
            continue

        out.append(line)
        i += 1
    return out


def ends_soft(text: str) -> bool:
    t = text.rstrip()
    if not t:
        return True
    if t.endswith(("-", ",", ";", ":", "«")):
        return True
    if t[-1].islower() or t[-1].isdigit():
        return True
    if t.endswith(("à", "de", "du", "des", "le", "la", "les", "un", "une", "et", "ou", "en")):
        return True
    return False


def merge_wrapped_paragraphs(lines: list[dict]) -> list[dict]:
    lines = merge_wrapped_headings(lines)
    blocks: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        kind = line.get("_kind") or classify_line(line)

        if kind == "li":
            group = [line]
            j = i + 1
            while j < len(lines):
                nxt = lines[j]
                nk = nxt.get("_kind") or classify_line(nxt)
                if nk != "p":
                    break
                gap = float(nxt["top"]) - float(group[-1]["top"])
                if gap > 24:
                    break
                nxt_t = nxt["text"].strip()
                # nouveau paragraphe après la liste (pas une suite d'adresse)
                if re.match(
                    r"^(Ci-après|D['’]une part|D['’]autre part|Fait |Le |La |Les |Entre |ET\b)",
                    nxt_t,
                    re.I,
                ):
                    break
                if re.match(r"^\d+\.\s", nxt_t):
                    break
                prev = group[-1]["text"].rstrip()
                # suite d'adresse (code postal / ville) après virgule ou CP seul
                is_addr_cont = bool(re.match(r"^\d{5}\b", nxt_t)) or (
                    bool(re.search(r"\d{5}\s*$", prev))
                    and float(nxt["x0"]) >= 80
                ) or (
                    prev.endswith(",")
                    and float(nxt["x0"]) >= 85
                    and len(nxt_t.split()) <= 4
                    and nxt_t[:1].isupper()
                )
                # suite de phrase coupée (« agissant » / « en qualité… »)
                is_soft_cont = ends_soft(prev) and (
                    nxt_t[:1].islower() or (float(nxt["x0"]) >= 90 and not nxt_t.endswith("."))
                )
                if is_addr_cont or is_soft_cont:
                    group.append(nxt)
                    j += 1
                    continue
                break
            blocks.append({"kind": "li", "lines": group})
            i = j
            continue

        if kind in {"title", "subtitle", "h2", "h3"}:
            blocks.append({"kind": kind, "lines": [line]})
            i += 1
            continue

        group = [line]
        j = i + 1
        while j < len(lines):
            nxt = lines[j]
            nk = nxt.get("_kind") or classify_line(nxt)
            if nk != "p":
                break
            gap = float(nxt["top"]) - float(group[-1]["top"])
            if gap > 20:
                break
            prev = group[-1]["text"].rstrip()
            nxt_t = nxt["text"].strip()
            # toujours couper avant un item numéroté « 1. … »
            if re.match(r"^\d+\.\s", nxt_t):
                break
            if re.match(r"^(Fait |Le \[|Signature)", nxt_t, re.I) and (
                prev.endswith(".") or prev.endswith(",") or ":" in prev[-3:]
            ):
                break
            if gap > 15 and nxt_t[:1].isupper() and prev.endswith(".") and not ends_soft(prev[:-1]):
                break
            group.append(nxt)
            j += 1
        blocks.append({"kind": "p", "lines": group})
        i = j
    return blocks


def flatten_block_spans(block: dict) -> list[dict]:
    spans: list[dict] = []
    for idx, line in enumerate(block["lines"]):
        if idx > 0:
            prev = block["lines"][idx - 1]["text"].rstrip()
            if prev.endswith("-") and line["text"][:1].islower():
                if spans:
                    spans[-1]["text"] = spans[-1]["text"].rstrip("-")
            else:
                spans.append(
                    {
                        "bold": False,
                        "italic": False,
                        "size": 11,
                        "text": " ",
                        "x0": 0,
                        "x1": 0,
                        "key": (False, False, 11),
                    }
                )
        spans.extend(line["spans"])
    merged: list[dict] = []
    for s in spans:
        if merged and merged[-1]["key"] == s["key"]:
            merged[-1]["text"] += s["text"]
            merged[-1]["x1"] = s.get("x1", merged[-1]["x1"])
        else:
            merged.append(dict(s))
    # nettoyer espaces en fin de spans gras avant texte normal
    for i in range(len(merged) - 1):
        if merged[i]["text"].endswith(" ") and merged[i]["bold"] and not merged[i + 1]["bold"]:
            merged[i]["text"] = merged[i]["text"].rstrip() + " "
            # leave single trailing space on bold — OK for "Général de"
            # better: move space to next
            if merged[i]["text"].endswith(" "):
                merged[i]["text"] = merged[i]["text"].rstrip()
                if not merged[i + 1]["text"].startswith(" "):
                    merged[i + 1]["text"] = " " + merged[i + 1]["text"]
    return merged


def table_to_html(table: list[list[str | None]]) -> str:
    rows = []
    for ri, row in enumerate(table):
        cells = []
        tag = "th" if ri == 0 else "td"
        for cell in row:
            val = esc((cell or "").replace("\n", " ").strip())
            cells.append(f"<{tag}>{val}</{tag}>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return '<table class="pdf-table"><tbody>' + "".join(rows) + "</tbody></table>"


def blocks_to_html_parts(blocks: list[dict], tables: list[dict]) -> list[str]:
    html_parts: list[str] = []
    used_tables: set[int] = set()

    def maybe_flush_tables(before_top: float):
        for ti, tb in enumerate(tables):
            if ti in used_tables:
                continue
            if tb["top"] < before_top - 2:
                html_parts.append(tb["html"])
                used_tables.add(ti)

    for block in blocks:
        top0 = float(block["lines"][0]["top"])
        maybe_flush_tables(top0)
        kind = block["kind"]
        inner = render_spans(flatten_block_spans(block))
        if kind == "title":
            html_parts.append(f'<h1 class="pdf-title">{inner}</h1>')
        elif kind == "subtitle":
            html_parts.append(f'<p class="pdf-subtitle">{inner}</p>')
        elif kind == "h2":
            html_parts.append(f'<h2 class="pdf-h2">{inner}</h2>')
        elif kind == "h3":
            html_parts.append(f'<h3 class="pdf-h3">{inner}</h3>')
        elif kind == "li":
            spans = flatten_block_spans(block)
            if spans:
                spans[0]["text"] = BULLET_RE.sub("", spans[0]["text"])
            html_parts.append(f'<li class="pdf-li">{render_spans(spans)}</li>')
        else:
            html_parts.append(f'<p class="pdf-p">{inner}</p>')

    for ti, tb in enumerate(tables):
        if ti not in used_tables:
            html_parts.append(tb["html"])

    out: list[str] = []
    in_ul = False
    for part in html_parts:
        if part.startswith("<li"):
            if not in_ul:
                out.append('<ul class="pdf-ul">')
                in_ul = True
            out.append(part)
        else:
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append(part)
    if in_ul:
        out.append("</ul>")
    return out


def page_to_html_parts(page) -> list[str]:
    table_bboxes = find_table_bboxes(page)
    tables = []
    try:
        for t in page.find_tables() or []:
            extracted = t.extract()
            if extracted and len(extracted) >= 1 and any(
                any((c or "").strip() for c in row) for row in extracted
            ):
                tables.append({"top": float(t.bbox[1]), "html": table_to_html(extracted)})
    except Exception:
        tables = []

    words = page.extract_words(
        extra_attrs=["fontname", "size"],
        keep_blank_chars=False,
        use_text_flow=False,
    ) or []
    if table_bboxes:
        words = [w for w in words if not word_in_any_bbox(w, table_bboxes)]

    lines = cluster_words_to_lines(words)
    blocks = merge_wrapped_paragraphs(lines)
    return blocks_to_html_parts(blocks, tables)


def stitch_cross_page_headings(parts: list[str]) -> list[str]:
    """Fusionne un h2 coupé en fin de page avec la suite en tête de page suivante."""
    if not parts:
        return parts
    out = [parts[0]]
    for part in parts[1:]:
        prev = out[-1]
        # h2 incomplet suivi d'un h2/h3 court en majuscules
        m_prev = re.match(r'^<h2 class="pdf-h2">(.*)</h2>$', prev, re.S)
        m_next = re.match(r'^<h([23]) class="pdf-h\1">(.*)</h\1>$', part, re.S)
        if m_prev and m_next:
            next_inner = m_next.group(2)
            plain = re.sub(r"<[^>]+>", "", next_inner).strip()
            if plain.isupper() and len(plain) < 90 and not ARTICLE_RE.match(plain):
                out[-1] = f'<h2 class="pdf-h2">{m_prev.group(1)} {next_inner}</h2>'
                continue
        # titre h1 multi-lignes
        m_t1 = re.match(r'^<h1 class="pdf-title">(.*)</h1>$', prev, re.S)
        m_t2 = re.match(r'^<h1 class="pdf-title">(.*)</h1>$', part, re.S)
        if m_t1 and m_t2:
            out[-1] = f'<h1 class="pdf-title">{m_t1.group(1)} {m_t2.group(1)}</h1>'
            continue
        out.append(part)
    return out


def pdf_to_html(pdf_path: Path) -> str:
    parts = ['<div class="pdf-legal-doc" lang="fr">']
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_parts = page_to_html_parts(page)
            parts.extend(page_parts)
    # stitch après assemblage multi-pages
    body = stitch_cross_page_headings(parts[1:])
    return "\n".join(['<div class="pdf-legal-doc" lang="fr">', *body, "</div>"])


def main() -> None:
    catalog = []
    for doc in DOCS:
        pdf_path = PDF_DIR / doc["pdf"]
        if not pdf_path.exists():
            raise SystemExit(f"PDF manquant: {pdf_path}")
        html = pdf_to_html(pdf_path)
        out = OUT_DIR / f"{doc['slug']}.html"
        out.write_text(html, encoding="utf-8")
        catalog.append(
            {
                "slug": doc["slug"],
                "title": doc["title"],
                "short": doc["short"],
                "htmlFile": f"{doc['slug']}.html",
            }
        )
        print(f"OK {doc['slug']}: {len(html)} chars")

    (OUT_DIR / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    lines = [
        "/** Contenu HTML FR des documents création entreprise (généré depuis PDF). */",
        "",
    ]
    exports = []
    for d in catalog:
        slug = d["slug"]
        html = (OUT_DIR / d["htmlFile"]).read_text(encoding="utf-8")
        var = "HTML_" + slug.upper()
        lines.append(f"export const {var} = {json.dumps(html)};")
        lines.append("")
        exports.append(
            f"  {slug}: {{\n"
            f"    title: {json.dumps(d['title'], ensure_ascii=False)},\n"
            f"    short: {json.dumps(d['short'], ensure_ascii=False)},\n"
            f"    html: {var},\n"
            f"  }},"
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
    ts = ROOT / "src" / "content" / "creationEntreprise" / "docs.fr.ts"
    ts.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", ts)


if __name__ == "__main__":
    main()
