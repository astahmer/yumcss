import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { createTwAdapter } from "../src/tw/adapter.ts";
import { examplePreset } from "../src/preset/example-preset.ts";
import { pandwindCssVite } from "../src/vite/css.ts";
import {
	diagnoseCssSources,
	extractCssSources,
	extractCssStyles,
	findAuthoredCssImports,
	findCssCallSites,
	findCssImports,
	inlineCssCalls,
	isCssSource,
} from "../src/vite/css-extract.ts";

test("findAuthoredCssImports reports explicit web stylesheet imports", () => {
	const code = `
		import "./globals.css";
		import styles from "@acme/theme/styles.css?inline";
		import { css } from "./design";
	`;
	const imports = findAuthoredCssImports(code, "src/main.tsx");

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
	const sites = findCssCallSites(code, "src/card.tsx", new Set(["css"]));

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
});

test("diagnoseCssSources reports unsupported constructs and missed extraction", () => {
	const code = `
		import { css } from "./design";
		const color = "$blue-500";
		css.keyframes({ from: { opacity: 0 } });
		css.class({ $text: { color } });
	`;
	const diagnostics = diagnoseCssSources(code, "src/card.tsx", new Set(["css"]));

	expect(diagnostics).toHaveLength(2);
	expect(diagnostics[0]).toMatchObject({
		kind: "unsupported-construct",
		line: 4,
		message: expect.stringContaining("keyframes"),
		suggestion: expect.stringContaining("css.class"),
	});
	expect(diagnostics[1]).toMatchObject({
		kind: "missing-extraction",
		line: 5,
		message: expect.stringContaining("dynamic"),
		suggestion: expect.stringContaining("css.vars"),
	});
});

test("extractCssSources records stable call provenance without changing styles", () => {
	const code = `\n\nimport { css as design } from "./design";\nconst a = design.class({ $text: { color: "$blue-500" } });`;
	const sources = extractCssSources(code, "/src/card.tsx", new Set(["design"]), examplePreset);

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
});

test("isCssSource matches css/design basenames", () => {
	const matchers = ["css", "design"];
	expect(isCssSource("./design", matchers)).toBe(true);
	expect(isCssSource("../css.ts", matchers)).toBe(true);
	expect(isCssSource("pandwind/design", matchers)).toBe(true);
	expect(isCssSource("./styles", matchers)).toBe(false);
});

test("findCssImports collects named, default and aliased css bindings", () => {
	const code = `
		import { css } from "./design";
		import styles from "./css";
		import { css as wind } from "pandwind/design";
		import { tw } from "./tw";
	`;
	expect(findCssImports(code, "app.tsx", ["css", "design"])).toEqual(
		new Set(["css", "styles", "wind"]),
	);
});

test("extractCssStyles resolves design modules in literal calls", () => {
	const code = `
		import { css } from "./design";
		const a = css({ $frame: { w: "20", fill: "$blue-500" } });
		const b = css.class({ $layout: { flow: "stackY", gap: "16" } });
		const c = css.raw({ $text: { color: "$red-300" } });
	`;
	expect(extractCssStyles(code, "app.ts", new Set(["css"]), examplePreset)).toEqual([
		{ width: "20px", backgroundColor: "#3182ce" },
		{ display: "flex", flexDirection: "column", gap: "16px" },
		{ color: "#FC8181" },
	]);
});

test("extractCssStyles skips dynamic calls and processes each argument", () => {
	const code = `
		import { css } from "./design";
		const color = "$blue-500";
		const a = css({ $frame: { fill: color } });
		const b = css({ $frame: { w: "20" } }, { $frame: { h: "20" } });
	`;
	expect(extractCssStyles(code, "app.ts", new Set(["css"]), examplePreset)).toEqual([
		{ width: "20px" },
		{ height: "20px" },
	]);
});

test("extractCssStyles ignores raw css() from non-matching sources", () => {
	const code = `
		import { other } from "./not-css";
		const a = other({ $frame: { w: "20" } });
	`;
	expect(extractCssStyles(code, "app.ts", new Set(["css"]), examplePreset)).toEqual([]);
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
	`;
	const result = inlineCssCalls(code, "app.ts", new Set(["css"]), examplePreset, twMode());
	expect(result.inlined).toBe(2);
	expect(result.code).toContain('const a = "text-blue-500";');
	expect(result.code).toContain('const b = {"backgroundColor":"bg-red-500"};');
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
	const result = inlineCssCalls(code, "app.ts", new Set(["css"]), examplePreset, twMode());
	expect(result.inlined).toBe(1);
	expect(result.code).toContain("const a = css.class({ $text: { color } });");
	expect(result.code).toContain('const b = css.raw({ $text: { color: "$blue-500" } });');
	expect(result.code).toContain("const c = css.props({});");
	// Multi-arg class calls are still inlined (merged).
	expect(result.code).toContain('const d = "text-blue-500 bg-red-500";');
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

const makeProject = (files: Record<string, string>): string => {
	const dir = mkdtempSync(join(tmpdir(), "pandwind-css-"));
	for (const [name, content] of Object.entries(files)) {
		const path = join(dir, name);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
	return dir;
};

const loadGenerated = (plugin: ReturnType<typeof pandwindCssVite>): string =>
	plugin.load("\0pandwind:css.css") as string;

test("pandwindCssVite generates the stylesheet from scanned files", () => {
	const dir = makeProject({
		"src/design.ts": "export const css = (x: unknown) => x; // module that imports stay valid",
		"src/app.tsx": `
			import { css } from "./design";
			export const styles = css({ $frame: { w: "20", fill: "$blue-500" } });
		`,
		"src/other.ts": `
			import { css } from "./design";
			css.class({ $layout: { flow: "stackY", gap: "16" } });
		`,
		"src/aliased-design.ts": `
			import { dcss as design } from "./design";
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
		expect(generated).toContain(":root");
		expect(generated).toContain("width:20px");
		expect(generated).toContain("background-color:#3182ce");
		expect(generated).toContain("flex-direction:column");
		expect(generated).toContain("border-radius:0.5rem");
		// node_modules is never scanned
		expect(generated).not.toContain("background-color:#60A3BC");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
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
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
