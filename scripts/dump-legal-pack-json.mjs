import fs from "fs";

const xml = fs.readFileSync("tmp-legal-pack/word/document.xml", "utf8");
const parts = xml.split("<w:p ");
const lines = [];
for (const chunk of parts.slice(1)) {
  const styleMatch = chunk.match(/<w:pStyle w:val="([^"]+)"/);
  const style = styleMatch ? styleMatch[1] : "";
  const isList = /<w:numPr>/.test(chunk);
  const texts = [...chunk.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
  );
  const text = texts.join("").replace(/\s+/g, " ").trim();
  if (text) lines.push({ style, isList, text });
}
fs.writeFileSync("tmp-legal-lines-utf8.json", JSON.stringify(lines, null, 0), "utf8");
console.log("wrote", lines.length, "lines");
