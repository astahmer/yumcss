/**
 * Swap suite (plans/022) — the bidirectional API converters.
 *
 * Every pandwind styling surface can be mechanically swapped to another:
 * tw() object literals, css.class()/css() literals and the design
 * vocabulary ($frame/$layout/$text). Parsers lower call sites to the swap
 * IR; emitters render the target API; residuals (bridge misses, dynamics,
 * unrepresentables) keep conversions lossless — the original stays plus a
 * skip marker, never a silent partial rewrite.
 *
 * Metadata comes from the real generated outputs in apps/example/src, and
 * asserted values are pinned against its bridge (e.g. #3182ce -> bg-blue-500).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loadMetaFromSources } from "../src/meta.ts";
import { runSwap, SWAP_TARGETS } from "../src/swap/index.ts";
import { examplePreset } from "pandwind/preset";

const appDir = resolve(import.meta.dirname, "../../../apps/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
	tokens: examplePreset.tokens,
});

const WITH_CSS = `import { css } from "./design.ts";\n`;
const swap = (source: string, to: string, from: string = "auto", file = "test.tsx") =>
	runSwap(source, meta, {
		from,
		to,
		file,
		metaDir: "apps/example/src",
	});

describe("swap tw -> css.class", () => {
	test("a bridge-covered utility lowers to exact resolved declarations", () => {
		const result = swap(
			`${WITH_CSS}export const A = () => <div className={tw({ bgColor: "blue-500" })} />;`,
			"css.class",
		);
		expect(result.changed).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('backgroundColor: "#3182ce"');
		expect(result.code).toContain("css.class({");
		expect(result.code).not.toContain("tw({");
	});

	test("conditions nest as _condition objects", () => {
		const result = swap(
			`${WITH_CSS}export const B = () => <div className={tw({ hover: { rounded: "md" } })} />;`,
			"css.class",
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain("_hover: {");
		expect(result.code).toContain('borderRadius: "0.375rem"');
	});

	test("bridge misses stay untouched with a skip marker", () => {
		const source = `${WITH_CSS}export const C = () => <div className={tw({ gap: "4" })} />;`;
		const result = swap(source, "css.class");
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain('tw({ gap: "4" })'); // original preserved
	});
});

describe("swap css.class -> tw", () => {
	test("declarations map back through the bridge to typed keys", () => {
		const result = swap(`const card = css.class({ backgroundColor: "#3182ce" });`, "tw");
		expect(result.converted).toBe(1);
		expect(result.code).toContain('bgColor: "blue-500"');
	});

	test("text declarations use the typed text-family tw key", () => {
		const result = swap(`const heading = css.class({ fontSize: "0.75rem" });`, "tw");
		expect(result.converted).toBe(1);
		expect(result.code).toContain('tw({ textSize: "xs" })');
	});

	test("tw target preserves the text utility family from a css source", () => {
		const result = swap(
			`${WITH_CSS}const heading = css.class({ fontSize: "1.5rem" });`,
			"tw",
			"css",
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('tw({ textSize: "2xl" })');
	});

	test("round trip stabilizes: css.class -> tw -> css.class is idempotent at IR level", () => {
		const once = swap(`const x = css.class({ backgroundColor: "#3182ce" });`, "tw");
		const twice = swap(once.code, "tw");
		expect(twice.changed).toBe(false);
	});

	test("optional capability enforcement keeps dynamic source styles untouched", () => {
		const result = runSwap("const card = css.class({ color: theme.foreground });", meta, {
			from: "css",
			to: "tw",
			file: "Card.tsx",
			metaDir: "apps/example/src",
			capabilityMode: "safe",
		});
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.capabilityReports[0]?.unsupported.map((issue) => issue.capability)).toEqual(
			expect.arrayContaining(["dynamic-values", "theme-context"]),
		);
		expect(result.code).toContain("css.class({ color: theme.foreground })");
	});
});

describe("swap design vocabulary", () => {
	test("dss is exposed as an explicit swap target", () => {
		expect(SWAP_TARGETS).toContain("dss");
	});

	test("$frame resolves offline and emits plain declarations", () => {
		const result = swap(
			`${WITH_CSS}export const Card = () => (\n\t<div className={css.class({ $frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] } })} />\n);`,
			"css.class",
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('backgroundColor: "#3182ce"');
		expect(result.code).toContain('borderRadius: "0.5rem"'); // radii lg token value
		expect(result.code).toContain('padding: "4px 8px"');
	});

	test("plain declarations lift INTO the vocabulary where tokens match", () => {
		const result = swap(
			`${WITH_CSS}const card = css.class({ backgroundColor: "#3182ce", borderRadius: "0.5rem", padding: "4px 8px" });`,
			"design",
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain("$frame: {");
		expect(result.code).toContain('fill: "$blue-500"');
		expect(result.code).toContain('corners: "lg"');
		expect(result.code).toMatch(/pad: \[4, 8\]/);
	});

	test("vocabulary misses land in $raw instead of being dropped", () => {
		const result = swap(
			`${WITH_CSS}const card = css.class({ backgroundColor: "#3182ce", boxShadow: "0 1px 2px black" });`,
			"design",
		);
		expect(result.code).toContain("$raw: {");
		expect(result.code).toContain("boxShadow");
	});

	test("flex pairing becomes $layout.flow", () => {
		const result = swap(
			`${WITH_CSS}const row = css.class({ display: "flex", flexDirection: "row", gap: "4px" });`,
			"design",
		);
		expect(result.code).toContain('flow: "stackX"');
		expect(result.code).toContain("gap: 4");
		expect(result.code).not.toContain('"display": "flex"');
	});

	test("non-flex display falls to $raw, never silently dropped", () => {
		const result = swap(`${WITH_CSS}const b = css.class({ display: "block" });`, "design");
		expect(result.code).toContain('display: "block"');
	});

	test("design vocabulary can target a local dss binding", () => {
		const result = swap(
			`import { css, dss } from "./design.ts";\nconst card = css.class({ $frame: { fill: "$blue-500", pad: 4 }, $text: { color: "$white" } });`,
			"dss",
			"design",
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain(
			'dss({ $frame: { fill: "$blue-500", pad: 4 }, $text: { color: "$white" } })',
		);
		expect(result.code).not.toContain("css.class({");
	});

	test("dss refuses to invent a missing local binding", () => {
		const result = swap(
			`${WITH_CSS}const card = css.class({ $frame: { fill: "$blue-500" } });`,
			"dss",
			"design",
		);
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("no local dss instance");
		expect(result.code).toContain("css.class({");
	});
});

describe("safety rails", () => {
	test("dynamic values flag the whole call site, original kept", () => {
		const source = `${WITH_CSS}export const D = ({ c }: { c: string }) => <div className={tw({ bgColor: c })} />;`;
		const result = swap(source, "css.class");
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("tw({ bgColor: c })");
	});

	test("swapping into css.class without a local css binding is refused by marker", () => {
		const source = `export const E = () => <div className={tw({ bgColor: "blue-500" })} />;`;
		const result = swap(source.replace(WITH_CSS, ""), "css.class");
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("no local pandwind css instance");
	});

	test("code inside comments is never touched (oxc mask applies to swap)", () => {
		const source = `${WITH_CSS}// example: tw({ bgColor: "blue-500" }) would become css.class\nexport const F = () => <div />;`;
		const result = swap(source, "css.class");
		expect(result.changed).toBe(false);
	});
});

describe("swap CLI end-to-end", () => {
	test("the real binary converts a fixture file on disk (--write)", () => {
		const dir = mkdtempSync(resolve(tmpdir(), "pw-codemod-swap-"));
		const file = resolve(dir, "card.tsx");
		writeFileSync(
			file,
			`import { css } from "./design.ts";\nexport const card = css.class({ backgroundColor: "#3182ce" });\n`,
		);
		const repoRoot = resolve(import.meta.dirname, "../../..");
		execFileSync(
			"pnpm",
			[
				"exec",
				"tsx",
				"src/cli.ts",
				"swap",
				"--from=auto",
				"--to=tw",
				"--write",
				`--meta=${resolve(repoRoot, "apps/example/src")}`,
				file,
			],
			{ cwd: resolve(import.meta.dirname, ".."), stdio: "pipe" },
		);
		const after = readFileSync(file, "utf8");
		expect(after).toContain("tw({");
		expect(after).toContain('bgColor: "blue-500"');
		expect(after).not.toContain("css.class(");
	}, 30_000);
});

/* ------------------------------------------------------------------ */
/* outbound adapters (plans/022): pandwind -> external libraries       */
/* ------------------------------------------------------------------ */

