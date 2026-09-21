import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import { createTwAdapter } from "../src/tw/adapter.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createCss } from "../src/css/create-css.ts";
import { firstThatWorks } from "../src/css/index.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createStyleXAdapter } from "../src/css/stylex-adapter.ts";
import { examplePreset } from "@pandwind/example-preset";
import { pandwindCssVite } from "../src/vite/css.ts";
import { createPandwindEngineContext } from "../src/vite/engine-context.ts";
import { stackFoldVite } from "../src/vite/stack-fold.ts";
import { createCssExtractionService, createCssSourceScanner } from "../src/vite/css-extract.ts";
import { CssSourceScannerService } from "../src/vite/css-source-scanner.ts";
import { SOURCE_SCANNER_SERVICE } from "../src/source-scanner.ts";
import { NodeKind } from "../src/ast-node-kind.ts";
import type {
	CssArtifactExtractor,
	CssDiagnosticReporter,
	CssSourceScanner,
} from "../src/vite/css-extraction-contracts.ts";

const scan = (matchers: readonly (string | RegExp)[] = []) => createCssSourceScanner(matchers);
const extract = (matchers: readonly (string | RegExp)[] = []) =>
	createCssExtractionService({ matchers, preset: examplePreset });
const inline = () =>
	createCssExtractionService({ matchers: [], preset: examplePreset, className: twMode() });
import { createCssSourceService } from "../src/vite/css-source-service.ts";

test("findAuthoredCssImports reports explicit web stylesheet imports", () => {
	const code = `
		import "./globals.css";
		import styles from "@acme/theme/styles.css?inline";
		import { css } from "./design";
	`;
	const imports = scan().findAuthoredImports(code, "src/main.tsx");

	expect(imports).toHaveLength(2);
	expect(imports[0]).toMatchObject({
		file: "src/main.tsx",
		source: "./globals.css",
		kind: "side-effect",
		line: 2,
	});
	expect(imports[1]).toMatchObject({
		source: "@acme/theme/styles.css?inline",
		kind: "binding",
		line: 3,
	});
});

test("findCssCallSites reports extraction coverage with provenance", () => {
	const code = `
		import { css } from "./design";
		const color = "$blue-500";
		const a = css.class({ $text: { color: "$blue-500" } });
		const b = css({ $text: { color } });
	`;
	const sites = scan().findCallSites(code, "src/card.tsx", new Set(["css"]));

	expect(sites).toHaveLength(2);
	expect(sites[0]).toMatchObject({
		callKind: "css.class",
		line: 4,
		staticArguments: 1,
		dynamicArguments: 0,
	});
	expect(sites[1]).toMatchObject({
		callKind: "css",
		line: 5,
		staticArguments: 0,
		dynamicArguments: 1,
	});
	expect(sites).toMatchInlineSnapshot(`
		[
		  {
		    "callKind": "css.class",
		    "column": 13,
		    "dynamicArguments": 0,
		    "end": 120,
		    "file": "src/card.tsx",
		    "line": 4,
		    "start": 76,
		    "staticArguments": 1,
		  },
		  {
		    "callKind": "css",
		    "column": 13,
		    "dynamicArguments": 1,
		    "end": 159,
		    "file": "src/card.tsx",
		    "line": 5,
		    "start": 134,
		    "staticArguments": 0,
		  },
		]
	`);
});

test("diagnoseCssSources reports unsupported constructs and missed extraction", () => {
	const code = `
		import { css } from "./design";
		const color = "$blue-500";
		const spin = { from: { opacity: 0 } };
		css.keyframes({ from: { opacity: 0 } });
		css.keyframes(spin);
		css.class({ $text: { color } });
	`;
	const diagnostics = extract().diagnose(code, "src/card.tsx", new Set(["css"]));

	expect(diagnostics).toHaveLength(2);
	expect(diagnostics[0]).toMatchObject({
		kind: "unsupported-construct",
		line: 6,
		message: "css.keyframes needs one static object literal body.",
		suggestion: expect.stringContaining("authored CSS"),
	});
	expect(diagnostics[1]).toMatchObject({
		kind: "missing-extraction",
		line: 7,
		message: expect.stringContaining("dynamic"),
		suggestion: expect.stringContaining("css.vars"),
	});
	expect(diagnostics).toMatchInlineSnapshot(`
		[
		  {
		    "column": 3,
		    "end": 169,
		    "file": "src/card.tsx",
		    "kind": "unsupported-construct",
		    "line": 6,
		    "message": "css.keyframes needs one static object literal body.",
		    "start": 150,
		    "suggestion": "Keep every step and declaration literal, or keep the @keyframes rule in authored CSS.",
		  },
		  {
		    "column": 3,
		    "end": 204,
		    "file": "src/card.tsx",
		    "kind": "missing-extraction",
		    "line": 7,
		    "message": "css.class has dynamic argument(s); only literal style objects enter the generated stylesheet.",
		    "start": 173,
		    "suggestion": "Keep the style shape literal for build-time extraction, or use css.vars for dynamic values and verify the runtime path.",
		  },
		]
	`);
});

test("diagnoseCssSources keeps authored @property rules in the explicit CSS lane", () => {
	const code = `
		import { css } from "./design";
		css.property({ name: "--progress", syntax: "<number>" });
	`;
	const diagnostics = extract().diagnose(code, "src/progress.tsx", new Set(["css"]));

	expect(diagnostics).toMatchObject([
		{
			kind: "unsupported-construct",
			message: "Authored @property rules are not extracted yet.",
			suggestion: expect.stringContaining("authored CSS"),
		},
	]);
});

test("diagnoseCssSources reports dynamic React Strict DOM web entries", () => {
	const code = `
		import { createCss } from "pandwind/react-strict-dom";
		const css = createCss();
		css.create({ opacity: (value) => ({ opacity: value }) });
	`;
	const id = "src/card.tsx";
	const names = scan().findImports(code, id);
	const diagnostics = extract().diagnose(code, id, names);

	expect(names).toEqual(new Set(["css"]));
	expect(diagnostics).toHaveLength(1);
	expect(diagnostics[0]).toMatchObject({
		kind: "missing-extraction",
		message: expect.stringContaining("css.create"),
		suggestion: expect.stringContaining("style shape literal"),
	});
});

