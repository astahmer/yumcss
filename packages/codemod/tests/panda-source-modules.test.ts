import { describe, expect, it } from "vitest";
import { CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";
import {
	PANDA_ENTRYPOINTS,
	pandaSourceModuleOwnershipFromContext,
	resolvePandaSourceModuleOwnership,
} from "../src/swap/adapters/panda/source-modules.ts";

const root = "/virtual/front";

describe("Panda generated-system source ownership", () => {
	it("derives entry points from importMap and ignores unrelated package imports", () => {
		const ownership = resolvePandaSourceModuleOwnership({
			importMap: "#design-system",
			packageImports: [
				{ specifier: "#generated/*", target: "./styled-system/dist/*" },
				{ specifier: "#ui/*", target: "./src/components/*" },
			],
		});

		for (const entrypoint of PANDA_ENTRYPOINTS) {
			expect(ownership.modules).toContain(`#design-system/${entrypoint}`);
			expect(ownership.modules).toContain(`#generated/${entrypoint}`);
			expect(ownership.modules).not.toContain(`#ui/${entrypoint}`);
		}
		expect(
			ownership.semanticMatchers?.some((matcher) =>
				matcher("#design-system/css", "styled-system/css"),
			),
		).toBe(true);
	});

	it("reads package.json imports at the project root and config importMap", () => {
		const files = new Map([
			[
				`${root}/panda.config.ts`,
				"export default { outdir: './generated', importMap: '#project-system' }",
			],
		]);
		const ownership = pandaSourceModuleOwnershipFromContext({
			root,
			packageJson: {
				imports: {
					"#project-system/*": "./generated/*",
					"#ui/*": "./src/components/*",
				},
			},
			readFile: (file) => files.get(file),
		});

		expect(ownership.modules).toContain("#project-system/css");
		expect(ownership.modules).toContain("#project-system/recipes");
		expect(ownership.modules).not.toContain("#ui/css");
	});

	it("migrates a custom package.json Panda alias", () => {
		const source = [
			'import { css as pandaCss } from "#design-system/css";',
			"export const card = pandaCss({ color: 'red.500', padding: '4' });",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
			file: `${root}/card.tsx`,
			root,
			packageJson: {
				imports: {
					"#design-system/*": "./styled-system/dist/*",
					"#ui/*": "./src/components/*",
				},
			},
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { createCss } from "pandwind/css";');
		expect(result.code).toContain("css.class");
		expect(result.code).not.toContain("#design-system/css");
	});

	it("migrates a custom Panda importMap without package.json aliases", () => {
		const files = new Map([
			[`${root}/panda.config.ts`, "export default { importMap: '#team-system' }"],
		]);
		const source = [
			'import { css as pandaCss } from "#team-system/css";',
			"export const card = pandaCss({ display: 'grid' });",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
			file: `${root}/card.tsx`,
			root,
			readFile: (file) => files.get(file),
		});

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("#team-system/css");
		expect(result.code).toContain("css.class");
	});

	it("keeps mixed Chakra and custom Panda migration order-independent", () => {
		const source = [
			'import { Box } from "@chakra-ui/react";',
			'import { css as pandaCss } from "#design-system/css";',
			'export const App = () => <Box p="4" />;',
			"export const card = pandaCss({ color: 'red.500' });",
		].join("\n");
		const options = {
			file: `${root}/app.tsx`,
			root,
			packageJson: {
				imports: { "#design-system/*": "./styled-system/dist/*" },
			},
		} as const;
		const chakraFirst = runAdapterMigration(source, {
			...options,
			from: CodemodAdapterId.ChakraUi,
			to: CodemodAdapterId.Pandwind,
		});
		const chakraThenPanda = runAdapterMigration(chakraFirst.code, {
			...options,
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
		});
		const pandaFirst = runAdapterMigration(source, {
			...options,
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
		});
		const pandaThenChakra = runAdapterMigration(pandaFirst.code, {
			...options,
			from: CodemodAdapterId.ChakraUi,
			to: CodemodAdapterId.Pandwind,
		});

		expect(chakraThenPanda.residuals).toEqual([]);
		expect(pandaThenChakra.residuals).toEqual([]);
		expect(chakraThenPanda.code).toBe(pandaThenChakra.code);
	});
});