import { runSwap as runSwapRaw } from "../src/swap/index.ts";

const swapTo = (
	source: string,
	to: "css.class" | "design" | "tw" | "tailwind" | "panda" | "stylex",
) =>
	runSwapRaw(source, meta, {
		from: "auto",
		to,
		file: "test.tsx",
		metaDir: "apps/example/src",
	});

describe("outbound: tailwind classes", () => {
	test("bridge-covered declarations become short utilities", () => {
		const result = swapTo(
			`const card = css.class({ backgroundColor: "#3182ce", fontSize: "0.75rem" });`,
			"tailwind",
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('"bg-blue-500 text-xs"');
	});

	test("bridge misses degrade to arbitrary-property classes instead of failing", () => {
		const result = swapTo(`const c = css.class({ boxShadow: "0 0 black" });`, "tailwind");
		expect(result.converted).toBe(1);
		expect(result.code).toContain("[box-shadow:0 0 black]");
	});

	test("conditions become variant prefixes", () => {
		const result = swapTo(
			`const c = css.class({ _hover: { backgroundColor: "#3182ce" } });`,
			"tailwind",
		);
		expect(result.code).toContain("hover:bg-blue-500");
	});
});

describe("outbound: panda", () => {
	test("declarations emit a panda css() call with native condition keys", () => {
		const result = swapTo(
			`const card = css.class({ backgroundColor: "#3182ce", _hover: { backgroundColor: "#2b6cb0" } });`,
			"panda",
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('backgroundColor: "blue.500"');
		expect(result.code).toContain('_hover: { backgroundColor: "blue.600" }');
		expect(result.code).toContain('import { css } from "styled-system/css";');
	});
});

describe("outbound: stylex", () => {
	test("call site becomes stylex.props over an injected create block", () => {
		const source = `import { css } from "./design.ts";\nexport const A = () => <div className={css.class({ backgroundColor: "#3182ce", _hover: { backgroundColor: "#2b6cb0" } })} />;`;
		const result = swapTo(source, "stylex");
		expect(result.converted).toBe(1);
		expect(result.code).toContain('import * as stylex from "@stylexjs/stylex";');
		expect(result.code).toContain("stylex.create({");
		expect(result.code).toContain("s1: {");
		expect(result.code).toContain("stylex.props(swapStyles.s1)");
		expect(result.code).toContain('":hover": {');
	});
});

/* ------------------------------------------------------------------ */
/* token-reference emission + compact output                           */
/* ------------------------------------------------------------------ */

describe("token references + single-line output", () => {
	test("panda emits bare token refs by default (authored $tokens)", () => {
		const result = swapTo(`const card = css.class({ backgroundColor: "$blue-500" });`, "panda");
		expect(result.code).toContain('backgroundColor: "blue.500"');
		expect(result.code).not.toContain('"$blue-500"');
		expect(result.code).toContain("css({ "); // single line, no pretty print
	});

	test("resolved values round-trip to token refs through the preset", () => {
		const result = swapTo(
			`const card = tw({ bgColor: "blue-500", hover: { bgColor: "blue-600" } });`,
			"panda",
		);
		expect(result.code).toContain('backgroundColor: "blue.500"');
	});

	test("group mode qualifies refs (colors.blue.500)", () => {
		const result = runSwapRaw(`const card = css.class({ backgroundColor: "$blue-500" });`, meta, {
			from: "auto",
			to: "panda",
			file: "t.tsx",
			metaDir: "apps/example/src",
			tokenRefs: "group",
		});
		expect(result.code).toContain('backgroundColor: "colors.blue.500"');
	});

	test("off mode keeps authored values verbatim", () => {
		const result = runSwapRaw(`const card = css.class({ backgroundColor: "$blue-500" });`, meta, {
			from: "auto",
			to: "panda",
			file: "t.tsx",
			metaDir: "apps/example/src",
			tokenRefs: "off",
		});
		expect(result.code).toContain('backgroundColor: "$blue-500"');
	});

	test("emitters stay single-line even with conditions and multiple modules", () => {
		const result = swapTo(
			`${WITH_CSS}export const Card = () => (\n\t<div className={css.class({ $frame: { fill: "$gray-100" }, _hover: { $frame: { fill: "$gray-800" } } })} />\n);`,
			"design",
		);
		// Raw preset keys round-trip verbatim into the vocabulary; one line.
		expect(result.code).toContain(
			'css.class({ $frame: { fill: "$gray-100" }, _hover: { $frame: { fill: "$gray-800" } } })',
		);
	});
});

/* ------------------------------------------------------------------ */
/* tokens subcommand: config-system conversions                        */
/* ------------------------------------------------------------------ */

import { tokenSetCodec as T } from "../src/swap/token-set.ts";

describe("TokenSet conversions", () => {
	const dtcg = JSON.stringify({
		colors: { blue: { 500: { $value: "#3182ce" }, 600: { $value: "#2b6cb0" } } },
		spacing: { 4: { $value: "4px" } },
	});

	test("DTCG -> @theme css", () => {
		const set = T.fromDtcgJson(dtcg);
		const theme = T.toThemeCss(set);
		expect(theme).toContain("--color-blue-500: #3182ce;");
		expect(theme).toContain("--spacing-4: 4px;");
	});

	test("@theme css -> DTCG round-trips", () => {
		const set = T.fromThemeCss(T.toThemeCss(T.fromDtcgJson(dtcg)));
		expect(set.groups.colors?.["blue-500"]).toBe("#3182ce");
		expect(set.groups.spacing?.["4"]).toBe("4px");
		const back = JSON.parse(T.toDtcgJson(set));
		expect(back.colors.blue[500].$value).toBe("#3182ce");
	});

	test("definePreset imports via dynamic import of the real preset", async () => {
		const set = await T.fromDefinePreset(
			resolve(import.meta.dirname, "../../../packages/pandwind/src/preset/example-preset.ts"),
		);
		expect(set.groups.colors?.["$blue-500"]).toBe("#3182ce");
	});

	test("panda-config import flattens nested { value } leaves", async () => {
		const dir = mkdtempSync(resolve(tmpdir(), "pw-panda-cfg-"));
		const cfg = resolve(dir, "panda.config.ts");
		writeFileSync(
			cfg,
			`export default { theme: { extend: { tokens: { colors: { blue: { 500: { value: "#3182ce" } } } } } } };\n`,
		);
		const set = await T.fromPandaConfig(cfg);
		expect(set.groups.colors?.["blue-500"]).toBe("#3182ce");
	});
});

/* ------------------------------------------------------------------ */
/* engine / tokenize / sort / dedup                                    */
/* ------------------------------------------------------------------ */

import { staticMissResolver } from "../src/swap/engine.ts";
import { dedupLiteralCallSites } from "../src/swap/index.ts";

describe("--engine: bridge-miss resolution", () => {
	test("non-preset values convert when the engine resolver knows the utility", () => {
		const result = runSwapRaw(`${WITH_CSS}const x = tw({ bgColor: "sky-600" });`, meta, {
			from: "auto",
			to: "css.class",
			file: "t.tsx",
			metaDir: "apps/example/src",
			engineResolver: staticMissResolver({
				"bg-sky-600": [{ prop: "background-color", value: "#0284c7" }],
			}),
		});
		expect(result.converted).toBe(1);
		expect(result.skippedByMarker).toBe(0);
		expect(result.code).toContain('backgroundColor: "#0284c7"');
	});

	test("without a resolver the same site stays flagged (regression guard)", () => {
		const result = swapTo(`const x = tw({ bgColor: "sky-600" });`, "css.class");
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
	});

	test("real Tailwind engine resolves an arbitrary non-preset utility", async () => {
		const { createEngineMissResolver } = await import("../src/swap/engine.ts");
		const engineResolve = await createEngineMissResolver({
			css: `@theme {\n\t--color-sky-600: #0284c7;\n}`,
			base: import.meta.dirname + "/..",
		});
		const decls = engineResolve("bg-sky-600");
		expect(decls?.length).toBeGreaterThan(0);
		expect(decls![0]!.prop).toBe("backgroundColor");
	});
});

describe("--tokenize: raw values -> authored $tokens", () => {
	test("raw hex rewrites to the authored preset token", () => {
		const result = runSwapRaw(
			`import { css } from "./design.ts";\nconst card = css.class({ backgroundColor: "#3182ce" });`,
			meta,
			{ from: "css", to: "css.class", file: "t.tsx", metaDir: "apps/example/src", tokenize: true },
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('backgroundColor: "$blue-500"');
	});
});

describe("--sort: canonical property order", () => {
	test("emitted scopes sort canonically (color after borderRadius)", () => {
		const result = runSwapRaw(
			`${WITH_CSS}const c = css.class({ $text: { color: "$gray-900" }, $frame: { corners: "$md", fill: "$blue-500" } });`,
			meta,
			{ from: "auto", to: "css.class", file: "t.tsx", metaDir: "apps/example/src", sort: true },
		);
		const call = result.code.slice(result.code.indexOf("css.class"));
		expect(call.indexOf("borderRadius")).toBeLessThan(call.indexOf("backgroundColor"));
		expect(call.indexOf("backgroundColor")).toBeLessThan(call.lastIndexOf("color"));
	});
});

describe("--dedup: repeated identical literals hoist to a constant", () => {
	test("duplicate call sites collapse into one module constant", () => {
		const code = dedupLiteralCallSites(
			`import { css } from "./design.ts";\nexport const a = css.class({ backgroundColor: "#3182ce" });\nexport const b = css.class({ backgroundColor: "#3182ce" });\nexport const c = css.class({ backgroundColor: "#000000" });`,
		);
		expect(code).toContain('const pwStyle1 = css.class({ backgroundColor: "#3182ce" });');
		expect(code.match(/pwStyle1/g)?.length).toBeGreaterThanOrEqual(3); // def + 2 refs
		expect(code).not.toContain("b = css.class");
		expect(code).toContain('"#000000"'); // unique site untouched
	});

	test("dedup applies even when the swap itself cannot convert", () => {
		const source = `import { css } from "./design.ts";\nexport const a = css.class({ backgroundColor: "#abc123" });\nexport const b = css.class({ backgroundColor: "#abc123" });`;
		const result = runSwapRaw(source, meta, {
			from: "auto",
			to: "tw",
			file: "t.tsx",
			metaDir: "apps/example/src",
			dedup: true,
		});
		expect(result.code).toContain("pwStyle1");
	});
});

/* ------------------------------------------------------------------ */
/* extra token formats (Style Dictionary / Figma / :root css / stylex) */
/* ------------------------------------------------------------------ */

describe("extra token formats", () => {
	const fixture = JSON.stringify({
		colors: { blue: { 500: { $value: "#3182ce" } } },
		spacing: { 4: { $value: "4px" } },
	});
	const set = T.fromDtcgJson(fixture);

	test("style dictionary round-trips and infers color type", () => {
		const sd = T.toStyleDictionary(set);
		expect(sd).toContain('"value": "#3182ce"');
		expect(sd).toContain('"type": "color"');
		const back = T.fromStyleDictionary(sd);
		expect(back.groups).toEqual(set.groups);
	});

	test("figma tokens round-trips with types always set", () => {
		const fig = T.toFigmaTokens(set);
		expect(fig).toContain('"type": "color"');
		expect(fig).toContain('"type": "spacing"');
		const back = T.fromFigmaTokens(fig);
		expect(back.groups).toEqual(set.groups);
	});

	test(":root css round-trips through the prefix map", () => {
		const cssOut = T.toRootCss(set);
		expect(cssOut).toContain("--color-blue-500: #3182ce;");
		expect(cssOut).toContain("--spacing-4: 4px;");
		const back = T.fromRootCss(cssOut);
		expect(back.groups).toEqual(set.groups);
	});

	test("stylex defineVars emits one export per group", () => {
		const vars = T.toStylexVars(set);
		expect(vars).toContain('import { defineVars } from "@stylexjs/stylex";');
		expect(vars).toContain("export const colors = defineVars({");
		expect(vars).toContain('"blue-500": "#3182ce"');
	});
});

/* ------------------------------------------------------------------ */
/* full swap matrix: from {tw, css, design} x to {css.class, design, tw} */
/* ------------------------------------------------------------------ */

describe("full swap matrix (9 pairs)", () => {
	const sources = {
		tw: `const a = tw({ bgColor: "blue-500", hover: { rounded: "md" } });`,
		css: `const b = css.class({ backgroundColor: "#3182ce", borderRadius: "0.375rem" });`,
		design: `const c = css.class({ $frame: { fill: "$blue-500", corners: "md" } });`,
	};
	const targets = ["css.class", "design", "tw"] as const;

	for (const from of ["tw", "css", "design"] as const) {
		for (const to of targets) {
			test(`${from} -> ${to}`, () => {
				const result = runSwapRaw(
					`${WITH_CSS}${
						from === "tw" ? sources.tw : from === "css" ? sources.css : sources.design
					}`,
					meta,
					{
						from,
						to,
						file: "t.tsx",
						metaDir: "apps/example/src",
					},
				);
				// Every pair converts at least one call site; nothing silently dropped.
				expect(result.converted).toBe(1);
				expect(result.code.length).toBeGreaterThan(20);
			});
		}
	}
});

test("CLI spawn e2e: --to=panda emits token refs + styled-system import", () => {
	const dir = mkdtempSync(resolve(tmpdir(), "pw-codemod-panda-"));
	const file = resolve(dir, "card.tsx");
	writeFileSync(
		file,
		`import { css } from "./design.ts";\nexport const card = css.class({ backgroundColor: "#3182ce" });\n`,
	);
	const repoRoot = resolve(import.meta.dirname, "../../..");
	execFileSync(
		"pnpm",
		[
			"exec",
			"tsx",
			"src/cli.ts",
			"swap",
			"--from=auto",
			"--to=panda",
			"--write",
			`--meta=${resolve(repoRoot, "apps/example/src")}`,
			file,
		],
		{ cwd: resolve(import.meta.dirname, ".."), stdio: "pipe" },
	);
	const after = readFileSync(file, "utf8");
	expect(after).toContain('css({ backgroundColor: "blue.500" })');
	expect(after).toContain('import { css } from "styled-system/css";');
}, 30_000);
