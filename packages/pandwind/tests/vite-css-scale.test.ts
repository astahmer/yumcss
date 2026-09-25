import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { createDesignCss } from "../src/design/index.ts";
import { pandwindCssVite } from "../src/vite/css.ts";

describe("CSS Vite extraction at project scale", () => {
	test(
		"extracts a large source tree and reuses its rendered stylesheet",
		{ timeout: 30_000 },
		async () => {
			const root = mkdtempSync(join(tmpdir(), "pandwind-css-scale-"));
			const sourceDirectory = join(root, "src");
			mkdirSync(sourceDirectory, { recursive: true });
			const plugin = pandwindCssVite(createDesignCss(examplePreset), { root });
			const pluginContext = {
				resolve: async (source: string, importer?: string) => ({
					id: resolve(importer === undefined ? sourceDirectory : dirname(importer), source),
					external: false,
					resolvedBy: "pandwind-css-scale-test",
					attributes: {},
					meta: {},
					moduleSideEffects: true,
					syntheticNamedExports: false,
				}),
			};
			const modules = Array.from({ length: 1_000 }, (_, index) => ({
				id: resolve(sourceDirectory, `module-${index}.tsx`),
				source: `import { css } from "./design";\nexport const style${index} = css({ margin: "${index}px", color: "#123456" });\n`,
			}));

			try {
				for (const module of modules) writeFileSync(module.id, module.source);

				const coldStart = performance.now();
				for (const module of modules)
					await plugin.transform.call(pluginContext, module.source, module.id);
				const css = plugin.load("\0pandwind:css.css");
				const coldMs = performance.now() - coldStart;
				const warmStart = performance.now();
				const warmCss = plugin.load("\0pandwind:css.css");
				const warmMs = performance.now() - warmStart;

				expect(css).toContain("0px");
				expect(css).toContain("999px");
				expect(css.match(/color:#123456/gu)).toHaveLength(1);
				expect(warmCss).toBe(css);
				expect(warmMs).toBeLessThan(coldMs);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);
});
