import { describe, expect, test } from "vitest";
import { CodemodAdapterId } from "pandwind-codemod/swap/browser";
import { createMigrationLab } from "./migration-lab.ts";
import { createPlaygroundTailwindResolver } from "./tailwind-default-resolver.ts";

describe("playground Tailwind defaults", () => {
	test("resolves the documented default utilities without a project config", async () => {
		const resolver = createPlaygroundTailwindResolver();
		await resolver.ready;
		const lab = createMigrationLab({ tailwindResolver: resolver });
		const result = lab.migrate(
			CodemodAdapterId.Tailwind,
			CodemodAdapterId.Pandwind,
			'import "tailwindcss";\n<div className="text-white bg-black p-4" />',
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.residuals.filter(({ kind }) => kind === "unknown-utility")).toEqual([]);
		expect(result.code).toContain("color");
		expect(result.code).toContain("padding");
		expect(result.code).toContain("#fff");
		expect(result.code).toContain("0.25rem");
		expect(result.code).not.toContain("var(--");
	});
});
