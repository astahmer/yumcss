import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	CodemodAdapterId,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";

interface OfficialApiCase {
	readonly adapter: CodemodAdapterId;
	readonly name: string;
	readonly file: string;
	readonly source: string;
	readonly documentation: string;
}

/**
 * One primary authoring form per registered adapter, copied from that
 * project's public documentation or maintained README. This is deliberately
 * source-specific: it is not a generic `route.run("happy")` smoke fixture.
 */
class OfficialAdapterApiCatalog {
	static cases(): readonly OfficialApiCase[] {
		return [
			{
				adapter: CodemodAdapterId.Pandwind,
				name: "css.class object",
				file: "styles.ts",
				source:
					'import { createCss } from "pandwind/css";\nconst css = createCss();\nexport const card = css.class({ color: "red", padding: "1rem" });',
				documentation: "/api/css/",
			},
			{
				adapter: CodemodAdapterId.Pandwind,
				name: "css.vars object",
				file: "styles.ts",
				source:
					'import { createCss } from "pandwind/css";\nconst css = createCss();\nexport const card = css.vars({ color: "var(--card-color)" });',
				documentation: "/api/css/",
			},
			{
				adapter: CodemodAdapterId.Panda,
				name: "generated styled-system css",
				file: "styles.ts",
				source:
					'import { css } from "styled-system/css";\nexport const card = css({ color: "red.300", _hover: { color: "blue.300" } });',
				documentation: "https://panda-css.com/docs/concepts/writing-styles",
			},
			{
				adapter: CodemodAdapterId.StyleX,
				name: "stylex.create",
				file: "styles.ts",
				source:
					'import stylex from "@stylexjs/stylex";\nexport const styles = stylex.create({ card: { color: "red", padding: 8 } });',
				documentation: "https://stylexjs.com/docs/learn/",
			},
			{
				adapter: CodemodAdapterId.Emotion,
				name: "@emotion/css object",
				file: "styles.ts",
				source:
					'import { css } from "@emotion/css";\nexport const card = css({ color: "red", padding: "1rem" });',
				documentation: "https://emotion.sh/docs/%40emotion/css",
			},
			{
				adapter: CodemodAdapterId.StyledComponents,
				name: "styled object",
				file: "Card.tsx",
				source:
					'import styled from "styled-components";\nexport const Card = styled.div({ color: "red", padding: "1rem" });',
				documentation: "https://styled-components.com/docs/api",
			},
			{
				adapter: CodemodAdapterId.VanillaExtract,
				name: "style object",
				file: "styles.css.ts",
				source:
					'import { style } from "@vanilla-extract/css";\nexport const card = style({ color: "red", padding: 8 });',
				documentation: "https://vanilla-extract.style/documentation/api/style/",
			},
			{
				adapter: CodemodAdapterId.Stitches,
				name: "css object",
				file: "styles.ts",
				source:
					'import { css } from "@stitches/react";\nexport const card = css({ color: "red", padding: "1rem" });',
				documentation: "https://stitches.dev/docs/styling",
			},
			{
				adapter: CodemodAdapterId.Linaria,
				name: "css template",
				file: "styles.ts",
				source:
					'import { css } from "@linaria/core";\nexport const card = css`color: red; padding: 1rem;`;',
				documentation: "https://linaria.dev/",
			},
			{
				adapter: CodemodAdapterId.Jss,
				name: "react-jss createUseStyles",
				file: "styles.ts",
				source:
					'import { createUseStyles } from "react-jss";\nexport const useStyles = createUseStyles({ card: { color: "red" } });',
				documentation: "https://cssinjs.org/react-jss",
			},
			{
				adapter: CodemodAdapterId.Fela,
				name: "renderer.renderRule",
				file: "styles.ts",
				source:
					'import { createRenderer } from "fela";\nconst renderer = createRenderer();\nexport const card = renderer.renderRule(() => ({ color: "red" }));',
				documentation: "https://fela.js.org/docs/",
			},
			{
				adapter: CodemodAdapterId.Goober,
				name: "css object",
				file: "styles.ts",
				source:
					'import { css } from "goober";\nexport const card = css({ color: "red", padding: "1rem" });',
				documentation: "https://goober.js.org/api/css/",
			},
			{
				adapter: CodemodAdapterId.Aphrodite,
				name: "StyleSheet.create",
				file: "styles.ts",
				source:
					'import { StyleSheet } from "aphrodite";\nexport const styles = StyleSheet.create({ card: { color: "red", padding: 8 } });',
				documentation: "https://github.com/Khan/aphrodite#usage",
			},
			{
				adapter: CodemodAdapterId.Treat,
				name: "treat style",
				file: "styles.treat.ts",
				source:
					'import { style } from "treat";\nexport const card = style({ color: "red", padding: 8 });',
				documentation: "https://seek-oss.github.io/treat/how-it-works/",
			},
			{
				adapter: CodemodAdapterId.Compiled,
				name: "compiled css object",
				file: "styles.tsx",
				source:
					'import { css } from "@compiled/react";\nexport const card = css({ color: "red", padding: 8 });',
				documentation: "https://compiledcssinjs.com/docs/api-css-prop",
			},
			{
				adapter: CodemodAdapterId.ChakraUi,
				name: "Chakra style props",
				file: "App.tsx",
				source:
					'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="red.200" p="4" />;',
				documentation: "https://chakra-ui.com/docs/styling/overview",
			},
			{
				adapter: CodemodAdapterId.Mui,
				name: "MUI sx prop",
				file: "App.tsx",
				source:
					'import { Box } from "@mui/material";\nexport const App = () => <Box sx={{ color: "red", p: 2 }} />;',
				documentation: "https://mui.com/system/getting-started/the-sx-prop/",
			},
			{
				adapter: CodemodAdapterId.Mantine,
				name: "Mantine style props",
				file: "App.tsx",
				source:
					'import { Box } from "@mantine/core";\nexport const App = () => <Box c="blue.6" mx="auto" maw={400} />;',
				documentation: "https://mantine.dev/styles/style-props/",
			},
			{
				adapter: CodemodAdapterId.NextYak,
				name: "next-yak css template",
				file: "styles.tsx",
				source:
					'import { css } from "next-yak";\nexport const card = css`color: red; padding: 1rem;`;',
				documentation: "https://yak.js.org/docs/features",
			},
			{
				adapter: CodemodAdapterId.Bamboo,
				name: "styled-system css object",
				file: "styles.ts",
				source:
					'import { css } from "styled-system/css";\nexport const card = css({ color: "red" });',
				documentation: "https://styled-system.com/",
			},
			{
				adapter: CodemodAdapterId.Style9,
				name: "style9.create",
				file: "styles.ts",
				source:
					'import style9 from "style9";\nexport const styles = style9.create({ card: { color: "red" } });',
				documentation: "https://github.com/jaredpalmer/style9#readme",
			},
			{
				adapter: CodemodAdapterId.SolidStyled,
				name: "solid styled template",
				file: "styles.tsx",
				source:
					'import { styled } from "solid-styled-components";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
				documentation: "https://github.com/solidjs/solid-styled-components",
			},
			{
				adapter: CodemodAdapterId.VueStyled,
				name: "vue styled template",
				file: "styles.ts",
				source:
					'import styled from "vue-styled-components";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
				documentation: "https://github.com/styled-components/vue-styled-components",
			},
			{
				adapter: CodemodAdapterId.ReactNative,
				name: "React Native StyleSheet",
				file: "styles.ts",
				source:
					'import { StyleSheet } from "react-native";\nexport const styles = StyleSheet.create({ card: { color: "red", padding: 8 } });',
				documentation: "https://reactnative.dev/docs/stylesheet",
			},
			{
				adapter: CodemodAdapterId.Tokenami,
				name: "Tokenami css object",
				file: "styles.ts",
				source:
					'import { css } from "@tokenami/css";\nexport const card = css({ color: "red", "--card-gap": "1rem" });',
				documentation: "https://tokenami.dev/",
			},
			{
				adapter: CodemodAdapterId.UnoCSS,
				name: "UnoCSS utility classes",
				file: "App.tsx",
				source: 'export const App = () => <div className="flex items-center gap-4" />;',
				documentation: "https://unocss.dev/",
			},
			{
				adapter: CodemodAdapterId.Tailwind,
				name: "Tailwind utility classes",
				file: "App.tsx",
				source: 'export const App = () => <div className="flex items-center gap-4" />;',
				documentation: "https://tailwindcss.com/docs/styling-with-utility-classes",
			},
		];
	}
}

