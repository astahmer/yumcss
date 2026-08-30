import { describe, expect, test } from "vitest";
import { CodemodAdapterId } from "pandwind-codemod/swap/browser";
import { createMigrationLab } from "./migration-lab.ts";

describe("migration lab", () => {
	test("projects the built-in adapter registry into both endpoint lists", () => {
		const lab = createMigrationLab();
		const sourceIds = new Set(lab.sources.map((endpoint) => endpoint.id));
		const targetIds = new Set(lab.targets.map((endpoint) => endpoint.id));

		expect(sourceIds).toEqual(targetIds);
		expect(sourceIds).toContain(CodemodAdapterId.StyledComponents);
		expect(targetIds).toContain(CodemodAdapterId.Pandwind);
	});

	test("runs the same safe migration contract used by the codemod", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.Emotion,
			CodemodAdapterId.Pandwind,
			lab.sampleFor(CodemodAdapterId.Emotion),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.class");
		expect(result.validations[0]).toMatchObject({ valid: true, lossiness: "lossless" });
	});

	test("returns an explicit error for a route the registry does not know", () => {
		const lab = createMigrationLab();
		const result = lab.migrate("not-a-source", CodemodAdapterId.Pandwind, "const value = 1;");

		expect(result).toEqual({
			ok: false,
			message: "unknown source style dialect: not-a-source",
		});
	});

	test("keeps every registered sample on the safe migration path", () => {
		const lab = createMigrationLab();
		for (const source of lab.sources) {
			const result = lab.migrate(source.id, CodemodAdapterId.Pandwind, lab.sampleFor(source.id));
			expect(result.ok, source.id).toBe(true);
		}
	});
});
