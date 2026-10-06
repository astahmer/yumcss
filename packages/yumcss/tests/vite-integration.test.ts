/**
 * Real-vite integration tests for the yumcss plugins — dev transform,
 * HMR invalidation, build output, plus post-plugin snapshot fixtures.
 *
 * Unlike the unit tests (which call extract/inline helpers directly), these
 * spin up an actual vite dev server and build, so plugin hook ordering,
 * module resolution and the virtual stylesheet module are exercised the way
 * a real app runs them.
 */
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { build, createServer, type ViteDevServer } from "vite";
import { examplePreset } from "@yumcss/example-preset";
import { RollupOutputKind } from "./helpers/rollup-output-kind.ts";
import { escapeIdentifier } from "../src/css/hash.ts";
import { createCss } from "../src/css/create-css.ts";
import { createDesignCss } from "../src/design/index.ts";
import { defaultPreset } from "../src/preset/default.ts";
import { yumcssExtractVite } from "../src/vite/css.ts";
import { createYumCSSEngineContext } from "../src/vite/engine-context.ts";
import { yumcssVite } from "../src/vite/index.ts";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");

const TW_SOURCE = `
import { createTw } from "yumcss/tw";

export const tw = /* @__PURE__ */ createTw({
	variants: {
		sm: {},
		hover: {},
		md: {},
	},
	conflicts: {
		p: { "*": ["padding-top", "padding-right", "padding-bottom", "padding-left"] },
		px: { "*": ["padding-left", "padding-right"] },
		bg: { "*": ["background-color"] },
		text: {
			"*": ["font-size", "line-height"],
			"gray-900": ["color"],
			center: ["text-align"],
		},
	},
});
`;

const DESIGN_SOURCE = `
import { createDesignCss } from "yumcss/design";
import { examplePreset } from "@yumcss/example-preset";

export const dss = createDesignCss(examplePreset);
`;

const CX_SOURCE = `
import { createCx } from "yumcss/cx";

export const cx = /* @__PURE__ */ createCx({
	conflicts: {
		p: { "*": ["padding-top", "padding-right", "padding-bottom", "padding-left"] },
		px: { "*": ["padding-left", "padding-right"] },
		bg: { "*": ["background-color"] },
	},
});
`;

const APP_SOURCE = `
import { tw } from "./tw";
import { dss } from "./design";
import { cx } from "./cx";
import "yumcss:css";

export const mainClasses = tw({
	bg: "red-500",
	p: "4",
	hover: { bg: "blue-600" },
	sm: { p: "6" },
});
export const headingClasses = tw({ text: "gray-900" });
export const buttonClasses = dss.class({
	$frame: { fill: "$blue-500", corners: "md" },
	$layout: { flow: "stackX", gap: "2px" },
	$text: { color: "$white", size: "sm" },
});
// Mixed tw-string + css-atom merge call: folds entirely at build time
// (plan 007 item A) — the atom's rule lands in the generated stylesheet.
export const mixedClasses = cx("px-2", dss.class({ color: "#0BC5EA" }));
// Consumed at the edge (like a render function would), so the bundler keeps
// the inlined class strings in the entry chunk.
console.log(mainClasses, headingClasses, buttonClasses, mixedClasses);
`;

interface Project {
	dir: string;
	inlinePlugin: ReturnType<typeof yumcssVite>;
	cssPlugin: ReturnType<typeof yumcssExtractVite>;
}

