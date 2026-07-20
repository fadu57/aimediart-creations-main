#!/usr/bin/env node
// PreToolUse guard (Claude Code) — versioned project safeguard.
// Blocks dangerous Bash commands that glob-based permissions.deny can miss
// (SQL via `psql -f`, chained commands). Exit code 2 = block + show stderr.
// Only runs under Claude Code; the equivalent rule for any agent lives in
// docs/engineering-standards.md and should also be enforced in CI.
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const cmd = (JSON.parse(input).tool_input?.command || "").toLowerCase();
  const patterns = [
    /rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)/, // rm -rf variants
    /git\s+push\s+.*(--force|\s-f)\b/,
    /drop\s+(table|database|schema)/,
    /truncate\s+/,
    /--delete\b.*origin|origin.*--delete\b/,
  ];
  const hit = patterns.find((p) => p.test(cmd));
  if (hit) {
    console.error(
      "Blocked by project safeguard hook. This action requires explicit human approval. Do not work around this block."
    );
    process.exit(2);
  }
  process.exit(0);
});
