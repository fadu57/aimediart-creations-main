const fs = require("fs");
const file = process.argv[2];
const s = fs.readFileSync(file, "utf8");
const lines = s.split("\n");
const out = [];
lines.forEach((l, i) => {
  const trimmed = l.trim();
  if (/^(\/\/|\*|\/\*)/.test(trimmed)) return;
  const jsxText = />\s*[A-Za-zÀ-ÿ][^<>{}]*[A-Za-zÀ-ÿ.!?…)]\s*</.test(l);
  const hasToast = /toast\.(error|success|warning|info)\(/.test(l);
  const hasAttr = /(placeholder|title|aria-label)=\s*["'][^"']*[A-Za-zÀ-ÿ]/.test(l);
  const frStr = /["'][^"']*[éèàùâêîôûçëïüÉÈÀ][^"']*["']/.test(l);
  if (jsxText || hasToast || hasAttr || frStr) {
    out.push((i + 1) + "| " + trimmed);
  }
});
console.log("FILE:", file, "candidates:", out.length);
console.log(out.join("\n"));
