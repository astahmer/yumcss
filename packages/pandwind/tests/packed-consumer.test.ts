/**
 * Packed-package consumer proof.
 *
 * This intentionally resolves Pandwind through the tarball's public exports,
 * not the workspace package symlink. It catches missing shipped files and
 * export-map/specifier mistakes that source-based tests cannot see.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { describe, expect, test } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const workspacePackageNodeModules = resolve(packageRoot, "node_modules");

function packInto(workdir: string): string {
	const output = execFileSync("pnpm", ["pack", "--json", "--pack-destination", workdir], {
		cwd: packageRoot,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output) as Array<{ filename?: string }> | { filename?: string };
	const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed.filename;
	if (filename === undefined) throw new Error("pnpm pack produced no tarball");
	return resolve(filename);
}

describe("packed Pandwind consumer", () => {
	test("public exports work in a real Vite consumer build", async () => {
		const workdir = mkdtempSync(join(tmpdir(), "pandwind-packed-consumer-"));
		const packageDir = join(workdir, "node_modules", "pandwind");
		const consumerDir = join(workdir, "consumer");
		try {
			const tarball = packInto(workdir);
			mkdirSync(packageDir, { recursive: true });
			execFileSync("tar", ["-xzf", tarball, "--strip-components", "1", "-C", packageDir]);
			symlinkSync(workspacePackageNodeModules, join(packageDir, "node_modules"), "dir");
			mkdirSync(join(consumerDir, "src"), { recursive: true });
			mkdirSync(join(consumerDir, "node_modules"), { recursive: true });
			symlinkSync(packageDir, join(consumerDir, "node_modules", "pandwind"), "dir");
			for (const dependency of [
				"@tailwindcss",
				"csstype",
				"oxc-parser",
				"postcss",
				"postcss-selector-parser",
				"tailwindcss",
				"unplugin",
			]) {
				const target = join(consumerDir, "node_modules", dependency);
				mkdirSync(dirname(target), { recursive: true });
				symlinkSync(join(workspacePackageNodeModules, dependency), target, "dir");
			}
			writeFileSync(
				join(consumerDir, "index.html"),
				'<div id="root"></div><script type="module" src="/src/main.js"></script>',
			);
			writeFileSync(
				join(consumerDir, "src/css.js"),
				[
					'import { createUnsafeCss } from "pandwind/unsafe/css";',
					"export const css = createUnsafeCss();",
				].join("\n"),
			);
			writeFileSync(
				join(consumerDir, "src/main.js"),
				[
					'import { css } from "./css.js";',
					'import "pandwind:css";',
					'const node = document.createElement("div");',
					'node.className = css.class({ color: "#123456" });',
					"document.body.append(node);",
				].join("\n"),
			);

			const consumerRequire = createRequire(join(consumerDir, "package.json"));
			const packedVitePath = consumerRequire.resolve("pandwind/vite");
			const packedPresetPath = consumerRequire.resolve("pandwind/preset");
			const packedCsstypePresetPath = consumerRequire.resolve("pandwind/preset/csstype");
			const packedDefaultPresetPath = consumerRequire.resolve("pandwind/preset/default");
			const [{ pandwindCssVite }, { define }, { csstypePreset }, { defaultPreset }] =
				await Promise.all([
					import(pathToFileURL(packedVitePath).href),
					import(pathToFileURL(packedPresetPath).href),
					import(pathToFileURL(packedCsstypePresetPath).href),
					import(pathToFileURL(packedDefaultPresetPath).href),
				]);
			expect(csstypePreset.properties).toEqual({ $all: true });
			expect(defaultPreset.properties).toHaveProperty("padding");
			const preset = define.preset(
				{ config: {}, tokens: {} },
				{ strict: false, properties: { $all: true }, conditions: {} },
			);

			await build({
				root: consumerDir,
				plugins: [pandwindCssVite(preset, { root: consumerDir })],
				build: {
					outDir: "dist",
					emptyOutDir: true,
					rollupOptions: { input: join(consumerDir, "index.html") },
				},
			});

			const files = execFileSync("rg", ["--files", join(consumerDir, "dist")], { encoding: "utf8" })
				.trim()
				.split("\n");
			const cssFile = files.find((file) => file.endsWith(".css"));
			expect(cssFile).toBeDefined();
			expect(readFileSync(cssFile!, "utf8")).toContain("#123456");
		} finally {
			rmSync(workdir, { recursive: true, force: true });
		}
	});
});
