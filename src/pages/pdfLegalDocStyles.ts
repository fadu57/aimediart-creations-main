/** Styles fidèles aux PDF création entreprise (Arial / gras / titres). */
export const PDF_LEGAL_DOC_CSS = `
.pdf-legal-doc {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  line-height: 1.45;
  color: #1f1f1f;
  max-width: 740px;
  margin: 0 auto;
}
.pdf-legal-doc .pdf-title {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 20pt;
  font-weight: 700;
  text-align: center;
  line-height: 1.25;
  margin: 0 0 0.75rem;
  letter-spacing: 0.01em;
}
.pdf-legal-doc .pdf-title .pdf-s24 { font-size: 24pt; }
.pdf-legal-doc .pdf-title .pdf-s20 { font-size: 20pt; }
.pdf-legal-doc .pdf-h2 .pdf-s16 { font-size: 16pt; }
.pdf-legal-doc .pdf-h2 .pdf-s14 { font-size: 14pt; }
.pdf-legal-doc .pdf-subtitle {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16pt;
  font-weight: 400;
  font-style: italic;
  text-align: center;
  margin: 0.35rem 0 0.85rem;
}
.pdf-legal-doc .pdf-h2 {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14pt;
  font-weight: 700;
  margin: 1.15rem 0 0.45rem;
  text-align: left;
}
.pdf-legal-doc .pdf-h3 {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12pt;
  font-weight: 700;
  margin: 0.9rem 0 0.35rem;
}
.pdf-legal-doc .pdf-p {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  font-weight: 400;
  margin: 0.35rem 0;
  text-align: justify;
}
.pdf-legal-doc .pdf-ul {
  margin: 0.35rem 0 0.55rem;
  padding-left: 1.35rem;
  list-style-type: disc;
}
.pdf-legal-doc .pdf-li {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  margin: 0.2rem 0;
  text-align: justify;
}
.pdf-legal-doc .pdf-b { font-weight: 700; }
.pdf-legal-doc .pdf-i { font-style: italic; }
.pdf-legal-doc .pdf-b.pdf-i { font-weight: 700; font-style: italic; }
.pdf-legal-doc .pdf-s10 { font-size: 10pt; }
.pdf-legal-doc .pdf-s12 { font-size: 12pt; }
.pdf-legal-doc .pdf-s14 { font-size: 14pt; }
.pdf-legal-doc .pdf-s16 { font-size: 16pt; }
.pdf-legal-doc .pdf-s18 { font-size: 18pt; }
.pdf-legal-doc .pdf-s20 { font-size: 20pt; }
.pdf-legal-doc .pdf-s24 { font-size: 24pt; }
.pdf-legal-doc .pdf-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0 1rem;
  font-size: 10pt;
}
.pdf-legal-doc .pdf-table th,
.pdf-legal-doc .pdf-table td {
  border: 1px solid #333;
  padding: 0.35rem 0.45rem;
  vertical-align: top;
  text-align: left;
  font-family: Arial, Helvetica, sans-serif;
}
.pdf-legal-doc .pdf-table th {
  font-weight: 700;
  background: #f3f3f3;
}
`;
