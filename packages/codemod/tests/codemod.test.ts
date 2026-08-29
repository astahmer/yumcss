/**
 * Codemod fixtures suite.
 *
 * Covers every migration mode plus the safety rails from plans/008:
 * plain/multi/variant/opacity/arbitrary class strings, unknown utilities
 * staying verbatim, clsx-family rewrites, skip markers, and idempotency
 * (a second run must be a no-op).
 *
 * Metadata is loaded from the real generated outputs in apps/example/src —
 * the same files an actual migration would read — so the tests pin the
 * codemod to the design system it will operate on.
 */
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { mapToken } from "../src/map.ts";
import { loadMetaFromSources } from "../src/meta.ts";
import { transformSource } from "../src/migrate.ts";
import { examplePreset } from "pandwind/preset";

const appDir = resolve(import.meta.dirname, "../../../apps/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
	tokens: examplePreset.tokens,
});

const tw = (source: string) => transformSource(source, meta, { mode: "tw", file: "test.tsx" });
const cxMode = (source: string) => transformSource(source, meta, { mode: "cx", file: "test.tsx" });
const css = (source: string) => transformSource(source, meta, { mode: "css", file: "test.tsx" });
const keep = (source: string) => transformSource(source, meta, { mode: "keep", file: "test.tsx" });

describe("mode: tw", () => {
	test("plain single utility becomes a typed tw object", () => {
		const result = tw(`export const A = () => <div className="p-4" />;`);
		expect(result.changed).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('tw({\n\t\tp: "4",');
	});

	test("multi-class strings group into one object", () => {
		const result = tw(`<div className="flex p-4 gap-2" />`);
		const code = result.code;
		expect(code).toContain("flex: true");
		expect(code).toContain('p: "4"');
		expect(code).toContain('gap: "2"');
	});

	test("variants become nested objects", () => {
		const result = tw(`<div className="hover:bg-red-500 md:p-4 group-hover:opacity-100" />`);
		expect(result.code).toContain("hover:");
		expect(result.code).toContain('bgColor: "red-500"');
		expect(result.code).toContain("md:");
	});

	test("kebab-case variants resolve to the generated camelCase keys", () => {
		const result = tw(`<div className="focus-within:ring-2" />`);
		expect(result.code).toContain("focusWithin:");
		expect(result.code).not.toContain('"focus-within:ring-2"');
	});

	test("direction-only flex utilities remain lossless residuals", () => {
		const result = tw(`<div className="hidden flex-row" />`);
		expect(result.code).toContain('"flex-row"');
		expect(result.code).not.toContain('flex: "row"');
	});

	test("parenthesized arbitrary values remain lossless residuals", () => {
		const result = tw(`<div className="border-x border-x-(--pattern-fg)" />`);
		expect(result.code).toContain("borderX: true");
		expect(result.code).toContain('"border-x-(--pattern-fg)"');
	});

	test("overloaded utilities pick the key matching their conflict properties", () => {
		// text-* is overloaded across size/color/align/wrap/overflow.
		const color = tw(`<div className="text-gray-900" />`).code;
		expect(color).toContain("textColor");

		const size = tw(`<div className="text-lg" />`).code;
		expect(size).toContain("textSize");

		const align = tw(`<div className="text-center" />`).code;
		expect(align).toContain("textAlign");
	});

	test("bg-* overload disambiguates via conflict properties", () => {
		expect(tw(`<div className="bg-blue-500" />`).code).toContain("bgColor");
		expect(tw(`<div className="bg-gradient-to-r" />`).code).toContain("bgImage");
	});

	test("opacity modifiers are preserved on the emitted value", () => {
		const result = tw(`<div className="bg-blue-500/50" />`);
		expect(result.code).toContain('"blue-500/50"');
	});

	test("arbitrary values stay verbatim as residual strings via cx", () => {
		const result = tw(`<div className="w-[37px] p-4" />`);
		expect(result.changed).toBe(true);
		expect(result.code).toContain("cx(tw({");
		expect(result.code).toContain('"w-[37px]"');
		expect(result.code).toContain('p: "4"');
		// imports for both engines
		expect(result.code).toContain('import { tw } from "pandwind/tw";');
		expect(result.code).toContain('import { createCx } from "pandwind/cx";');
	});

	test("unknown utilities stay verbatim; fully-unknown calls are untouched", () => {
		const unknownOnly = `<div className="totally-not-a-utility" />`;
		const untouched = tw(unknownOnly);
		expect(untouched.changed).toBe(false);
		expect(untouched.converted).toBe(0);
	});

	test("important modifiers stay verbatim", () => {
		const result = tw(`<div className="!p-4 flex" />`);
		expect(result.code).toContain('"!p-4"');
	});
});

describe("mode: cx (clsx / tailwind-merge -> cx)", () => {
	test("default-import clsx is renamed onto pandwind cx", () => {
		const source = [
			`import clsx from "clsx";`,
			`export const a = clsx("p-4", cond && "p-6");`,
		].join("\n");
		const result = cxMode(source);
		expect(result.changed).toBe(true);
		expect(result.code).toContain('import { createCx } from "pandwind/cx";');
		expect(result.code).not.toContain('from "clsx"');
		expect(result.code).toContain('cx("p-4", cond && "p-6")');
	});

	test("the common cn wrapper pattern collapses onto cx", () => {
		const source = [
			`import clsx from "clsx";`,
			`import { twMerge } from "tailwind-merge";`,
			`const cn = (...args) => twMerge(clsx(...args));`,
			`export const a = cn("p-4");`,
		].join("\n");
		const result = cxMode(source);
		expect(result.changed).toBe(true);
		expect(result.code).toContain("const cn = (...args) => cx(...args);");
		expect(result.code).not.toContain("twMerge(clsx");
		expect(result.code).not.toContain('from "tailwind-merge"');
	});

	test("aliased named imports rewrite call sites too", () => {
		const source = [`import { clsx as cx2 } from "clsx";`, `export const a = cx2("p-4");`].join(
			"\n",
		);
		const result = cxMode(source);
		expect(result.code).toContain('import { createCx } from "pandwind/cx";');
		expect(result.code).toContain('cx("p-4")'.replace('\\"', '"'));
		expect(result.code).not.toContain("cx2(");
	});
});

