import { expect, test } from "vitest";
import { BuiltinHostFramework, CodemodAdapterId } from "../src/swap/index.ts";
import { createAdapterRouteSpec } from "./route-spec-support.ts";

const pandaToLinaria = createAdapterRouteSpec(CodemodAdapterId.Panda, CodemodAdapterId.Linaria);
const mantineToLinaria = createAdapterRouteSpec(CodemodAdapterId.Mantine, CodemodAdapterId.Linaria);

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

test("A2 preserves unresolved Mantine theme values with a configuration residual", () => {
	const fixture = {
		input:
			'import { Box } from "@mantine/core";\n' +
			'export const App = () => <Box c="blue.6" mx="auto" maw={400} />;',
		expectedOutput:
			'import { Box } from "@mantine/core";\n' +
			"export const App = () => // pandwind:migrate-skip (route: mantine -> linaria | parse-residual: configuration | available: style-prop, residual)\n" +
			'<Box c="blue.6" mx="auto" maw={400} />;',
	};
	const result = mantineToLinaria.run({
		source: fixture.input,
		file: "App.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(fixture).toMatchInlineSnapshot(`
		{
		  "expectedOutput": "import { Box } from "@mantine/core";
		export const App = () => // pandwind:migrate-skip (route: mantine -> linaria | parse-residual: configuration | available: style-prop, residual)
		<Box c="blue.6" mx="auto" maw={400} />;",
		  "input": "import { Box } from "@mantine/core";
		export const App = () => <Box c="blue.6" mx="auto" maw={400} />;",
		}
	`);
	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: "configuration", text: "blue.6" }),
		]),
	);
	expect(result.code).toBe(fixture.expectedOutput);
	expect(result.code).toContain('c="blue.6"');
	expect(result.code).toContain('mx="auto"');
	expect(result.code).toContain("maw={400}");
	expect(result.code).not.toContain('import { css } from "@linaria/core";');
	expect(result.code).not.toContain("--mantine-spacing-auto");
	expect(result.code).not.toContain("max-width: 400;");
});

test("A2 maps Mantine auto spacing and numeric dimensions to CSS semantics", () => {
	const fixture = {
		input:
			'import { Box } from "@mantine/core";\n' +
			'export const App = () => <Box c="#123456" mx="auto" maw={400} />;',
		expectedOutput:
			'import { Box } from "@mantine/core";\n' +
			'import { css } from "@linaria/core";\n' +
			"export const App = () => <Box className={css`color: #123456; margin-inline: auto; max-width: calc(25rem * var(--mantine-scale));`}/>;",
	};
	const result = mantineToLinaria.run({
		source: fixture.input,
		file: "App.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(fixture).toMatchInlineSnapshot(`
		{
		  "expectedOutput": "import { Box } from "@mantine/core";
		import { css } from "@linaria/core";
		export const App = () => <Box className={css\`color: #123456; margin-inline: auto; max-width: calc(25rem * var(--mantine-scale));\`}/>;",
		  "input": "import { Box } from "@mantine/core";
		export const App = () => <Box c="#123456" mx="auto" maw={400} />;",
		}
	`);
	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toBe(fixture.expectedOutput);
	expect(result.code).toContain("margin-inline: auto");
	expect(result.code).toContain("max-width: calc(25rem * var(--mantine-scale))");
	expect(result.code).not.toContain("--mantine-spacing-auto");
	expect(result.code).not.toContain("max-width: 400;");
});
