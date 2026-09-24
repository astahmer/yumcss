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
			writeFileSync(join(root, "src", "Card.ts"), "export const card = 'before';\n");
			writeFileSync(
				join(root, "vite.config.ts"),
				"export default { plugins: [{ name: 'pandwind-preview-test', enforce: 'pre', transform(code, id) { if (id.endsWith('/src/Card.ts')) return { code: code.replace('before', 'after'), map: null }; } }] };\n",
			);

			runtime = await createCompilerPreviewRuntime({ root });
			expect(runtime.info.viteVersion).toBe("8.2.2");
			expect(runtime.info.pandwindPlugins).toContain("pandwind-preview-test");
			expect(runtime.files()).toContainEqual({ path: "src/Card.ts", bytes: 33 });

			const result = await runtime.transform("src/Card.ts");
			expect(result.source).toContain("before");
			expect(result.code).toContain("after");
			expect(result.code).not.toContain("before");
			expect(result.durationMs).toBeGreaterThanOrEqual(0);
			expect(() => runtime?.read("../outside.ts")).toThrow(
				"outside the supported project workspace",
			);
		} finally {
			if (runtime !== null) await runtime.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
