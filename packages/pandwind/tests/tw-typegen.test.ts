import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { describe, expect, test } from "vitest";
import { generateDesignSystem } from "../src/tw/generate-types.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");
const css = readFileSync(resolve(app, "src/tailwind.css"), "utf8");

describe("typegen", () => {
	test("generates utilities, variants and runtime metadata", async () => {
		const { typesDts, twTs, utilityCount, variantCount } =
			await generateDesignSystem(css, app);

		expect(utilityCount).toBeGreaterThan(200);
		expect(variantCount).toBeGreaterThan(50);
		expect(typesDts).toContain("interface WindUtilities");
		expect(typesDts).toContain('"bg"?');
		expect(typesDts).toContain('"flex"?:');
		expect(typesDts).toContain("hover?: WindVariants");
		expect(typesDts).toContain("group?: WindVariants");

		expect(twTs).toContain('group: { join: "-" }');
		expect(twTs).toContain('"@": { join: "" }');
		// Only the variants block is checked: `"sm"` legitimately appears in
		// the generated conflict map (`text-sm`) and `before` in compose keys.
		const variantsBlock = twTs.slice(0, twTs.indexOf("conflicts:"));
		expect(variantsBlock).not.toContain('"before"');
		expect(variantsBlock).not.toContain('"sm"');
	});
});

describe("generated classes compile", () => {
	test("runtime-style candidates are valid Tailwind", async () => {
		const system = await __unstable__loadDesignSystem(css, { base: app });
		const classes = [
			"group-hover:opacity-100",
			"max-md:bg-red-500",
			"@md:hover:bg-red-500",
			"aria-checked:bg-sky-600",
			"before:content-['']",
			"hover:sm:bg-red-500",
			"focus-visible:outline-2",
			"focus-visible:outline-offset-2",
			"focus-visible:outline-sky-600",
		];
		expect(system.candidatesToCss(classes).every((out) => out !== null)).toBe(
			true,
		);
	});
});
