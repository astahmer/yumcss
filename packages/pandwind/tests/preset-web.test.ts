import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createRuntimeStylesheet } from "../src/css/runtime-stylesheet.ts";
import { define } from "../src/types/define-preset.export.ts";
import { createCssExtractorPluginCore } from "../src/vite/css-core.ts";
import {
	createPandwindLibArtifact,
	createPandwindLibCompatibility,
	validatePandwindLibArtifact,
} from "../src/vite/lib-artifact.ts";

const preset = define.preset(
	{
		config: {},
		tokens: { colors: { $brand: "#123456" } },
	},
	{
		conditions: {},
		properties: { $all: true, color: { $tokens: "colors" } },
	},
	{
		globals: {
			":root": { color: "$brand", "--app-space": "1rem", "--omitted": undefined },
		},
		keyframes: {
			"fade-in": {
				from: { opacity: 0 },
				to: { opacity: 1 },
			},
		},
		fontFaces: {
			brand: {
				family: "Brand",
				src: 'url("/fonts/brand.woff2") format("woff2")',
				display: "swap",
			},
		},
	},
);

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe("preset.web", () => {
	test("emits deterministic globals, keyframes, and font faces with used tokens", () => {
		const sheet = createStylesheet(preset, {}, { tokens: "used" });
		const web = sheet.gen.web();

		expect(web).toBe(
			'@font-face{font-family:Brand;src:url("/fonts/brand.woff2") format("woff2");font-display:swap}\n' +
				"@keyframes fade-in{0%{opacity:0}100%{opacity:1}}\n" +
				":root{--app-space:1rem;color:var(--hzvmrv)}",
		);
		expect(sheet.gen.tokens()).toContain("#123456");
		expect(sheet.generate([])).toContain(web);

		const tokenFirst = createStylesheet(preset, {}, { tokens: "used" });
		expect(tokenFirst.gen.tokens()).toContain("#123456");
	});

	test("keeps preset web CSS out of the runtime stylesheet", () => {
		const runtime = createRuntimeStylesheet(preset);

		expect(runtime.gen.tokens()).not.toContain("@font-face");
		expect(runtime.gen.tokens()).not.toContain("@keyframes fade-in");
		expect(runtime.gen.tokens()).not.toContain(":root{color:");
	});

	test("carries preset web CSS through the library artifact contract", () => {
		const sheet = createStylesheet(preset, {}, { tokens: "used" });
		const artifact = createPandwindLibArtifact({
			compatibility: createPandwindLibCompatibility(preset),
			sources: [{ path: "src/design.ts", hash: "source" }],
			tokens: sheet.gen.tokenEntries(),
			web: sheet.gen.web(),
			atomic: sheet.gen.atomicEntries(),
			vars: sheet.gen.varEntries(),
		});

		expect(artifact.web).toContain("@font-face");
		expect(validatePandwindLibArtifact(artifact).valid).toBe(true);
	});

	test("keeps global CSS in the common split bucket", () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-preset-web-"));
		temporaryDirectories.push(root);
		const plugin = createCssExtractorPluginCore(preset, {
			root,
			splitByRoute: [{ match: /\/dashboard\//u, name: "dashboard" }],
		});
		const virtualId = plugin.resolveId("pandwind:css");
		const routeId = plugin.resolveId("pandwind:css?route=dashboard");

		expect(virtualId).not.toBeNull();
		expect(routeId).not.toBeNull();
		expect(plugin.load(virtualId!)).toContain("@font-face");
		expect(plugin.load(routeId!)).not.toContain("@font-face");
	});

	test("rejects broad authored-CSS constructs in the typed web lane", () => {
		const broadPreset = define.preset(
			{ config: {}, tokens: {} },
			{
				conditions: {},
				properties: { $all: true },
			},
			{ globals: { "@supports (display: grid)": { display: "grid" } } },
		);

		expect(() => createStylesheet(broadPreset).gen.web()).toThrow("flat CSS selector");
	});
});
