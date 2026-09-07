import { describe, expect, test } from "vitest";
import { createPandwindProjectSupport } from "../src/swap/project-bootstrap.ts";
import { CodemodAdapterId } from "../src/swap/identifiers.ts";

describe("Pandwind project bootstrap", () => {
	test("does not bind a generated tw module when no Tailwind graph was emitted", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Panda,
			outputDirectory: "pandwind",
			readFile: () => undefined,
			listFiles: () => [],
		});

		expect(support.files.map((file) => file.path)).not.toContain("pandwind/tw.ts");
		expect(support.bindings.twModule).toBeUndefined();
		expect(support.bindings.cssModule).toBe("pandwind/css.ts");
		expect(support.files.map((file) => file.path)).toContain("pandwind/dss.ts");
		expect(support.files.find((file) => file.path === "pandwind/css.ts")?.content).toContain(
			'import "pandwind:css";',
		);
		expect(support.bindings.dssModule).toBe("pandwind/dss.ts");
		expect(support.files.find((file) => file.path === "pandwind/dss.ts")?.content).toContain(
			"createDesignCss(pandwindPreset)",
		);
	});

	test("keeps generated css bindings open to CSS properties", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Panda,
			outputDirectory: "pandwind",
			readFile: () => undefined,
			listFiles: () => [],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain('config: {} as import("pandwind/preset").AnyCssConfig');
		expect(preset).toContain('"$all": true');
	});

	test("maps generated token groups to the properties that can consume them", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Tailwind,
			outputDirectory: "pandwind",
			readFile: (file) =>
				file === "/project/styles.css"
					? "@theme { --color-brand: #123456; --spacing-card: 1rem; }"
					: undefined,
			listFiles: () => ["/project/styles.css"],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain('"color": {');
		expect(preset).toContain('"$tokens": "colors"');
		expect(preset).toContain('"padding": {');
		expect(preset).toContain('"$tokens": "spacing"');
		expect(preset).toContain('"$brand": "#123456"');
		expect(preset).toContain('"$card": "1rem"');
	});

	test("uses an explicit TypeScript extension in generated Vite config imports", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Tailwind,
			outputDirectory: "pandwind",
			readFile: (file) => {
				if (file === "/project/styles.css") return '@import "tailwindcss";';
				if (file === "/project/vite.config.ts")
					return [
						'import tailwindcss from "@tailwindcss/vite";',
						'import { defineConfig } from "vite";',
						"export default defineConfig({ plugins: [tailwindcss()] });",
					].join("\n");
				return undefined;
			},
			listFiles: () => ["/project/styles.css", "/project/vite.config.ts"],
		});

		expect(support.fileChanges).toEqual([
			{
				path: "vite.config.ts",
				expectedContent: [
					'import tailwindcss from "@tailwindcss/vite";',
					'import { defineConfig } from "vite";',
					"export default defineConfig({ plugins: [tailwindcss()] });",
				].join("\n"),
				content: [
					'import { pandwindCssVite } from "pandwind/vite";',
					'import { pandwindPreset } from "./pandwind/preset.ts";',
					'import { defineConfig } from "vite";',
					'export default defineConfig({ plugins: [pandwindCssVite(pandwindPreset, { root: "." })] });',
				].join("\n"),
			},
		]);
	});
});
