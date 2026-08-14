import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { examplePreset } from "../src/preset/example-preset.ts";
import { pandwindCssVite } from "../src/vite/css.ts";
import { extractCssStyles, findCssImports, isCssSource } from "../src/vite/css-extract.ts";

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
