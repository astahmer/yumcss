import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { generateDesignSystem } from "../src/tw/generate-types.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");
const css = readFileSync(resolve(app, "src/tailwind.css"), "utf8");

describe("typegen determinism", () => {
	test("generating twice produces byte-identical output", async () => {
		const [first, second] = await Promise.all([
			generateDesignSystem(css, resolve(app, "src")),
			generateDesignSystem(css, resolve(app, "src")),
		]);

		expect(first.typesDts).toBe(second.typesDts);
		expect(first.twTs).toBe(second.twTs);
		expect(first.utilityCount).toBe(second.utilityCount);
		expect(first.variantCount).toBe(second.variantCount);
	});

	test("generated output matches the committed artifacts", async () => {
		const { typesDts, twTs } = await generateDesignSystem(css, resolve(app, "src"));

		// Drift guard: a Tailwind minor upgrade that changes the design system
		// makes this fail, forcing a review and a deliberate regeneration.
		expect(typesDts).toBe(readFileSync(resolve(app, "src/types.d.ts"), "utf8"));
		expect(twTs).toBe(readFileSync(resolve(app, "src/tw.ts"), "utf8"));
	});
});
