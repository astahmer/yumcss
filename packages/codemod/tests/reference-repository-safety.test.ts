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
	test("preserves Panda JSX style-prop sources as an explicit residual", () => {
		const source = `import React from "react";
import { styled } from "styled-system/jsx";

const Button = () => <styled.button color="red" />;`;
		const result = migrate(source, CodemodAdapterId.Panda);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual([
			expect.objectContaining({
				kind: "unmatched-source",
				hint: expect.stringContaining("no supported style construct"),
			}),
		]);
		expect(result.code).toContain('import { styled } from "styled-system/jsx";');
		expect(result.code).toMatchInlineSnapshot(`
		"// pandwind:migrate-skip (route: panda -> pandwind | lowering-residual: unmatched-source)
		import React from \"react\";
		import { styled } from \"styled-system/jsx\";

		const Button = () => <styled.button color=\"red\" />;"
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
