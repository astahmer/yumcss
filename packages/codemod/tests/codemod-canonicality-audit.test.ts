import { expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import { createAdapterRouteSpec } from "./route-spec-support.ts";

const pandaToLinaria = createAdapterRouteSpec(CodemodAdapterId.Panda, CodemodAdapterId.Linaria);

test("A1 preserves unresolved Panda token references with a configuration residual", () => {
	const fixture = {
		input:
			'import { css } from "styled-system/css";\n' +
			'export const card = css({ color: "red.300", _hover: { color: "blue.300" } });',
		expectedOutput:
			'import { css } from "styled-system/css";\n' +
			"export const card = // pandwind:migrate-skip (route: panda -> linaria | parse-residual: configuration | available: named-map, residual)\n" +
			'css({ color: "red.300", _hover: { color: "blue.300" } });',
	};
	const result = pandaToLinaria.run({ source: fixture.input, file: "styles.ts" });

	expect(fixture).toMatchInlineSnapshot(`
		{
		  "expectedOutput": "import { css } from "styled-system/css";
		export const card = // pandwind:migrate-skip (route: panda -> linaria | parse-residual: configuration | available: named-map, residual)
		css({ color: "red.300", _hover: { color: "blue.300" } });",
		  "input": "import { css } from "styled-system/css";
		export const card = css({ color: "red.300", _hover: { color: "blue.300" } });",
		}
	`);
	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: "configuration", text: "red.300" }),
			expect.objectContaining({ kind: "configuration", text: "blue.300" }),
		]),
	);
	expect(result.code).toBe(fixture.expectedOutput);
	expect(result.code).toContain('import { css } from "styled-system/css";');
	expect(result.code).toContain('color: "red.300"');
	expect(result.code).toContain('color: "blue.300"');
	expect(result.code).not.toContain('import { css } from "@linaria/core";');
});
