import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { parseSync } from "oxc-parser";

test("dbg", () => {
	const code = 'const base = tw({ display: "flex", gap: "4" });\ncx(base, "p-2");';
	const parsed = parseSync("playground.tsx", code, { sourceType: "module", lang: "tsx" });
	const program = parsed.program as unknown as {
		body?: Array<{ type: string; start: number; end: number }>;
	};
	const stmts = (program.body ?? []).map((s) => ({ type: s.type, start: s.start, end: s.end }));
	writeFileSync("/tmp/dbg-multi.json", JSON.stringify({ stmts, codeLen: code.length }, null, 1));
});
