import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

function migrate(source: string, from: CodemodAdapterId) {
	return runAdapterMigration(source, {
		from,
		to: CodemodAdapterId.Pandwind,
		file: "App.tsx",
		adapterRegistry: catalog.registry,
		readFile: () => undefined,
	});
}

describe("reference-repository migration safety", () => {
	test("lowers Panda JSX style-prop hosts to intrinsic Pandwind hosts", () => {
		const source = `import React from "react";
import { styled } from "styled-system/jsx";

const Button = () => <styled.button color="red" />;`;
		const result = migrate(source, CodemodAdapterId.Panda);

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

	test("handles aliased Panda styled factories and preserves ordinary JSX attributes", () => {
		const source = `import { styled as pandaStyled } from "styled-system/jsx";

export const Button = () =>
		<pandaStyled.button bg="tomato" color="red" _hover={{ color: "blue" }} data-testid="button" disabled />;`;
		const result = migrate(source, CodemodAdapterId.Panda);

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
		const result = migrate(source, CodemodAdapterId.StyledComponents);

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
