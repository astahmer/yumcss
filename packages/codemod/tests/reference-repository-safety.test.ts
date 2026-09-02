import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createPandaAdapter,
	createStyleAdapterRegistry,
	runAdapterMigration,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const catalog = createBuiltinCodemodCatalog();

const pandaLoader: ProjectModuleLoader = {
	async importPackage(packageName) {
		if (packageName === "@pandacss/config")
			return {
				loadConfig: async () => ({ config: { conditions: { _hover: "&:hover" } } }),
			} as never;
		if (packageName === "@pandacss/is-valid-prop")
			return {
				isCssProperty: (value: string) => ["color", "backgroundColor"].includes(value),
			} as never;
		return undefined;
	},
	async importFile() {
		return undefined;
	},
};

const registry = createStyleAdapterRegistry([
	createPandaAdapter({ moduleLoader: pandaLoader }),
	catalog.registry.get(CodemodAdapterId.Pandwind)!,
]);

async function migrate(source: string, from: CodemodAdapterId) {
	return runAdapterMigrationAsync(source, {
		from,
		to: CodemodAdapterId.Pandwind,
		file: "App.tsx",
		root: "/project",
		adapterRegistry: registry,
		readFile: (file) => (file.endsWith("panda.config.ts") ? "export default {};" : undefined),
		listFiles: () => ["/project/panda.config.ts"],
	});
}

function migrateSync(source: string, from: CodemodAdapterId) {
	return runAdapterMigration(source, {
		from,
		to: CodemodAdapterId.Pandwind,
		file: "App.tsx",
		adapterRegistry: catalog.registry,
		readFile: () => undefined,
	});
}

describe("reference-repository migration safety", () => {
	test("does not guess unknown Panda JSX props without official or generated metadata", () => {
		const source = `import { styled } from "styled-system/jsx";

export const Button = () => <styled.button color="red" customState="ready" />;`;
		const result = migrateSync(source, CodemodAdapterId.Panda);

		expect(result.converted).toBe(0);
		expect(result.code).toBe(source);
		expect(result.code).toMatchInlineSnapshot(`
			"import { styled } from \"styled-system/jsx\";

			export const Button = () => <styled.button color=\"red\" customState=\"ready\" />;"
		`);
	});

	test("lowers Panda JSX style-prop hosts to intrinsic Pandwind hosts", async () => {
		const source = `import React from "react";
import { styled } from "styled-system/jsx";

const Button = () => <styled.button color="red" />;`;
		const result = await migrate(source, CodemodAdapterId.Panda);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain('from "styled-system/jsx"');
		expect(result.code).toContain('<button className={css.class({ color: "red" })} />');
		expect(result.code).toMatchInlineSnapshot(`
		"import React from \"react\";
		import { createCss } from \"pandwind/css\";
		const css = createCss();


		const Button = () => <button className={css.class({ color: \"red\" })} />;"
	`);
	});

	test("handles aliased Panda styled factories and preserves ordinary JSX attributes", async () => {
		const source = `import { styled as pandaStyled } from "styled-system/jsx";

export const Button = () =>
		<pandaStyled.button bg="tomato" color="red" _hover={{ color: "blue" }} data-testid="button" disabled />;`;
		const result = await migrate(source, CodemodAdapterId.Panda);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("pandaStyled");
		expect(result.code).toMatchInlineSnapshot(`
		"import { createCss } from \"pandwind/css\";
		const css = createCss();


		export const Button = () =>
		\t\t<button data-testid=\"button\" disabled className={css.class({ backgroundColor: \"tomato\", color: \"red\", \"&:hover\": { color: \"blue\" } })} />;"
	`);
	});

	test("converts the supported styled-components template form without leaving its import", () => {
		const source = `import React from "react";
import styled from "styled-components";

const Card = styled.button\`color: red;\`;
export const App = () => <Card />;`;
		const result = migrateSync(source, CodemodAdapterId.StyledComponents);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("styled-components");
		expect(result.code).toContain('import { createCss } from "pandwind/css";');
		expect(result.code).toMatchInlineSnapshot(`
		"import React from \"react\";
		import { createCss } from \"pandwind/css\";
		const css = createCss();


		const Card = css.class({ color: \"red\" });
		export const App = () => <button className={Card} />;"
	`);
	});
});
