import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	AdapterCapabilityTag,
	BuiltinHostFramework,
	CodemodAdapterId,
	createChakraAdapter,
	runAdapterMigrationAsync,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import {
	createAdapterRouteProject,
	createAdapterRouteSpec,
	createInstalledChakraRouteProject,
	routeEvidence,
} from "./route-spec-support.ts";

const projectRoot = resolve(import.meta.dirname, "..");

const migrate = (
	source: string,
	from: CodemodAdapterId,
	to: CodemodAdapterId,
): Promise<AdapterMigrationResult> =>
	runAdapterMigrationAsync(source, {
		from,
		to,
		file: "src/App.tsx",
		root: projectRoot,
		mode: "safe",
		semantic: { source: { framework: "react" } },
	});

describe("Chakra migration audit", () => {
	test("uses the configured Tailwind color variable without changing Chakra background semantics", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.Tailwind);
		const project = createAdapterRouteProject(
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Tailwind,
			"#2a57c8",
		);
		const result = await route.runAsync({
			source:
				'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="brand.500" />;',
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
			project,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("[background:var(--color-brand)]");
		expect(result.code).not.toContain("#2a57c8");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			export const App = () => <Box className={"[background:var(--color-brand)]"}/>;",
			  "converted": 1,
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

	test("uses a configured Tokenami color token for Chakra background", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.Tokenami);
		const project = createAdapterRouteProject(
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Tokenami,
			"#2a57c8",
		);
		const result = await route.runAsync({
			source:
				'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="brand.500" />;',
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
			project,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"--background": "var(--color_brand)"');
		expect(result.code).not.toContain("brand.500");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			import { css } from "@tokenami/css";
			export const App = () => <Box style={css({ "--background": "var(--color_brand)" })} />;",
			  "converted": 1,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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

	test("uses a configured UnoCSS color utility for Chakra backgroundColor", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.UnoCSS);
		const project = createAdapterRouteProject(
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.UnoCSS,
			"#2a57c8",
		);
		const result = await route.runAsync({
			source:
				'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box backgroundColor="brand.500" />;',
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
			project,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("bg-brand");
		expect(result.code).not.toContain("#2a57c8");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			export const App = () => <Box className={"bg-brand"}/>;",
			  "converted": 1,
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

	test("keeps Chakra background shorthand when UnoCSS only has a background-color token", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.UnoCSS);
		const project = createAdapterRouteProject(
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.UnoCSS,
			"#2a57c8",
		);
		const result = await route.runAsync({
			source:
				'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="brand.500" />;',
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
			project,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("[background:#2a57c8]");
		expect(result.code).not.toContain("bg-brand");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			export const App = () => <Box className={"[background:#2a57c8]"}/>;",
			  "converted": 1,
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

	test("materializes verified Chakra tokens for targets without a token policy", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.Emotion);
		const result = await route.runAsync({
			source:
				'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="red.200" p="4" />;',
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
			project: createInstalledChakraRouteProject(),
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('background: "#fecaca"');
		expect(result.code).toContain('padding: "1rem"');
		expect(result.code).not.toContain("red.200");
		expect(result.code).not.toContain('p="4"');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			import { css } from "@emotion/css";
			export const App = () => <Box className={css({ background: "#fecaca", padding: "1rem" })}/>;",
			  "converted": 1,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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

	test("resolves Chakra token groups from the official utility system", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.Emotion);
		const result = await route.runAsync({
			source:
				'import { Box } from "@chakra-ui/react";\n' +
				'export const App = () => <Box transitionDuration="fast" transitionTimingFunction="ease-in" aspectRatio="square" zIndex="docked" />;',
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
			project: createInstalledChakraRouteProject(),
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('transitionDuration: "150ms"');
		expect(result.code).toContain('transitionTimingFunction: "cubic-bezier(0.42, 0, 1, 1)"');
		expect(result.code).toContain('aspectRatio: "1 / 1"');
		expect(result.code).toContain('zIndex: "10"');
		expect(result.code).not.toMatch(/(?:fast|ease-in|square|docked)/u);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			import { css } from "@emotion/css";
			export const App = () => <Box className={css({ aspectRatio: "1 / 1", transitionDuration: "150ms", transitionTimingFunction: "cubic-bezier(0.42, 0, 1, 1)", zIndex: "10" })}/>;",
			  "converted": 1,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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

	test("preserves Tokenami custom properties when migrating into Chakra", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.Tokenami, CodemodAdapterId.ChakraUi);
		const result = await route.runAsync({
			source:
				'import { css } from "@tokenami/css";\n' +
				'export const card = css({ "---card-gap": "1rem" });',
			file: "Card.tsx",
			project: createInstalledChakraRouteProject(),
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"--card-gap": "1rem"');
		expect(result.code).not.toContain("cardGap");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { defaultSystem } from "@chakra-ui/react";

			export const card = defaultSystem.css({ "--card-gap": "1rem" });",
			  "converted": 1,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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

	test("keeps unresolved Chakra tokens as typed residuals for foreign targets", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.Emotion);
		const source =
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box color="brand.999" />;';
		const result = await route.runAsync({
			source,
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
			project: createInstalledChakraRouteProject(),
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: AdapterCapabilityTag.TokenValues, text: "brand.999" }),
			]),
		);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain(source.split("\n")[1]);
		expect(result.code).not.toContain('color: "brand.999"');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			// pandwind:migrate-skip (route: chakra-ui -> emotion | lowering-residual: token-values, validation)
			export const App = () => <Box color="brand.999" />;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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
			      "hint": "source token brand.999 has no verified target value",
			      "kind": "token-values",
			      "preserved": undefined,
			    },
			    {
			      "hint": "1 residual conversion(s)",
			      "kind": "validation",
			      "preserved": undefined,
			    },
			  ],
			  "skipped": 1,
			  "validations": [
			    {
			      "differences": [
			        "1 residual conversion(s)",
			      ],
			      "lossiness": "lossy",
			      "valid": false,
			    },
			  ],
			}
		`);
	});

	test("does not guess a configured Tokenami token for an unresolved Chakra value", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.Tokenami);
		const project = createAdapterRouteProject(
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Tokenami,
			"#2a57c8",
		);
		const source =
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box color="brand.999" />;';
		const result = await route.runAsync({
			source,
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
			project,
		});

		expect(project.loaderCalls.packages).toContain("@tokenami/css");
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: AdapterCapabilityTag.TokenValues, text: "brand.999" }),
			]),
		);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain(source.split("\n")[1]);
		expect(result.code).not.toContain("$colors.brand");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			// pandwind:migrate-skip (route: chakra-ui -> tokenami | lowering-residual: token-values, validation)
			export const App = () => <Box color="brand.999" />;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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
			      "hint": "source token brand.999 has no verified target value",
			      "kind": "token-values",
			      "preserved": undefined,
			    },
			    {
			      "hint": "1 residual conversion(s)",
			      "kind": "validation",
			      "preserved": undefined,
			    },
			  ],
			  "skipped": 1,
			  "validations": [
			    {
			      "differences": [
			        "1 residual conversion(s)",
			      ],
			      "lossiness": "lossy",
			      "valid": false,
			    },
			  ],
			}
		`);
	});

	test("keeps a literal when a configured Chakra color duplicates a default token", async () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.Aphrodite, CodemodAdapterId.ChakraUi);
		const project = createAdapterRouteProject(
			CodemodAdapterId.Aphrodite,
			CodemodAdapterId.ChakraUi,
			"#2563eb",
		);
		const result = await route.runAsync({
			source:
				'import { StyleSheet } from "aphrodite";\nexport const styles = StyleSheet.create({ card: { color: "#2563eb" } });',
			file: "styles.ts",
			project,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "#2563eb"');
		expect(result.code).not.toContain("brand.500");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { defaultSystem } from "@chakra-ui/react";
			export const styles = { "card": defaultSystem.css({ color: "#2563eb" }) };",
			  "converted": 1,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "static",
			        "named-map",
			        "residual",
			      ],
			      "representation": "named-map",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "target-native",
			      "representation": "named-map",
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

	test("loads the installed default theme for Chakra to Pandwind", async () => {
		const result = await migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="red.200" p="4" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('background: "#fecaca"');
		expect(result.code).toContain('padding: "1rem"');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ background: "#fecaca", padding: "1rem" })} />;",
			  "converted": 1,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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

	test("keeps a completed Chakra to Pandwind migration stable on rerun", async () => {
		const first = await migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="red.200" p="4" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);
		const second = await migrate(first.code, CodemodAdapterId.Pandwind, CodemodAdapterId.Pandwind);

		expect(first.converted).toBe(1);
		expect(first.residuals).toEqual([]);
		expect(second.changed).toBe(false);
		expect(second.converted).toBe(0);
		expect(second.residuals).toEqual([]);
		expect(second.code).toBe(first.code);
		expect(routeEvidence(second)).toMatchInlineSnapshot(`
			{
			  "changed": false,
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ background: "#fecaca", padding: "1rem" })} />;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [],
			  "outcomes": [],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [],
			}
		`);
	});

	test("preserves unknown Chakra tokens with a typed residual", async () => {
		const source =
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box color="brand.999" />;';
		const result = await migrate(source, CodemodAdapterId.ChakraUi, CodemodAdapterId.Pandwind);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "token-values",
					hint: expect.stringContaining("token"),
				}),
			]),
		);
		expect(result.code).toContain('color="brand.999"');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Box } from "@chakra-ui/react";
			// pandwind:migrate-skip (route: chakra-ui -> pandwind | lowering-residual: emission-empty, token-values | available: static, named-map, residual)
			export const App = () => <Box color="brand.999" />;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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
			      "hint": "target adapter produced no representable output",
			      "kind": "emission-empty",
			      "preserved": undefined,
			    },
			    {
			      "hint": "source token brand.999 has no verified target value",
			      "kind": "token-values",
			      "preserved": undefined,
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});

	test("keeps CSS zero literal when Chakra metadata is unavailable", () => {
		const adapter = createChakraAdapter();
		const source = "defaultSystem.css({ gap: 0 });";
		const parsed = adapter.parse(source, {
			file: "src/styles.ts",
			source,
			targetId: CodemodAdapterId.Pandwind,
			config: { adapter: CodemodAdapterId.ChakraUi, files: [], values: {} },
		});
		const declarations = parsed.matches[0]?.program.declarations ?? [];

		expect(declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: "gap",
					value: { kind: "literal", value: 0 },
				}),
			]),
		);
		expect(parsed.matches[0]?.program.residuals).toEqual([]);
		expect(declarations).toMatchInlineSnapshot(`
			[
			  {
			    "conditions": [],
			    "property": "gap",
			    "value": {
			      "kind": "literal",
			      "value": 0,
			    },
			  },
			]
		`);
	});

	test("preserves Chakra JSX props when the style property system is unavailable", () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.Bamboo);
		const source =
			'import { Box } from "@chakra-ui/react";\n' +
			"export const App = () => <Box bg={theme.foreground} />;";
		const result = route.run({
			source,
			file: "App.tsx",
			semantic: { source: { framework: BuiltinHostFramework.React } },
		});

		expect(result.code).toBe(source);
		expect(result.converted).toBe(0);
		expect(result.code).not.toContain("css({})");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": false,
			  "code": "import { Box } from "@chakra-ui/react";
			export const App = () => <Box bg={theme.foreground} />;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [],
			  "outcomes": [],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [],
			}
		`);
	});

	test("fails closed when a discovered Chakra theme cannot load its official package", async () => {
		const source =
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box color="brand.500" />;';
		const root = "/virtual/chakra-docs-project";
		const themeFile = `${root}/apps/www/app/theme.ts`;
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.ChakraUi,
			to: CodemodAdapterId.Pandwind,
			file: "apps/www/app/page.tsx",
			root,
			mode: "safe",
			readFile: (candidate) =>
				candidate === themeFile
					? "export const system = createSystem(defaultConfig, { theme: { tokens: {} } });"
					: undefined,
			listFiles: () => [themeFile],
			moduleLoader: {
				async importPackage() {
					return undefined;
				},
				async importFile() {
					return undefined;
				},
			},
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "configuration",
					hint: expect.stringContaining("official @chakra-ui/react package is unavailable"),
				}),
			]),
		);
		expect(result.code).toContain('<Box color="brand.500" />');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "// pandwind:migrate-skip (configuration-residual: configuration)
			import { Box } from "@chakra-ui/react";
			export const App = () => <Box color="brand.500" />;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [],
			  "outcomes": [
			    {
			      "outcome": "residual",
			      "representation": "residual",
			    },
			  ],
			  "residuals": [
			    {
			      "hint": "the official @chakra-ui/react package is unavailable for a discovered theme module",
			      "kind": "configuration",
			      "preserved": undefined,
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});

	test("lowers Chakra layout component defaults and scoped props", async () => {
		const result = await migrate(
			'import { HStack } from "@chakra-ui/react";\nexport const App = () => <HStack><span>A</span><span>B</span></HStack>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('alignItems: "center"');
		expect(result.code).toContain('gap: "0.5rem"');
		expect(result.code).toContain('flexDirection: "row"');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ gap: "0.5rem", alignItems: "center", display: "flex", flexDirection: "row" })}><span>A</span><span>B</span></div>;",
			  "converted": 1,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
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

	test("keeps CSS columns distinct from SimpleGrid column count", async () => {
		const result = await migrate(
			'import { Grid, SimpleGrid } from "@chakra-ui/react";\nexport const App = () => <><Grid columns={2} /><SimpleGrid columns={2} /></>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("columns: 2");
		expect(result.code).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
		expect(result.code).not.toContain("gridTemplateColumns: 2");
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <><div className={css.class({ columns: 2, display: "grid" })} /><div className={css.class({ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" })} /></>;",
			  "converted": 2,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "static",
			        "named-map",
			        "residual",
			      ],
			      "representation": "static",
			      "residuals": [],
			    },
			    {
			      "applied": [],
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
			      "outcome": "static",
			      "representation": "static",
			    },
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
			    {
			      "differences": [],
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("preserves application component props without Chakra provenance", async () => {
		const source = [
			'import { PageContainer } from "./page-container";',
			'export const App = () => <PageContainer h="full" py="2" />;',
		].join("\n");
		const result = await migrate(source, CodemodAdapterId.ChakraUi, CodemodAdapterId.Pandwind);

		expect(result.converted).toBe(0);
		expect(result.code).toContain('<PageContainer h="full" py="2" />');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": false,
			  "code": "import { PageContainer } from "./page-container";
			export const App = () => <PageContainer h="full" py="2" />;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [],
			  "outcomes": [],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [],
			}
		`);
	});

	test("keeps components with unlowered recipe semantics visible", async () => {
		const source = [
			'import { Button, Heading } from "@chakra-ui/react";',
			'export const App = () => <><Button variant="solid">Save</Button><Heading size="lg">Title</Heading></>;',
		].join("\n");
		const result = await migrate(source, CodemodAdapterId.ChakraUi, CodemodAdapterId.Pandwind);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals.length).toBeGreaterThan(0);
		expect(result.code).toContain('<Button variant="solid">');
		expect(result.code).toContain('<Heading size="lg">');
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { Button, Heading } from "@chakra-ui/react";
			// pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: component | available: named-map, residual)
			// pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: component | available: named-map, residual)
			export const App = () => <><Button variant="solid">Save</Button><Heading size="lg">Title</Heading></>;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "named-map",
			        "residual",
			      ],
			      "representation": "residual",
			      "residuals": [],
			    },
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "named-map",
			        "residual",
			      ],
			      "representation": "residual",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "residual",
			      "representation": "residual",
			    },
			    {
			      "outcome": "residual",
			      "representation": "residual",
			    },
			  ],
			  "residuals": [
			    {
			      "hint": "Chakra host 'Button' has no verified intrinsic projection",
			      "kind": "component",
			      "preserved": undefined,
			    },
			    {
			      "hint": "Chakra host 'Heading' has no verified intrinsic projection",
			      "kind": "component",
			      "preserved": undefined,
			    },
			  ],
			  "skipped": 2,
			  "validations": [],
			}
		`);
	});
});
