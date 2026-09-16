import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { format } from "oxfmt";
import { describe, expect, test } from "vitest";
import { generateDesignSystem } from "../src/tw/generate-types.ts";

const app = resolve(import.meta.dirname, "../../../examples/example");
const css = readFileSync(resolve(app, "src/tailwind.css"), "utf8");

describe("typegen determinism", () => {
	test("generating twice produces byte-identical output", async () => {
		const [first, second] = await Promise.all([
			generateDesignSystem(css, resolve(app, "src")),
			generateDesignSystem(css, resolve(app, "src")),
		]);

		expect(first.typesDts).toBe(second.typesDts);
		expect(first.twTs).toBe(second.twTs);
		expect(first.twRuntimeTs).toBe(second.twRuntimeTs);
		expect(first.twConflictsTs).toBe(second.twConflictsTs);
		expect(first.twBuildTs).toBe(second.twBuildTs);
		expect(first.utilityCount).toBe(second.utilityCount);
		expect(first.variantCount).toBe(second.variantCount);
	});

	test("generated output matches the committed artifacts", async () => {
		const { typesDts, twTs, twRuntimeTs, twConflictsTs, twBuildTs } = await generateDesignSystem(
			css,
			resolve(app, "src"),
		);

		// Drift guard: a Tailwind minor upgrade that changes the design system
		// makes this fail, forcing a review and a deliberate regeneration.
		expect(typesDts).toBe(readFileSync(resolve(app, "src/types.d.ts"), "utf8"));
		expect(twTs).toBe(readFileSync(resolve(app, "src/tw.ts"), "utf8"));
		expect(
			(await format("tw.runtime.ts", twRuntimeTs, { printWidth: 100, useTabs: true })).code,
		).toBe(readFileSync(resolve(app, "src/tw.runtime.ts"), "utf8"));
		expect(
			(await format("tw.conflicts.ts", twConflictsTs, { printWidth: 100, useTabs: true })).code,
		).toBe(readFileSync(resolve(app, "src/tw.conflicts.ts"), "utf8"));
		expect((await format("tw.build.ts", twBuildTs, { printWidth: 100, useTabs: true })).code).toBe(
			readFileSync(resolve(app, "src/tw.build.ts"), "utf8"),
		);
	});
});
