import { expect, test } from "vitest";
import { BuiltinHostFramework, CodemodAdapterId } from "../src/swap/index.ts";
import {
	createAdapterRouteProject,
	createAdapterRouteSpec,
	routeEvidence,
} from "./route-spec-support.ts";

const pandaToLinaria = createAdapterRouteSpec(CodemodAdapterId.Panda, CodemodAdapterId.Linaria);
const mantineToLinaria = createAdapterRouteSpec(CodemodAdapterId.Mantine, CodemodAdapterId.Linaria);
const mantineToEmotion = createAdapterRouteSpec(CodemodAdapterId.Mantine, CodemodAdapterId.Emotion);
const mantineToChakra = createAdapterRouteSpec(CodemodAdapterId.Mantine, CodemodAdapterId.ChakraUi);
const mantineToMui = createAdapterRouteSpec(CodemodAdapterId.Mantine, CodemodAdapterId.Mui);
const mantineToUnoCSS = createAdapterRouteSpec(CodemodAdapterId.Mantine, CodemodAdapterId.UnoCSS);

test("A1 preserves unresolved Panda token references with a configuration residual", () => {
	const fixture = {
		input:
			'import { css } from "styled-system/css";\n' +
			'export const card = css({ color: "red.300", _hover: { color: "blue.300" } });',
		expectedOutput:
			'import { css } from "styled-system/css";\n' +
			"// pandwind:migrate-skip (route: panda -> linaria | parse-residual: configuration | available: named-map, residual)\n" +
			'export const card = css({ color: "red.300", _hover: { color: "blue.300" } });',
	};
	const result = pandaToLinaria.run({ source: fixture.input, file: "styles.ts" });

	expect(fixture).toMatchInlineSnapshot(`
		{
		  "expectedOutput": "import { css } from "styled-system/css";
		// pandwind:migrate-skip (route: panda -> linaria | parse-residual: configuration | available: named-map, residual)
		export const card = css({ color: "red.300", _hover: { color: "blue.300" } });",
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
			"// pandwind:migrate-skip (route: mantine -> linaria | parse-residual: configuration | available: named-map, residual)\n" +
			'export const App = () => <Box c="blue.6" mx="auto" maw={400} />;',
	};
	const result = mantineToLinaria.run({
		source: fixture.input,
		file: "App.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

	expect(fixture).toMatchInlineSnapshot(`
		{
		  "expectedOutput": "import { Box } from "@mantine/core";
		// pandwind:migrate-skip (route: mantine -> linaria | parse-residual: configuration | available: named-map, residual)
		export const App = () => <Box c="blue.6" mx="auto" maw={400} />;",
		  "input": "import { Box } from "@mantine/core";
		export const App = () => <Box c="blue.6" mx="auto" maw={400} />;",
		}
	`);
	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([expect.objectContaining({ kind: "configuration", text: "blue.6" })]),
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

test("A2 preserves Mantine source props when target validation rejects emitted CSS", async () => {
	const fixture = {
		input:
			'import { Box } from "@mantine/core";\n' +
			'export const App = () => <Box c="brand.0" mx="auto" maw={400} />;',
		expectedOutput:
			'import { Box } from "@mantine/core";\n' +
			"// pandwind:migrate-skip (route: mantine -> unocss | lowering-residual: configuration, validation)\n" +
			'export const App = () => <Box c="brand.0" mx="auto" maw={400} />;',
	};
	expect(fixture).toMatchInlineSnapshot(`
		{
		  "expectedOutput": "import { Box } from "@mantine/core";
		// pandwind:migrate-skip (route: mantine -> unocss | lowering-residual: configuration, validation)
		export const App = () => <Box c="brand.0" mx="auto" maw={400} />;",
		  "input": "import { Box } from "@mantine/core";
		export const App = () => <Box c="brand.0" mx="auto" maw={400} />;",
		}
	`);
	const result = await mantineToUnoCSS.runAsync({
		source: fixture.input,
		file: "App.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
		project: createAdapterRouteProject(
			CodemodAdapterId.Mantine,
			CodemodAdapterId.UnoCSS,
			"#2563eb",
		),
	});

	expect(result.code).toBe(fixture.expectedOutput);
	expect(result.converted).toBe(0);
	expect(result.skipped).toBe(1);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toContain("style=");
	expect(result.residuals.map((residual) => residual.kind)).toContain("validation");
	expect(routeEvidence(result)).toMatchInlineSnapshot(`
		{
		  "changed": true,
		  "code": "import { Box } from "@mantine/core";
		// pandwind:migrate-skip (route: mantine -> unocss | lowering-residual: configuration, validation)
		export const App = () => <Box c="brand.0" mx="auto" maw={400} />;",
		  "converted": 0,
		  "generatedFiles": [],
		  "loweringPlans": [
		    {
		      "applied": [
		        "token-fallback",
		        "dynamic-and-theme",
		      ],
		      "availableRepresentations": [
		        "static",
		        "named-map",
		        "residual",
		      ],
		      "representation": "static",
		      "residuals": [],
		    },
		  ],
		  "outcomes": [
		    {
		      "outcome": "residual",
		      "representation": "static",
		    },
		  ],
		  "residuals": [
		    {
		      "hint": "the official UnoCSS generator did not prove this emitted utility",
		      "kind": "configuration",
		      "preserved": undefined,
		    },
		    {
		      "hint": "canonical CSS differs or has residuals",
		      "kind": "validation",
		      "preserved": undefined,
		    },
		  ],
		  "skipped": 1,
		  "validations": [
		    {
		      "differences": [
		        "canonical CSS differs or has residuals",
		      ],
		      "lossiness": "unsupported",
		      "valid": false,
		    },
		  ],
		}
	`);
});

test("A4 keeps Mantine hosts valid across Emotion, Chakra, and MUI routes", () => {
	const fixture = {
		input: `import { Box } from "@mantine/core";
export const App = () => <Box c="#123456" />;`,
		emotionOutput:
			'import { Box } from "@mantine/core";\n' +
			'import { css } from "@emotion/css";\n' +
			'export const App = () => <Box className={css({ color: "#123456" })}/>;',
		chakraOutput:
			'import { Box } from "@mantine/core";\n' +
			"// pandwind:migrate-skip (route: mantine -> chakra-ui | lowering-residual: host-framework | available: static, named-map, residual)\n" +
			'export const App = () => <Box c="#123456" />;',
		muiOutput:
			'import { Box } from "@mantine/core";\n' +
			"// pandwind:migrate-skip (route: mantine -> mui | lowering-residual: host-framework | available: static, named-map, residual)\n" +
			'export const App = () => <Box c="#123456" />;',
	};
	const options = {
		source: fixture.input,
		file: "App.tsx",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	};
	const emotion = mantineToEmotion.run(options);
	const chakra = mantineToChakra.run(options);
	const mui = mantineToMui.run(options);

	expect(fixture).toMatchInlineSnapshot(`
		{
		  "chakraOutput": "import { Box } from "@mantine/core";
		// pandwind:migrate-skip (route: mantine -> chakra-ui | lowering-residual: host-framework | available: static, named-map, residual)
		export const App = () => <Box c="#123456" />;",
		  "emotionOutput": "import { Box } from "@mantine/core";
		import { css } from "@emotion/css";
		export const App = () => <Box className={css({ color: "#123456" })}/>;",
		  "input": "import { Box } from "@mantine/core";
		export const App = () => <Box c="#123456" />;",
		  "muiOutput": "import { Box } from "@mantine/core";
		// pandwind:migrate-skip (route: mantine -> mui | lowering-residual: host-framework | available: static, named-map, residual)
		export const App = () => <Box c="#123456" />;",
		}
	`);
	expect(emotion.converted).toBe(1);
	expect(emotion.skipped).toBe(0);
	expect(emotion.residuals).toEqual([]);
	expect(emotion.code).toBe(fixture.emotionOutput);
	expect(emotion.code).toContain('import { Box } from "@mantine/core";');
	expect(emotion.code).toContain('import { css } from "@emotion/css";');
	expect(emotion.code).toContain('<Box className={css({ color: "#123456" })}');
	expect(emotion.code).not.toContain("export const App = () => css(");
	expect(emotion.code).not.toContain('c="#123456"');

	for (const { result, expectedOutput, targetImport } of [
		{ result: chakra, expectedOutput: fixture.chakraOutput, targetImport: "@chakra-ui/react" },
		{ result: mui, expectedOutput: fixture.muiOutput, targetImport: "@mui/material" },
	]) {
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "host-framework" })]),
		);
		expect(result.code).toBe(expectedOutput);
		expect(result.code).toContain('import { Box } from "@mantine/core";');
		expect(result.code).toContain('<Box c="#123456" />;');
		expect(result.code).not.toContain(`from "${targetImport}"`);
	}
});
