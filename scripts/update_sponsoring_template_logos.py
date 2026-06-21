#!/usr/bin/env python3
"""Met à jour template.docx : ligne logos AIMEDIArt (gauche) + agence (droite, placeholder rIdAgencyLogo)."""
import re
import zipfile
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parents[1] / "supabase/functions/generate-sponsoring-convention/template.docx"

# Drawing AIMEDIArt existant (rId7) — extrait tel quel pour cellule gauche
AIMEDIART_DRAWING = """<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" wp14:anchorId="306737D1" wp14:editId="512DFF36"><wp:extent cx="1989734" cy="476529"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="555484815" name="Image 1"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="555484815" name="Image 555484815"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId7" cstate="print"><a:extLst><a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" val="0"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2010761" cy="481565"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"""

# Placeholder logo agence — remplacé à la génération (rIdAgencyLogo)
AGENCY_LOGO_PLACEHOLDER = "<!--AGENCY_LOGO_PLACEHOLDER-->"

LOGO_TABLE = f"""<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>
      <w:insideH w:val="nil"/><w:insideV w:val="nil"/>
    </w:tblBorders>
    <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
  </w:tblPr>
  <w:tblGrid><w:gridCol w:w="4819"/><w:gridCol w:w="4819"/></w:tblGrid>
  <w:tr>
    <w:tc>
      <w:tcPr><w:tcW w:w="2500" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p w14:paraId="3108F4EF" w14:textId="47CD7751" w:rsidR="00662CDA" w:rsidRDefault="005B0148" w:rsidP="008748F9">
        {AIMEDIART_DRAWING}
      </w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="2500" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p w14:paraId="A1B2C3D4" w14:textId="77777777" w:rsidR="00662CDA" w:rsidRDefault="005B0148" w:rsidP="008748F9">
        <w:pPr><w:jc w:val="right"/></w:pPr>
        {AGENCY_LOGO_PLACEHOLDER}
      </w:p>
    </w:tc>
  </w:tr>
</w:tbl>"""


def main() -> None:
    with zipfile.ZipFile(TEMPLATE, "r") as zin:
        document_xml = zin.read("word/document.xml").decode("utf-8")
        other_files = {name: zin.read(name) for name in zin.namelist() if name != "word/document.xml"}

    # Remplace le premier paragraphe (logo seul) par le tableau deux colonnes
    pattern = r"<w:p w14:paraId=\"3108F4EF\".*?</w:p>"
    if not re.search(pattern, document_xml, flags=re.DOTALL):
        raise SystemExit("Paragraphe logo AIMEDIArt introuvable dans document.xml")

    document_xml = re.sub(pattern, LOGO_TABLE, document_xml, count=1, flags=re.DOTALL)

    with zipfile.ZipFile(TEMPLATE, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for name, data in other_files.items():
            zout.writestr(name, data)
        zout.writestr("word/document.xml", document_xml.encode("utf-8"))

    print(f"Template mis à jour : {TEMPLATE}")


if __name__ == "__main__":
    main()