describe("mode: css", () => {
	const withBinding = `const css = createDesignCss(preset);\nexport const A = () => <div className="bg-blue-500 rounded-base" />;`;

	test("bridge-mappable tokens become exact resolved declarations", () => {
		const result = css(withBinding);
		expect(result.changed).toBe(true);
		expect(result.code).toContain('backgroundColor: "#3182ce"');
		expect(result.code).toContain("borderRadius:");
		// resolved values, not tailwind scale names
		expect(result.code).toContain('"0.25rem"');
	});

	test("preset-scoped bridge means tailwind-default-only tokens stay verbatim", () => {
		const result = css(`${withBinding}<span className="p-4" />`);
		// example preset uses a px-based spacing scale, so p-4 is not bridged
		expect(result.unmappedTokens.some((t) => t.token === "p-4")).toBe(true);
	});

	test("files without a css binding are reported, not rewritten", () => {
		const result = css(`<div className="bg-blue-500" />`);
		expect(result.changed).toBe(false);
		expect(result.unmappedTokens.some((t) => t.reason.includes("existing css binding"))).toBe(true);
	});

	test("tokens outside the bridge stay verbatim and block full conversion", () => {
		const result = css(`${withBinding.replace("bg-blue-500 ", "")}<span className="hover:p-4" />`);
		expect(result.unmappedTokens.some((t) => t.token === "hover:p-4")).toBe(true);
	});

	test("multi-property bridge utilities preserve every declaration", () => {
		const result = transformSource(
			`${withBinding}<span className="line-clamp-1" />`,
			{
				...meta,
				bridgeDeclarations: new Map([
					[
						"line-clamp-1",
						[
							{ property: "-webkit-box-orient", value: "vertical" },
							{ property: "-webkit-line-clamp", value: "1" },
							{ property: "display", value: "-webkit-box" },
							{ property: "overflow", value: "hidden" },
						],
					],
				]),
			},
			{ mode: "css", file: "test.tsx" },
		);
		expect(result.code).toContain('WebkitLineClamp: "1"');
		expect(result.code).toContain('WebkitBoxOrient: "vertical"');
		expect(result.code).toContain('overflow: "hidden"');
	});
});

describe("mode: keep (analysis only)", () => {
	test("reports counts without changing code", () => {
		const source = `<div className="p-4 totally-unknown" />`;
		const result = keep(source);
		expect(result.changed).toBe(false);
		expect(result.converted).toBeGreaterThanOrEqual(1);
		expect(result.unmappedTokens.some((t) => t.token === "totally-unknown")).toBe(true);
		expect(result.code).toBe(source);
	});
});

describe("safety rails", () => {
	test("skip marker opts the following line out", () => {
		const source = [
			`// pandwind:migrate-skip`,
			`<div className="p-4" />`,
			`<div className="p-6" />`,
		].join("\n");
		const result = tw(source);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain('<div className="p-4" />');
		expect(result.code).toContain("tw({");
	});

	test("idempotent: second run reports zero changes", () => {
		const first = tw(`<div className="flex p-4 text-gray-900 hover:bg-blue-500" />`);
		expect(first.changed).toBe(true);
		const second = tw(first.code);
		expect(second.changed).toBe(false);
		expect(second.converted).toBe(0);

		const cxFirst = cxMode(`import clsx from "clsx";\nexport const a = clsx("p-4");`);
		const cxSecond = cxMode(cxFirst.code);
		expect(cxSecond.changed).toBe(false);
	});

	test("does not rewrite className text inside strings or comments", () => {
		const source = [
			`const example = 'className="p-4"';`,
			`// <div className="p-6" />`,
			`/* <div className="p-8" /> */`,
			`export const A = () => <div className="p-2" />;`,
		].join("\n");
		const result = tw(source);
		expect(result.converted).toBe(1);
		expect(result.code).toContain(`const example = 'className="p-4"';`);
		expect(result.code).toContain(`// <div className="p-6" />`);
		expect(result.code).toContain(`/* <div className="p-8" /> */`);
		expect(result.code).toContain("tw({");
	});
});

describe("mapToken unit behavior", () => {
	test("negative utilities stay verbatim (semantic sign change)", () => {
		expect(mapToken("-mt-2", meta)).toBeNull();
	});

	test("boolean utilities emit true", () => {
		const mapped = mapToken("flex", meta);
		expect(mapped).not.toBeNull();
		expect(mapped!.value).toBe(true);
		expect(mapped!.key).toBe("flex");
	});

	test("unsupported negated and named data conditions stay verbatim", () => {
		expect(mapToken("not-in-data-dragging:animate-ping", meta)).toBeNull();
		expect(mapToken("data-focus:outline-none", meta)).toBeNull();
	});

	test("wildcard conflicts do not consume project-owned classes", () => {
		const custom = {
			...meta,
			keysByBase: new Map([["theme", [{ key: "theme", base: "theme", valueType: "ThemeValue" }]]]),
			valueLiterals: new Map([["ThemeValue", new Set(["container"])]]),
			conflicts: new Map([["theme", { "*": ["font-family"] }]]),
		} as typeof meta;
		expect(mapToken("theme-taupe", custom)).toBeNull();
	});
});