const makeProject = (): Project => {
	const dir = mkdtempSync(join(tmpdir(), "yumcss-vite-"));
	const files: Record<string, string> = {
		"src/tw.ts": TW_SOURCE,
		"src/design.ts": DESIGN_SOURCE,
		"src/cx.ts": CX_SOURCE,
		"src/app.ts": APP_SOURCE,
	};
	for (const [name, content] of Object.entries(files)) {
		const path = join(dir, name);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
	// Let the fixture resolve "yumcss/*" exports to this workspace package.
	mkdirSync(join(dir, "node_modules"), { recursive: true });
	symlinkSync(PACKAGE_ROOT, join(dir, "node_modules/yumcss"), "dir");
	return {
		dir,
		inlinePlugin: yumcssVite({ css: { preset: examplePreset } }),
		cssPlugin: yumcssExtractVite(createDesignCss(examplePreset), { root: dir }),
	};
};

let project: Project;
let server: ViteDevServer;
let virtualId: string;

beforeAll(async () => {
	project = makeProject();
	server = await createServer({
		root: project.dir,
		plugins: [project.inlinePlugin, project.cssPlugin],
		server: { middlewareMode: true },
		appType: "custom",
		logLevel: "silent",
		optimizeDeps: { noDiscovery: true },
	});
	virtualId = (await server.pluginContainer.resolveId("yumcss:css", undefined))!.id;
});

afterAll(async () => {
	await server?.close();
	rmSync(project?.dir, { recursive: true, force: true });
});

describe("dev server", () => {
	test("tw() calls are statically inlined before tailwind scanning", async () => {
		const result = await server.transformRequest("/src/app.ts");
		expect(result?.code).toBeDefined();
		expect(result!.code).toContain("bg-red-500 p-4 hover:bg-blue-600 sm:p-6");
		expect(result!.code).toContain("text-gray-900");
		expect(result!.code).not.toContain("tw({");
	});

	test("mixed tw + css.class cx() call folds completely (plan 007 item A)", async () => {
		const result = await server.transformRequest("/src/app.ts");
		expect(result?.code).toBeDefined();
		// The cx() call is gone entirely — no runtime merge for this file.
		expect(result!.code).not.toContain("cx(");
		// The folded string contains the tw part plus the css atom class.
		expect(result!.code).toMatch(/"px-2 [A-Za-z0-9_-]+"/);
	});

	test("static css() calls are erased before bundling", async () => {
		const result = await server.transformRequest("/src/app.ts");
		expect(result?.code).toBeDefined();
		// The stylesheet plugin owns the generated rules; no static css factory
		// call needs to remain in the browser module.
		expect(result!.code).not.toContain("css.class(");
		expect(result!.code).not.toContain("createDesignCss(");
	});

	test("virtual stylesheet serves deduped tokens + atomic rules", async () => {
		const result = await server.transformRequest(virtualId);
		expect(result?.code).toBeDefined();
		const css = result!.code;
		// Design-layer calls are resolved to concrete declarations before the
		// sheet sees them, so `tokens: "used"` emits no unused preset roots.
		expect(css).not.toContain(":root");
		expect(css).toContain("background-color:#3182ce");
		expect(css).toContain("border-radius:");
		expect(css).toContain("display:flex");
		expect(css).toContain("gap:2px");
		// one rule per declaration — the repeated rules collapsed
		expect(css.match(/background-color:#3182ce/g)).toHaveLength(1);
	});

	test("the stylesheet contains a rule for the css atom folded inside cx()", async () => {
		const app = await server.transformRequest("/src/app.ts");
		// Extract the folded atom from `"px-2 <atom>"`.
		const match = /"px-2 ([A-Za-z0-9_-]+)"/.exec(app!.code!);
		expect(match).not.toBeNull();
		const atom = match![1]!;

		const sheet = (await server.transformRequest(virtualId))!.code!;
		// color:$cyan-500 resolves to #0BC5EA and only the folded literal
		// uses it, so exactly one rule must exist and carry the atom class.
		expect(sheet.match(/color:#0BC5EA/g)).toHaveLength(1);
		const rule = sheet.split("}").find((block) => block.includes("color:#0BC5EA"))!;
		// Selectors escape leading digits (`1pucx05` -> `.\\31 pucx05`).
		expect(rule).toContain(escapeIdentifier(atom));
	});
});

describe("HMR", () => {
	test("changed files invalidate the scan and the next load includes them", async () => {
		const before = project.cssPlugin.load("\0yumcss:css.css") as string;
		expect(before).not.toContain("background-color:#60A3BC");

		const extra = join(project.dir, "src/extra.ts");
		try {
			writeFileSync(
				extra,
				'import { css } from "./design";\ncss({ $frame: { fill: "$green-500" } });\n',
			);

			// The same hook vite calls on file change.
			project.cssPlugin.handleHotUpdate({ file: extra });

			const after = project.cssPlugin.load("\0yumcss:css.css") as string;
			expect(after).toContain("background-color:#60A3BC");

			// And the served virtual module reflects it after invalidation.
			server.moduleGraph.invalidateAll();
			const served = await server.transformRequest(virtualId);
			expect(served!.code).toContain("background-color:#60A3BC");
		} finally {
			rmSync(extra, { force: true });
			project.cssPlugin.handleHotUpdate({ file: extra });
		}
	});

	test("a file ADDED to the scanned tree appears on the next load", async () => {
		const added = join(project.dir, "src/added-late.ts");
		writeFileSync(
			added,
			'import { css } from "./design";\ncss({ $frame: { fill: "$red-500" } });\n',
		);
		try {
			project.cssPlugin.invalidate(added);
			project.cssPlugin.handleHotUpdate({ file: added });
			const after = project.cssPlugin.load("\0yumcss:css.css") as string;
			expect(after.toLowerCase()).toContain("background-color:#e53e3e"); // red-500
		} finally {
			rmSync(added, { force: true });
			project.cssPlugin.invalidate(added);
			project.cssPlugin.handleHotUpdate({ file: added });
		}
	});

	test("a DELETED file's atoms leave the sheet on the next load", async () => {
		const doomed = join(project.dir, "src/doomed.ts");
		writeFileSync(
			doomed,
			'import { css } from "./design";\ncss({ $frame: { fill: "$amber-500" } });\n',
		);
		project.cssPlugin.handleHotUpdate({ file: doomed });
		expect(project.cssPlugin.load("\0yumcss:css.css")).toContain("amber");

		rmSync(doomed, { force: true });
		// Deleted files are dropped because the walker no longer sees them;
		// the change hook triggers the rescan.
		project.cssPlugin.handleHotUpdate({ file: join(project.dir, "src/app.ts") });
		const after = project.cssPlugin.load("\0yumcss:css.css") as string;
		expect(after.toLowerCase()).not.toContain("amber-500");
	});

	test("invalidate() picks up new content even when mtime is unchanged", async () => {
		const frozen = join(project.dir, "src/frozen.ts");
		writeFileSync(
			frozen,
			'import { css } from "./design";\ncss({ $frame: { fill: "$red-500" } });\n',
		);
		project.cssPlugin.invalidate(frozen);
		project.cssPlugin.handleHotUpdate({ file: frozen });
		const withRed = project.cssPlugin.load("\0yumcss:css.css") as string;
		expect(withRed.toLowerCase()).toContain("background-color:#e53e3e"); // red-500

		// Rewrite content, then pin the old mtime back so a naive
		// mtime-only cache would serve the stale entry.
		const staleMtime = statSync(frozen).mtimeMs - 5_000;
		writeFileSync(
			frozen,
			'import { css } from "./design";\ncss({ $frame: { fill: "$green-500" } });\n',
		);
		utimesSync(frozen, staleMtime / 1000, staleMtime / 1000);

		project.cssPlugin.invalidate(frozen);
		const after = project.cssPlugin.load("\0yumcss:css.css") as string;
		expect(after.toLowerCase()).toContain("background-color:#60a3bc"); // green-500
		expect(after.toLowerCase()).not.toContain("background-color:#e53e3e");

		rmSync(frozen, { force: true });
		project.cssPlugin.handleHotUpdate({ file: frozen });
	});

	test("transitive composed theme changes refresh the extractor without restarting Vite", async () => {
		const dir = mkdtempSync(join(tmpdir(), "yumcss-vite-preset-hmr-"));
		const files: Record<string, string> = {
			"src/theme-tokens.ts": `
export const green500 = "#60A3BC";
`,
			"src/theme.ts": `
import { green500 } from "./theme-tokens";

export const colors = { "$green-500": green500 };
`,
			"src/design.ts": `
import { createCss } from "yumcss/css";
import { defaultPreset } from "yumcss/preset/default";
import { colors } from "./theme";

const preset = {
	...defaultPreset,
	properties: { backgroundColor: { $tokens: "colors" } },
	tokens: { colors },
};

export const css = createCss(preset);
`,
			"src/app.ts": `
import { css } from "./design";
import "yumcss:css";

export const className = css.class({ backgroundColor: "$green-500" });
`,
		};
		for (const [name, content] of Object.entries(files)) {
			const file = join(dir, name);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, content);
		}
		mkdirSync(join(dir, "node_modules"), { recursive: true });
		symlinkSync(PACKAGE_ROOT, join(dir, "node_modules/yumcss"), "dir");

		const initialPreset = {
			...defaultPreset,
			properties: { backgroundColor: { $tokens: "colors" } },
			tokens: { colors: { "$green-500": "#60A3BC" } },
		};
		const engine = createYumCSSEngineContext({ preset: initialPreset });
		const cssPlugin = yumcssExtractVite(createCss(initialPreset), { root: dir, engine });
		const hmrServer = await createServer({
			root: dir,
			plugins: [cssPlugin],
			server: { middlewareMode: true },
			appType: "custom",
			logLevel: "silent",
			optimizeDeps: { noDiscovery: true },
		});
		const virtualId = (await hmrServer.pluginContainer.resolveId("yumcss:css", undefined))!.id;

		try {
			await hmrServer.ssrLoadModule("/src/design.ts");
			const app = await hmrServer.transformRequest("/src/app.ts");
			expect(app?.code).toBeDefined();
			const before = await hmrServer.transformRequest(virtualId);
			expect(before?.code).toContain("#60A3BC");

			const tokenFile = join(dir, "src/theme-tokens.ts");
			writeFileSync(tokenFile, files["src/theme-tokens.ts"]!.replace("#60A3BC", "#FF00AA"));
			const updatedModules = await cssPlugin.handleHotUpdate({
				file: tokenFile,
				modules: [],
				server: hmrServer,
			});
			expect(updatedModules).toBeDefined();
			expect(updatedModules?.some((module) => module.id?.endsWith("/src/app.ts"))).toBe(true);
			const virtualModule = hmrServer.moduleGraph.getModuleById(virtualId);
			expect(updatedModules).toContain(virtualModule);
			if (virtualModule !== undefined) {
				hmrServer.moduleGraph.invalidateModule(virtualModule, new Set(), Date.now(), true);
			}

			const after = await hmrServer.transformRequest(virtualId);
			expect(after?.code).toContain("#FF00AA");
			expect(after?.code).not.toContain("#60A3BC");
			expect(engine.preset).not.toBe(initialPreset);
		} finally {
			await hmrServer.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("build", () => {
	test("production CSS extraction respects the configured source exclusions", async () => {
		const dir = mkdtempSync(join(tmpdir(), "yumcss-vite-source-filter-"));
		try {
			mkdirSync(join(dir, "src"), { recursive: true });
			mkdirSync(join(dir, "node_modules"), { recursive: true });
			symlinkSync(PACKAGE_ROOT, join(dir, "node_modules/yumcss"), "dir");
			mkdirSync(join(dir, "node_modules/@yumcss"), { recursive: true });
			symlinkSync(
				resolve(PACKAGE_ROOT, "../../examples/yumcss-example-preset"),
				join(dir, "node_modules/@yumcss/example-preset"),
				"dir",
			);
			writeFileSync(join(dir, "src/design.ts"), DESIGN_SOURCE);
			writeFileSync(
				join(dir, "src/app.ts"),
				`import { dss } from "./design";
import { excluded } from "./excluded";
import "yumcss:css";
export const included = dss.class({ color: "#ff0000" });
console.log(included, excluded);`,
			);
			writeFileSync(
				join(dir, "src/excluded.ts"),
				`import { dss } from "./design";
export const excluded = dss.class({ color: "#0000ff" });`,
			);

			const result = await build({
				root: dir,
				plugins: [
					yumcssExtractVite(createDesignCss(examplePreset), {
						root: dir,
						exclude: [/excluded\.ts$/],
					}),
				],
				logLevel: "silent",
				build: {
					write: false,
					minify: false,
					rollupOptions: { input: join(dir, "src/app.ts") },
				},
			});
			const output = (
				Array.isArray(result) ? result : "output" in result ? result.output : []
			) as Array<{
				type: (typeof RollupOutputKind)[keyof typeof RollupOutputKind];
				fileName: string;
				source?: string | Uint8Array;
			}>;
			const css = output
				.filter((chunk) => chunk.type === RollupOutputKind.Asset && chunk.fileName.endsWith(".css"))
				.map((chunk) => chunk.source?.toString() ?? "")
				.join("\n");

			expect(css).toContain("color:#ff0000");
			expect(css).not.toContain("color:#0000ff");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("runtime pruning survives a real Vite production bundle", async () => {
		const dir = mkdtempSync(join(tmpdir(), "yumcss-runtime-vite-"));
		try {
			mkdirSync(join(dir, "node_modules", "@yumcss"), { recursive: true });
			symlinkSync(PACKAGE_ROOT, join(dir, "node_modules", "yumcss"), "dir");
			symlinkSync(
				resolve(PACKAGE_ROOT, "../../examples/yumcss-example-preset"),
				join(dir, "node_modules", "@yumcss", "example-preset"),
				"dir",
			);
			writeFileSync(
				join(dir, "app.ts"),
				`
import { createCss } from "yumcss/css";
import { examplePreset } from "@yumcss/example-preset";

const css = createCss(examplePreset);
export const className = css.class({ color: "$red-500" });
console.log(className);
`,
			);
			const result = await build({
				root: dir,
				plugins: [yumcssVite({ css: { preset: examplePreset } })],
				logLevel: "silent",
				build: {
					write: false,
					minify: false,
					rollupOptions: { input: join(dir, "app.ts") },
				},
			});
			const output = (
				Array.isArray(result) ? result : "output" in result ? result.output : []
			) as Array<{ type: (typeof RollupOutputKind)[keyof typeof RollupOutputKind]; code?: string }>;
			const code = output
				.filter((chunk) => chunk.type === RollupOutputKind.Chunk)
				.map((chunk) => chunk.code!)
				.join("\n");

			expect(code).toContain("createPresetCssRuntime");
			expect(code).toContain("$red-500");
			expect(code).not.toContain("$blue-600");
			expect(code).not.toContain("createDesignCssRuntime");
			expect(code).not.toContain("attachKeyframes");
			expect(code).not.toContain("createCss(examplePreset)");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("inlined classes land in the JS bundle and the stylesheet in the CSS asset", async () => {
		const result = await build({
			root: project.dir,
			plugins: [project.inlinePlugin, project.cssPlugin],
			logLevel: "silent",
			build: {
				write: false,
				minify: false,
				rollupOptions: { input: join(project.dir, "src/app.ts") },
			},
		});
		const output = (
			Array.isArray(result) ? result : "output" in result ? result.output : []
		) as Array<{
			type: (typeof RollupOutputKind)[keyof typeof RollupOutputKind];
			fileName: string;
			code?: string;
			source?: string | Uint8Array;
		}>;

		const js = output.filter((chunk) => chunk.type === RollupOutputKind.Chunk);
		expect(js.length).toBeGreaterThan(0);
		const code = js.map((chunk) => chunk.code!).join("\n");
		expect(code).toContain("bg-red-500 p-4 hover:bg-blue-600 sm:p-6");
		expect(code).not.toContain("tw({");
		// The mixed cx() call folded too — no runtime merge call survives.
		expect(code).not.toContain("cx(");
		// The design module is imported only to feed static calls. Its factory
		// must disappear with the now-unused binding.
		expect(code).not.toContain("createDesignCss");

		const css = output.find(
			(chunk) => chunk.type === RollupOutputKind.Asset && chunk.fileName.endsWith(".css"),
		);
		expect(css).toBeDefined();
		expect(css!.source!.toString()).toContain("background-color:#3182ce");
		// The fixture has no unresolved token references left for the stylesheet
		// collector, so used-token emission does not include a root block.
		expect(css!.source!.toString()).not.toContain(":root");
	});

	test("root-barrel imports tree-shake: one API in, one API's code out", async () => {
		// A real vite production build of an app that imports only css() from
		// the ROOT `yumcss` barrel must not ship the tw()/cx()/preset code,
		// and a css-only import must stay far smaller than importing all three.
		// Keep a little room for shared CSS-runtime options (such as a custom
		// carrier namespace) that correctly belong in both bundles.
		const buildApp = async (source: string): Promise<string> => {
			const dir = mkdtempSync(join(tmpdir(), "yumcss-shake-"));
			try {
				mkdirSync(join(dir, "node_modules"), { recursive: true });
				symlinkSync(PACKAGE_ROOT, join(dir, "node_modules/yumcss"), "dir");
				writeFileSync(join(dir, "app.ts"), source);
				const result = await build({
					root: dir,
					logLevel: "silent",
					build: {
						write: false,
						minify: true,
						rollupOptions: { input: join(dir, "app.ts") },
					},
				});
				const output = (
					Array.isArray(result) ? result : "output" in result ? result.output : []
				) as Array<{
					type: (typeof RollupOutputKind)[keyof typeof RollupOutputKind];
					code?: string;
				}>;
				return output
					.filter((chunk) => chunk.type === RollupOutputKind.Chunk)
					.map((chunk) => chunk.code!)
					.join("\n");
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		};

		// Root lane is tw+cx only (see src/index.ts); css comes via its subpath.
		const cssOnly = await buildApp(`
			import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const a = css.class({ color: "red", bg: "blue" });
			console.log(a);
		`);
		const allThree = await buildApp(`
			import { createUnsafeCss } from "yumcss/unsafe/css";
			import { createCx } from "yumcss/cx";
			import { createTw } from "yumcss/tw";
			const css = createUnsafeCss();
			const cx = createCx({ css });
			const tw = createTw({});
			console.log(cx(tw({ bg: "red-500" }), css.class({ color: "red" })));
		`);

		expect(cssOnly).not.toContain("createTw");
		expect(cssOnly).not.toContain("createCx");
		// The CSS runtime includes the small firstThatWorks fallback decoder, so
		// keep the single-engine assertion slightly wider while preserving the
		// proof that the other engines are shaken out.
		expect(cssOnly.length).toBeLessThan(allThree.length * 0.58);
	});
});

describe("post-plugin snapshots", () => {
	test("inline transform output", async () => {
		const result = await project.inlinePlugin.transform.call(
			{ resolve: async () => ({ id: join(project.dir, "src/tw.ts") }) },
			APP_SOURCE,
			"/src/app.ts",
		);
		expect(result).not.toBeNull();
		await expect(result!.code).toMatchFileSnapshot(
			join(import.meta.dirname, "snapshots", "vite-inline-transform.ts.snap"),
		);
	});

	test("generated stylesheet", async () => {
		const snapshotProject = makeProject();
		try {
			const css = snapshotProject.cssPlugin.load("\0yumcss:css.css") as string;
			await expect(css).toMatchFileSnapshot(
				join(import.meta.dirname, "snapshots", "vite-generated-stylesheet.css.snap"),
			);
		} finally {
			rmSync(snapshotProject.dir, { recursive: true, force: true });
		}
	});
});
