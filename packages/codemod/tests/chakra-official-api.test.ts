import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createChakraAdapter,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { ADAPTER_TOKEN_DEFINITIONS_SCHEMA } from "../src/swap/adapter-contract.ts";
import { TokenCatalog } from "../src/swap/tokens.ts";
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
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ padding: "4", backgroundColor: "red.200" })} />;",
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

	test("does not treat unknown local component props as Chakra style props", () => {
		const result = migrate(
			[
				'import { Box } from "@chakra-ui/react";',
				"type MinMaxInputProps = { filter: string };",
				"const MinMaxInput = (props: MinMaxInputProps) => <input {...props} />;",
				'export const App = () => <> <Box p="4" /> <MinMaxInput filter="subscriberCount" /> </>;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.code).toContain('<MinMaxInput filter="subscriberCount" />');
		expect(result.code).not.toContain('css.class({ filter: "subscriberCount" })');
	});

	test("projects Chakra style props passed to imported local wrappers", () => {
		const result = migrate(
			[
				'import { PageContainer } from "./page-container";',
				'export const App = () => <PageContainer h="full" py="2" />;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("<PageContainer className={css.class({");
		expect(result.code).not.toContain(" h=");
		expect(result.code).not.toContain(" py=");
	});

	test("preserves project-imported component identity when projecting Chakra props", () => {
		const result = migrate(
			[
				'import { Button } from "#ui/button";',
				'export const App = () => <Button bg="accent.solid" variant="ghost" />;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('<Button variant="ghost"');
		expect(result.code).toContain("className={css.class({");
		expect(result.code).not.toContain("<button");
	});

	test("does not lower Chakra layout defaults when asChild changes the host contract", () => {
		const result = migrate(
			[
				'import { Box } from "@chakra-ui/react";',
				'export const App = () => <Box asChild><button variant="solid">Run</button></Box>;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.code).toContain('<Box asChild><button variant="solid">Run</button></Box>');
		expect(result.code).not.toContain('display: "flex"');
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
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ color: "red.200", "& svg": { color: "blue.200" } })} />;",
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

	test("leaves Panda source for the Panda route", () => {
		const result = migrate(
			[
				'import { css } from "#styled-system/css";',
				'import { HStack } from "#styled-system/jsx";',
				'const card = css({ color: "red.200", _hover: { color: "red.300" } });',
				'export const App = () => <HStack gap="4" className={card} />;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(0);
		expect(result.code).toBe(
			[
				'import { css } from "#styled-system/css";',
				'import { HStack } from "#styled-system/jsx";',
				'const card = css({ color: "red.200", _hover: { color: "red.300" } });',
				'export const App = () => <HStack gap="4" className={card} />;',
			].join("\n"),
		);
	});

	test("supports independent, order-insensitive Chakra and Panda passes", () => {
		const source = [
			'import { Box } from "@chakra-ui/react";',
			'import { css } from "#styled-system/css";',
			'const pandaClass = css({ color: "red" });',
			'export const App = () => <Box p="4" className={pandaClass} />;',
		].join("\n");

		const chakraFirst = migrate(source, CodemodAdapterId.ChakraUi, CodemodAdapterId.Pandwind);
		const chakraThenPanda = migrate(
			chakraFirst.code,
			CodemodAdapterId.Panda,
			CodemodAdapterId.Pandwind,
		);
		const pandaFirst = migrate(source, CodemodAdapterId.Panda, CodemodAdapterId.Pandwind);
		const pandaThenChakra = migrate(
			pandaFirst.code,
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		for (const result of [chakraThenPanda, pandaThenChakra]) {
			expect(result.residuals).toEqual([]);
			expect(result.code).not.toContain("@chakra-ui/react");
			expect(result.code).toContain("className={css.class({");
		}
		expect(chakraThenPanda.code, "Chakra then Panda").not.toContain("#styled-system");
		expect(pandaThenChakra.code, "Panda then Chakra").not.toContain("#styled-system");

		for (const result of [chakraThenPanda, pandaThenChakra]) {
			for (const sourceAdapter of [CodemodAdapterId.ChakraUi, CodemodAdapterId.Panda]) {
				expect(
					migrate(result.code, sourceAdapter, CodemodAdapterId.Pandwind).code,
					`${sourceAdapter} second pass`,
				).toBe(result.code);
			}
		}
	});

	test("lowers style-system layout hosts that only use their built-in defaults", () => {
		const result = migrate(
			'import { Center } from "@chakra-ui/react";\nexport const App = () => <Center><span>Ready</span></Center>',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expectStatic(result);
		expect(result.code).not.toContain("@chakra-ui/react");
		expect(result.code).toContain("<div className={css.class({");
		expect(result.code).toContain(
			'css.class({ alignItems: "center", display: "flex", justifyContent: "center" })',
		);
	});

	test("lowers the portable Container host without preserving the Panda JSX runtime", () => {
		const result = migrate(
			'import { Container } from "@chakra-ui/react";\nexport const App = () => <Container maxW="breakpoint-lg" w="full" mx="auto" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expectStatic(result);
		expect(result.code).not.toContain("@chakra-ui/react");
		expect(result.code).toContain("<div className={css.class({");
		expect(result.code).toContain('maxWidth: "breakpoint-lg"');
	});

	test("does not reinterpret native JSX attributes as Panda conditions", () => {
		const result = migrate(
			'import { Input, Menu } from "@chakra-ui/react";\nexport const App = () => <><Input placeholder="Search" /><Menu.Root open><div /></Menu.Root></>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.code).toContain('placeholder="Search"');
		expect(result.code).toContain("open");
		expect(result.code).not.toContain('placeholder: "Search"');
		expect(result.code).not.toContain("open: true");
	});

	test("normalizes dynamic Chakra grid columns into a CSS repeat expression", () => {
		const result = migrate(
			'import { Grid } from "@chakra-ui/react";\nconst count = 3;\nexport const App = () => <Grid gridTemplateColumns={count} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.code).toContain("repeat(");
		expect(result.code).not.toContain("gridTemplateColumns: count");
	});

	test("lowers Chakra inputs to intrinsic input elements", () => {
		const result = migrate(
			'import { Input } from "@chakra-ui/react";\nexport const App = () => <Input placeholder="Search" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expectStatic(result);
		expect(result.code).toContain('<input placeholder="Search" />');
		expect(result.code).not.toContain("css.");
	});

	test("lowers aliased simple Chakra hosts to intrinsic elements without CSS calls", () => {
		const result = migrate(
			'import { Box, Button, Text as ChakraText } from "@chakra-ui/react";\nexport const App = () => <><Box data-box="true" /><Button type="button">Save</Button><ChakraText>Ready</ChakraText></>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(3);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("className={defaultSystem.css");
		expect(result.code).not.toContain("className={system.css");
		expect(result.code).toContain('<div data-box="true" />');
		expect(result.code).toContain('<button type="button">Save</button>');
		expect(result.code).toContain("<p>Ready</p>");
		expect(result.code).not.toContain("@chakra-ui/react");
	});

	test("normalizes static numeric Chakra spacing to target token keys", () => {
		const result = migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box ml={2} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expectStatic(result);
		expect(result.code).toContain('marginLeft: "2"');
		expect(result.code).not.toContain("--chakra");
	});

	test("fails closed for keyframes embedded in a Chakra style object", () => {
		const result = migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box css={{ "@keyframes fade": { from: { opacity: 0 }, to: { opacity: 1 } } }} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					hint: "Chakra keyframes require an explicit target keyframes API",
				}),
			]),
		);
		expect(result.code).toContain("@keyframes fade");
		expect(result.code).not.toContain("css.class");
	});

	test("lowers legacy Chakra prop types to native Pandwind types", () => {
		const result = migrate(
			'import { Flex, type FlexProps } from "@chakra-ui/react";\nexport const App = (props: FlexProps) => <Flex {...props} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.code).toContain('React.ComponentProps<"div">');
		expect(result.code).not.toContain("#styled-system/jsx");
	});

	test("removes replaced type specifiers without corrupting source imports", () => {
		const result = migrate(
			[
				'import type { GroupProps, InputProps } from "@chakra-ui/react";',
				"export type Props = InputProps & { rootProps?: GroupProps };",
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.code).toContain('React.ComponentProps<"input">');
		expect(result.code).toContain('React.ComponentProps<"div">');
		expect(result.code).not.toContain("InputProps");
		expect(result.code).not.toContain("GroupProps");
		expect(result.code).not.toContain('from "@chakra-ui/react"');
	});

	test("keeps converted style props valid in interface extends clauses", () => {
		const result = migrate(
			[
				'import type { InputProps } from "@chakra-ui/react";',
				"interface PasswordVisibilityProps { visible?: boolean }",
				"interface PasswordProps extends InputProps, PasswordVisibilityProps {}",
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.code).toContain(
			'interface PasswordProps extends React.ComponentProps<"input">, StyleObject, PasswordVisibilityProps',
		);
		expect(result.code).not.toContain("InputProps");
	});

	test("leaves dynamic Panda css carriers for the Panda route", () => {
		const result = migrate(
			[
				'import { css } from "#styled-system/css";',
				'import { link } from "./link";',
				'const underlineLinkClass = css(link.raw({ variant: "underline" }));',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(0);
		expect(result.code).toContain('css(link.raw({ variant: "underline" }))');
		expect(result.code).toContain('import { css } from "#styled-system/css";');
	});

	test("lowers Chakra boolean style props without leaking DOM attributes", () => {
		const result = migrate(
			'import { Text } from "@chakra-ui/react";\nexport const App = () => <Text fontWeight="700" truncate title="Campaign" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.code).toContain('overflow: "hidden"');
		expect(result.code).toContain('textOverflow: "ellipsis"');
		expect(result.code).toContain('whiteSpace: "nowrap"');
		expect(result.code).toContain('<p title="Campaign"');
		expect(result.code).not.toContain(" truncate");
		expect(result.code).not.toContain("<ptitle");
	});

	test("lowers Heading size into the intrinsic host's static style", () => {
		const result = migrate(
			'import { Heading } from "@chakra-ui/react";\nexport const App = () => <Heading size="lg">Title</Heading>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expectStatic(result);
		expect(result.code).toContain('fontSize: "lg"');
		expect(result.code).not.toContain(' size="lg"');
		expect(result.code).toContain("<h2 className={css.class({");
	});

	test("expands a known Chakra textStyle", () => {
		const adapter = createChakraAdapter();
		const source =
			'import { Box } from "@chakra-ui/react";\n' +
			'export const App = () => <Box textStyle="sm" _hover={{ color: "red.300" }} />;';
		const result = adapter.parse(source, {
			file: "App.tsx",
			source,
			targetId: CodemodAdapterId.Pandwind,
			config: {
				adapter: CodemodAdapterId.ChakraUi,
				files: [],
				values: {
					chakraConfig: {
						theme: {
							textStyles: { sm: { value: { fontSize: "sm", fontWeight: "600" } } },
						},
					},
				},
				conditionCatalog: { hover: "&:hover", _hover: "&:hover" },
			},
		});
		const declarations = result.matches[0]?.program.declarations ?? [];

		expect(declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ property: "fontSize", value: { kind: "literal", value: "sm" } }),
				expect.objectContaining({
					property: "fontWeight",
					value: { kind: "literal", value: "600" },
				}),
				expect.objectContaining({
					property: "color",
					value: { kind: "literal", value: "red.300" },
				}),
			]),
		);
		expect(declarations.some((declaration) => declaration.property === "textStyle")).toBe(false);
	});

	test("replaces obsolete WebKit-only clamp declarations with lineClamp", () => {
		const result = migrate(
			'import { Box } from "@chakra-ui/react";\n' +
				'export const App = () => <Box css={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expectStatic(result);
		expect(result.code).toContain("lineClamp: 2");
		expect(result.code).not.toContain("WebkitBoxOrient");
		expect(result.code).not.toContain("WebkitLineClamp");
	});

	test("leaves imported Panda builtin patterns for the Panda route", () => {
		const result = migrate(
			[
				'import { css } from "#styled-system/css";',
				'import { stack } from "#styled-system/patterns";',
				'const card = css({ color: "red.200" });',
				'export const App = () => <div className={compact ? stack({ alignItems: "flex-start" }) : card} />;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(0);
		expect(result.code).toContain("#styled-system/patterns");
		expect(result.code).toContain('stack({ alignItems: "flex-start" })');
	});

	test("converts authored Chakra CSS variables to owned token references", () => {
		const adapter = createChakraAdapter();
		const source =
			'<Box css={{ color: "var(--chakra-colors-accent-solid)", p: "var(--chakra-spacing-4)" }} />;';
		const config = {
			adapter: CodemodAdapterId.ChakraUi,
			files: [],
			values: {},
			tokenCatalog: TokenCatalog.fromGroups({
				colors: { "accent.solid": "#123456" },
				spacing: { "4": "1rem" },
			})?.contract,
			tokenDefinitions: {
				schema: ADAPTER_TOKEN_DEFINITIONS_SCHEMA,
				raw: { spacing: { "4": { value: "1rem" } } },
				semantic: {
					colors: {
						accent: { solid: { value: { _light: "#123456", _dark: "#abcdef" } } },
					},
				},
			},
		};
		const parsed = adapter.parse(source, {
			file: "App.tsx",
			source,
			config,
			targetId: CodemodAdapterId.Pandwind,
		});
		const declarations = parsed.matches[0]?.program.declarations ?? [];

		expect(declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: "color",
					value: expect.objectContaining({ kind: "token", authored: "accent.solid" }),
				}),
				expect.objectContaining({
					property: "padding",
					value: expect.objectContaining({ kind: "token", authored: "4" }),
				}),
			]),
		);
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
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <button className={css.class({ backgroundColor: "blue.500", color: "white" })} />;",
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
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ padding: "4", color: "red.200" });",
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
			  "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ padding: "4", color: "red.200" });",
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

	test("keeps unsupported Chakra hosts as safe residuals", () => {
		const result = migrate(
			'import { AbsoluteCenter } from "@chakra-ui/react";\nexport const App = () => <AbsoluteCenter p="4" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.code).toContain('<AbsoluteCenter p="4" />');
		expect(result.code).toContain("@chakra-ui/react");
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "component",
					text: "AbsoluteCenter",
				}),
			]),
		);
	});

	test("preserves multiline imports for unsupported Chakra hosts", () => {
		const result = migrate(
			'import {\n\tAbsoluteCenter,\n\tSpinner,\n} from "@chakra-ui/react";\nexport const App = () => <AbsoluteCenter p="4"><Spinner /></AbsoluteCenter>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expect(result.skipped).toBe(1);
		expect(result.code).toContain("AbsoluteCenter");
		expect(result.code).toContain("Spinner");
		expect(result.code).toContain('from "@chakra-ui/react"');
	});

	test("lowers Chakra Grid columns without leaking a DOM prop", () => {
		const result = migrate(
			'import { Grid } from "@chakra-ui/react";\nexport const App = () => <Grid columns={2} gap="4" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.Pandwind,
		);

		expectStatic(result);
		expect(result.code).not.toContain("columns=");
		expect(result.code).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
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
			import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.vars({ backgroundColor: defaultSystem.token.var("colors.blue.200"), color: defaultSystem.token("colors.red.200") });",
			  "converted": 1,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "named-map",
			        "target-native",
			        "residual",
			      ],
			      "representation": "target-native",
			      "residuals": [],
			    },
			  ],
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
			    ],
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
			    ],
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
			    ],
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
			    ],
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
			    ],
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
			    ],
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
			    ],
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
				  },
				  "styledSubject": {
				    "changed": true,
				    "code": "import { chakra } from "@chakra-ui/react";
				const Card = (props) => <chakra.div {...props} css={{ color: "red" }} />;
				export const App = () => <Card />;",
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
				  },
				}
			`);
	});
});
