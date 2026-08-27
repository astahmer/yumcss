/**
 * Webpack adapter smoke test — a real webpack build over a small JS fixture.
 *
 * The fixture intentionally uses a plain generated tw module so this test
 * isolates the unplugin adapter from TypeScript and framework loaders. The
 * Rollup browser fixture covers the CSS virtual module and browser output;
 * this test covers the Webpack transform hook itself.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import webpack, { type Configuration, type Stats } from "webpack";
import { describe, expect, test } from "vitest";
import { pandwindWebpack } from "../src/unplugin.ts";

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
});
