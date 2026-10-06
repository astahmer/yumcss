import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { describe, expect, test } from "vitest";
import { createDesignSystemCodegen, generateDesignSystem } from "../src/tw/generate-types.ts";
import { UTILITY_SUBKEYS } from "yumcss/tw/compile";
import { extractTwConfigFromSources } from "yumcss/vite/inline";

const app = resolve(import.meta.dirname, "../../../examples/example");
const css = readFileSync(resolve(app, "src/tailwind.css"), "utf8");

describe("typegen", () => {
	test("composition root accepts substituted codegen policies", async () => {
		const calls: string[] = [];
		const generator = createDesignSystemCodegen({
			loader: async () =>
				({
					utilities: { keys: () => [] },
					getVariants: () => [],
				}) as never,
			catalog: {
				collect: () => new Map([["bg", new Set<string | true>(["red"])]]),
				expand: () => calls.push("expand"),
			},
			buildConflicts: () => {
				calls.push("conflicts");
				return { conflicts: {}, compose: [] };
			},
			detectModifiers: () => {
				calls.push("modifiers");
				return new Set();
			},
			detectVariantJoin: () => ":",
			emitter: {
				utilities: () => "utilities",
				variants: () => "variants",
				runtime: () => ({
					entry: "runtime",
					runtime: "runtime metadata",
					conflicts: "conflict metadata",
					build: "build metadata",
				}),
			},
		});
		const output = await generator.generate("", ".");
		expect(output.typesDts).toContain("utilities");
		expect(output.twTs).toBe("runtime");
		expect(output.twRuntimeTs).toBe("runtime metadata");
		expect(output.twConflictsTs).toBe("conflict metadata");
		expect(output.twBuildTs).toBe("build metadata");
		expect(calls).toEqual(["conflicts", "expand", "modifiers"]);
	});

	test("generates utilities, variants and runtime metadata", async () => {
		const { typesDts, twTs, twRuntimeTs, twConflictsTs, twBuildTs, utilityCount, variantCount } =
			await generateDesignSystem(css, resolve(app, "src"));

		expect(utilityCount).toBeGreaterThan(200);
		expect(variantCount).toBeGreaterThan(50);
		expect(typesDts).toContain("interface WindUtilities");
		expect(typesDts).toContain('"bg"?');
		expect(typesDts).toContain('"flex"?:');
		expect(typesDts).toContain("hover?: WindVariants");
		expect(typesDts).toContain("group?: WindVariants");

		// Semantic sub-keys for overloaded utilities: additive, narrower
		// spellings derived from the conflict map's property partitions.
		expect(typesDts).toContain('"textColor"?:');
		expect(typesDts).toContain('"textSize"?:');
		expect(typesDts).toContain('"textAlign"?:');
		const sizeValues = typesDts.match(/type TextSizeValue = ([^;]*);/)?.[1] ?? "";
		expect(sizeValues).toContain('"2xl"');
		expect(sizeValues).not.toContain('"gray-900"');
		const alignValues = typesDts.match(/type TextAlignValue = ([^;]*);/)?.[1] ?? "";
		expect(alignValues).toContain('"center"');
		expect(alignValues).not.toContain('"2xl"');

		// bg / border / outline / decoration sub-key families (plan 007 item C):
		expect(typesDts).toContain('"bgColor"?:');
		expect(typesDts).toContain('"bgSize"?:');
		expect(typesDts).toContain('"borderWidth"?:');
		expect(typesDts).toContain('"outlineColor"?:');
		expect(typesDts).toContain('"decorationThickness"?:');
		const bgColorValues = typesDts.match(/"bgColor"\?: (\w+)/)?.[1] ?? "";
		const bgColorUnion = typesDts.match(new RegExp(`type ${bgColorValues} = ([^;]*);`))?.[1] ?? "";
		expect(bgColorUnion).toContain('"red-500"');
		// concerns we deliberately do not split stay OUT of the color partition
		expect(bgColorUnion).not.toContain('"cover"');
		expect(bgColorUnion).not.toContain('"no-repeat"');
		expect(bgColorUnion).not.toContain('"blend-normal"');
		const borderWidthValues = typesDts.match(/type BorderWidthValue = ([^;]*);/)?.[1] ?? "";
		expect(borderWidthValues).toContain('"2"');
		expect(borderWidthValues).not.toContain('"dashed"');

		// every runtime sub-key must be advertised by the generated interface —
		// the SUBKEY_SUFFIXES whitelist keeps the two sides in agreement.
		for (const key of Object.keys(UTILITY_SUBKEYS)) {
			expect(typesDts, `missing generated type for sub-key ${key}`).toContain(`"${key}"?:`);
		}

		expect(twTs).not.toContain('from "./tw.runtime.ts"');
		expect(twTs).toContain("createTw");
		expect(twTs).toContain('group: { join: "-" }');
		expect(twTs).not.toContain("conflicts");
		expect(twTs).not.toContain("wildcardValues");
		expect(twTs).not.toContain("__yumcssBuildMetadata");
		expect(twRuntimeTs).toContain('group: { join: "-" }');
		expect(twRuntimeTs).toContain('"@": { join: "" }');
		expect(twRuntimeTs).toContain("export const __yumcssRuntimeConfig");
		expect(twRuntimeTs).not.toContain("wildcardValues");
		expect(twRuntimeTs).toContain('from "./tw.conflicts.ts"');
		expect(twRuntimeTs).not.toContain("__yumcssConflictConfig");
		expect(twConflictsTs).toContain("export const __yumcssConflictConfig");
		expect(twConflictsTs).toContain("JSON.parse");
		expect(twConflictsTs).toContain("new Proxy");
		expect(twConflictsTs).toContain("v: number[][]");
		expect(twBuildTs).toContain("export const __yumcssBuildMetadata");
		expect(twBuildTs).toContain("wildcardValues");
		const extracted = extractTwConfigFromSources([twTs, twRuntimeTs, twConflictsTs, twBuildTs]);
		expect(extracted?.conflicts?.bg).toBeDefined();
		// Every variant is emitted now (default `:` joins included) so the
		// tailwind css() adapter can look any condition up.
		const variantsBlock = twRuntimeTs.slice(0, twRuntimeTs.indexOf("conflicts:"));
		expect(variantsBlock).toContain('hover: { join: ":" }');
		expect(variantsBlock).toContain('sm: { join: ":" }');
		// `before` stays out of the variants block (pseudo-element, not a
		// variant) — it can only appear in the conflict map / compose keys.
		expect(variantsBlock).not.toContain('"before"');
	});

	test("can scope optional conflict metadata without shrinking generated types", async () => {
		const full = await generateDesignSystem(css, resolve(app, "src"));
		const scoped = await generateDesignSystem(css, resolve(app, "src"), {
			conflictUtilities: ["bg", "p", "text"],
		});

		expect(scoped.typesDts).toBe(full.typesDts);
		expect(scoped.twTs).toBe(full.twTs);
		const extracted = extractTwConfigFromSources([
			scoped.twTs,
			scoped.twRuntimeTs,
			scoped.twConflictsTs,
			scoped.twBuildTs,
		]);
		expect(Object.keys(extracted?.conflicts ?? {}).toSorted()).toEqual(["bg", "p", "text"]);
		expect(extracted?.compose).toBeUndefined();
		expect(scoped.twConflictsTs.length).toBeLessThan(full.twConflictsTs.length);
	});
});

describe("generated classes compile", () => {
	test("runtime-style candidates are valid Tailwind", async () => {
		const system = await __unstable__loadDesignSystem(css, { base: resolve(app, "src") });
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
		expect(system.candidatesToCss(classes).every((out) => out !== null)).toBe(true);
	});
});
