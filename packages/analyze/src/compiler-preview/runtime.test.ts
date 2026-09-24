import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { CompilerPreviewRuntime } from "./runtime.ts";
import { createCompilerPreviewRuntime } from "./runtime.ts";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("createCompilerPreviewRuntime", () => {
	test("runs the project's real Vite transform pipeline and confines source reads", async () => {
		const root = mkdtempSync(join(packageRoot, ".compiler-preview-test-"));
		let runtime: CompilerPreviewRuntime | null = null;
		try {
			mkdirSync(join(root, "src"), { recursive: true });
			writeFileSync(
				join(root, "src", "design.ts"),
				"import { createDesignCss } from 'pandwind/design'; import { examplePreset } from '@pandwind/example-preset'; export const css = createDesignCss(examplePreset);\n",
			);
			writeFileSync(
				join(root, "src", "Card.ts"),
				"import { css } from './design'; import 'pandwind:css'; export const card = css.class({ color: '$blue-500' });\n",
			);
			writeFileSync(
				join(root, "vite.config.ts"),
				`import { pandwindCssVite, pandwindVite } from 'pandwind/vite'; import { createDesignCss } from 'pandwind/design'; import { examplePreset } from '@pandwind/example-preset'; const css = createDesignCss(examplePreset); export default { plugins: [pandwindVite({ css: { preset: examplePreset } }), pandwindCssVite(css, { root: ${JSON.stringify(root)} })] };\n`,
			);

			runtime = await createCompilerPreviewRuntime({ root });
			expect(runtime.info.viteVersion).toBe("8.2.2");
			expect(runtime.info.pandwindPlugins.length).toBeGreaterThan(0);
			expect(runtime.files().map((file) => file.path)).toContain("src/Card.ts");

			const result = await runtime.transform("src/Card.ts");
			expect(result.source).toContain("css.class(");
			expect(result.code).not.toContain("css.class(");
			expect(result.code).toMatch(/export const card = ["'][^"']+["']/u);
			expect(result.durationMs).toBeGreaterThanOrEqual(0);
			expect(() => runtime?.read("../outside.ts")).toThrow(
				"outside the supported project workspace",
			);
		} finally {
			if (runtime !== null) await runtime.close();
			rmSync(root, { recursive: true, force: true });
		}
	}, 15_000);
});