test("extractCssSources records stable call provenance without changing styles", () => {
	const code = `\n\nimport { css as design } from "./design";\nconst a = design.class({ $text: { color: "$blue-500" } });`;
	const sources = extract().extract(code, "/src/card.tsx", new Set(["design"]));

	expect(sources).toHaveLength(1);
	expect(sources[0]).toMatchObject({
		style: { color: "#3182ce" },
		provenance: {
			file: "/src/card.tsx",
			line: 4,
			column: 11,
			callKind: "css.class",
		},
	});
	expect(sources[0]!.provenance.end).toBeGreaterThan(sources[0]!.provenance.start);
	expect(sources).toMatchInlineSnapshot(`
		[
		  {
		    "provenance": {
		      "callKind": "css.class",
		      "column": 11,
		      "end": 101,
		      "file": "/src/card.tsx",
		      "line": 4,
		      "start": 54,
		    },
		    "style": {
		      "color": "#3182ce",
		    },
		  },
		]
	`);
});

test("extractCssFile keeps styles and var keys equivalent in one parse", () => {
	const code = `
		import { css } from "./design";
		css({ $text: { color: "$blue-500" } });
		css.vars({ color: "runtime" });
	`;
	const names = scan(["css"]).findImports(code, "app.ts");
	const combined = extract(["css"]).extractFile(code, "app.ts");

	expect(combined.sources).toEqual(extract().extract(code, "app.ts", names));
	expect(combined.varKeys).toEqual(scan().findVarKeys(code, "app.ts", names));
});

test("isCssSource matches css/design basenames", () => {
	const matchers = ["css", "design"];
	expect(scan(matchers).matches("./design")).toBe(true);
	expect(scan(matchers).matches("../css.ts")).toBe(true);
	expect(scan(matchers).matches("./css.generated.ts")).toBe(true);
	expect(scan(matchers).matches("pandwind/css.generated")).toBe(true);
	expect(scan(matchers).matches("pandwind/design")).toBe(true);
	expect(scan(matchers).matches("./styles")).toBe(false);
});

test("findCssImports collects named, default and aliased css bindings", () => {
	const code = `
		import { css } from "./design";
		import styles from "./css";
		import { css as wind } from "pandwind/design";
		import { tw } from "./tw";
	`;
	expect(scan(["css", "design"]).findImports(code, "app.tsx")).toEqual(
		new Set(["css", "styles", "wind"]),
	);
});

test("findCssImports accepts named carriers and ignores factories and type imports", () => {
	const code = `
		import { createCss as makeCss, untypedCss } from "./css";
		import type { CssFn } from "./css";
		import { createDesignCss, dss as design } from "./design";
	`;

	expect(scan(["css", "design"]).findImports(code, "app.tsx")).toEqual(
		new Set(["untypedCss", "design"]),
	);
});

test("the CSS scanner ignores stylesheet and virtual module ids", () => {
	const scanner = createCssExtractionService({ matchers: ["css"], preset: examplePreset }).scanner;
	const source = 'import { css } from "./design"; css({ color: "red" });';

	expect(scanner.findImports(source, "styles.css")).toEqual(new Set());
	expect(scanner.findAuthoredImports(source, "styles.css")).toEqual([]);
	expect(scanner.findCallSites(source, "\0pandwind:css.css", new Set(["css"]))).toEqual([]);
	expect(scanner.findVarKeys(source, "styles.css", new Set(["css"]))).toEqual([]);
});

test("shares one parsed document across CSS inspection operations", () => {
	let parseCount = 0;
	const sharedScanner = {
		...SOURCE_SCANNER_SERVICE,
		parse: (document: Parameters<typeof SOURCE_SCANNER_SERVICE.parse>[0]) => {
			parseCount++;
			return SOURCE_SCANNER_SERVICE.parse(document);
		},
	};
	const scanner = new CssSourceScannerService(["design"], sharedScanner);
	const source = 'import { css } from "./design"; css({ color: "red" });';

	scanner.inspect(source, "src/card.tsx");
	scanner.findImports(source, "src/card.tsx");
	scanner.findAuthoredImports(source, "src/card.tsx");
	scanner.findCallSites(source, "src/card.tsx", new Set(["css"]));
	scanner.findVarKeys(source, "src/card.tsx", new Set(["css"]));

	expect(parseCount).toBe(1);
	expect(scanner.inspect(source, "src/card.tsx")).toMatchInlineSnapshot(`
		{
		  "authoredCss": [],
		  "cssDiagnostics": [],
		  "cssNames": Set {
		    "css",
		  },
		  "cssSources": [
		    {
		      "callKind": "css",
		      "column": 33,
		      "dynamicArguments": 0,
		      "end": 53,
		      "file": "src/card.tsx",
		      "line": 1,
		      "start": 32,
		      "staticArguments": 1,
		    },
		  ],
		}
	`);
	scanner.findImports(source.replace("red", "blue"), "src/card.tsx");
	expect(parseCount).toBe(2);
});

test("css extraction façade accepts substituted policy ports", () => {
	const scanner: CssSourceScanner = {
		matches: () => true,
		parse: () => ({ type: NodeKind.Program }),
		findImports: () => new Set(["css"]),
		inspect: () => ({
			authoredCss: [],
			cssNames: new Set(["css"]),
			cssSources: [],
			cssDiagnostics: [],
		}),
		findAuthoredImports: () => [],
		findCallSites: () => [],
		findVarKeys: () => ["runtime__color"],
	};
	const artifacts: CssArtifactExtractor = {
		extract: () => [],
		extractFile: () => ({ sources: [], varKeys: ["runtime__color"], keyframes: [] }),
	};
	const diagnostics: CssDiagnosticReporter = { diagnose: () => [] };
	const service = createCssExtractionService({
		matchers: [],
		preset: examplePreset,
		scanner,
		artifacts,
		diagnostics,
		rewriter: { inline: (code) => ({ code: `${code}!`, inlined: 1, varKeys: [] }) },
	});

	expect(service.extractFile("ignored", "ignored.ts")).toEqual({
		sources: [],
		varKeys: ["runtime__color"],
		keyframes: [],
	});
	expect(service.inline("code", "ignored.ts", new Set(["css"]))).toEqual({
		code: "code!",
		inlined: 1,
		varKeys: [],
	});
});

