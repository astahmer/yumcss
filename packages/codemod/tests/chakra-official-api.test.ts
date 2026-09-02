import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";

function migrate(
	source: string,
	from: CodemodAdapterId,
	to: CodemodAdapterId,
): AdapterMigrationResult {
	return runAdapterMigration(source, {
		from,
		to,
		file: "App.tsx",
		mode: "safe",
		semantic: { source: { framework: "react" } },
	});
}

describe("Chakra UI official API forms", () => {
	function expectStatic(result: AdapterMigrationResult): void {
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("className={defaultSystem.css");
		expect(result.code).not.toContain("className={system.css");
	}

	test("lowers style props", () => {
		const result = migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="red.200" p="4" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <Box className={css.class({ padding: "var(--chakra-spacing-4)", backgroundColor: "var(--chakra-colors-red-200)" })}/>;",
			  "converted": 1,
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			    },
			  ],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "differences": [],
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("lowers the css prop with nested selectors", () => {
		const result = migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box css={{ color: "red.200", "& svg": { color: "blue.200" } }} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <Box className={css.class({ color: "var(--chakra-colors-red-200)", "& svg": { color: "var(--chakra-colors-blue-200)" } })}/>;",
			  "converted": 1,
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			    },
			  ],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "differences": [],
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("lowers Chakra factory hosts", () => {
		const result = migrate(
			'import { chakra } from "@chakra-ui/react";\nexport const App = () => <chakra.button bg="blue.500" color="white" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { chakra } from "@chakra-ui/react";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <chakra.button className={css.class({ backgroundColor: "var(--chakra-colors-blue-500)", color: "white" })}/>;",
			  "converted": 1,
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			    },
			  ],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "differences": [],
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("lowers defaultSystem css interop", () => {
		const result = migrate(
			'import { defaultSystem } from "@chakra-ui/react";\nexport const card = defaultSystem.css({ color: "red.200", p: "4" });',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { defaultSystem } from "@chakra-ui/react";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const card = css.class({ padding: "var(--chakra-spacing-4)", color: "var(--chakra-colors-red-200)" });",
			  "converted": 1,
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			    },
			  ],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "differences": [],
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("lowers custom system css interop", () => {
		const result = migrate(
			'import { createSystem, defaultConfig } from "@chakra-ui/react";\nconst system = createSystem(defaultConfig);\nexport const card = system.css({ color: "red.200", p: "4" });',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createSystem, defaultConfig } from "@chakra-ui/react";
			import { createCss } from "pandwind/css";
			const css = createCss();
			const system = createSystem(defaultConfig);
			export const card = css.class({ padding: "var(--chakra-spacing-4)", color: "var(--chakra-colors-red-200)" });",
			  "converted": 1,
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			    },
			  ],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "differences": [],
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("preserves documented token helpers when they remain runtime expressions", () => {
		const result = migrate(
			'import { defaultSystem } from "@chakra-ui/react";\n' +
				'export const card = defaultSystem.css({ color: defaultSystem.token("colors.red.200"), backgroundColor: defaultSystem.token.var("colors.blue.200") });',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.outcomes[0]).toMatchObject({
			outcome: "host-runtime",
			representation: "target-native",
		});
		expect(result.code).toContain('defaultSystem.token("colors.red.200")');
		expect(result.code).toContain('defaultSystem.token.var("colors.blue.200")');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { defaultSystem } from "@chakra-ui/react";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const card = css.vars({ backgroundColor: defaultSystem.token.var("colors.blue.200"), color: defaultSystem.token("colors.red.200") });",
			  "converted": 1,
			  "outcomes": [
			    {
			      "outcome": "host-runtime",
			      "representation": "target-native",
			    },
			  ],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "differences": [],
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("keeps recipe and composition APIs explicit instead of flattening variants", () => {
		const sources = {
			defineRecipe:
				'import { defineRecipe } from "@chakra-ui/react";\n' +
				'export const button = defineRecipe({ base: { color: "white" }, variants: { size: { sm: { p: "2" } } } });',
			defineSlotRecipe:
				'import { defineSlotRecipe } from "@chakra-ui/react";\n' +
				'export const alert = defineSlotRecipe({ slots: ["title"], base: { title: { color: "red" } } });',
			cva: 'import { defaultSystem } from "@chakra-ui/react";\nexport const button = defaultSystem.cva({ base: { color: "white" } });',
			sva: 'import { defaultSystem } from "@chakra-ui/react";\nexport const alert = defaultSystem.sva({ slots: ["title"], base: { title: { color: "red" } } });',
			factory:
				'import { chakra } from "@chakra-ui/react";\n' +
				'export const Link = chakra("a", { base: { color: "red.500" } });',
			useRecipe:
				'import { useRecipe } from "@chakra-ui/react";\nexport const styles = useRecipe(button);',
			useSlotRecipe:
				'import { useSlotRecipe } from "@chakra-ui/react";\nexport const styles = useSlotRecipe(alert);',
		} as const;
		const results = Object.fromEntries(
			Object.entries(sources).map(([name, source]) => [
				name,
				migrate(source, CodemodAdapterId.ChakraUi, CodemodAdapterId.Pandwind),
			]),
		);

		for (const result of Object.values(results)) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBe(1);
			expect(result.residuals).toEqual([expect.objectContaining({ kind: "composition" })]);
			expect(result.code).toContain("pandwind:migrate-skip");
		}
		expect(
			Object.fromEntries(
				Object.entries(results).map(([name, result]) => [name, routeEvidence(result)]),
			),
		).toMatchInlineSnapshot(`
			{
			  "cva": {
			    "changed": true,
			    "code": "import { defaultSystem } from "@chakra-ui/react";
			export const button = // pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			defaultSystem.cva({ base: { color: "white" } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Chakra recipes and attached factory styles require explicit composition lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "defineRecipe": {
			    "changed": true,
			    "code": "import { defineRecipe } from "@chakra-ui/react";
			export const button = // pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			defineRecipe({ base: { color: "white" }, variants: { size: { sm: { p: "2" } } } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Chakra recipes and attached factory styles require explicit composition lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "defineSlotRecipe": {
			    "changed": true,
			    "code": "import { defineSlotRecipe } from "@chakra-ui/react";
			export const alert = // pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			defineSlotRecipe({ slots: ["title"], base: { title: { color: "red" } } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Chakra recipes and attached factory styles require explicit composition lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "factory": {
			    "changed": true,
			    "code": "import { chakra } from "@chakra-ui/react";
			export const Link = // pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			chakra("a", { base: { color: "red.500" } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Chakra recipes and attached factory styles require explicit composition lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "sva": {
			    "changed": true,
			    "code": "import { defaultSystem } from "@chakra-ui/react";
			export const alert = // pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			defaultSystem.sva({ slots: ["title"], base: { title: { color: "red" } } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Chakra recipes and attached factory styles require explicit composition lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "useRecipe": {
			    "changed": true,
			    "code": "import { useRecipe } from "@chakra-ui/react";
			export const styles = // pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			useRecipe(button);",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Chakra recipe usage requires explicit variant/component lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "useSlotRecipe": {
			    "changed": true,
			    "code": "import { useSlotRecipe } from "@chakra-ui/react";
			export const styles = // pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			useSlotRecipe(alert);",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Chakra slot recipe usage requires explicit variant/component lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			}
		`);
	});

	test("uses Chakra's documented style carriers when targeting Chakra", () => {
		const classHost = migrate(
			'import { css } from "pandwind/css";\nexport const App = () => <div className={css.class({ color: "red" })} />;',
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.ChakraUi,
		);
		const styledSubject = migrate(
			'import styled from "styled-components";\nconst Card = styled.div({ color: "red" });\nexport const App = () => <Card />;',
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.ChakraUi,
		);

		for (const result of [classHost, styledSubject]) {
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).not.toContain("chakraSystem.css");
			expect(result.code).not.toMatch(/className=\{\{[\s\S]*\}\}/u);
		}
		expect(classHost.code).toContain("<chakra.div");
		expect(classHost.code).toContain('css={{ color: "red" }}');
		expect(styledSubject.code).toContain("<chakra.div");
		expect(styledSubject.code).toContain('css={{ color: "red" }}');
		expect({ classHost: routeEvidence(classHost), styledSubject: routeEvidence(styledSubject) })
			.toMatchInlineSnapshot(`
			{
			  "classHost": {
			    "changed": true,
			    "code": "import { chakra } from "@chakra-ui/react";

			export const App = () => <chakra.div css={{ color: "red" }} />;",
			    "converted": 1,
			    "outcomes": [
			      {
			        "outcome": "static",
			        "representation": "static",
			      },
			    ],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  "styledSubject": {
			    "changed": true,
			    "code": "import { chakra } from "@chakra-ui/react";

			const Card = (props) => <chakra.div {...props} css={{ color: "red" }} />;
			export const App = () => <Card />;",
			    "converted": 1,
			    "outcomes": [
			      {
			        "outcome": "static",
			        "representation": "static",
			      },
			    ],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			}
		`);
	});
});
