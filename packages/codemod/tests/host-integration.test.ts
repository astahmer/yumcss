import { describe, expect, test } from "vitest";
import { planPandwindViteIntegration } from "../src/swap/host-integration.ts";

describe("Pandwind Vite integration", () => {
	test("registers the generated preset before framework plugins and is idempotent", () => {
		const root = "/project";
		const configPath = `${root}/vite.config.ts`;
		const source = [
			'import { defineConfig } from "vite";',
			'import react from "@vitejs/plugin-react";',
			"export default defineConfig({ plugins: [react()] });",
		].join("\n");
		let currentSource = source;
		const fileSystem = {
			read: (path: string) => (path === configPath ? currentSource : undefined),
			exists: (path: string) => path === configPath,
		};
		const request = { projectRoot: root, outputDirectory: "pandwind", fileSystem };
		const plan = planPandwindViteIntegration(request);

		expect(plan.enabled).toBe(true);
		expect(plan.fileChanges).toHaveLength(1);
		expect(plan.fileChanges[0]?.content).toMatchInlineSnapshot(`
			"import { defineConfig } from "vite";
			import react from "@vitejs/plugin-react";
			import { pandwindCssVite } from "pandwind/vite";
			import { preset } from "./pandwind/preset.ts";
			export default defineConfig({ plugins: [pandwindCssVite(preset, { root: "." }), react()] });"
		`);
		currentSource = plan.fileChanges[0]?.content ?? source;

		const repeatedPlan = planPandwindViteIntegration(request);
		expect(repeatedPlan.enabled).toBe(true);
		expect(repeatedPlan.fileChanges).toEqual([]);
	});

	test("preserves ambiguous plugin wiring as a visible integration residual", () => {
		const root = "/project";
		const configPath = `${root}/vite.config.ts`;
		const source = "export default { plugins: createPlugins() };";
		const plan = planPandwindViteIntegration({
			projectRoot: root,
			outputDirectory: "pandwind",
			fileSystem: {
				read: (path) => (path === configPath ? source : undefined),
				exists: (path) => path === configPath,
			},
		});

		expect(plan.enabled).toBe(false);
		expect(plan.fileChanges).toEqual([]);
		expect(plan.notes).toContain("could not safely register pandwindCssVite in vite.config.ts");
	});

	test("does not attach a second extractor to an unrelated Pandwind preset", () => {
		const root = "/project";
		const configPath = `${root}/vite.config.ts`;
		const source = [
			'import { pandwindCssVite } from "pandwind/vite";',
			'import { css } from "./src/css";',
			"export default { plugins: [pandwindCssVite(css)] };",
		].join("\n");
		const plan = planPandwindViteIntegration({
			projectRoot: root,
			outputDirectory: "pandwind",
			fileSystem: {
				read: (path) => (path === configPath ? source : undefined),
				exists: (path) => path === configPath,
			},
		});

		expect(plan.enabled).toBe(false);
		expect(plan.fileChanges).toEqual([]);
		expect(plan.notes[0]).toContain("because its preset could not be verified");
	});
});
