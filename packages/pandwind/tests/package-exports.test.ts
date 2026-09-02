import { describe, expect, test } from "vitest";

const entries = [
	"pandwind/css",
	"pandwind/tw",
	"pandwind/cx",
	"pandwind/preset",
	"pandwind/design",
	"pandwind/vite",
	"pandwind/unplugin",
	"pandwind/codegen/types",
	"pandwind/codegen/theme",
	"pandwind/codegen/collect",
	"pandwind/codegen/bridge",
	"pandwind/react-native",
	"pandwind/opentui",
	"pandwind/stack",
	"pandwind/types/typings",
] as const;

describe("pandwind package boundary", () => {
	test.each(entries)("resolves %s through exports", async (specifier) => {
		const resolved = await import.meta.resolve(specifier);
		expect(resolved).toContain("packages/pandwind/src/");
	});
});
