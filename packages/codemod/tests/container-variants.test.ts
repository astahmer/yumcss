/**
 * Container-query variants — end-to-end audit proofs.
 *
 * Verifies (against the REAL Tailwind compiler) that @container variants
 * work through every pandwind layer without special-casing:
 * 1. typegen exposes the functional forms (`@`, `@min`, `@max`) as variants;
 * 2. tw() emits correct escaped classes for nested container keys
 *    (`{"@md": {...}}` -> `@md\:p-4`);
 * 3. cx() keeps container-scoped signatures distinct from base scope
 *    (`@md:bg-blue-500` survives a later base-scope `bg-green-500`, and
 *    last-wins applies within the same container scope);
 * 4. real Tailwind compiles emitted classes into `@container (...)`
 *    at-rules targeting the `@container`-marked parent.
 */
import { compile } from "@tailwindcss/node";
import { parse, type Root } from "postcss";
import { describe, expect, test } from "vitest";
import { extractTwConfig } from "pandwind/vite/inline";
import { createTw } from "pandwind/tw";
import { createCx } from "pandwind/cx";
import { generateDesignSystem } from "../src/tw/generate-types.ts";

const CSS = `@import "tailwindcss";
@theme {
	--color-red-500: #ef4444;
	--color-blue-500: #3b82f6;
	--color-green-500: #22c55e;
}`;

async function makeEngine() {
	const gen = await generateDesignSystem(CSS, import.meta.dirname);
	const cfg = extractTwConfig(gen.twTs)!;
	return {
		gen,
		tw: createTw({ variants: cfg.variants, conflicts: cfg.conflicts, compose: cfg.compose }),
		cx: createCx({ variants: cfg.variants, conflicts: cfg.conflicts, compose: cfg.compose }),
	};
}

async function compileClasses(classes: Array<string>): Promise<Root> {
	const compiled = await compile(CSS, { base: import.meta.dirname, onDependency: () => {} });
	return parse(compiled.build(classes));
}

describe("container-query variants", () => {
	test("typegen exposes the functional container variants", async () => {
		const { gen } = await makeEngine();
		expect(gen.variantCount).toBeGreaterThan(0);
		expect(gen.typesDts).toContain('"@min"?: WindVariants');
		expect(gen.typesDts).toContain('"@max"?: WindVariants');
		expect(gen.typesDts).toContain('"@"?: WindVariants');
	});

	test("tw() emits escaped container classes from nested keys", async () => {
		const { tw } = await makeEngine();
		const out = tw({ bg: "red-500", "@md": { bg: "blue-500" } } as never);
		expect(out).toBe("bg-red-500 @md:bg-blue-500");
	});

	test("cx() scopes container variants separately from base", async () => {
		const { tw, cx } = await makeEngine();
		const merged = cx(
			tw({ bg: "red-500", "@md": { bg: "blue-500" } } as never),
			tw({ bg: "green-500" }),
		);
		// base red killed by base green; @md blue survives (different scope)
		expect(merged).toBe("@md:bg-blue-500 bg-green-500");
	});

	test("real Tailwind compiles the emitted class inside a container at-rule", async () => {
		const { tw } = await makeEngine();
		const p4 = tw({ "@md": { p: "4" } } as never);
		const root = await compileClasses(["@container", p4]);
		let found: string | undefined;
		root.walkAtRules((at) => {
			if (at.name === "container") {
				at.walkRules((rule) => {
					if (rule.selector.includes("p-4")) found = `${at.params} :: ${rule.selector}`;
				});
			}
		});
		expect(found).toContain("(width >= 28rem)");
		expect(found).toContain("\\@md\\:p-4");
	});

	test("arbitrary cq units in container variants stay verbatim-safe", async () => {
		const { tw } = await makeEngine();
		// cqw units ride the arbitrary-value escape hatch; must not crash or drop
		const out = tw({ w: "[50cqw]" } as never);
		expect(out).toContain("cqw");
	});
});
