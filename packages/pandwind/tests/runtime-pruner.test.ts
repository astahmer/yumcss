import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { createCssExtractorPluginCore } from "../src/vite/css-core.ts";
import { createInlineTwPluginCore } from "../src/vite/index.ts";
import { renderCssRuntimeModule } from "../src/css/runtime-codegen.ts";
import { createRuntimePruningTransform } from "../src/vite/runtime-pruner.ts";

const ID = "/project/src/styles.ts";

describe("runtime pruning", () => {
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
		"import { createUnsafeCss as makeCss } from \"pandwind:runtime/css?methods=\";\nconst css = makeCss();\nexport const styles = css({ color: \"red\" });"
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

		expect(pruner.transform(source, ID)).toBeNull();
		expect(
			pruner.transform(
				'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\nuse(css);',
				ID,
			),
		).toBeNull();
	});

	test("does not replace preset-bound createCss with an unbound runtime", () => {
		const pruner = createRuntimePruningTransform();
		const source =
			'import { createCss } from "pandwind/css";\nconst css = createCss(preset);\nexport const styles = css({ color: runtimeColor });';

		expect(pruner.transform(source, ID)).toBeNull();
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
