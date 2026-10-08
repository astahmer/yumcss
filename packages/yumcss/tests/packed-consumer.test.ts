/**
 * Packed-package consumer proof.
 *
 * This intentionally resolves YumCSS through the tarball's public exports,
 * not the workspace package symlink. It catches missing shipped files and
 * export-map/specifier mistakes that source-based tests cannot see.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { describe, expect, test } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const workspacePackageNodeModules = resolve(packageRoot, "node_modules");

function packInto(workdir: string): string {
	const output = execFileSync(
		"pnpm",
		["pack", "--ignore-scripts", "--json", "--pack-destination", workdir],
		{
			cwd: packageRoot,
			encoding: "utf8",
		},
	);
	const parsed = JSON.parse(output) as Array<{ filename?: string }> | { filename?: string };
	const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed.filename;
	if (filename === undefined) throw new Error("pnpm pack produced no tarball");
	return resolve(filename);
}

describe("packed YumCSS consumer", () => {
	test("public exports work in a real Vite consumer build", async () => {
		const workdir = mkdtempSync(join(tmpdir(), "yumcss-packed-consumer-"));
		const packageDir = join(workdir, "node_modules", "yumcss");
		const consumerDir = join(workdir, "consumer");
		try {
			const tarball = packInto(workdir);
			mkdirSync(packageDir, { recursive: true });
			execFileSync("tar", ["-xzf", tarball, "--strip-components", "1", "-C", packageDir]);
			symlinkSync(workspacePackageNodeModules, join(packageDir, "node_modules"), "dir");
			mkdirSync(join(consumerDir, "src"), { recursive: true });
			mkdirSync(join(consumerDir, "node_modules"), { recursive: true });
			symlinkSync(packageDir, join(consumerDir, "node_modules", "yumcss"), "dir");
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
					'import { createUnsafeCss } from "yumcss/unsafe/css";',
					"export const css = createUnsafeCss();",
				].join("\n"),
			);
			writeFileSync(
				join(consumerDir, "src/main.js"),
				[
					'import { css } from "./css.js";',
					'import "yumcss:css";',
					'const node = document.createElement("div");',
					'node.className = css.class({ color: "#123456" });',
					"document.body.append(node);",
				].join("\n"),
			);

			const consumerRequire = createRequire(join(consumerDir, "package.json"));
			const packedVitePath = consumerRequire.resolve("yumcss/vite");
			const packedPresetPath = consumerRequire.resolve("yumcss/preset");
			const packedCsstypePresetPath = consumerRequire.resolve("yumcss/preset/csstype");
			const packedDefaultPresetPath = consumerRequire.resolve("yumcss/preset/default");
			const packedTailwindPresetPath = consumerRequire.resolve("yumcss/preset/tailwindcss");
			const packedChakraPresetPath = consumerRequire.resolve("yumcss/preset/chakra");
			const packedShadcnPresetPath = consumerRequire.resolve("yumcss/preset/shadcn");
			const packedPandaPresetPath = consumerRequire.resolve("yumcss/preset/panda");
			const packedTailwindResetPath = consumerRequire.resolve("yumcss/reset/tailwindcss");
			const packedPandaResetPath = consumerRequire.resolve("yumcss/reset/panda");
			const packedYumCSSResetPath = consumerRequire.resolve("yumcss/reset/yumcss");
			const packedTailwindProsePath = consumerRequire.resolve("yumcss/prose/tailwindcss");
			const [
				{ yumcssExtractVite },
				{ define },
				{ csstypePreset },
				{ defaultPreset },
				{ tailwindPreset },
				{ chakraPreset },
				{ shadcnPreset },
				{ pandaPreset },
			] = await Promise.all([
				import(pathToFileURL(packedVitePath).href),
				import(pathToFileURL(packedPresetPath).href),
				import(pathToFileURL(packedCsstypePresetPath).href),
				import(pathToFileURL(packedDefaultPresetPath).href),
				import(pathToFileURL(packedTailwindPresetPath).href),
				import(pathToFileURL(packedChakraPresetPath).href),
				import(pathToFileURL(packedShadcnPresetPath).href),
				import(pathToFileURL(packedPandaPresetPath).href),
			]);
			expect(csstypePreset.properties).toEqual({ $all: true });
			expect(defaultPreset.properties).toHaveProperty("padding");
			expect(tailwindPreset.properties.backgroundColor).toEqual({
				$tokens: "colors",
				$strict: true,
			});
			expect(chakraPreset.properties.backgroundColor).toEqual({
				$tokens: "colors",
				$strict: true,
			});
			expect(shadcnPreset.properties.backgroundColor).toEqual({
				$tokens: "colors",
				$strict: true,
			});
			expect(pandaPreset.properties.backgroundColor).toEqual({
				$tokens: "colors",
				$strict: true,
			});
			expect(shadcnPreset.cssVariables).toHaveProperty("radius");
			expect(packedTailwindResetPath).toMatch(/dist\/reset\/tailwindcss\.css$/);
			expect(readFileSync(packedTailwindResetPath, "utf8")).toContain("@layer reset {");
			expect(packedPandaResetPath).toMatch(/dist\/reset\/panda\.css$/);
			expect(readFileSync(packedPandaResetPath, "utf8")).toContain(
				"--global-color-border, currentcolor",
			);
			expect(packedYumCSSResetPath).toMatch(/dist\/reset\/yumcss\.css$/);
			expect(readFileSync(packedYumCSSResetPath, "utf8")).toContain("box-sizing: border-box;");
			expect(packedTailwindProsePath).toMatch(/dist\/prose\/tailwindcss\.css$/);
			expect(readFileSync(packedTailwindProsePath, "utf8")).toContain("@layer prose {");
			const preset = define.preset(
				{ config: {}, tokens: {} },
				{ strict: false, properties: { $all: true }, conditions: {} },
			);

			await build({
				root: consumerDir,
				plugins: [yumcssExtractVite(preset, { root: consumerDir })],
				build: {
					outDir: "dist",
					emptyOutDir: true,
					rollupOptions: { input: join(consumerDir, "index.html") },
				},
			});

			const distDirectory = join(consumerDir, "dist");
			const cssFile = readdirSync(distDirectory, { recursive: true, encoding: "utf8" }).find(
				(file) => file.endsWith(".css"),
			);
			if (cssFile === undefined) throw new Error("Vite consumer build emitted no CSS file");
			expect(readFileSync(join(distDirectory, cssFile), "utf8")).toContain("#123456");
		} finally {
			rmSync(workdir, { recursive: true, force: true });
		}
	});
});
