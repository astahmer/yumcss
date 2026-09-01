import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	CodemodPatternId,
	SwapSourceId,
	SwapTargetId,
} from "../src/swap/index.ts";

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

	test("uses typed identities at composition boundaries", () => {
		expect(CodemodAdapterId.StyleX).toBe("stylex");
		expect(CodemodPatternId.StyleXCreate).toBe("stylex-create");
		expect(SwapSourceId.Tw).toBe("tw");
		expect(SwapTargetId.CssClass).toBe("css.class");

		const orchestration = [
			readSwap("adapter-migration.ts"),
			readSwap("adapter-catalog.ts"),
			readSwap("semantic-ir.ts"),
			readSwap("adapters/pandwind.adapter.ts"),
		].join("\n");
		expect(readSwap("semantic-ir.ts")).not.toContain("stylex");
		for (const identity of ["stylex", "panda", "pandwind"]) {
			expect(orchestration).not.toMatch(new RegExp(`(?:===|!==)\\s*[\\"']${identity}[\\"']`));
		}
	});

	test("has one composition boundary for built-in adapters and no parallel catalog", () => {
		expect(existsSync(resolve(swapRoot, "extra-adapters.ts"))).toBe(false);
		expect(readSwap("adapters/plugin.ts")).toContain("BUILTIN_ADAPTER_PLUGIN");
		expect(readdirSync(swapRoot).some((name) => name.startsWith("panda-"))).toBe(false);
		expect(existsSync(resolve(swapRoot, "adapters/panda/index.ts"))).toBe(true);
	});

	test("keeps project migration behavior out of the CLI", () => {
		const cli = readFileSync(resolve(swapRoot, "../cli.ts"), "utf8");
		expect(cli).not.toContain("runPandaMigration");
		expect(cli).not.toContain("inferCommonRoot");
		expect(cli).toContain("getProjectMigrationCommand");
	});
});