function migrate(api: OfficialApiCase): AdapterMigrationResult {
	return runAdapterMigration(api.source, {
		from: api.adapter,
		to: CodemodAdapterId.Pandwind,
		file: api.file,
		mode: "safe",
		semantic: { source: { framework: api.file.endsWith("x") ? "react" : undefined } },
	});
}

describe("official primary API forms", () => {
	test("covers every registered adapter with source-specific documented syntax", () => {
		const cases = OfficialAdapterApiCatalog.cases();
		const results = cases.map((api) => ({ api, result: migrate(api) }));

		expect(new Set(results.map(({ api }) => api.adapter))).toEqual(
			new Set(BUILTIN_CODEMOD_ADAPTER_IDS),
		);
		for (const { api, result } of results) {
			if (api.adapter === CodemodAdapterId.Pandwind) {
				expect(result.skipped, `${api.adapter}/${api.name}: ${api.documentation}`).toBe(0);
				expect(result.residuals, `${api.adapter}/${api.name}: ${api.documentation}`).toEqual([]);
				continue;
			}
			expect(result.converted, `${api.adapter}/${api.name}: ${api.documentation}`).toBeGreaterThan(
				0,
			);
			expect(result.skipped, `${api.adapter}/${api.name}: ${api.documentation}`).toBe(0);
			expect(result.residuals, `${api.adapter}/${api.name}: ${api.documentation}`).toEqual([]);
			expect(result.code, `${api.adapter}/${api.name}`).not.toContain("migrate-skip");
		}
		expect(
			Object.fromEntries(
				results.map(({ api, result }) => [`${api.adapter}/${api.name}`, routeEvidence(result)]),
			),
		).toMatchInlineSnapshot(`
			{
			  "aphrodite/StyleSheet.create": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const styles = css.group({ card: { color: "red", padding: 8 } });",
			    "converted": 1,
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
			  },
			  "bamboo/styled-system css object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red" });",
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
			  "chakra-ui/Chakra style props": {
			    "changed": true,
			    "code": "import { Box } from "@chakra-ui/react";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <Box  className={css.class({ backgroundColor: "var(--chakra-colors-red-200)", padding: "var(--chakra-spacing-4)" })}/>;",
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
			  "compiled/compiled css object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: 8 });",
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
			  "emotion/@emotion/css object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "fela/renderer.renderRule": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const renderer = createRenderer();
			export const card = css.class({ color: "red" });",
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
			  "goober/css object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "jss/react-jss createUseStyles": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const useStyles = css.group({ card: { color: "red" } });",
			    "converted": 1,
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
			  },
			  "linaria/css template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "mantine/Mantine style props": {
			    "changed": true,
			    "code": "import { Box } from "@mantine/core";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <Box  className={css.class({ color: "blue.6", marginLeft: "var(--mantine-spacing-auto)", marginRight: "var(--mantine-spacing-auto)", maxWidth: 400 })}/>;",
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
			  "mui/MUI sx prop": {
			    "changed": true,
			    "code": "import { Box } from "@mui/material";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <Box  className={css.class({ color: "red", padding: "16px" })}/>;",
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
			  "next-yak/next-yak css template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "panda/generated styled-system css": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red.300", "&:hover": { color: "blue.300" } });",
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
			  "pandwind/css.class object": {
			    "changed": false,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const card = css.class({ color: "red", padding: "1rem" });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "pandwind/css.vars object": {
			    "changed": false,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const card = css.vars({ color: "var(--card-color)" });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "react-native/React Native StyleSheet": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const styles = css.group({ card: { color: "red", padding: 8 } });",
			    "converted": 1,
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
			  },
			  "solid-styled/solid styled template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ color: "red", padding: "1rem" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-t6bw3o", props.className)} />; }; component.__pandwindClassName = "pw-t6bw3o"; return component; })();",
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
			  "stitches/css object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "style9/style9.create": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const styles = css.group({ card: { color: "red" } });",
			    "converted": 1,
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
			  },
			  "styled-components/styled object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ color: "red", padding: "1rem" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1fn70s4", props.className)} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
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
			  "stylex/stylex.create": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const styles = css.group({ card: { color: "red", padding: "8px" } });",
			    "converted": 1,
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
			  },
			  "tailwind/Tailwind utility classes": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div  className={css.class({ display: "flex", alignItems: "center", gap: "1rem" })}/>;",
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
			  "tokenami/Tokenami css object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", cardGap: "1rem" });",
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
			  "treat/treat style": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: 8 });",
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
			  "unocss/UnoCSS utility classes": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div  className={css.class({ display: "flex", alignItems: "center", gap: "1rem" })}/>;",
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
			  "vanilla-extract/style object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: 8 });",
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
			  "vue-styled/vue styled template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const Card = css.class({ color: "red", padding: "1rem" });",
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
