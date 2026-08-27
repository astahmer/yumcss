import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const swapRoot = resolve(import.meta.dirname, "../src/swap");
const readSwap = (name: string): string => readFileSync(resolve(swapRoot, name), "utf8");

describe("codemod architecture boundaries", () => {
	test("keeps ecosystem policy behind adapter family boundaries", () => {
		const migration = readSwap("adapter-migration.ts");
		const engine = readSwap("external-adapters.ts");
		for (const sourceId of [
			"emotion",
			"jss",
			"linaria",
			"panda",
			"stitches",
			"stylex",
			"vanilla-extract",
		]) {
			expect(migration).not.toContain(`options.from === "${sourceId}"`);
			expect(engine).not.toContain(`options.from === "${sourceId}"`);
		}
		expect(migration).not.toContain("AdapterDefinition");
		expect(engine).not.toContain("AdapterDefinition");
	});

	test("has one composition boundary for built-in adapters and no legacy catalog", () => {
		expect(existsSync(resolve(swapRoot, "extra-adapters.ts"))).toBe(false);
		expect(readSwap("adapters/plugin.ts")).toContain("BUILTIN_ADAPTER_PLUGIN");
		expect(readdirSync(swapRoot).some((name) => name.startsWith("panda-"))).toBe(false);
		expect(existsSync(resolve(swapRoot, "adapters/panda/index.ts"))).toBe(true);
	});
});