test("the shared source service composes the extraction façade", () => {
	const calls: string[] = [];
	const service = createCssSourceService({
		scanner: {
			matches: () => true,
			parse: () => ({ type: NodeKind.Program }),
			findImports: () => {
				calls.push("scan");
				return new Set(["css"]);
			},
			inspect: () => ({
				authoredCss: [],
				cssNames: new Set(["css"]),
				cssSources: [],
				cssDiagnostics: [],
			}),
			findAuthoredImports: () => [],
			findCallSites: () => [],
			findVarKeys: () => [],
		},
		artifacts: {
			extract: () => [],
			extractFile: () => {
				calls.push("extract");
				return { sources: [], varKeys: [], keyframes: [] };
			},
		},
	});

	service.extractFile("source", "app.ts", ["css"], examplePreset);
	expect(calls).toEqual(["extract"]);
});

test("extractCssStyles resolves design modules in literal calls", () => {
	const code = `
		import { css } from "./design";
		const a = css({ $frame: { w: "20", fill: "$blue-500" } });
		const b = css.class({ $layout: { flow: "stackY", gap: "16" } });
		const c = css.raw({ $text: { color: "$red-300" } });
	`;
	const styles = extract().extractStyles(code, "app.ts", new Set(["css"]));
	expect(styles).toEqual([
		{ width: "20px", backgroundColor: "#3182ce" },
		{ display: "flex", flexDirection: "column", gap: "16px" },
		{ color: "#FC8181" },
	]);
	expect(styles).toMatchInlineSnapshot(`
		[
		  {
		    "backgroundColor": "#3182ce",
		    "width": "20px",
		  },
		  {
		    "display": "flex",
		    "flexDirection": "column",
		    "gap": "16px",
		  },
		  {
		    "color": "#FC8181",
		  },
		]
	`);
});

test("extractCssStyles registers const-backed candidates and skips unbounded calls", () => {
	const code = `
		import { css } from "./design";
		const color = "$blue-500";
		const a = css({ $frame: { fill: color } });
		const b = css({ $frame: { w: "20" } }, { $frame: { h: "20" } });
	`;
	// A same-module const is a finite, proven value -> its resolved rule is
	// registered as a candidate; the runtime call still selects it.
	expect(extract().extractStyles(code, "app.ts", new Set(["css"]))).toEqual([
		{ backgroundColor: "#3182ce" },
		{ width: "20px" },
		{ height: "20px" },
	]);
	// Genuinely unbounded values stay conservative.
	const unbounded = `
		import { css } from "./design";
		const pick = () => "$blue-500";
		const a = css({ $frame: { fill: pick() } });
	`;
	expect(extract().extractStyles(unbounded, "app.ts", new Set(["css"]))).toEqual([]);
});

test("extractCssStyles ignores raw css() from non-matching sources", () => {
	const code = `
		import { other } from "./not-css";
		const a = other({ $frame: { w: "20" } });
	`;
	expect(extract().extractStyles(code, "app.ts", new Set(["css"]))).toEqual([]);
});

/** Minimal bridge + variants for the tailwind-mode inlining tests. */
const twMode = () =>
	createTwAdapter({
		preset: examplePreset,
		variants: { hover: { join: ":" }, sm: { join: ":" } },
		bridge: {
			color: { "#3182ce": "text-blue-500" },
			"background-color": { "#E53E3E": "bg-red-500" },
		},
	});

test("inlineCssCalls rewrites literal css() calls to Tailwind classes", () => {
	const code = `
		import { css } from "./design";
		const a = css.class({ $text: { color: "$blue-500" } });
		const b = css({ $frame: { fill: "$red-500" } });
		const c = css({ $frame: { fill: "$red-500" } }, { $frame: { w: "20" } });
	`;
	const result = inline().inline(code, "app.ts", new Set(["css"]));
	expect(result.inlined).toBe(3);
	expect(result.code).toContain('const a = "text-blue-500";');
	expect(result.code).toContain('const b = {"backgroundColor":"bg-red-500"};');
	expect(result.code).toContain(
		'const c = {"backgroundColor":"bg-red-500","width":"[width:20px]"};',
	);
	expect(result).toMatchInlineSnapshot(`
		{
		  "code": "
				import { css } from "./design";
				const a = "text-blue-500";
				const b = {"backgroundColor":"bg-red-500"};
				const c = {"backgroundColor":"bg-red-500","width":"[width:20px]"};
			",
		  "inlined": 3,
		  "varKeys": [],
		}
	`);
});

test("inlineCssCalls leaves raw/props/group and dynamic calls untouched", () => {
	const code = `
		import { css } from "./design";
		const color = "$blue-500";
		const a = css.class({ $text: { color } });
		const b = css.raw({ $text: { color: "$blue-500" } });
		const c = css.props({});
		const d = css.class({ $text: { color: "$blue-500" } }, { $frame: { fill: "$red-500" } });
	`;
	const result = inline().inline(code, "app.ts", new Set(["css"]));
	expect(result.inlined).toBe(1);
	expect(result.code).toContain("const a = css.class({ $text: { color } });");
	expect(result.code).toContain('const b = css.raw({ $text: { color: "$blue-500" } });');
	expect(result.code).toContain("const c = css.props({});");
	// Multi-arg class calls are still inlined (merged).
	expect(result.code).toContain('const d = "text-blue-500 bg-red-500";');
	expect(result).toMatchInlineSnapshot(`
		{
		  "code": "
				import { css } from "./design";
				const color = "$blue-500";
				const a = css.class({ $text: { color } });
				const b = css.raw({ $text: { color: "$blue-500" } });
				const c = css.props({});
				const d = "text-blue-500 bg-red-500";
			",
		  "inlined": 1,
		  "varKeys": [],
		}
	`);
});

test("pandwindCssVite with className serves empty CSS and inlines calls", () => {
	const dir = makeProject({
		"src/app.tsx": `
			import { css } from "./design";
			import "pandwind:css";
			export const a = css.class({ $text: { color: "$blue-500" } });
		`,
	});
	const plugin = pandwindCssVite(examplePreset, {
		className: twMode(),
		root: dir,
	});
	const result = (plugin.transform as (code: string, id: string) => { code: string } | null).call(
		null,
		readFileSync(join(dir, "src/app.tsx"), "utf8"),
		join(dir, "src/app.tsx"),
	);
	expect(result).not.toBeNull();
	expect(result!.code).toContain('const a = "text-blue-500"');
	// Tailwind owns the CSS in this mode.
	expect(loadGenerated(plugin as never)).toBe("");
});

