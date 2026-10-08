import { expect, test } from "vitest";
import { partitionTypecheckDiagnostics } from "../../../scripts/proof-typecheck-diagnostics.ts";

test("source baselines cannot suppress new generated diagnostics or repeated errors", () => {
	const sourceError = "src/test.tsx(1,2): error TS2322: Wrong source type.";
	const movedError = "src/test.tsx(20,2): error TS2322: Wrong source type.";
	const generatedError = "src/__yumcss/recipe.ts(1,2): error TS2322: Wrong source type.";
	const newError = "src/test.tsx(30,2): error TS2304: Cannot find name 'targetCss'.";
	expect(
		partitionTypecheckDiagnostics({
			source: [sourceError],
			generated: [movedError, movedError, generatedError, newError],
		}),
	).toEqual({ baseline: [movedError], errors: [movedError, generatedError, newError] });
});

test("continuation text remains part of a diagnostic's identity", () => {
	const header = "src/test.tsx(1,2): error TS2345: Invalid argument.";
	expect(
		partitionTypecheckDiagnostics({
			source: [header, "  Source detail."],
			generated: [header, "  Generated detail."],
		}),
	).toEqual({ baseline: [], errors: [`${header}\n  Generated detail.`] });
});
