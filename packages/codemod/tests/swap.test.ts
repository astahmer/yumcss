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
 * Metadata comes from the real generated outputs in examples/example/src, and
 * asserted values are pinned against its bridge (e.g. #3182ce -> bg-blue-500).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loadMetaFromSources } from "../src/meta.ts";
import { runSwap, SWAP_TARGETS, TokenReferenceFormat } from "../src/swap/index.ts";
import { examplePreset } from "@pandwind/example-preset";

const appDir = resolve(import.meta.dirname, "../../../examples/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
	tokens: examplePreset.tokens,
});

const WITH_CSS = `import { css } from "./design.ts";\n`;
const swap = (
	source: string,
	to: "css.class" | "design" | "dss" | "tw",
	from: "auto" | "tw" | "css" | "design" = "auto",
	file = "test.tsx",
) =>
	runSwap(source, meta, {
		from,
		to,
		file,
		metaDir: "examples/example/src",
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
		const source = `${WITH_CSS}export const C = () => <div className={tw({ gap: "not-a-real-value" })} />;`;
		const result = swap(source, "css.class");
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain('tw({ gap: "not-a-real-value" })'); // original preserved
	});
});

describe("swap static style placement", () => {
	test("keeps generated static classes beside JSX by default", () => {
		const result = swap(
			`${WITH_CSS}export const View = () => <div className={tw({ bgColor: "blue-500" })} />;`,
			"css.class",
		);

		expect(result.code).toContain('className={css.class({ backgroundColor: "#3182ce" })}');
		expect(result.code).not.toContain("staticClassName");
	});

	test("hoists generated static classes only when requested", () => {
		const result = runSwap(
			`${WITH_CSS}export const View = () => <div className={tw({ bgColor: "blue-500" })} />;`,
			meta,
			{
				from: "tw",
				to: "css.class",
				file: "View.tsx",
				metaDir: "examples/example/src",
				hoistStaticStyles: true,
			},
		);

		expect(result.code).toContain(
			'const staticClassName1 = css.class({ backgroundColor: "#3182ce" });',
		);
		expect(result.code).toContain("className={staticClassName1}");
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
			metaDir: "examples/example/src",
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
		expect(result.code).toContain('fill: "blue.500"');
		expect(result.code).toContain('corners: "lg"');
		expect(result.code).toMatch(/pad: \[4, 8\]/);
	});

	test("vocabulary misses land in $raw instead of being dropped", () => {
		const result = swap(
			`${WITH_CSS}const card = css.class({ backgroundColor: "#3182ce", boxShadow: "0 1px 2px black" });`,
			"design",
		);
		expect(result.converted).toBe(1);
		expect(result.skippedByMarker).toBe(0);
		expect(result.code).toContain("$raw: {");
		expect(result.code).toContain("boxShadow");
		expect(result.unmappedTokens[0]?.reason).toContain("placed in $raw");
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
	test("the real binary converts a fixture file on disk", () => {
		const dir = mkdtempSync(resolve(tmpdir(), "pw-codemod-swap-"));
		const file = resolve(dir, "card.tsx");
		writeFileSync(
			file,
			`import { css } from "./design.ts";\nexport const card = css.class({ backgroundColor: "#3182ce" });\n`,
		);
		const repoRoot = resolve(import.meta.dirname, "../../..");
		execFileSync(
			"nub",
			[
				"src/cli.ts",
				"migrate",
				"--from=auto",
				"--to=tw",
				`--root=${dir}`,
				`--meta=${resolve(repoRoot, "examples/example/src")}`,
				"--no-install",
				file,
			],
			{ cwd: resolve(import.meta.dirname, ".."), stdio: "pipe" },
		);
		const after = readFileSync(file, "utf8");
		expect(after).toContain("tw({");
		expect(after).toContain('bgColor: "blue-500"');
		expect(after).not.toContain("css.class(");
	}, 30_000);

	test("auto-detects an external source for the unified default target", () => {
		const dir = mkdtempSync(resolve(tmpdir(), "pw-codemod-auto-"));
		const file = resolve(dir, "card.tsx");
		writeFileSync(
			file,
			'import styled from "styled-components";\nexport const Card = styled.div`color: red;`;\n',
		);
		try {
			const output = execFileSync(
				"nub",
				[
					"src/cli.ts",
					"migrate",
					"--root",
					dir,
					"--dry-run",
					"--no-install",
					"--report=json",
					file,
				],
				{ cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" },
			);
			const report = JSON.parse(output) as {
				readonly files: readonly [{ readonly from: string }];
			};
			expect(report.files[0]?.from).toBe("styled-components");
			const after = readFileSync(file, "utf8");
			expect(after).toContain('from "styled-components"');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
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
		metaDir: "examples/example/src",
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
	test("panda preserves authored token refs by default", () => {
		const result = swapTo(`const card = css.class({ backgroundColor: "$blue-500" });`, "panda");
		expect(result.code).toContain('backgroundColor: "$blue-500"');
		expect(result.code).toContain("css({ "); // single line, no pretty print
	});

	test("panda can force dot-delimited token refs", () => {
		const result = runSwapRaw(`const card = css.class({ backgroundColor: "$blue-500" });`, meta, {
			from: "auto",
			to: "panda",
			file: "t.tsx",
			metaDir: "examples/example/src",
			tokenReferenceFormat: TokenReferenceFormat.DotDelimited,
		});
		expect(result.code).toContain('backgroundColor: "blue.500"');
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
			metaDir: "examples/example/src",
			tokenRefs: "group",
			tokenReferenceFormat: TokenReferenceFormat.DotDelimited,
		});
		expect(result.code).toContain('backgroundColor: "colors.blue.500"');
	});

	test("off mode keeps authored values verbatim", () => {
		const result = runSwapRaw(`const card = css.class({ backgroundColor: "$blue-500" });`, meta, {
			from: "auto",
			to: "panda",
			file: "t.tsx",
			metaDir: "examples/example/src",
			tokenRefs: "off",
		});
		expect(result.code).toContain('backgroundColor: "$blue-500"');
	});

	test("emitters stay single-line even with conditions and multiple modules", () => {
		const result = swapTo(
			`${WITH_CSS}export const Card = () => (\n\t<div className={css.class({ $frame: { fill: "$gray-100" }, _hover: { $frame: { fill: "$gray-800" } } })} />\n);`,
			"design",
		);
		// Authored token references are preserved by the default format; one line.
		expect(result.code).toContain(
			'css.class({ $frame: { fill: "$gray-100" }, _hover: { $frame: { fill: "$gray-800" } } })',
		);
	});
});

/* ------------------------------------------------------------------ */
/* tokens subcommand: config-system conversions                        */
/* ------------------------------------------------------------------ */

import { tokenDocumentCodec as T } from "../src/swap/token-document-codec.ts";

describe("TokenDocument conversions", () => {
	const dtcg = JSON.stringify({
		colors: { blue: { 500: { $value: "#3182ce" }, 600: { $value: "#2b6cb0" } } },
		spacing: { 4: { $value: "4px" } },
	});

	test("DTCG -> @theme css", () => {
		const document = T.fromText("dtcg", dtcg);
		const theme = T.to("theme", document, { allowLossy: true }).text;
		expect(theme).toContain("--color-blue-500: #3182ce;");
		expect(theme).toContain("--spacing-4: 4px;");
	});

	test("@theme css -> DTCG round-trips", () => {
		const original = T.fromText("dtcg", dtcg);
		const theme = T.to("theme", original, { allowLossy: true }).text;
		const document = T.fromText("theme", theme);
		expect(document.root.children).toMatchObject({
			colors: {
				children: { "blue-500": { kind: "token", value: { kind: "string", value: "#3182ce" } } },
			},
			spacing: { children: { "4": { kind: "token", value: { kind: "string", value: "4px" } } } },
		});
		const back = JSON.parse(T.to("dtcg", document).text);
		expect(back.colors["blue-500"].$value).toBe("#3182ce");
	});

	test("define.preset imports via dynamic import of the real preset", async () => {
		const document = await T.fromFile("preset", "@pandwind/example-preset");
		expect(document.root.children).toMatchObject({
			colors: {
				children: { "$blue-500": { kind: "token", value: { kind: "string", value: "#3182ce" } } },
			},
		});
	});

	test("panda-config import flattens nested { value } leaves", async () => {
		const dir = mkdtempSync(resolve(tmpdir(), "pw-panda-cfg-"));
		const cfg = resolve(dir, "panda.config.ts");
		writeFileSync(
			cfg,
			`export default { theme: { extend: { tokens: { colors: { blue: { 500: { value: "#3182ce" } } } } } } };\n`,
		);
		const document = await T.fromFile("panda", cfg);
		expect(document.root.children).toMatchObject({
			colors: {
				children: { "blue-500": { kind: "token", value: { kind: "string", value: "#3182ce" } } },
			},
		});
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
			metaDir: "examples/example/src",
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
			{
				from: "css",
				to: "css.class",
				file: "t.tsx",
				metaDir: "examples/example/src",
				tokenize: true,
			},
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('backgroundColor: "$blue-500"');
	});
});

describe("--tokenize + governance suggestions (plans/054)", () => {
	test("governance suggestions govern: only exact property+value pairs rewrite", () => {
		const source = `import { css } from "./design.ts";\nconst card = css.class({ backgroundColor: "#3182ce", color: "#3182ce" });`;
		const result = runSwapRaw(source, meta, {
			from: "css",
			to: "css.class",
			file: "t.tsx",
			metaDir: "examples/example/src",
			tokenize: true,
			// Only backgroundColor has a verified exact-match suggestion; color
			// shares the same raw value but no evidence — stays literal.
			suggestions: [
				{
					file: "t.tsx",
					start: 0,
					end: 1,
					property: "backgroundColor",
					rawValue: "#3182ce",
					tokenId: "colors::blue-500",
					replacement: "$blue-500",
					confidence: "verified",
				},
			],
		});
		expect(result.converted).toBe(1);
		expect(result.code).toContain('backgroundColor: "$blue-500"');
		expect(result.code).toContain('color: "#3182ce"');
	});

	test("suggestions without a matching literal leave source untouched", () => {
		const source = `import { css } from "./design.ts";\nconst card = css.class({ backgroundColor: "#222222" });`;
		const result = runSwapRaw(source, meta, {
			from: "css",
			to: "css.class",
			file: "t.tsx",
			metaDir: "examples/example/src",
			tokenize: true,
			suggestions: [
				{
					file: "t.tsx",
					start: 0,
					end: 1,
					property: "backgroundColor",
					rawValue: "#3182ce",
					tokenId: "colors::blue-500",
					replacement: "$blue-500",
					confidence: "verified",
				},
			],
		});
		expect(result.converted).toBe(1);
		expect(result.code).toContain('backgroundColor: "#222222"');
	});
});

describe("--sort: canonical property order", () => {
	test("emitted scopes sort canonically (color after borderRadius)", () => {
		const result = runSwapRaw(
			`${WITH_CSS}const c = css.class({ $text: { color: "$gray-900" }, $frame: { corners: "$md", fill: "$blue-500" } });`,
			meta,
			{ from: "auto", to: "css.class", file: "t.tsx", metaDir: "examples/example/src", sort: true },
		);
		const call = result.code.slice(result.code.indexOf("css.class"));
		expect(call.indexOf("borderRadius")).toBeLessThan(call.indexOf("backgroundColor"));
		expect(call.indexOf("backgroundColor")).toBeLessThan(call.lastIndexOf("color"));
	});
});

describe("--nearest-tokens: raw-literal diagnostics", () => {
	test("adds a close token candidate to a preserved raw declaration", () => {
		const result = runSwap(
			`${WITH_CSS}const card = css.class({ outlineColor: "#3182cf" });`,
			meta,
			{
				from: "auto",
				to: "design",
				file: "t.tsx",
				metaDir: "examples/example/src",
				nearestTokens: true,
			},
		);
		expect(result.converted).toBe(1);
		expect(result.unmappedTokens[0]?.reason).toContain("nearest token candidate");
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
			metaDir: "examples/example/src",
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
	const document = T.fromText("dtcg", fixture);

	test("style dictionary round-trips and infers color type", () => {
		const sd = T.to("sd", document, { allowLossy: true }).text;
		expect(sd).toContain('"value": "#3182ce"');
		expect(sd).toContain('"type": "color"');
		const back = T.fromText("sd", sd);
		expect(back.root.children).toMatchObject({
			colors: {
				children: { "blue-500": { kind: "token", value: { kind: "string", value: "#3182ce" } } },
			},
		});
	});

	test("figma tokens round-trips with types always set", () => {
		const fig = T.to("figma", document, { allowLossy: true }).text;
		expect(fig).toContain('"type": "color"');
		expect(fig).toContain('"type": "spacing"');
		const back = T.fromText("figma", fig);
		expect(back.root.children).toMatchObject({
			colors: {
				children: { "blue-500": { kind: "token", value: { kind: "string", value: "#3182ce" } } },
			},
		});
	});

	test(":root css round-trips through the prefix map", () => {
		const cssOut = T.to("rootcss", document, { allowLossy: true }).text;
		expect(cssOut).toContain("--color-blue-500: #3182ce;");
		expect(cssOut).toContain("--spacing-4: 4px;");
		const back = T.fromText("rootcss", cssOut);
		expect(back.root.children).toMatchObject({
			colors: {
				children: { "blue-500": { kind: "token", value: { kind: "string", value: "#3182ce" } } },
			},
		});
	});

	test("stylex defineVars emits one export per group", () => {
		const vars = T.to("stylex", document, { allowLossy: true }).text;
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
						metaDir: "examples/example/src",
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
		"nub",
		[
			"src/cli.ts",
			"migrate",
			"--from=auto",
			"--to=panda",
			`--root=${dir}`,
			`--meta=${resolve(repoRoot, "examples/example/src")}`,
			"--no-install",
			file,
		],
		{ cwd: resolve(import.meta.dirname, ".."), stdio: "pipe" },
	);
	const after = readFileSync(file, "utf8");
	expect(after).toContain('css({ backgroundColor: "blue.500" })');
	expect(after).toContain('import { css } from "styled-system/css";');
}, 30_000);