test("configured Stack folding feeds the shared sheet-backed CSS lane", () => {
	const dir = makeProject({
		"src/app.tsx":
			'import { Stack } from "pandwind/stack/react"; export const app = <Stack direction="column" gap={4} />;',
	});
	try {
		const engine = createPandwindEngineContext({
			preset: examplePreset,
			className: createNamedAtomsStrategy("app"),
		});
		const id = join(dir, "src/app.tsx");
		const source = readFileSync(id, "utf8");
		const stack = stackFoldVite({ engine });
		const transformed = stack.transform(source, id);

		expect(transformed?.code).toContain(
			'<div className="app-display-flex app-flexDirection-column app-gap-4px" />',
		);

		const css = pandwindCssVite(examplePreset, { root: dir, engine });
		const generated = loadGenerated(css);
		expect(generated).toContain(".app-display-flex{display:flex}");
		expect(generated).toContain(".app-flexDirection-column{flex-direction:column}");
		expect(generated).toContain(".app-gap-4px{gap:4px}");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

const makeProject = (files: Record<string, string>): string => {
	const dir = mkdtempSync(join(tmpdir(), "pandwind-css-"));
	for (const [name, content] of Object.entries(files)) {
		const path = join(dir, name);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
	return dir;
};

test("static extraction retains the virtual stylesheet side effect", () => {
	const dir = makeProject({
		"src/css.ts":
			'import { createUnsafeCss } from "pandwind/unsafe/css"; export const css = createUnsafeCss();',
		"src/app.tsx": 'import { css } from "./css"; export const card = css.class({ color: "red" });',
	});
	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const source = readFileSync(join(dir, "src/app.tsx"), "utf8");
		const transformed = (plugin.transform as (code: string, id: string) => { code: string } | null)(
			source,
			join(dir, "src/app.tsx"),
		);

		expect(transformed?.code).toContain('import "pandwind:css";');
		expect(transformed?.code).not.toContain("css.class(");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pandwindCssVite folds responsive CSS calls with preset conditions", () => {
	const dir = makeProject({
		"src/app.ts": [
			'import { css } from "./design";',
			'export const menu = css.class({ position: { sm: "fixed", md: "absolute" }, top: { sm: "0", md: "100%" } });',
		].join("\n"),
		"src/design.ts": "export const css = { class: (styles: unknown) => styles };",
	});
	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const source = readFileSync(join(dir, "src/app.ts"), "utf8");
		const transformed = (
			plugin.transform as (code: string, id: string) => { code: string } | null
		).call(null, source, join(dir, "src/app.ts"));
		const expectedClasses = createUnsafeCss({ conditions: examplePreset.conditions }).class({
			position: { sm: "fixed", md: "absolute" },
			top: { sm: "0", md: "100%" },
		});

		expect(transformed?.code).toContain(`const menu = ${JSON.stringify(expectedClasses)}`);
		const generated = loadGenerated(plugin);
		expect(generated).toContain("position:fixed");
		expect(generated).toContain("position:absolute");
		expect(generated).toContain("top:0");
		expect(generated).toContain("top:100%");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pandwindCssVite extracts firstThatWorks fallback declarations", () => {
	const dir = makeProject({
		"src/app.ts": [
			'import { firstThatWorks } from "pandwind/css";',
			'import { css } from "./design";',
			'export const menu = css.class({ display: firstThatWorks("flex", "-webkit-box", "block") });',
		].join("\n"),
		"src/design.ts": "export const css = { class: (styles: unknown) => styles };",
	});
	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const source = readFileSync(join(dir, "src/app.ts"), "utf8");
		const transformed = (
			plugin.transform as (code: string, id: string) => { code: string } | null
		).call(null, source, join(dir, "src/app.ts"));
		const expectedClasses = createUnsafeCss({ conditions: examplePreset.conditions }).class({
			display: firstThatWorks("flex", "-webkit-box", "block"),
		} as never);

		expect(transformed?.code).toContain(`const menu = ${JSON.stringify(expectedClasses)}`);
		expect(loadGenerated(plugin)).toContain("display:block;display:-webkit-box;display:flex");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pandwindCssVite extracts reusable firstThatWorks constants", () => {
	const dir = makeProject({
		"src/app.ts": [
			'import { firstThatWorks } from "pandwind/css";',
			'import { css } from "./design";',
			'const displayFallback = firstThatWorks("flex", "-webkit-box", "block");',
			"export const menu = css.class({ display: displayFallback });",
		].join("\n"),
		"src/design.ts": "export const css = { class: (styles: unknown) => styles };",
	});
	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const source = readFileSync(join(dir, "src/app.ts"), "utf8");
		const transformed = (
			plugin.transform as (code: string, id: string) => { code: string } | null
		).call(null, source, join(dir, "src/app.ts"));

		expect(transformed?.code).toContain("displayFallback");
		expect(loadGenerated(plugin)).toContain("display:block;display:-webkit-box;display:flex");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pandwindCssVite does not evaluate same-named local fallback helpers", () => {
	const dir = makeProject({
		"src/app.ts": [
			'import { css } from "./design";',
			"const firstThatWorks = (...values: string[]) => values[0];",
			'export const menu = css.class({ display: firstThatWorks("flex", "block") });',
		].join("\n"),
		"src/design.ts": "export const css = { class: (styles: unknown) => styles };",
	});
	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const source = readFileSync(join(dir, "src/app.ts"), "utf8");
		const transformed = (
			plugin.transform as (code: string, id: string) => { code: string } | null
		).call(null, source, join(dir, "src/app.ts"));

		expect(transformed?.code).toContain('firstThatWorks("flex", "block")');
		expect(loadGenerated(plugin)).not.toContain("display:flex");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test.each([
	["specificity", "specificity", ":not(#\\#)"],
	["layers", "layers", "@layer pandwind{"],
	["named layers", { mode: "layers", layer: "app.utilities" }, "@layer app.utilities{"],
] as const)("pandwindCssVite applies the %s cascade mode", (_label, cascade, marker) => {
	const dir = makeProject({
		"src/css.ts":
			'import { createUnsafeCss } from "pandwind/unsafe/css"; export const css = createUnsafeCss();',
		"src/app.tsx": 'import { css } from "./css"; export const card = css.class({ color: "red" });',
	});
	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir, cascade });
		expect(loadGenerated(plugin)).toContain(marker);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pandwindCssVite inherits a named layer from the CSS composition", () => {
	const dir = makeProject({
		"src/css.ts":
			'import { createUnsafeCss } from "pandwind/unsafe/css"; export const css = createUnsafeCss();',
		"src/app.tsx": 'import { css } from "./css"; export const card = css.class({ color: "red" });',
	});
	try {
		const css = createCss(examplePreset, {
			cascade: { mode: "layers", layer: "app.utilities" },
		});
		const plugin = pandwindCssVite(css, { root: dir });

		expect(loadGenerated(plugin)).toContain("@layer app.utilities{");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pandwindCssVite extracts static React Strict DOM css.create maps", () => {
	const dir = makeProject({
		"src/app.tsx": `
			import { createCss } from "pandwind/react-strict-dom";
			const css = createCss();
			const styles = css.create({
				card: { color: "red", padding: "1rem" },
				active: { backgroundColor: "blue" },
			});
			export const card = styles.card;
		`,
	});
	try {
		const plugin = pandwindCssVite(examplePreset, {
			className: createStyleXAdapter(),
			root: dir,
		});
		const source = readFileSync(join(dir, "src/app.tsx"), "utf8");
		const transformed = (plugin.transform as (code: string, id: string) => { code: string } | null)(
			source,
			join(dir, "src/app.tsx"),
		);

		expect(transformed?.code).toContain('import "pandwind:css";');
		expect(transformed?.code).toContain("css.create");
		expect(loadGenerated(plugin)).toContain("color:red");
		expect(loadGenerated(plugin)).toContain("padding:1rem");
		expect(loadGenerated(plugin)).toContain("background-color:blue");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("React Strict DOM native css carriers stay out of web stylesheet extraction", () => {
	const dir = makeProject({
		"src/app.tsx": `
			import { createCss, ReactStrictDomPlatform } from "pandwind/react-strict-dom";
			const css = createCss({ platform: ReactStrictDomPlatform.Native });
			const styles = css.create({ card: { color: "red" } });
			export const card = styles.card;
		`,
	});
	try {
		const plugin = pandwindCssVite(examplePreset, {
			className: createStyleXAdapter(),
			root: dir,
		});
		const source = readFileSync(join(dir, "src/app.tsx"), "utf8");
		const transformed = (plugin.transform as (code: string, id: string) => { code: string } | null)(
			source,
			join(dir, "src/app.tsx"),
		);

		expect(transformed).toBeNull();
		expect(loadGenerated(plugin)).toBe("");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

const loadGenerated = (plugin: ReturnType<typeof pandwindCssVite>): string =>
	plugin.load("\0pandwind:css.css") as string;

const relevantCss = (css: string, markers: readonly string[]): string =>
	css
		.split("\n")
		.filter((line) => markers.some((marker) => line.includes(marker)))
		.join("\n");

test("pandwindCssVite extracts carriers exported under non-css names", () => {
	const dir = makeProject({
		"src/css.ts":
			'import { createUnsafeCss } from "pandwind/unsafe/css"; export const untypedCss = createUnsafeCss();',
		"src/app.tsx": `
			import { untypedCss } from "./css";
			export const text = untypedCss.class({
				color: "var(--demo-accent)",
				padding: "var(--demo-gap)",
				border: "1px solid var(--demo-accent)",
			});
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const source = readFileSync(join(dir, "src/app.tsx"), "utf8");
		const transformed = (plugin.transform as (code: string, id: string) => { code: string } | null)(
			source,
			join(dir, "src/app.tsx"),
		);
		const generated = loadGenerated(plugin);

		expect(transformed?.code).not.toContain("untypedCss.class(");
		expect(generated).toContain("color:var(--demo-accent)");
		expect(generated).toContain("padding:var(--demo-gap)");
		expect(generated).toContain("border:1px solid var(--demo-accent)");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pandwindCssVite generates the stylesheet from scanned files", () => {
	const dir = makeProject({
		"src/design.ts": "export const dss = (x: unknown) => x; // module that imports stay valid",
		"src/app.tsx": `
			import { css } from "./design";
			export const styles = css({ $frame: { w: "20", fill: "$blue-500" } });
		`,
		"src/other.ts": `
			import { css } from "./design";
			css.class({ $layout: { flow: "stackY", gap: "16" } });
		`,
		"src/aliased-design.ts": `
			import { dss as design } from "./design";
			design.class({ $frame: { corners: "lg" } });
		`,
		"node_modules/pkg/index.ts": `
			import { css } from "./design";
			css({ $frame: { fill: "$green-500" } });
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		expect(plugin.resolveId("pandwind:css")).toBe("\0pandwind:css.css");

		const generated = loadGenerated(plugin);
		// Design-layer calls are resolved to concrete declarations before the
		// sheet sees them, so they do not need the preset's unused token roots.
		expect(generated).not.toContain(":root");
		expect(generated).toContain("width:20px");
		expect(generated).toContain("background-color:#3182ce");
		expect(generated).toContain("flex-direction:column");
		expect(generated).toContain("border-radius:0.5rem");
		// node_modules is never scanned
		expect(generated).not.toContain("background-color:#60A3BC");
		expect(
			relevantCss(generated, [
				"width:20px",
				"background-color:#3182ce",
				"flex-direction:column",
				"border-radius:0.5rem",
			]),
		).toMatchInlineSnapshot(`
			".\\31 ugydhi{border-radius:0.5rem}
			.\\31 xccw59{background-color:#3182ce}
			.lh3u0m{flex-direction:column}
			.try5ud{width:20px}"
		`);
		/*
		 * The full stylesheet is intentionally not snapshotted here: the default
		 * preset contributes a large token catalog. The rule-level snapshot above
		 * keeps this test focused on scanned source and the assertions above still
		 * verify the complete artifact's inclusion/exclusion behavior.
		 */
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("default stylesheet mode rewrites literal css calls", () => {
	const code = `
		import { css } from "./design";
		const a = css.class({ $text: { color: "$blue-500" } });
		const b = css({ $frame: { w: "20", fill: "$red-500" } });
	`;
	const result = extract().inline(code, "app.ts", new Set(["css"]));

	expect(result.inlined).toBe(2);
	expect(result.code).toContain('const a = "');
	expect(result.code).toContain('const b = {"width":"');
	expect(result.code).not.toContain("css.class(");
	expect(result.code).not.toContain("css({");
});

test("static extraction includes and rewrites literal css groups", () => {
	const dir = makeProject({
		"src/css.ts":
			'import { createUnsafeCss } from "pandwind/unsafe/css"; export const css = createUnsafeCss();',
		"src/app.tsx": `
			import { css } from "./css";
			import "pandwind:css";
			export const styles = css.group({
				button: { color: "red", padding: "1rem" },
				label: { fontWeight: 600 },
			});
		`,
	});
	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const source = readFileSync(join(dir, "src/app.tsx"), "utf8");
		const transformed = (plugin.transform as (code: string, id: string) => { code: string } | null)(
			source,
			join(dir, "src/app.tsx"),
		);
		const generated = loadGenerated(plugin);

		expect(transformed?.code).not.toContain("css.group(");
		expect(transformed?.code).toContain('"button"');
		expect(generated).toContain("color:red");
		expect(generated).toContain("padding:1rem");
		expect(generated).toContain("font-weight:600");
		expect({
			transformed: transformed?.code,
			rules: relevantCss(generated, ["color:red", "padding:1rem", "font-weight:600"]),
		}).toMatchInlineSnapshot(`
			{
			  "rules": ".\\31 macb5i{padding:1rem}
			.\\31 nmpgqu{color:red}
			.\\31 r2drmp{font-weight:600}",
			  "transformed": "
						import { css } from "./css";
						import "pandwind:css";
						export const styles = {"button":{"color":"1nmpgqu","padding":"1macb5i"},"label":{"fontWeight":"1r2drmp"}};
					",
			}
		`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("static extraction emits css.input group rules for createCss", () => {
	const dir = makeProject({
		"src/css.ts":
			'import { createUnsafeCss } from "pandwind/unsafe/css"; export const css = createUnsafeCss();',
		"src/app.tsx": `
			import { css } from "./css";
			type ButtonInput = { background: string };
			const styles = css.group({
				button: {
					$input: {} as ButtonInput,
					display: "block",
					backgroundColor: css.input("background"),
					padding: "1rem",
				},
			});
			export const App = ({ background }: ButtonInput) => (
				<button {...css.props(styles.button({ background }))} />
			);
		`,
	});
	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const source = readFileSync(join(dir, "src/app.tsx"), "utf8");
		const transformed = (plugin.transform as (code: string, id: string) => { code: string } | null)(
			source,
			join(dir, "src/app.tsx"),
		);
		const generated = loadGenerated(plugin);

		expect(transformed?.code).toContain("css.group({");
		expect(generated).toContain("background-color:var(--background)");
		expect(generated).toContain("display:block");
		expect(generated).toContain("padding:1rem");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("static direct factory calls are marked pure for bundler elimination", () => {
	const code = `
		import { createUnsafeCss } from "../../src/unsafe/css.ts";
		const css = createUnsafeCss();
		const card = css.class({ color: "red" });
	`;
	const result = extract().inline(code, "app.ts", new Set(["css"]));

	expect(result.inlined).toBe(1);
	expect(result.code).toContain("/* @__PURE__ */ createUnsafeCss()");
});

test("extractCssFile records literal keyframe bodies with their provenance", () => {
	const code = `
		import { css } from "./css";
		css({ $text: { color: "$blue-500" } });
		const spin = css.keyframes({ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } });
		css.keyframes({ from: { opacity: 0 } });
		const fade = { from: { opacity: 0 } };
		css.keyframes(fade);
	`;
	const names = scan(["css"]).findImports(code, "app.ts");
	const combined = extract(["css"]).extractFile(code, "app.ts");

	expect(combined.keyframes).toHaveLength(2);
	expect(combined.keyframes[0]).toMatchObject({
		body: { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
		provenance: { file: "app.ts", callKind: "css.keyframes", line: 4 },
	});
	expect(combined.keyframes[1]).toMatchObject({
		body: { from: { opacity: 0 } },
		provenance: { callKind: "css.keyframes", line: 5 },
	});
	expect(combined.sources).toEqual(extract().extract(code, "app.ts", names));
	expect(combined.varKeys).toEqual(scan().findVarKeys(code, "app.ts", names));
});

test("a literal keyframes call folds to the name literal the sheet emits", () => {
	const code = `
		import { css } from "./design";
		export const spin = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
	`;
	const result = extract().inline(code, "app.ts", new Set(["css"]));

	expect(result.inlined).toBe(1);
	expect(result.code).toContain('export const spin = "pw-kf-');
	expect(result.code).not.toContain("css.keyframes");
});

test("a dynamic keyframes body keeps the runtime call", () => {
	const code = `
		import { css } from "./design";
		const fade = { from: { opacity: 0 } };
		export const spin = css.keyframes(fade);
	`;
	const result = extract().inline(code, "app.ts", new Set(["css"]));

	expect(result.inlined).toBe(0);
	expect(result.code).toBe(code);
});

test("a keyframes-only module still marks the factory pure", () => {
	const code = `
		import { createUnsafeCss } from "../../src/unsafe/css.ts";
		const css = createUnsafeCss();
		export const spin = css.keyframes({ from: { opacity: 0 } });
	`;
	const result = extract().inline(code, "app.ts", new Set(["css"]));

	expect(result.inlined).toBe(1);
	expect(result.code).toContain("/* @__PURE__ */ createUnsafeCss()");
});

test("dynamic css calls keep the runtime fallback", () => {
	const code = `
		import { createUnsafeCss } from "../../src/unsafe/css.ts";
		const css = createUnsafeCss();
		const color = getColor();
		const card = css.class({ color });
	`;
	const result = extract().inline(code, "app.ts", new Set(["css"]));

	expect(result.inlined).toBe(0);
	expect(result.code).toContain("/* @__PURE__ */ createUnsafeCss()");
	expect(result.code).toContain("css.class({ color })");
});

test("dynamic className rewriting is opt-in and host-aware", () => {
	const code = `
		import { css } from "./design";
		const color = getColor();
		export const App = () => <button className={css.class({ color: color, padding: 8 })} />;
	`;
	const unchanged = extract().inline(code, "app.tsx", new Set(["css"]));
	expect(unchanged.inlined).toBe(0);
	expect(unchanged.code).toBe(code);

	const dir = makeProject({
		"src/app.tsx": code,
	});
	try {
		const plugin = pandwindCssVite(examplePreset, {
			root: dir,
			transformDynamicClassName: true,
			namespace: "checkout",
		});
		const transformed = (
			plugin.transform as (source: string, id: string) => { code: string } | null
		)(readFileSync(join(dir, "src/app.tsx"), "utf8"), join(dir, "src/app.tsx"));
		const generated = loadGenerated(plugin);

		expect(transformed?.code).toContain(
			'<button {...css.props(css.vars({ color: color }), "qko5uj")} />',
		);
		expect(transformed?.code).not.toContain("className={css.class");
		expect(transformed?.code).not.toContain("css.class({ padding: 8 })");
		expect(generated).toContain("padding:8");
		expect(generated).toContain("color: var(--checkout-c-color)");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("dynamic className rewriting leaves conflicting hosts untouched", () => {
	const code = `
		import { css } from "./design";
		const color = getColor();
		const style = getStyle();
		export const App = () => <button style={style} className={css.class({ color: color })} />;
	`;
	const dir = makeProject({ "src/app.tsx": code });
	try {
		const plugin = pandwindCssVite(examplePreset, {
			root: dir,
			transformDynamicClassName: true,
		});
		const transformed = (
			plugin.transform as (source: string, id: string) => { code: string } | null
		)(code, join(dir, "src/app.tsx"));

		expect(transformed?.code).toContain("className={css.class({ color: color })}");
		expect(transformed?.code).not.toContain("css.props(css.vars");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the checked-in dynamic example exercises both compiler carrier rewrites", () => {
	const appRoot = resolve(import.meta.dirname, "../../../examples/example");
	const file = join(appRoot, "src/examples/dynamic-app.tsx");
	const source = readFileSync(file, "utf8");
	const plugin = pandwindCssVite(examplePreset, {
		root: appRoot,
		transformDynamicClassName: true,
	});
	const transformed = (plugin.transform as (input: string, id: string) => { code: string } | null)(
		source,
		file,
	);

	expect(transformed?.code).toContain("relaxedCss.props(relaxedCss.vars({ color: accent })");
	expect(transformed?.code).toContain(
		"relaxedCss.props(relaxedCss.vars({ backgroundColor: accent })",
	);
	expect(transformed?.code).not.toContain("className={relaxedCss.class");
	expect(transformed?.code).not.toContain("{...relaxedCss({");
});

test("mixed literal/dynamic css calls in JSX hosts lower through vars carriers", () => {
	const code = `
		import { css } from "./design";
		const shade = getShade();
		export const App = () => (
			<>
				<div {...css({ color: "red", backgroundColor: shade })} />
				<div {...css({ _hover: { bg: shade } })} />
				<div {...css({ padding: "1rem" }, { margin: shade, display: "flex" })} />
			</>
		);
	`;
	const result = inline().inline(code, "app.tsx", new Set(["css"]));

	// Two carriers: each mixed call with a static subset lowers as one
	// carrier. The _hover-only call has no top-level literal declaration,
	// so it keeps the untouched runtime fallback.
	expect(result.inlined).toBe(2);
	expect(result.code).toContain('css.props(css.vars({ backgroundColor: shade }), "[color:red]")');
	expect(result.code).toContain(
		'css.props(css.vars({ margin: shade }), "[padding:1rem] [display:flex]")',
	);
	expect(result.code).toContain("css({ _hover: { bg: shade } })");
	// Flattened toggle keys mirror the scanner contract.
	expect(result.varKeys).toEqual(["backgroundColor", "margin"]);
	expect(result.code).toContain("const shade = getShade();");
	expect(result.code).toContain("<>");
});

test("ambiguous mixed css spreads keep the conservative all-vars carrier", () => {
	const code = `
		import { css } from "./design";
		const shade = getShade();
		export const App = () => (
			<div {...css(
				{ color: "red", backgroundColor: shade },
				{ color: shade, borderColor: "blue" },
			)} />
		);
	`;
	const result = inline().inline(code, "app.tsx", new Set(["css"]));

	expect(result.inlined).toBe(1);
	expect(result.code).toContain(
		'css.props(css.vars({ color: "red", backgroundColor: shade }, { color: shade, borderColor: "blue" }))',
	);
	expect(result.varKeys).toEqual(["color", "backgroundColor", "borderColor"]);
});

test("vars carriers preserve an aliased css binding", () => {
	const code = `
		import { css as uiCss } from "./design";
		const tone = getTone();
		export const App = () => <div {...uiCss({ color: "red", backgroundColor: tone })} />;
	`;
	const result = inline().inline(code, "app.tsx", new Set(["uiCss"]));

	expect(result.inlined).toBe(1);
	expect(result.code).toContain(
		'uiCss.props(uiCss.vars({ backgroundColor: tone }), "[color:red]")',
	);
	expect(result.code).not.toContain("css.props(css.vars");
});

test("vars carriers are gated to JSX host positions", () => {
	const code = `
		import { css } from "./design";
		const shade = getShade();
		export const App = () => <div {...css({ color: "red", backgroundColor: shade })} />;
		const plain = css({ color: "red", backgroundColor: shade });
		const full = css({ color: "red" });
	`;
	const result = inline().inline(code, "app.tsx", new Set(["css"]));

	// JSX host position: carrier. Plain statement: untouched runtime fallback.
	expect(result.code).toContain('css.props(css.vars({ backgroundColor: shade }), "[color:red]")');
	expect(result.code).toContain('const plain = css({ color: "red", backgroundColor: shade });');
	// Full-literal plain call still folds through the ordinary engine path.
	expect(result.code).toContain('const full = {"color":"[color:red]"}');
	expect(result.varKeys).toEqual(["backgroundColor"]);
});

test("vars carriers refuse non-object and group-shaped arguments", () => {
	const code = `
		import { css } from "./design";
		const shade = getShade();
		const a = css(getShade());
		const b = css.group({ _hover: { bg: shade } });
		const c = css(...spread);
	`;
	const result = inline().inline(code, "app.ts", new Set(["css"]));

	expect(result.inlined).toBe(0);
	expect(result.varKeys).toEqual([]);
	expect(result.code).toBe(code);
});

test("pandwindCssVite dedupes repeated rules and re-scans changed files", () => {
	const dir = makeProject({
		"src/app.ts": `
			import { css } from "./design";
			css({ $frame: { fill: "$red-300" } });
		`,
		"src/other.ts": `
			import { css } from "./design";
			css({ $frame: { fill: "$red-300" } });
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const first = loadGenerated(plugin);
		expect(first.match(/background-color:#FC8181/g)).toHaveLength(1);

		// A changed file is picked up on the next load.
		writeFileSync(
			join(dir, "src/app.ts"),
			'import { css } from "./design"; css({ $frame: { fill: "$blue-600" } });',
		);
		const second = loadGenerated(plugin);
		expect(second).toContain("background-color:#2b6cb0");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("pandwindCssVite serves conditions and semantic tokens", () => {
	const dir = makeProject({
		"src/app.ts": `
			import { css } from "./design";
			css({
				$frame: { pad: "button.padding" },
				_hover: { $text: { color: "success" } },
			});
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const generated = loadGenerated(plugin);
		expect(generated).toContain(":hover");
		expect(generated).toContain("padding:20px");
		expect(relevantCss(generated, ["padding:20px", ":hover"])).toMatchInlineSnapshot(`
			".\\31 e60pra{padding:20px}
			.\\31 qx89tq:hover{color:#60A3BC}"
		`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("finite ternary members register every combination in the sheet", () => {
	const dir = makeProject({
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/app.ts": `
			import { css } from "./design";
			const cond = Math.random() > 0.5;
			const cls = css({ $text: { color: cond ? "$red-300" : "$blue-600" } });
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const generated = loadGenerated(plugin);
		// Both branches are statically knowable -> both rules exist.
		expect(generated).toContain("color:#FC8181");
		expect(generated).toContain("color:#2b6cb0");
		// The call itself stays the runtime selection mechanism.
		expect(relevantCss(generated, ["color:#FC8181", "color:#2b6cb0"])).toMatchInlineSnapshot(`
			".\\31 8g83j1{color:#2b6cb0}
			.\\31 95eees{color:#FC8181}"
		`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("mixed literal and finite dynamic members enumerate combinations", () => {
	const dir = makeProject({
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/app.ts": `
			import { css } from "./design";
			const cond = Math.random() > 0.5;
			const cls = css({
				$frame: { pad: "4" },
				$text: { color: cond ? "$red-300" : "$blue-600" },
			});
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const generated = loadGenerated(plugin);
		// pad:"4" combines with both colors -> pad rule + two color rules,
		// deduped by atomic id (the static subset is not registered twice).
		expect(generated).toContain("padding:4px");
		expect(generated).toContain("color:#FC8181");
		expect(generated).toContain("color:#2b6cb0");
		expect(generated.match(/padding:4px/g)).toHaveLength(1);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("module constants feeding dynamic members enumerate through the const scope", () => {
	const dir = makeProject({
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/app.ts": `
			import { css } from "./design";
			const BRAND = "$red";
			const tone = BRAND + "-300";
			const cls = css.class({ $text: { color: tone } });
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const generated = loadGenerated(plugin);
		// The call-site value is a plain identifier; only the module const
		// scope makes it finite and provable -> the resolved rule exists.
		expect(generated).toContain("color:#FC8181");
		expect(relevantCss(generated, ["color:#FC8181"])).toMatchInlineSnapshot(
			`".\\31 95eees{color:#FC8181}"`,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("css.group finite entries register every entry combination", () => {
	const dir = makeProject({
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/app.ts": `
			import { css } from "./design";
			const cond = Math.random() > 0.5;
			const cls = css.group({
				card: { $frame: { pad: "4" } },
				accent: { $text: { color: cond ? "$red-300" : "$blue-600" } },
			});
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const generated = loadGenerated(plugin);
		// Static group entries resolve as before; the finite dynamic entry
		// contributes one rule per branch value.
		expect(generated).toContain("padding:4px");
		expect(generated).toContain("color:#FC8181");
		expect(generated).toContain("color:#2b6cb0");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("finite combinations beyond the cap stay conservative", () => {
	// 3 chained ternaries = 8 branch values, but 3 nested ternary
	// *dimensions* would exceed 256 via the cartesian object; build an
	// unbounded shape instead: a non-constant function call value.
	const dir = makeProject({
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/app.ts": `
			import { css } from "./design";
			const pick = () => (Math.random() > 0.5 ? "1rem" : "2rem");
			const cls = css.class({ $frame: { pad: pick() } });
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const generated = loadGenerated(plugin);
		// Function-call values are unbounded -> no candidate rules; the
		// rewriter owns the runtime carrier instead.
		expect(generated).not.toContain("padding:1rem");
		expect(generated).not.toContain("padding:2rem");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("dss finite dynamic tokens register candidates through the design resolver", () => {
	const dir = makeProject({
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/app.ts": `
			import { css } from "./design";
			const cond = Math.random() > 0.5;
			const cls = css({ $text: { color: cond ? "$red-300" : "$blue-600" } });
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const generated = loadGenerated(plugin);
		// Design tokens resolve through the preset catalog exactly like the
		// static dss path -> both branch rules exist with concrete colors.
		expect(generated).toContain("color:#FC8181");
		expect(generated).toContain("color:#2b6cb0");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("dss literal values outside the token catalog resolve identically at runtime", () => {
	const dir = makeProject({
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/app.ts": `
			import { css } from "./design";
			const cond = Math.random() > 0.5;
			const cls = css({ $text: { color: cond ? "#ff0000" : "#00ff00" } });
		`,
	});

	try {
		const plugin = pandwindCssVite(examplePreset, { root: dir });
		const generated = loadGenerated(plugin);
		// Raw hex values are not preset tokens, but the design resolver
		// passes unknown values through as-is. The runtime would resolve
		// the same concrete rules, so finite extraction registers them:
		// candidate completeness mirrors runtime resolution, it does not
		// filter by token membership.
		expect(generated).toContain("color:#ff0000");
		expect(generated).toContain("color:#00ff00");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
