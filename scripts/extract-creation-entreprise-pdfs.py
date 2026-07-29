# Extrait le texte des PDF création entreprise vers des .txt
from pathlib import Path
from pypdf import PdfReader

src = Path(__file__).resolve().parent / "_creation_entreprise_pdfs"
out = src / "text"
out.mkdir(exist_ok=True)

for pdf in sorted(src.glob("*.pdf")):
    reader = PdfReader(str(pdf))
    parts = []
    for i, page in enumerate(reader.pages):
        t = page.extract_text() or ""
        parts.append(f"--- page {i+1} ---\n{t}")
    text = "\n\n".join(parts).strip()
    dest = out / (pdf.stem + ".txt")
    dest.write_text(text, encoding="utf-8")
    print(f"{pdf.name}: {len(text)} chars, {len(reader.pages)} pages -> {dest.name}")
