import { describe, expect, test } from "vitest";
import { MigrationText } from "../src/swap/migration-text.ts";

describe("migration text policies", () => {
	test("consolidates generated imports deterministically", () => {
		expect(
			MigrationText.consolidateImports([
				'import { z } from "pkg";',
				'import { a } from "pkg";',
				'import thing from "other";',
			]),
		).toEqual(['import { a, z } from "pkg";', 'import thing from "other";']);
	});

	test("preserves keyframe bindings during target validation", () => {
		expect(
			MigrationText.validationSource("keyframes({})", {
				rules: [{ kind: "keyframes", name: "spin", declarations: [], conditions: [], children: [] }],
			} as never),
		).toBe("const spin = keyframes({})");
	});
});
