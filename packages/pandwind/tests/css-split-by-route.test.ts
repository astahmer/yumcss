/**
 * Opt-in per-route CSS splitting (plans/014 §2): with splitByRoute set,
 * route-exclusive atoms move to `pandwind:css?route=<name>` virtual
 * modules while shared atoms and unmatched-file atoms stay in the base
 * `pandwind:css` sheet. Without the option nothing changes (default mode
 * is covered by vite-css.test.ts).
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { pandwindCssVite } from "../src/vite/css.ts";
import { examplePreset } from "@pandwind/example-preset";

const makeProject = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "pandwind-split-"));
	const files: Record<string, string> = {
		"src/design.ts": "export const css = (x: unknown) => x;",
		"src/routes/admin/admin.tsx": `
			import { css } from "../design";
			export const a = css.class({ $layout: { flow: "stackY" }, $frame: { w: "20" } });
		`,
		"src/routes/user/user.tsx": `
			import { css } from "../design";
			export const b = css.class({ $layout: { flow: "stackY" }, $frame: { h: "12" } });
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
