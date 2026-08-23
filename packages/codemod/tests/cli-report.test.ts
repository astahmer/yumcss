/**
 * Error paths + report math for the codemod and analyze CLIs — the parts
 * users hit first when wiring is wrong.
 */
import { describe, expect, test } from "vitest";
import { buildReport, type ReportEntry } from "../src/cli.ts";
import { loadTwConfig } from "../../analyze/src/analyze.ts";
import { transformSource } from "../src/migrate.ts";
import { loadMetaFromSources } from "../src/meta.ts";
import { resolve } from "node:path";

const appDir = resolve(import.meta.dirname, "../../../apps/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
});

const entry = (
	relative: string,
	converted: number,
	skipped: number,
	verbatim: number,
): ReportEntry => ({
	relative,
	result: {
		code: "",
		changed: converted > 0 || skipped > 0,
		converted,
		unmappedTokens: Array.from({ length: verbatim }, (_, i) => ({
			file: relative,
			token: `tok-${i}`,
			reason: "x",
		})),
		skippedByMarker: skipped,
	},
});

describe("codemod --report math", () => {
	test("percentages and counts aggregate across files", () => {
		const report = buildReport([
			entry("a.ts", 10, 2, 4),
			entry("b.ts", 0, 1, 0),
			entry("c.ts", 5, 0, 3),
		]);
		expect(report).toContain("call sites through pandwind: 15/18 (83%)");
		expect(report).toContain("flagged for manual work: 3 site(s)");
		expect(report).toContain("tokens kept verbatim (unknown to metadata): 7");
		expect(report).toContain("- a.ts: 2 flagged, 4 verbatim");
	});

	test("zero-site edge keeps a clean line without NaN", () => {
		const report = buildReport([entry("empty.ts", 0, 0, 0)]);
		expect(report).toContain("call sites through pandwind: 0/0");
		expect(report).not.toContain("NaN");
		// nothing flagged -> no attention section
		expect(report).not.toContain("files needing attention:");
	});
});

describe("analyze error paths", () => {
	test("missing tw config throws with the offending path", () => {
		expect(() => loadTwConfig("/nonexistent/src/tw.ts")).toThrow(/tw\.ts/);
	});

	test("unresolvable token in metadata surfaces as verbatim keep, not a crash", () => {
		// The CLI's robustness contract: bad inputs degrade to keeps.
		const result = transformSource(`export const a = cx("totally-not-a-utility");`, meta, {
			mode: "keep",
			file: "t.ts",
		});
		expect(result.code).toContain("totally-not-a-utility");
	});
});
