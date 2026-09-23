import { describe, expect, test, vi } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { createCssExtractorPluginCore } from "../src/vite/css-core.ts";
import { createInlineTwPluginCore } from "../src/vite/index.ts";
import { renderCssRuntimeModule } from "../src/css/runtime-codegen.ts";
import { SOURCE_SCANNER_SERVICE } from "../src/source-scanner.ts";
import {
	createRuntimePruningTransform,
	explainRuntimePruning,
} from "../src/vite/runtime-pruner.ts";

const ID = "/project/src/styles.ts";

describe("runtime pruning", () => {
	test("skips parsing modules that cannot import a CSS factory", () => {
		const pruner = createRuntimePruningTransform();
		const parse = vi.spyOn(SOURCE_SCANNER_SERVICE, "parse");
		try {
			expect(pruner.transform("export const value = 1;", ID)).toBeNull();
			expect(parse).not.toHaveBeenCalled();
		} finally {
			parse.mockRestore();
		}
	});

	test("explains projected methods, keys, and token entries", () => {
		const explanations = explainRuntimePruning({
			code:
				'import { createDesignCss } from "pandwind/design";\n' +
				'import { examplePreset } from "@pandwind/example-preset";\n' +
				"const css = createDesignCss(examplePreset);\n" +
				'export const styles = css.class({ $frame: { fill: "$red-500" } });',
			id: ID,
			preset: examplePreset,
		});

		expect(explanations).toHaveLength(1);
		expect(explanations[0]).toMatchObject({
			factory: "design",
			status: "preset-projected",
			methods: ["class"],
			properties: ["$frame", "fill"],
			projectedTokenGroups: { colors: 1 },
		});
	});

	test("selects the callable core for aliased call-only factories", () => {
		const pruner = createRuntimePruningTransform();
		const result = pruner.transform(
			'import { createUnsafeCss as makeCss } from "pandwind/unsafe/css";\nconst css = makeCss();\nexport const styles = css({ color: "red" });',
			ID,
		);

		expect(result).not.toBeNull();
		// The inline snapshot intentionally contains quoted source-code strings.
		/* oxlint-disable no-useless-escape */
		expect(result?.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss as makeCss } from \"pandwind:runtime/css?methods=\";\nconst css = /* @__PURE__ */ makeCss();\nexport const styles = css({ color: \"red\" });"
	`);
		/* oxlint-enable no-useless-escape */
		expect(result?.code).toContain('methods="');
	});

	test("keeps only the methods that are used and includes group dependencies", () => {
		const pruner = createRuntimePruningTransform();
		const result = pruner.transform(
			'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\nexport const styles = css.group({ button: { color: "red" }, dynamic: (value: { color: string }) => ({ color: value.color }) });',
			ID,
		);

		expect(result?.code).toContain("methods=vars,group");
		const virtual = pruner.resolveId("pandwind:runtime/css?methods=vars,group");
		expect(virtual).not.toBeNull();
		const loaded = pruner.load(virtual!);
		expect(loaded).toBe(renderCssRuntimeModule(["vars", "group"]));
		expect(loaded).toContain("pandwind/_runtime/css-base");
		expect(loaded).toContain("pandwind/_runtime/css-vars");
		expect(loaded).toContain("pandwind/_runtime/css-group");
		expect(loaded).not.toContain("pandwind/_runtime/css-props");
	});

	test("does not optimize factories that escape their module", () => {
		const pruner = createRuntimePruningTransform();
		const source =
			'import { createUnsafeCss } from "pandwind/unsafe/css";\nexport const css = createUnsafeCss();';

		const exported = pruner.transform(source, ID);
		expect(exported?.code).toContain("/* @__PURE__ */ createUnsafeCss()");
		expect(exported?.code).not.toContain("pandwind:runtime/css");
		const used = pruner.transform(
			'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\nuse(css);',
			ID,
		);
		expect(used?.code).toContain("/* @__PURE__ */ createUnsafeCss()");
		expect(used?.code).not.toContain("pandwind:runtime/css");
	});

	test("projects serializable preset metadata for dynamic property calls", () => {
		const pruner = createRuntimePruningTransform({ preset: examplePreset });
		const source =
			'import { createCss } from "pandwind/css";\n' +
			'import { examplePreset } from "@pandwind/example-preset";\n' +
			"const css = createCss(examplePreset);\n" +
			"const color = getColor();\n" +
			"export const styles = css.class({ color });";

		const result = pruner.transform(source, ID);
		const virtualSource = result?.code.match(/pandwind:runtime\/css\?[^"']+/u)?.[0];
		expect(virtualSource).toContain("factory=preset");
		expect(virtualSource).toContain("slice=");
		expect(result?.code).toContain("createCss(undefined)");
		expect(result?.code).not.toContain('from "@pandwind/example-preset"');
		const virtual = pruner.resolveId(virtualSource!);
		expect(virtual).not.toBeNull();
		const loaded = pruner.load(virtual!);
		expect(loaded).toContain("createPresetCssRuntime({");
		expect(loaded).toContain('"$red-500"');
		expect(loaded).toContain('"$blue-600"');
	});

	test("projects design presets to the used token group and literal entry", () => {
		const pruner = createRuntimePruningTransform({ preset: examplePreset });
		const source =
			'import { createDesignCss } from "pandwind/design";\n' +
			'import { examplePreset } from "@pandwind/example-preset";\n' +
			"const css = createDesignCss(examplePreset);\n" +
			'export const styles = css.class({ $frame: { fill: "$red-500" } });';

		const result = pruner.transform(source, ID);
		const virtualSource = result?.code.match(/pandwind:runtime\/css\?[^"']+/u)?.[0];
		expect(virtualSource).toContain("factory=design");
		expect(virtualSource).toContain("slice=");
		expect(result?.code).toContain("createDesignCss(undefined)");
		expect(result?.code).not.toContain('from "@pandwind/example-preset"');
		const virtual = pruner.resolveId(virtualSource!);
		const loaded = pruner.load(virtual!);
		expect(loaded).toContain('"tokens":{"colors":{"$red-500"');
		expect(loaded).not.toContain('"$blue-600"');
		expect(loaded).not.toContain('"radii"');
		expect(loaded).not.toContain('"spacing"');
	});

	test("projects every candidate from a finite dynamic token expression", () => {
		const pruner = createRuntimePruningTransform({ preset: examplePreset });
		const source =
			'import { createDesignCss } from "pandwind/design";\n' +
			'import { examplePreset } from "@pandwind/example-preset";\n' +
			"const css = createDesignCss(examplePreset);\n" +
			"const tone = getTone();\n" +
			'const color = tone === "primary" ? "$blue-500" : "$red-500";\n' +
			'export const styles = css.class({ $frame: { fill: tone === "primary" ? "$blue-500" : "$red-500", stroke: color } });';

		const result = pruner.transform(source, ID);
		const virtualSource = result?.code.match(/pandwind:runtime\/css\?[^"']+/u)?.[0];
		const virtual = pruner.resolveId(virtualSource!);
		const loaded = pruner.load(virtual!);
		const explanation = explainRuntimePruning({ code: source, id: ID, preset: examplePreset });

		expect(loaded).toContain('"tokens":{"colors":{"$blue-500"');
		expect(loaded).toContain('"$red-500"');
		expect(loaded).not.toContain('"$gray-900"');
		expect(loaded).not.toContain('"$blue-600"');
		expect(explanation[0]).toMatchObject({
			status: "preset-projected",
			projectedTokenGroups: { colors: 2 },
		});
	});

	test("keeps a complete design token group for dynamic design values", () => {
		const pruner = createRuntimePruningTransform({ preset: examplePreset });
		const source =
			'import { createDesignCss } from "pandwind/design";\n' +
			'import { examplePreset } from "@pandwind/example-preset";\n' +
			"const css = createDesignCss(examplePreset);\n" +
			"const color = getColor();\n" +
			"export const styles = css.class({ $frame: { fill: color } });";

		const result = pruner.transform(source, ID);
		const virtualSource = result?.code.match(/pandwind:runtime\/css\?[^"']+/u)?.[0];
		const virtual = pruner.resolveId(virtualSource!);
		const loaded = pruner.load(virtual!);
		expect(loaded).toContain('"tokens":{"colors":');
		expect(loaded).toContain('"$blue-600"');
		expect(loaded).not.toContain('"radii"');
		expect(loaded).not.toContain('"spacing"');
	});

	test("keeps all design groups for a dynamic module object", () => {
		const pruner = createRuntimePruningTransform({ preset: examplePreset });
		const source =
			'import { createDesignCss } from "pandwind/design";\n' +
			'import { examplePreset } from "@pandwind/example-preset";\n' +
			"const css = createDesignCss(examplePreset);\n" +
			"const frame = getFrame();\n" +
			"export const styles = css.class({ $frame: frame });";

		const result = pruner.transform(source, ID);
		const virtualSource = result?.code.match(/pandwind:runtime\/css\?[^"']+/u)?.[0];
		const virtual = pruner.resolveId(virtualSource!);
		const loaded = pruner.load(virtual!);
		expect(loaded).toContain('"colors":');
		expect(loaded).toContain('"spacing":');
		expect(loaded).toContain('"radii":');
	});

	test("falls back for a dynamic raw style object", () => {
		const pruner = createRuntimePruningTransform({ preset: examplePreset });
		const source =
			'import { createCss } from "pandwind/css";\n' +
			'import { examplePreset } from "@pandwind/example-preset";\n' +
			"const css = createCss(examplePreset);\n" +
			"const raw = getStyle();\n" +
			"export const styles = css.class({ $raw: raw });";

		const result = pruner.transform(source, ID);
		expect(result?.code).toContain("factory=preset&methods=class");
		expect(result?.code).toContain("createCss(examplePreset)");
		expect(result?.code).not.toContain("slice=");
	});

	test("keeps the complete preset for dynamic style spreads", () => {
		const pruner = createRuntimePruningTransform({ preset: examplePreset });
		const source =
			'import { createCss } from "pandwind/css";\n' +
			'import { examplePreset } from "@pandwind/example-preset";\n' +
			"const css = createCss(examplePreset);\n" +
			"const style = getStyle();\n" +
			"export const styles = css.class({ ...style });";

		const result = pruner.transform(source, ID);
		expect(result?.code).toContain("factory=preset&methods=class");
		expect(result?.code).toContain("createCss(examplePreset)");
		expect(result?.code).toContain('from "@pandwind/example-preset"');
		expect(result?.code).not.toContain("slice=");
	});

	test("specializes preset-bound createCss without losing preset resolution", () => {
		const pruner = createRuntimePruningTransform();
		const source =
			'import { createCss } from "pandwind/css";\nconst css = createCss(preset);\nexport const styles = css.class({ color: "red" });';

		const result = pruner.transform(source, ID);
		expect(result?.code).toContain("factory=preset&methods=class");
		const virtual = pruner.resolveId("pandwind:runtime/css?factory=preset&methods=class");
		expect(virtual).not.toBeNull();
		const loaded = pruner.load(virtual!);
		expect(loaded).toContain("pandwind/_runtime/css-preset");
		expect(loaded).toContain("pandwind/_runtime/css-class");
		expect(loaded).not.toContain("pandwind/_runtime/css-vars");
	});

	test("specializes generated and design factories with their public factory identity", () => {
		const pruner = createRuntimePruningTransform();
		const generated = pruner.transform(
			'import { createGeneratedCss } from "pandwind/css/generated";\nconst css = createGeneratedCss(preset);\nconst animation = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
			ID,
		);
		expect(generated?.code).toContain("factory=generated&methods=keyframes");
		const generatedVirtual = pruner.resolveId(
			"pandwind:runtime/css?factory=generated&methods=keyframes",
		);
		expect(pruner.load(generatedVirtual!)).toContain("createGeneratedCss");

		const design = pruner.transform(
			'import { createDesignCss } from "pandwind/design";\nconst css = createDesignCss(preset);\nconst styles = css.class({ $frame: { fill: "red" } });',
			ID,
		);
		expect(design?.code).toContain("factory=design&methods=class");
		const designVirtual = pruner.resolveId("pandwind:runtime/css?factory=design&methods=class");
		expect(pruner.load(designVirtual!)).toContain("createDesignCss");
	});

	test("accepts explicit source-file extensions on package factory imports", () => {
		const pruner = createRuntimePruningTransform();
		const result = pruner.transform(
			'import { createCss } from "pandwind/css/create-css.ts";\nconst css = createCss(preset);\nconst styles = css.class({ color: "red" });',
			ID,
		);

		expect(result?.code).toContain("factory=preset&methods=class");
	});

	test("is wired into the bundler-agnostic css plugin", () => {
		const core = createCssExtractorPluginCore(examplePreset, { root: "/project" });
		const result = core.transform(
			'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\nexport const styles = css({ color: window.location.href });',
			ID,
		);

		expect(result?.code).toContain('pandwind:runtime/css?methods="');
		const virtual = core.resolveId('pandwind:runtime/css?methods="');
		expect(virtual).not.toBeNull();
		expect(core.load(virtual!)).toContain("pandwind/_runtime/css-base");
	});

	test("projects preset metadata through the bundler-agnostic css plugin", () => {
		const core = createCssExtractorPluginCore(examplePreset, { root: "/project" });
		const result = core.transform(
			'import { createCss } from "pandwind/css";\n' +
				'import { examplePreset } from "@pandwind/example-preset";\n' +
				"const css = createCss(examplePreset);\n" +
				"const color = getColor();\n" +
				"export const styles = css.class({ color });",
			ID,
		);

		expect(result?.code).toContain("factory=preset");
		expect(result?.code).toContain("slice=");
		expect(result?.code).not.toContain('from "@pandwind/example-preset"');
	});

	test("is also available from the general Vite plugin", async () => {
		const core = createInlineTwPluginCore();
		const result = await core.transform(
			'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\nexport const styles = css({ color: window.location.href });',
			ID,
		);

		expect(result?.code).toContain('pandwind:runtime/css?methods="');
		expect(core.load(core.resolveId('pandwind:runtime/css?methods="')!)).toContain(
			"pandwind/_runtime/css-base",
		);
	});
});
