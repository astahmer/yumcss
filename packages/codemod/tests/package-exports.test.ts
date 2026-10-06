import { describe, expect, test } from "vitest";

const entries = [
	"@yumcss/codemod/tw",
	"@yumcss/codemod/runtime",
	"@yumcss/codemod/swap",
	"@yumcss/codemod/css",
	"@yumcss/codemod/swap/identifiers",
	"@yumcss/codemod/swap/corpus",
	"@yumcss/codemod/migration/meta",
	"@yumcss/codemod/migration/map",
	"@yumcss/codemod/migration/shared",
	"@yumcss/codemod/migration/tokens",
] as const;

describe("yumcss-codemod package boundary", () => {
	test.each(entries)("resolves %s through exports", async (specifier) => {
		const resolved = await import.meta.resolve(specifier);
		expect(resolved).toContain("packages/codemod/src/");
	});
});
