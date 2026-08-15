/**
 * Real-vite integration tests for the pandwind plugins — dev transform,
 * HMR invalidation, build output, plus post-plugin snapshot fixtures.
 *
 * Unlike the unit tests (which call extract/inline helpers directly), these
 * spin up an actual vite dev server and build, so plugin hook ordering,
 * module resolution and the virtual stylesheet module are exercised the way
 * a real app runs them.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { build, createServer, type ViteDevServer } from "vite";
import { examplePreset } from "../src/preset/example-preset.ts";
import { pandwindCssVite } from "../src/vite/css.ts";
import { pandwindVite } from "../src/vite/index.ts";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");

const TW_SOURCE = `
import { createTw } from "pandwind/tw";

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
import { createDesignCss } from "pandwind/design";
import { examplePreset } from "pandwind/preset";

export const css = createDesignCss(examplePreset);
`;

const APP_SOURCE = `
import { tw } from "./tw";
import { css } from "./design";
import "pandwind:css";

export const mainClasses = tw({
	bg: "red-500",
	p: "4",
	hover: { bg: "blue-600" },
	sm: { p: "6" },
});
export const headingClasses = tw({ text: "gray-900" });
export const buttonClasses = css.class({
	$frame: { fill: "$blue-500", corners: "md" },
	$layout: { flow: "stackX", gap: "2" },
	$text: { color: "$white", size: "sm" },
});
// Consumed at the edge (like a render function would), so the bundler keeps
// the inlined class strings in the entry chunk.
console.log(mainClasses, headingClasses, buttonClasses);
`;

interface Project {
	dir: string;
	inlinePlugin: ReturnType<typeof pandwindVite>;
	cssPlugin: ReturnType<typeof pandwindCssVite>;
}

const makeProject = (): Project => {
	const dir = mkdtempSync(join(tmpdir(), "pandwind-vite-"));
	const files: Record<string, string> = {
		"src/tw.ts": TW_SOURCE,
		"src/design.ts": DESIGN_SOURCE,
		"src/app.ts": APP_SOURCE,
	};
	for (const [name, content] of Object.entries(files)) {
		const path = join(dir, name);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
	// Let the fixture resolve "pandwind/*" exports to this workspace package.
	mkdirSync(join(dir, "node_modules"), { recursive: true });
	symlinkSync(PACKAGE_ROOT, join(dir, "node_modules/pandwind"), "dir");
	return {
		dir,
		inlinePlugin: pandwindVite(),
		cssPlugin: pandwindCssVite(examplePreset, { root: dir }),
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
	virtualId = (await server.pluginContainer.resolveId("pandwind:css", undefined))!.id;
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

	test("virtual stylesheet serves deduped tokens + atomic rules", async () => {
		const result = await server.transformRequest(virtualId);
		expect(result?.code).toBeDefined();
		const css = result!.code;
		expect(css).toContain(":root");
		expect(css).toContain("background-color:#3182ce");
		expect(css).toContain("border-radius:");
		expect(css).toContain("display:flex");
		expect(css).toContain("gap:2px");
		// one rule per declaration — the repeated rules collapsed
		expect(css.match(/background-color:#3182ce/g)).toHaveLength(1);
	});
});

describe("HMR", () => {
	test("changed files invalidate the scan and the next load includes them", async () => {
		const before = project.cssPlugin.load("\0pandwind:css.css") as string;
		expect(before).not.toContain("background-color:#60A3BC");

		const extra = join(project.dir, "src/extra.ts");
		writeFileSync(
			extra,
			'import { css } from "./design";\ncss({ $frame: { fill: "$green-500" } });\n',
		);

		// The same hook vite calls on file change.
		project.cssPlugin.handleHotUpdate({ file: extra });

		const after = project.cssPlugin.load("\0pandwind:css.css") as string;
		expect(after).toContain("background-color:#60A3BC");

		// And the served virtual module reflects it after invalidation.
		server.moduleGraph.invalidateAll();
		const served = await server.transformRequest(virtualId);
		expect(served!.code).toContain("background-color:#60A3BC");
	});
});

describe("build", () => {
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
			type: "chunk" | "asset";
			fileName: string;
			code?: string;
			source?: string | Uint8Array;
		}>;

		const js = output.filter((chunk) => chunk.type === "chunk");
		expect(js.length).toBeGreaterThan(0);
		const code = js.map((chunk) => chunk.code!).join("\n");
		expect(code).toContain("bg-red-500 p-4 hover:bg-blue-600 sm:p-6");
		expect(code).not.toContain("tw({");

		const css = output.find((chunk) => chunk.type === "asset" && chunk.fileName.endsWith(".css"));
		expect(css).toBeDefined();
		expect(css!.source!.toString()).toContain("background-color:#3182ce");
		expect(css!.source!.toString()).toContain(":root");
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
		const css = project.cssPlugin.load("\0pandwind:css.css") as string;
		await expect(css).toMatchFileSnapshot(
			join(import.meta.dirname, "snapshots", "vite-generated-stylesheet.css.snap"),
		);
	});
});
