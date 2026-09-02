import { describe, expect, test } from "vitest";

const entries = [
	"pandwind-codemod/swap",
	"pandwind-codemod/swap/identifiers",
	"pandwind-codemod/swap/corpus",
	"pandwind-codemod/migration/meta",
	"pandwind-codemod/migration/map",
	"pandwind-codemod/migration/source",
	"pandwind-codemod/migration/shared",
	"pandwind-codemod/migration/tokens",
] as const;

describe("pandwind-codemod package boundary", () => {
	test.each(entries)("resolves %s through exports", async (specifier) => {
		const resolved = await import.meta.resolve(specifier);
		expect(resolved).toContain("packages/codemod/src/");
	});
});
