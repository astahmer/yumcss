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
	"pandwind/stack/react",
	"pandwind/stack/solid",
	"pandwind/stack/vue",
	"pandwind/stack/preact",
	"pandwind/types/typings",
] as const;

describe("pandwind package boundary", () => {
	test.each(entries)("resolves %s through exports", async (specifier) => {
		const resolved = await import.meta.resolve(specifier);
		// The workspace `pandwind` condition resolves source; a built package
		// resolves dist. Both are valid package-boundary resolutions.
		expect(resolved).toMatch(/packages\/pandwind\/(?:src|dist)\//);
	});
});
