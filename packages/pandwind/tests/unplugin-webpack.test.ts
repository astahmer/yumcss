/**
 * Webpack adapter smoke test — a real webpack build over a small JS fixture.
 *
 * The fixture intentionally uses a plain generated tw module so this test
 * isolates the unplugin adapter from TypeScript and framework loaders. The
 * Rollup browser fixture covers the CSS virtual module and browser output;
 * this test covers the Webpack transform hook itself.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import webpack, { type Compiler, type Configuration, type Stats, type Watching } from "webpack";
import { describe, expect, test } from "vitest";
import { examplePreset } from "../src/preset/example-preset.ts";
import { pandwindWebpack, pandwindWebpackCss } from "../src/unplugin.ts";

const packageRoot = resolve(import.meta.dirname, "..");
const exampleTwModule = resolve(packageRoot, "../../apps/example/src/tw.ts");

function writeJsTwModule(dir: string): string {
	let source = readFileSync(exampleTwModule, "utf8");
	source = source.replace(/^import [^\n]*$/gm, "");
	source = source.replace(/createTw<[^>(]*>\(/, "createTw(");
	source = source.replace("__pandwindConfig: TwOptions = {", "__pandwindConfig = {");
	const target = join(dir, "tw.js");
	writeFileSync(target, source);
	return target;
}

function runWebpack(config: Configuration): Promise<Stats> {
	return new Promise((resolveStats, reject) => {
		const compiler = webpack(config);
		if (compiler === null) {
			reject(new Error("Webpack returned no compiler"));
			return;
		}
		compiler.run((error, stats) => {
			compiler.close((closeError) => {
				if (error ?? closeError) {
					reject(error ?? closeError);
					return;
				}
				if (stats === undefined) {
					reject(new Error("Webpack emitted no stats"));
					return;
				}
				resolveStats(stats);
			});
		});
	});
}

describe("pandwindWebpack", () => {
	test("folds tw() calls in a real webpack build", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pandwind-unplugin-webpack-"));
		const outputDir = join(dir, "dist");
		try {
			const twModule = writeJsTwModule(dir);
			const entry = join(dir, "entry.js");
			writeFileSync(
				entry,
				[
					`import { tw } from ${JSON.stringify(twModule)};`,
					'console.log(tw({ p: "6", text: "sm" }));',
				].join("\n"),
			);
			mkdirSync(outputDir, { recursive: true });

			const stats = await runWebpack({
				mode: "production",
				context: dir,
				entry: "./entry.js",
				output: { path: outputDir, filename: "bundle.js", clean: true },
				plugins: [pandwindWebpack({})],
			});

			expect(stats.hasErrors(), stats.toString({ errorDetails: true })).toBe(false);
			const code = readFileSync(join(outputDir, "bundle.js"), "utf8");
			expect(code).toContain("p-6 text-sm");
			expect(code).not.toMatch(/\btw\s*\(/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("watch rebuild reprocesses changed source", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pandwind-unplugin-webpack-watch-"));
		const outputDir = join(dir, "dist");
		const entry = join(dir, "entry.js");
		mkdirSync(outputDir, { recursive: true });
		let compiler: Compiler | null = null;
		let watching: Watching | undefined;
		try {
			const twModule = writeJsTwModule(dir);
			writeFileSync(
				entry,
				[
					`import { tw } from ${JSON.stringify(twModule)};`,
					'console.log(tw({ p: "6", text: "sm" }));',
				].join("\n"),
			);
			compiler = webpack({
				mode: "development",
				context: dir,
				entry: "./entry.js",
				output: { path: outputDir, filename: "bundle.js" },
				plugins: [pandwindWebpack({})],
			}) as Compiler;
			if (compiler === null) throw new Error("Webpack returned no compiler");
			const builds: Stats[] = [];
			const waiters: Array<{
				resolve: (stats: Stats) => void;
				reject: (error: Error) => void;
			}> = [];
			const nextBuild = () => {
				const build = builds.shift();
				if (build !== undefined) return Promise.resolve(build);
				return new Promise<Stats>((resolveStats, reject) => {
					waiters.push({ resolve: resolveStats, reject });
				});
			};
			watching = compiler.watch({ aggregateTimeout: 10 }, (error, stats) => {
				if (error !== null) {
					waiters.shift()?.reject(error);
					return;
				}
				if (stats === undefined || "stats" in stats) {
					waiters.shift()?.reject(new Error("Webpack emitted no watch stats"));
					return;
				}
				const waiter = waiters.shift();
				if (waiter !== undefined) waiter.resolve(stats);
				else builds.push(stats);
			});
			const initial = await nextBuild();
			expect(initial.hasErrors(), initial.toString({ errorDetails: true })).toBe(false);
			expect(readFileSync(join(outputDir, "bundle.js"), "utf8")).toContain("p-6 text-sm");

			const waitForBundle = async (expected: string): Promise<Stats> => {
				const deadline = Date.now() + 5_000;
				const poll = async (): Promise<Stats> => {
					const remaining = deadline - Date.now();
					if (remaining <= 0) {
						throw new Error(`Webpack watch output never contained ${expected}`);
					}
					const build = nextBuild();
					let timer: ReturnType<typeof setTimeout> | undefined;
					const stats = await Promise.race([
						build,
						new Promise<never>((_, reject) => {
							timer = setTimeout(
								() => reject(new Error("Timed out waiting for Webpack watch rebuild")),
								remaining,
							);
						}),
					]);
					if (timer !== undefined) clearTimeout(timer);
					if (stats.hasErrors()) return stats;
					if (readFileSync(join(outputDir, "bundle.js"), "utf8").includes(expected)) return stats;
					return poll();
				};
				return poll();
			};

			const updatedBuild = waitForBundle("p-8 text-sm");
			writeFileSync(
				entry,
				[
					`import { tw } from ${JSON.stringify(twModule)};`,
					'console.log(tw({ p: "8", text: "sm" }));',
				].join("\n"),
			);
			const changedAt = new Date(Date.now() + 1_000);
			utimesSync(entry, changedAt, changedAt);
			if (watching === undefined) throw new Error("Webpack watch returned no Watching handle");
			watching.invalidate();
			const updated = await updatedBuild;
			expect(updated.hasErrors(), updated.toString({ errorDetails: true })).toBe(false);
			expect(readFileSync(join(outputDir, "bundle.js"), "utf8")).toContain("p-8 text-sm");
		} finally {
			if (watching !== undefined)
				await new Promise<void>((resolveClose) => watching?.close(() => resolveClose()));
			if (compiler !== null)
				await new Promise<void>((resolveClose) => compiler!.close(() => resolveClose()));
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("emits extracted CSS through the Webpack adapter", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pandwind-unplugin-webpack-css-"));
		const outputDir = join(dir, "dist");
		try {
			writeFileSync(join(dir, "css.js"), 'export const css = { class: () => "runtime-class" };');
			const cssLoader = join(dir, "css-loader.cjs");
			writeFileSync(
				cssLoader,
				"module.exports = function cssLoader(source) { return `globalThis.__pandwindCss = ${JSON.stringify(source)}`; };",
			);
			writeFileSync(
				join(dir, "entry.js"),
				[
					'import { css } from "./css.js";',
					'import "pandwind:css";',
					'console.log(css.class({ color: "$blue-500" }));',
				].join("\n"),
			);
			mkdirSync(outputDir, { recursive: true });

			const stats = await runWebpack({
				mode: "production",
				context: dir,
				entry: "./entry.js",
				output: { path: outputDir, filename: "bundle.js", clean: true },
				module: {
					rules: [{ test: /_virtual_.*\.css$/, use: [{ loader: cssLoader }] }],
				},
				plugins: [pandwindWebpackCss({ preset: examplePreset, root: dir })],
			});

			expect(stats.hasErrors(), stats.toString({ errorDetails: true })).toBe(false);
			const code = readFileSync(join(outputDir, "bundle.js"), "utf8");
			expect(code).toContain("#3182ce");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
