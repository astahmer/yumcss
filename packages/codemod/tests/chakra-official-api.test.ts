import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createChakraAdapter,
	runAdapterMigrationAsync,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { ADAPTER_TOKEN_DEFINITIONS_SCHEMA } from "../src/swap/adapter-contract.ts";
import { TokenCatalog } from "../src/swap/tokens.ts";
import { routeEvidence } from "./route-spec-support.ts";

const projectRoot = resolve(import.meta.dirname, "..");

async function migrate(
	source: string,
	from: CodemodAdapterId,
	to: CodemodAdapterId,
): Promise<AdapterMigrationResult> {
	return runAdapterMigrationAsync(source, {
		from,
		to,
		file: "App.tsx",
		root: projectRoot,
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

	test("lowers style props", async () => {
		const result = await migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="red.200" p="4" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
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

	test("does not treat unknown local component props as Chakra style props", async () => {
		const result = await migrate(
			[
				'import { Box } from "@chakra-ui/react";',
				"type MinMaxInputProps = { filter: string };",
				"const MinMaxInput = (props: MinMaxInputProps) => <input {...props} />;",
				'export const App = () => <> <Box p="4" /> <MinMaxInput filter="subscriberCount" /> </>;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.code).toContain('<MinMaxInput filter="subscriberCount" />');
		expect(result.code).not.toContain('css.class({ filter: "subscriberCount" })');
	});

	test("preserves props on imported local wrappers without Chakra provenance", async () => {
		const result = await migrate(
			[
				'import { PageContainer } from "./page-container";',
				'export const App = () => <PageContainer h="full" py="2" />;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('<PageContainer h="full" py="2" />');
	});

	test("preserves project-imported component identity when projecting Chakra props", async () => {
		const result = await migrate(
			[
				'import { Button } from "#ui/button";',
				'export const App = () => <Button bg="accent.solid" variant="ghost" />;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('<Button bg="accent.solid" variant="ghost" />');
		expect(result.code).not.toContain("<button");
	});

	test("does not lower Chakra layout defaults when asChild changes the host contract", async () => {
		const result = await migrate(
			[
				'import { Box } from "@chakra-ui/react";',
				'export const App = () => <Box asChild><button variant="solid">Run</button></Box>;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.code).toContain('<Box asChild><button variant="solid">Run</button></Box>');
		expect(result.code).not.toContain('display: "flex"');
	});

	test("lowers the css prop with nested selectors", async () => {
		const result = await migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box css={{ color: "red.200", "& svg": { color: "blue.200" } }} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ color: "#fecaca", "& svg": { color: "#bfdbfe" } })} />;",
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

	test("leaves Panda source for the Panda route", async () => {
		const result = await migrate(
			[
				'import { css } from "#styled-system/css";',
				'import { HStack } from "#styled-system/jsx";',
				'const card = css({ color: "red.200", _hover: { color: "red.300" } });',
				'export const App = () => <HStack gap="4" className={card} />;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
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

	test("supports independent, order-insensitive Chakra and Panda passes", async () => {
		const source = [
			'import { Box } from "@chakra-ui/react";',
			'import { css } from "#styled-system/css";',
			'const pandaClass = css({ color: "red" });',
			'export const App = () => <Box p="4" className={pandaClass} />;',
		].join("\n");

		const chakraFirst = await migrate(source, CodemodAdapterId.ChakraUi, CodemodAdapterId.YumCSS);
		const chakraThenPanda = await migrate(
			chakraFirst.code,
			CodemodAdapterId.Panda,
			CodemodAdapterId.YumCSS,
		);
		const pandaFirst = await migrate(source, CodemodAdapterId.Panda, CodemodAdapterId.YumCSS);
		const pandaThenChakra = await migrate(
			pandaFirst.code,
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
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
					(await migrate(result.code, sourceAdapter, CodemodAdapterId.YumCSS)).code,
					`${sourceAdapter} second pass`,
				).toBe(result.code);
			}
		}
	});

	test("lowers style-system layout hosts that only use their built-in defaults", async () => {
		const result = await migrate(
			'import { Center } from "@chakra-ui/react";\nexport const App = () => <Center><span>Ready</span></Center>',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expectStatic(result);
		expect(result.code).not.toContain("@chakra-ui/react");
		expect(result.code).toContain("<div className={css.class({");
		expect(result.code).toContain(
			'css.class({ display: "flex", alignItems: "center", justifyContent: "center" })',
		);
	});

	test("preserves Container when its Chakra recipe behavior is not represented", async () => {
		const result = await migrate(
			'import { Container } from "@chakra-ui/react";\nexport const App = () => <Container maxW="breakpoint-lg" w="full" mx="auto" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "component" })]),
		);
		expect(result.code).toContain('<Container maxW="breakpoint-lg" w="full" mx="auto" />');
		expect(result.code).toContain('from "@chakra-ui/react"');
	});

	test("does not reinterpret native JSX attributes as Panda conditions", async () => {
		const result = await migrate(
			'import { Input, Menu } from "@chakra-ui/react";\nexport const App = () => <><Input placeholder="Search" /><Menu.Root open><div /></Menu.Root></>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.code).toContain('placeholder="Search"');
		expect(result.code).toContain("open");
		expect(result.code).not.toContain('placeholder: "Search"');
		expect(result.code).not.toContain("open: true");
	});

	test("normalizes dynamic Chakra SimpleGrid columns into a CSS repeat expression", async () => {
		const result = await migrate(
			'import { SimpleGrid } from "@chakra-ui/react";\nconst count = 3;\nexport const App = () => <SimpleGrid columns={count} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.code).toContain("repeat(");
		expect(result.code).not.toContain("gridTemplateColumns: count");
	});

	test("preserves Chakra input runtime behavior with a typed component residual", async () => {
		const result = await migrate(
			'import { Input } from "@chakra-ui/react";\nexport const App = () => <Input placeholder="Search" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "component" })]),
		);
		expect(result.code).toContain('<Input placeholder="Search" />');
		expect(result.code).toContain('from "@chakra-ui/react"');
	});

	test("lowers aliased simple Chakra hosts to intrinsic elements without CSS calls", async () => {
		const result = await migrate(
			'import { Box, Button, Text as ChakraText } from "@chakra-ui/react";\nexport const App = () => <><Box data-box="true" /><Button type="button">Save</Button><ChakraText>Ready</ChakraText></>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "component" })]),
		);
		expect(result.code).not.toContain("className={defaultSystem.css");
		expect(result.code).not.toContain("className={system.css");
		expect(result.code).toContain('<div data-box="true" />');
		expect(result.code).toContain('<Button type="button">Save</Button>');
		expect(result.code).toContain("<p>Ready</p>");
		expect(result.code).toContain('from "@chakra-ui/react"');
	});

	test("normalizes static numeric Chakra spacing to target token keys", async () => {
		const result = await migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box ml={2} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expectStatic(result);
		expect(result.code).toContain('marginLeft: "0.5rem"');
		expect(result.code).not.toContain("--chakra");
	});

	test("fails closed for keyframes embedded in a Chakra style object", async () => {
		const result = await migrate(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box css={{ "@keyframes fade": { from: { opacity: 0 }, to: { opacity: 1 } } }} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
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

	test("lowers legacy Chakra prop types to native YumCSS types", async () => {
		const result = await migrate(
			'import { Flex, type FlexProps } from "@chakra-ui/react";\nexport const App = (props: FlexProps) => <Flex {...props} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.code).toContain('React.ComponentProps<"div">');
		expect(result.code).not.toContain("#styled-system/jsx");
	});

	test("removes replaced type specifiers without corrupting source imports", async () => {
		const result = await migrate(
			[
				'import type { GroupProps, InputProps } from "@chakra-ui/react";',
				"export type Props = InputProps & { rootProps?: GroupProps };",
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.code).toContain('React.ComponentProps<"input">');
		expect(result.code).toContain('React.ComponentProps<"div">');
		expect(result.code).not.toContain("InputProps");
		expect(result.code).not.toContain("GroupProps");
		expect(result.code).not.toContain('from "@chakra-ui/react"');
	});

	test("keeps converted style props valid in interface extends clauses", async () => {
		const result = await migrate(
			[
				'import type { InputProps } from "@chakra-ui/react";',
				"interface PasswordVisibilityProps { visible?: boolean }",
				"interface PasswordProps extends InputProps, PasswordVisibilityProps {}",
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.code).toContain(
			'interface PasswordProps extends React.ComponentProps<"input">, StyleObject, PasswordVisibilityProps',
		);
		expect(result.code).not.toContain("InputProps");
	});

	test("leaves dynamic Panda css carriers for the Panda route", async () => {
		const result = await migrate(
			[
				'import { css } from "#styled-system/css";',
				'import { link } from "./link";',
				'const underlineLinkClass = css(link.raw({ variant: "underline" }));',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.converted).toBe(0);
		expect(result.code).toContain('css(link.raw({ variant: "underline" }))');
		expect(result.code).toContain('import { css } from "#styled-system/css";');
	});

	test("lowers Chakra boolean style props without leaking DOM attributes", async () => {
		const result = await migrate(
			'import { Text } from "@chakra-ui/react";\nexport const App = () => <Text fontWeight="700" truncate title="Campaign" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.code).toContain('overflow: "hidden"');
		expect(result.code).toContain('textOverflow: "ellipsis"');
		expect(result.code).toContain('whiteSpace: "nowrap"');
		expect(result.code).toContain('<p title="Campaign"');
		expect(result.code).not.toContain(" truncate");
		expect(result.code).not.toContain("<ptitle");
	});

	test("preserves Heading recipe defaults with a typed component residual", async () => {
		const result = await migrate(
			'import { Heading } from "@chakra-ui/react";\nexport const App = () => <Heading size="lg">Title</Heading>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "component" })]),
		);
		expect(result.code).toContain('<Heading size="lg">Title</Heading>');
		expect(result.code).toContain('from "@chakra-ui/react"');
	});

	test("expands a known Chakra textStyle", async () => {
		const adapter = createChakraAdapter();
		const source =
			'import { Box } from "@chakra-ui/react";\n' +
			'export const App = () => <Box textStyle="sm" _hover={{ color: "red.300" }} />;';
		const result = adapter.parse(source, {
			file: "App.tsx",
			source,
			targetId: CodemodAdapterId.YumCSS,
			config: {
				adapter: CodemodAdapterId.ChakraUi,
				files: [],
				values: {
					chakraConfig: {
						theme: {
							textStyles: { sm: { value: { fontSize: "sm", fontWeight: "600" } } },
						},
					},
					chakraSystem: {
						_config: {
							theme: { tokens: { colors: {} } },
							utilities: { color: { values: "colors" } },
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
					value: { kind: "token", ref: "red.300", authored: "red.300" },
				}),
			]),
		);
		expect(declarations.some((declaration) => declaration.property === "textStyle")).toBe(false);
	});

	test("replaces obsolete WebKit-only clamp declarations with lineClamp", async () => {
		const result = await migrate(
			'import { Box } from "@chakra-ui/react";\n' +
				'export const App = () => <Box css={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }} />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expectStatic(result);
		expect(result.code).toContain("lineClamp: 2");
		expect(result.code).not.toContain("WebkitBoxOrient");
		expect(result.code).not.toContain("WebkitLineClamp");
	});

	test("leaves imported Panda builtin patterns for the Panda route", async () => {
		const result = await migrate(
			[
				'import { css } from "#styled-system/css";',
				'import { stack } from "#styled-system/patterns";',
				'const card = css({ color: "red.200" });',
				'export const App = () => <div className={compact ? stack({ alignItems: "flex-start" }) : card} />;',
			].join("\n"),
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.converted).toBe(0);
		expect(result.code).toContain("#styled-system/patterns");
		expect(result.code).toContain('stack({ alignItems: "flex-start" })');
	});

	test("converts authored Chakra CSS variables to owned token references", async () => {
		const adapter = createChakraAdapter();
		const source =
			'<Box css={{ color: "var(--chakra-colors-accent-solid)", p: "var(--chakra-spacing-4)" }} />;';
		const config = {
			adapter: CodemodAdapterId.ChakraUi,
			files: [],
			values: {
				chakraSystem: {
					properties: new Set(["color", "padding", "p"]),
					utility: { shorthands: new Map([["p", "padding"]]) },
				},
			},
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
			targetId: CodemodAdapterId.YumCSS,
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

	test("lowers Chakra factory hosts", async () => {
		const result = await migrate(
			'import { chakra } from "@chakra-ui/react";\nexport const App = () => <chakra.button bg="blue.500" color="white" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <button className={css.class({ background: "#3b82f6", color: "#FFFFFF" })} />;",
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

	test("lowers defaultSystem css interop", async () => {
		const result = await migrate(
			'import { defaultSystem } from "@chakra-ui/react";\nexport const card = defaultSystem.css({ color: "red.200", p: "4" });',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "#fecaca", padding: "1rem" });",
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

	test("lowers custom system css interop", async () => {
		const result = await migrate(
			'import { createSystem, defaultConfig } from "@chakra-ui/react";\nconst system = createSystem(defaultConfig);\nexport const card = system.css({ color: "red.200", p: "4" });',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);
		expectStatic(result);
		expect(routeEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "#fecaca", padding: "1rem" });",
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

	test("keeps unsupported Chakra hosts as safe residuals", async () => {
		const result = await migrate(
			'import { AbsoluteCenter } from "@chakra-ui/react";\nexport const App = () => <AbsoluteCenter p="4" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
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

	test("preserves multiline imports for unsupported Chakra hosts", async () => {
		const result = await migrate(
			'import {\n\tAbsoluteCenter,\n\tSpinner,\n} from "@chakra-ui/react";\nexport const App = () => <AbsoluteCenter p="4"><Spinner /></AbsoluteCenter>;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expect(result.skipped).toBe(1);
		expect(result.code).toContain("AbsoluteCenter");
		expect(result.code).toContain("Spinner");
		expect(result.code).toContain('from "@chakra-ui/react"');
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "component" })]),
		);
	});

	test("lowers Chakra SimpleGrid columns without leaking a DOM prop", async () => {
		const result = await migrate(
			'import { SimpleGrid } from "@chakra-ui/react";\nexport const App = () => <SimpleGrid columns={2} gap="4" />;',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
		);

		expectStatic(result);
		expect(result.code).not.toContain("columns=");
		expect(result.code).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
	});

	test("preserves documented token helpers when they remain runtime expressions", async () => {
		const result = await migrate(
			'import { defaultSystem } from "@chakra-ui/react";\n' +
				'export const card = defaultSystem.css({ color: defaultSystem.token("colors.red.200"), backgroundColor: defaultSystem.token.var("colors.blue.200") });',
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
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
			import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.vars({ color: defaultSystem.token("colors.red.200"), backgroundColor: defaultSystem.token.var("colors.blue.200") });",
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

	test("keeps recipe and composition APIs explicit instead of flattening variants", async () => {
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
			await Promise.all(
				Object.entries(sources).map(
					async ([name, source]) =>
						[
							name,
							await migrate(source, CodemodAdapterId.ChakraUi, CodemodAdapterId.YumCSS),
						] as const,
				),
			),
		);

		for (const result of Object.values(results)) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBe(1);
			expect(result.residuals).toEqual([expect.objectContaining({ kind: "composition" })]);
			expect(result.code).toContain("yumcss:migrate-skip");
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
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | parse-residual: composition | available: named-map, residual)
			export const button = defaultSystem.cva({ base: { color: "white" } });",
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
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | parse-residual: composition | available: named-map, residual)
			export const button = defineRecipe({ base: { color: "white" }, variants: { size: { sm: { p: "2" } } } });",
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
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | parse-residual: composition | available: named-map, residual)
			export const alert = defineSlotRecipe({ slots: ["title"], base: { title: { color: "red" } } });",
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
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | parse-residual: composition | available: named-map, residual)
			export const Link = chakra("a", { base: { color: "red.500" } });",
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
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | parse-residual: composition | available: named-map, residual)
			export const alert = defaultSystem.sva({ slots: ["title"], base: { title: { color: "red" } } });",
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
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | parse-residual: composition | available: named-map, residual)
			export const styles = useRecipe(button);",
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
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | parse-residual: composition | available: named-map, residual)
			export const styles = useSlotRecipe(alert);",
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

	test("uses Chakra's documented style carriers when targeting Chakra", async () => {
		const classHost = await migrate(
			'import { css } from "yumcss/css";\nexport const App = () => <div className={css.class({ color: "red" })} />;',
			CodemodAdapterId.YumCSS,
			CodemodAdapterId.ChakraUi,
		);
		const styledSubject = await migrate(
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
