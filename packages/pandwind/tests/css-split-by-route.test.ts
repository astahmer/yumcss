/**
 * Opt-in per-route CSS splitting (plans/014 §2): with splitByRoute set,
 * route-exclusive atoms move to `pandwind:css?route=<name>` virtual
 * modules while shared atoms and unmatched-file atoms stay in the base
 * `pandwind:css` sheet. Without the option nothing changes (default mode
 * is covered by vite-css.test.ts).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { pandwindCssVite } from "../src/vite/css.ts";
import { createPandwindEngineContext } from "../src/vite/engine-context.ts";
import { stackFoldVite } from "../src/vite/stack-fold.ts";
import { examplePreset } from "@pandwind/example-preset";

const makeProject = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "pandwind-split-"));
	const files: Record<string, string> = {
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/routes/admin/admin.tsx": `
			import { css } from "../design";
			export const a = css.class({ $layout: { flow: "stackY" }, $frame: { w: "20" } });
			export const spin = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
			export const slide = css.keyframes({ from: { transform: "translateX(0)" } });
		`,
		"src/routes/user/user.tsx": `
			import { css } from "../design";
			export const b = css.class({ $layout: { flow: "stackY" }, $frame: { h: "12" } });
			export const sharedLater = css.class({ $frame: { w: "26" } });
			export const spin = css.keyframes({ to: { opacity: 1 }, from: { opacity: 0 } });
		`,
		"src/routes/reports/reports.tsx": `
			import { css } from "../../design";
			export const sharedLater = css.class({ $frame: { w: "26" } });
		`,
		"src/common.ts": `
			import { css } from "./design";
			export const c = css.class({ $frame: { fill: "$red-500" } });
		`,
	};
	for (const [name, content] of Object.entries(files)) {
		const path = join(dir, name);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
	return dir;
};

const pluginFor = (dir: string) =>
	pandwindCssVite(examplePreset, {
		root: dir,
		splitByRoute: [
			{ match: /\/routes\/admin\//, name: "admin" },
			{ match: /\/routes\/user\//, name: "user" },
			{ match: /\/routes\/reports\//, name: "reports" },
		],
	});

describe("splitByRoute", () => {
	test("base sheet keeps shared + unmatched atoms only", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir);
		expect(plugin.resolveId("pandwind:css")).toBe("\0pandwind:css.css");

		const base = plugin.load("\0pandwind:css.css") as string;
		expect(base).toContain("flex-direction:column"); // shared atom -> common
		expect(base).toContain("background-color:#"); // unmatched file -> common
		expect(base).not.toContain("width:20px"); // admin-exclusive
		expect(base).not.toContain("height:"); // user-exclusive
	});

	test("route chunks carry their exclusives", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir);
		expect(plugin.resolveId("pandwind:css?route=admin")).toBe("\0pandwind:css.css?route=admin");

		const admin = plugin.load("\0pandwind:css.css?route=admin") as string;
		expect(admin).toContain("width:20px");
		expect(admin).not.toContain("height:");
		expect(admin).not.toContain("flex-direction:column"); // shared stays common

		const user = plugin.load("\0pandwind:css.css?route=user") as string;
		expect(user).toContain("height:");
		expect(user).not.toContain("width:20px");
	});

	test("keyframes shared across routes stay common, exclusives stay in their route", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir);
		const base = plugin.load("\0pandwind:css.css") as string;
		const admin = plugin.load("\0pandwind:css.css?route=admin") as string;
		const user = plugin.load("\0pandwind:css.css?route=user") as string;

		const spin = /@keyframes pw-kf-[a-z0-9]+\{0%\{opacity:0\}100%\{opacity:1\}\}/u.exec(base)?.[0];
		expect(spin).toBeDefined();
		expect(base).not.toContain("translateX");
		expect(admin).toContain("translateX(0)");
		expect(admin).not.toContain(spin!);
		expect(user).not.toContain(spin!);
		expect(user).not.toContain("translateX");
	});

	test("rules shared by later route buckets stay in the common sheet", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir);
		const base = plugin.load("\0pandwind:css.css") as string;
		const user = plugin.load("\0pandwind:css.css?route=user") as string;
		const reports = plugin.load("\0pandwind:css.css?route=reports") as string;

		expect(base).toContain("width:26px");
		expect(user).not.toContain("width:26px");
		expect(reports).not.toContain("width:26px");
	});

	test("configured Stack declarations stay in their owning route chunk", () => {
		const dir = makeProject();
		const stackFile = join(dir, "src/routes/admin/stack.tsx");
		const stackSource =
			'import { Stack } from "pandwind/stack/react"; export const stack = <Stack gap={4} />;';
		writeFileSync(stackFile, stackSource);
		try {
			const engine = createPandwindEngineContext({
				preset: examplePreset,
				className: createNamedAtomsStrategy("app"),
			});
			const stack = stackFoldVite({ engine });
			expect(stack.transform(stackSource, stackFile)?.code).toContain(
				'<div className="app-display-flex app-gap-4px" />',
			);

			const plugin = pandwindCssVite(examplePreset, {
				root: dir,
				splitByRoute: [
					{ match: /\/routes\/admin\//, name: "admin" },
					{ match: /\/routes\/user\//, name: "user" },
				],
				engine,
			});
			const base = plugin.load("\0pandwind:css.css") as string;
			const admin = plugin.load("\0pandwind:css.css?route=admin") as string;

			expect(base).not.toContain(".app-gap-4px{gap:4px}");
			expect(admin).toContain(".app-gap-4px{gap:4px}");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("manifest module maps routes to virtual ids", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir);
		expect(plugin.resolveId("pandwind:css-manifest")).toBe("\0pandwind:css-manifest.js");
		const manifest = plugin.load("\0pandwind:css-manifest.js") as string;
		expect(manifest).toContain('"admin": "pandwind:css?route=admin"');
		expect(manifest).toContain('"user": "pandwind:css?route=user"');
	});

	test("unknown route resolves to null and loads empty", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir);
		expect(plugin.resolveId("pandwind:css?route=nope")).toBeNull();
		expect(plugin.load("\0pandwind:css.css?route=nope")).toBe("");
	});

	test("HMR invalidation refreshes the owning route chunk", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir);
		const adminFile = join(dir, "src/routes/admin/admin.tsx");
		expect(plugin.load("\0pandwind:css.css?route=admin") as string).toContain("width:20px");

		writeFileSync(adminFile, readFileSync(adminFile, "utf8").replace('w: "20"', 'w: "24"'));
		plugin.handleHotUpdate({ file: adminFile });
		const refreshed = plugin.load("\0pandwind:css.css?route=admin") as string;
		expect(refreshed).toContain("width:24px");
		expect(refreshed).not.toContain("width:20px");
	});
});
