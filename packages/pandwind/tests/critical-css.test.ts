/**
 * Critical-CSS inlining (plans/014 §2a): with splitByRoute + inlineCritical,
 * build-time closeBundle writes common+route CSS into each configured HTML
 * entry's <head>. Pure injection logic is unit-tested alongside the
 * plugin-level behavior (configResolved/closeBundle driven directly).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { pandwindCssVite } from "../src/vite/css.ts";
import { renderCriticalHtml } from "../src/vite/critical-css.ts";
import { examplePreset } from "../src/preset/example-preset.ts";

const htmlDoc = (title: string) =>
	`<!doctype html>\n<html>\n<head><title>${title}</title></head>\n<body></body>\n</html>`;

const makeProject = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "pandwind-critical-"));
	void 0;
	const files: Record<string, string> = {
		"index.html": htmlDoc("home"),
		"admin.html": htmlDoc("admin"),
		"user.html": htmlDoc("user"),
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

const pluginFor = (dir: string, inlineCritical?: true | { capBytes?: number }) =>
	pandwindCssVite(examplePreset, {
		root: dir,
		splitByRoute: [
			{ match: /\/routes\/admin\//, name: "admin", html: "admin.html" },
			{ match: /\/routes\/user\//, name: "user", html: "user.html" },
		],
		inlineCritical,
	});

describe("renderCriticalHtml", () => {
	test("injects a marked style tag after <head>", () => {
		const out = renderCriticalHtml({
			html: "<html><head></head><body></body></html>",
			routeName: "admin",
			css: ".a{width:20px}",
		});
		expect(out).toMatchObject({ ok: true });
		if (out.ok) {
			expect(out.html).toContain('<style data-pw-critical="admin">.a{width:20px}</style>');
			expect(out.html.indexOf("<style")).toBeGreaterThan(out.html.indexOf("<head"));
		}
	});

	test("idempotent: already-injected documents are skipped", () => {
		const once = renderCriticalHtml({
			html: "<html><head></head></html>",
			routeName: "admin",
			css: ".a{}",
		});
		expect(once.ok).toBe(true);
		if (!once.ok) return;
		const twice = renderCriticalHtml({ html: once.html, routeName: "admin", css: ".a{}" });
		expect(twice.ok).toBe(false);
	});

	test("cap: oversized payloads are refused, file untouched semantics", () => {
		const out = renderCriticalHtml({
			html: "<html><head></head></html>",
			routeName: "x",
			css: "/* quite long */".repeat(100),
			capBytes: 64,
		});
		expect(out.ok).toBe(false);
	});

	test("documents without <head> are skipped", () => {
		const out = renderCriticalHtml({ html: "<p>fragment</p>", routeName: "x", css: ".a{}" });
		expect(out.ok).toBe(false);
	});
});

describe("inlineCritical (closeBundle)", () => {
	test("build injects common+route css into configured html entries", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir, true);
		plugin.configResolved?.({ command: "build" });
		plugin.closeBundle?.();

		const admin = readFileSync(join(dir, "admin.html"), "utf8");
		expect(admin).toContain('data-pw-critical="admin"');
		expect(admin).toContain("width:20px"); // admin exclusive
		expect(admin).toContain("background-color:#"); // common atom
		expect(admin).not.toContain("height:"); // user exclusive stays out

		const user = readFileSync(join(dir, "user.html"), "utf8");
		expect(user).toContain('data-pw-critical="user"');
		expect(user).toContain("height:");
		expect(user).not.toContain("width:20px");
	});

	test("off by default (no inlineCritical -> never writes)", () => {
		const dir = makeProject();
		const off = pluginFor(dir);
		off.configResolved?.({ command: "build" });
		off.closeBundle?.();
		expect(readFileSync(join(dir, "admin.html"), "utf8")).not.toContain("data-pw-critical");
		expect(readFileSync(join(dir, "user.html"), "utf8")).not.toContain("data-pw-critical");
	});

	test("serve mode never writes", () => {
		const dir = makeProject();
		const before = readFileSync(join(dir, "admin.html"), "utf8");
		const plugin = pluginFor(dir, true);
		plugin.configResolved?.({ command: "serve" });
		plugin.closeBundle?.();
		expect(readFileSync(join(dir, "admin.html"), "utf8")).toBe(before);
		expect(existsSync(join(dir, "admin.html"))).toBe(true);
	});

	test("cap option propagates: tiny cap skips injection", () => {
		const dir = makeProject();
		const plugin = pluginFor(dir, { capBytes: 32 });
		plugin.configResolved?.({ command: "build" });
		plugin.closeBundle?.();
		expect(readFileSync(join(dir, "admin.html"), "utf8")).not.toContain("data-pw-critical");
	});
});
