import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import { NODE_PROJECT_MODULE_LOADER } from "../src/swap/project-module-loader.ts";

const projectRoot = fileURLToPath(new URL("../../..", import.meta.url));
const adapterRegistry = createBuiltinCodemodCatalog(NODE_PROJECT_MODULE_LOADER).registry;

const cases = [
	{
		name: "Sass variables and nesting",
		adapter: CodemodAdapterId.Sass,
		file: "src/card.scss",
		source: "$brand: red;\n.card { color: $brand; padding: 1rem; &__title { font-weight: 600; } }",
		expectations: ["color: red", "font-weight: 600"],
	},
	{
		name: "Less variables and nesting",
		adapter: CodemodAdapterId.Less,
		file: "src/card.less",
		source: "@brand: red;\n.card { color: @brand; padding: 1rem; &__title { font-weight: 600; } }",
		expectations: ["color: red", "font-weight: 600"],
	},
	{
		name: "Sass mixins and module functions",
		adapter: CodemodAdapterId.Sass,
		file: "src/card.scss",
		source:
			'@use "sass:math";\n@mixin flex($gap) { display: flex; gap: $gap; }\n.card { @include flex(math.div(16px, 2)); }',
		expectations: ["display: flex", "gap: 8px"],
	},
	{
		name: "Less mixin call",
		adapter: CodemodAdapterId.Less,
		file: "src/card.less",
		source: ".shadow() { box-shadow: 0 1px 2px black; }\n.card { .shadow(); color: red; }",
		expectations: ["box-shadow: 0 1px 2px black", "color: red"],
	},
] as const;

describe("official stylesheet compiler integrations", () => {
	test.each(cases)("lowers $name through the installed compiler", async (testCase) => {
		const result = await runAdapterMigrationAsync(testCase.source, {
			from: testCase.adapter,
			to: CodemodAdapterId.AuthoredCss,
			file: testCase.file,
			root: projectRoot,
			readFile: () => undefined,
			listFiles: () => [],
			adapterRegistry,
			mode: "safe",
		});

		expect(result.converted, testCase.name).toBeGreaterThan(0);
		expect(result.skipped, testCase.name).toBe(0);
		expect(result.residuals, testCase.name).toEqual([]);
		expect(result.outputExtension, testCase.name).toBe(".css");
		expect(result.code, testCase.name).not.toContain("yumcss:migrate-skip");
		for (const expected of testCase.expectations)
			expect(result.code, testCase.name).toContain(expected);
		expect(result.code, testCase.name).not.toMatch(
			/(?:\$brand|@brand|@include|\.shadow\(\)|&__title)/u,
		);
	});
});
