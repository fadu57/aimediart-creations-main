const fs = require("fs");
const s = fs.readFileSync("src/pages/Users.tsx", "utf8");
const lines = s.split("\n");
const out = [];
lines.forEach((l, i) => {
  const trimmed = l.trim();
  if (/^(\/\/|\*|\/\*)/.test(trimmed)) return;
  // JSX text node: >Something Text< with a letter
  const jsxText = />\s*[A-Za-zÀ-ÿ][^<>{}]*[A-Za-zÀ-ÿ.!?…)]\s*</.test(l);
  const hasToast = /toast\.(error|success|warning|info)\(/.test(l);
  const hasAttr = /(placeholder|title|aria-label)=\s*["'][^"']*[A-Za-zÀ-ÿ]/.test(l);
  if (jsxText || hasToast || hasAttr) {
    out.push((i + 1) + "| " + trimmed);
  }
});
console.log("total candidate lines:", out.length);
fs.writeFileSync("scripts/users-scan.txt", out.join("\n"), "utf8");
