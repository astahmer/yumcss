/**
 * Official documented API forms for every registered codemod adapter,
 * copied from each project's public documentation or maintained README.
 * Shared by the matrix/families conformance tests and the playground
 * migration lab, so the UI surfaces exactly what the tests prove.
 */

import { CodemodAdapterId } from "./identifiers.ts";

/** One primary authoring form per registered adapter. */
export interface OfficialApiCase {
	readonly adapter: CodemodAdapterId;
	readonly name: string;
	readonly file: string;
	readonly source: string;
	readonly documentation: string;
}

/** Primary cases: one per adapter. */
export function officialApiCases(): readonly OfficialApiCase[] {
	return [
		{
			adapter: CodemodAdapterId.Pandwind,
			name: "css.class object",
			file: "styles.ts",
			source:
				'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\nexport const card = css.class({ color: "red", padding: "1rem" });',
			documentation: "/api/css/",
		},
		{
			adapter: CodemodAdapterId.Pandwind,
			name: "css.vars object",
			file: "styles.ts",
			source:
				'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\nexport const card = css.vars({ color: "var(--card-color)" });',
			documentation: "/api/css/",
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "generated styled-system css",
			file: "styles.ts",
			source:
				'import { css } from "styled-system/css";\nexport const card = css({ color: "red", _hover: { color: "blue" } });',
			documentation: "https://panda-css.com/docs/concepts/writing-styles",
		},
		{
			adapter: CodemodAdapterId.StyleX,
			name: "stylex.create",
			file: "styles.ts",
			source:
				'import * as stylex from "@stylexjs/stylex";\nexport const styles = stylex.create({ card: { color: "red", padding: 8 } });',
			documentation: "https://stylexjs.com/docs/learn/",
		},
		{
			adapter: CodemodAdapterId.ReactStrictDom,
			name: "react-strict-dom css.create",
			file: "Card.tsx",
			source:
				'import { css, html } from "react-strict-dom";\nconst styles = css.create({ card: { color: "red", padding: "1rem" } });\nexport const Card = () => <html.div style={styles.card} />;',
			documentation:
				"https://github.com/react/react-strict-dom/blob/main/packages/react-strict-dom/README.md",
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
				'import { Box } from "@mantine/core";\nexport const App = () => <Box c="blue" mx="auto" maw={400} />;',
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
				'import { css } from "@tokenami/css";\nexport const card = css({ color: "red", "--gap": "1rem" });',
			documentation: "https://tokenami.dev/",
		},
		{
			adapter: CodemodAdapterId.UnoCSS,
			name: "UnoCSS utility classes",
			file: "App.tsx",
			source:
				'export const App = () => <div className="[display:flex] [align-items:center] [gap:1rem]" />;',
			documentation: "https://unocss.dev/",
		},
		{
			adapter: CodemodAdapterId.Tailwind,
			name: "Tailwind arbitrary utility classes",
			file: "App.tsx",
			source:
				'export const App = () => <div className="[display:flex] [align-items:center] [gap:1rem]" />;',
			documentation: "https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values",
		},
		{
			adapter: CodemodAdapterId.Tamagui,
			name: "styled component",
			file: "Card.tsx",
			source:
				'import { styled, View } from "tamagui";\nexport const Card = styled(View, { color: "red", padding: "$4" });\nexport const App = () => <Card />;',
			documentation: "https://tamagui.dev/docs/core/styled",
		},
		{
			adapter: CodemodAdapterId.CssModules,
			name: "module class",
			file: "Card.module.css",
			source: ".card { color: red; padding: 1rem; }",
			documentation: "https://github.com/css-modules/css-modules",
		},
		{
			adapter: CodemodAdapterId.Sass,
			name: "scss rule",
			file: "card.scss",
			source: ".card { color: red; padding: 1rem; }",
			documentation: "https://sass-lang.com/documentation/",
		},
		{
			adapter: CodemodAdapterId.Less,
			name: "less rule",
			file: "card.less",
			source: ".card { color: red; padding: 1rem; }",
			documentation: "https://lesscss.org/features/",
		},
		{
			adapter: CodemodAdapterId.AuthoredCss,
			name: "css rule",
			file: "card.css",
			source: ".card { color: red; padding: 1rem; }",
			documentation: "https://developer.mozilla.org/en-US/docs/Web/CSS",
		},
	];
}

/**
 * Remaining documented syntax families with different IR semantics:
 * rules, maps, templates, components, globals, keyframes, composition.
 */
export type OfficialApiExpectation = "converted" | "runtime" | "residual" | "identity" | "context";

export interface OfficialApiFamilyCase {
	readonly adapter: CodemodAdapterId;
	readonly name: string;
	readonly expectation: OfficialApiExpectation;
	readonly file?: string;
	readonly source: string;
}

/** Family cases: secondary documented forms. */
export function officialApiFamilyCases(): readonly OfficialApiFamilyCase[] {
	return [
		{
			adapter: CodemodAdapterId.Pandwind,
			name: "css.group named map",
			expectation: "identity",
			file: "styles.ts",
			source:
				'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\nexport const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });',
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "cva recipe",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { cva } from "styled-system/recipes";\nexport const button = cva({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });',
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "sva slot recipe",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { sva } from "styled-system/recipes";\nexport const card = sva({ slots: ["root", "label"], base: { root: { color: "red" } } });',
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "generated styled component",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { styled } from "styled-system/jsx";\nexport const Card = styled.div({ base: { color: "red" } });',
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "generated styled JSX style props",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { styled } from "styled-system/jsx";\nexport const Button = () => <styled.button color="red" />;',
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "globalCss config",
			expectation: "context",
			file: "panda.config.ts",
			source:
				'import { defineConfig, defineGlobalStyles } from "@pandacss/dev";\nconst globalCss = defineGlobalStyles({ "html, body": { margin: 0 } });\nexport default defineConfig({ globalCss });',
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "token helper context",
			expectation: "context",
			file: "App.tsx",
			source:
				'import { token } from "styled-system/tokens";\nexport const color = token("colors.red.400");',
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "defineRecipe config",
			expectation: "context",
			file: "button.recipe.ts",
			source:
				'import { defineRecipe } from "@pandacss/dev";\nexport const button = defineRecipe({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });',
		},
		{
			adapter: CodemodAdapterId.Panda,
			name: "defineSlotRecipe config",
			expectation: "context",
			file: "card.recipe.ts",
			source:
				'import { defineSlotRecipe } from "@pandacss/dev";\nexport const card = defineSlotRecipe({ slots: ["root"], base: { root: { color: "red" } } });',
		},
		{
			adapter: CodemodAdapterId.StyleX,
			name: "create",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import * as stylex from "@stylexjs/stylex";\nexport const styles = stylex.create({ card: { color: "red" } });',
		},
		{
			adapter: CodemodAdapterId.StyleX,
			name: "keyframes",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import * as stylex from "@stylexjs/stylex";\nexport const pulse = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
		},
		{
			adapter: CodemodAdapterId.StyleX,
			name: "defineVars",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import * as stylex from "@stylexjs/stylex";\nexport const theme = stylex.defineVars({ accent: "red" });',
		},
		{
			adapter: CodemodAdapterId.StyleX,
			name: "props host projection",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import * as stylex from "@stylexjs/stylex";\nconst styles = stylex.create({ card: { color: "red" } });\nexport const Card = () => <div {...stylex.props(styles.card)} />;',
		},
		{
			adapter: CodemodAdapterId.StyleX,
			name: "createTheme context",
			expectation: "residual",
			file: "theme.ts",
			source:
				'import * as stylex from "@stylexjs/stylex";\nimport { vars } from "./vars";\nexport const theme = stylex.createTheme(vars, { accent: "blue" });',
		},
		{
			adapter: CodemodAdapterId.ReactStrictDom,
			name: "css.keyframes",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { css } from "react-strict-dom";\nexport const pulse = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
		},
		{
			adapter: CodemodAdapterId.ReactStrictDom,
			name: "css.defineVars",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { css } from "react-strict-dom";\nexport const theme = css.defineVars({ accent: "red" });',
		},
		{
			adapter: CodemodAdapterId.ReactStrictDom,
			name: "css.createTheme context",
			expectation: "residual",
			file: "theme.ts",
			source:
				'import { css } from "react-strict-dom";\nexport const theme = css.createTheme({ accent: "red" });',
		},
		{
			adapter: CodemodAdapterId.ReactStrictDom,
			name: "compat.native boundary",
			expectation: "residual",
			file: "compat.native.tsx",
			source:
				'import { compat } from "react-strict-dom";\nimport { Text } from "react-native";\nexport const Label = () => <compat.native as="text">{(props) => <Text {...props} />}</compat.native>;',
		},
		{
			adapter: CodemodAdapterId.Emotion,
			name: "tagged css template",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { css } from "@emotion/css";\nexport const card = css`color: red; padding: 1rem;`;',
		},
		{
			adapter: CodemodAdapterId.Emotion,
			name: "keyframes object",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { keyframes } from "@emotion/css";\nexport const pulse = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
		},
		{
			adapter: CodemodAdapterId.Emotion,
			name: "injectGlobal tagged template",
			expectation: "converted",
			file: "styles.ts",
			source: 'import { injectGlobal } from "@emotion/css";\ninjectGlobal`body { margin: 0; }`;',
		},
		{
			adapter: CodemodAdapterId.Emotion,
			name: "styled component object",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import styled from "@emotion/styled";\nexport const Card = styled.button({ color: "red" });',
		},
		{
			adapter: CodemodAdapterId.Emotion,
			name: "css prop",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { jsx } from "@emotion/react";\nexport const Card = () => <button css={{ color: "red" }} />;',
		},
		{
			adapter: CodemodAdapterId.Emotion,
			name: "Global component",
			expectation: "converted",
			file: "Global.tsx",
			source:
				'import { Global } from "@emotion/react";\nexport const App = () => <Global styles={{ body: { margin: 0 } }} />;',
		},
		{
			adapter: CodemodAdapterId.StyledComponents,
			name: "styled tagged template",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import styled from "styled-components";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
		},
		{
			adapter: CodemodAdapterId.StyledComponents,
			name: "keyframes tagged template",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { keyframes } from "styled-components";\nexport const pulse = keyframes`from { opacity: 0; } to { opacity: 1; }`;',
		},
		{
			adapter: CodemodAdapterId.StyledComponents,
			name: "createGlobalStyle tagged template",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { createGlobalStyle } from "styled-components";\nexport const Global = createGlobalStyle`body { margin: 0; }`;',
		},
		{
			adapter: CodemodAdapterId.StyledComponents,
			name: "styled component subject",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import styled from "styled-components";\nconst Link = (props: { href: string }) => <a {...props} />;\nexport const Card = styled(Link)({ color: "red" });',
		},
		{
			adapter: CodemodAdapterId.StyledComponents,
			name: "polymorphic as",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import styled from "styled-components";\nconst Card = styled.div({ color: "red" });\nexport const App = () => <Card as="a" href="/docs" />;',
		},
		{
			adapter: CodemodAdapterId.StyledComponents,
			name: "ThemeProvider context",
			expectation: "context",
			file: "App.tsx",
			source:
				'import { ThemeProvider } from "styled-components";\nexport const App = () => <ThemeProvider theme={{ colors: { brand: "red" } }}><div /></ThemeProvider>;',
		},
		{
			adapter: CodemodAdapterId.StyledComponents,
			name: "theme callback",
			expectation: "runtime",
			file: "Card.tsx",
			source:
				'import styled from "styled-components";\nexport const Card = styled.div(({ theme }) => ({ color: theme.colors.brand }));',
		},
		{
			adapter: CodemodAdapterId.VanillaExtract,
			name: "globalStyle",
			expectation: "converted",
			source:
				'import { globalStyle } from "@vanilla-extract/css";\nglobalStyle("body", { margin: 0 });',
		},
		{
			adapter: CodemodAdapterId.VanillaExtract,
			name: "keyframes",
			expectation: "converted",
			source:
				'import { keyframes } from "@vanilla-extract/css";\nexport const pulse = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
		},
		{
			adapter: CodemodAdapterId.VanillaExtract,
			name: "fontFace",
			expectation: "converted",
			source:
				'import { fontFace } from "@vanilla-extract/css";\nexport const inter = fontFace({ fontFamily: "Inter", src: "url(inter.woff2)" });',
		},
		{
			adapter: CodemodAdapterId.VanillaExtract,
			name: "styleVariants",
			expectation: "converted",
			source:
				'import { styleVariants } from "@vanilla-extract/css";\nexport const variants = styleVariants({ primary: { color: "red" } });',
		},
		{
			adapter: CodemodAdapterId.VanillaExtract,
			name: "recipe",
			expectation: "converted",
			file: "styles.css.ts",
			source:
				'import { recipe } from "@vanilla-extract/recipes";\nexport const button = recipe({ base: { color: "red" }, variants: { size: { sm: { padding: 4 } } } });',
		},
		{
			adapter: CodemodAdapterId.VanillaExtract,
			name: "theme contract",
			expectation: "context",
			file: "theme.css.ts",
			source:
				'import { createThemeContract } from "@vanilla-extract/css";\nexport const vars = createThemeContract({ colors: { brand: null } });',
		},
		{
			adapter: CodemodAdapterId.VanillaExtract,
			name: "createVar",
			expectation: "converted",
			file: "theme.css.ts",
			source:
				'import { createVar } from "@vanilla-extract/css";\nexport const brand = createVar();',
		},
		{
			adapter: CodemodAdapterId.VanillaExtract,
			name: "createTheme",
			expectation: "context",
			file: "theme.css.ts",
			source:
				'import { createTheme } from "@vanilla-extract/css";\nexport const themeClass = createTheme({ colors: { brand: "red" } });',
		},
		{
			adapter: CodemodAdapterId.Stitches,
			name: "globalCss",
			expectation: "converted",
			source:
				'import { globalCss } from "@stitches/react";\nexport const reset = globalCss({ body: { margin: 0 } });',
		},
		{
			adapter: CodemodAdapterId.Stitches,
			name: "keyframes",
			expectation: "converted",
			source:
				'import { keyframes } from "@stitches/react";\nexport const pulse = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
		},
		{
			adapter: CodemodAdapterId.Stitches,
			name: "styled component",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { styled } from "@stitches/react";\nexport const Card = styled("div", { color: "red" });',
		},
		{
			adapter: CodemodAdapterId.Stitches,
			name: "createTheme context",
			expectation: "context",
			file: "theme.ts",
			source:
				'import { createStitches } from "@stitches/react";\nexport const { createTheme } = createStitches({ theme: { colors: { brand: "red" } } });',
		},
		{
			adapter: CodemodAdapterId.Stitches,
			name: "variants",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { css } from "@stitches/react";\nexport const button = css({ variants: { size: { sm: { padding: 4 } } }, compoundVariants: [{ size: "sm", css: { color: "red" } }] });',
		},
		{
			adapter: CodemodAdapterId.Linaria,
			name: "styled tagged template",
			expectation: "converted",
			source:
				'import { styled } from "@linaria/react";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
		},
		{
			adapter: CodemodAdapterId.Linaria,
			name: "css prop",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { css } from "@linaria/core";\nexport const Card = () => <button css={css`color: red;`} />;',
		},
		{
			adapter: CodemodAdapterId.Jss,
			name: "createStyleSheet named map",
			expectation: "converted",
			source:
				'import jss from "jss";\nexport const sheet = jss.createStyleSheet({ card: { color: "red" } });',
		},
		{
			adapter: CodemodAdapterId.Jss,
			name: "createRule named map",
			expectation: "converted",
			source: 'import jss from "jss";\nexport const rule = jss.createRule({ color: "red" });',
		},
		{
			adapter: CodemodAdapterId.Jss,
			name: "imperative applyTo",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import jss from "jss";\nconst sheet = jss.createStyleSheet({ card: { color: "red" } });\nsheet.attach();\nsheet.getRule("card").applyTo(element);',
		},
		{
			adapter: CodemodAdapterId.Fela,
			name: "createComponent",
			expectation: "converted",
			source:
				'import { createComponent } from "react-fela";\nexport const Card = createComponent(() => ({ color: "red" }), "button");',
		},
		{
			adapter: CodemodAdapterId.Fela,
			name: "renderer plugins context",
			expectation: "context",
			file: "renderer.ts",
			source:
				'import { createRenderer } from "fela";\nconst plugin = (element) => element;\nexport const renderer = createRenderer({ plugins: [plugin] });',
		},
		{
			adapter: CodemodAdapterId.Goober,
			name: "styled tagged template",
			expectation: "converted",
			source:
				'import { styled } from "goober";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
		},
		{
			adapter: CodemodAdapterId.Goober,
			name: "css tagged template",
			expectation: "converted",
			file: "styles.ts",
			source: 'import { css } from "goober";\nexport const card = css`color: red; padding: 1rem;`;',
		},
		{
			adapter: CodemodAdapterId.Goober,
			name: "setup context",
			expectation: "context",
			file: "setup.ts",
			source:
				'import React from "react";\nimport { setup } from "goober";\nsetup(React.createElement);',
		},
		{
			adapter: CodemodAdapterId.Aphrodite,
			name: "font-face array value",
			expectation: "converted",
			source:
				'import { StyleSheet } from "aphrodite";\nexport const styles = StyleSheet.create({ fonts: { fontFamily: [{ fontFamily: "Inter", src: "url(inter.woff2)" }] } });',
		},
		{
			adapter: CodemodAdapterId.Aphrodite,
			name: "array composition",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { StyleSheet } from "aphrodite";\nexport const styles = StyleSheet.create({ card: [{ color: "red" }, { padding: 8 }] });',
		},
		{
			adapter: CodemodAdapterId.Treat,
			name: "treat style",
			expectation: "converted",
			file: "styles.treat.ts",
			source:
				'import { style } from "treat";\nexport const card = style({ color: "red", padding: 8 });',
		},
		{
			adapter: CodemodAdapterId.Treat,
			name: "createTheme context",
			expectation: "context",
			file: "theme.treat.ts",
			source:
				'import { createTheme } from "treat";\nexport const theme = createTheme({ colors: { brand: "red" } });',
		},
		{
			adapter: CodemodAdapterId.Compiled,
			name: "cssMap",
			expectation: "converted",
			source:
				'import { cssMap } from "@compiled/react";\nexport const colors = cssMap({ red: { color: "red" } });',
		},
		{
			adapter: CodemodAdapterId.Compiled,
			name: "keyframes",
			expectation: "converted",
			source:
				'import { keyframes } from "@compiled/react";\nexport const pulse = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
		},
		{
			adapter: CodemodAdapterId.Compiled,
			name: "styled component",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { styled } from "@compiled/react";\nexport const Card = styled.button({ color: "red" });',
		},
		{
			adapter: CodemodAdapterId.Compiled,
			name: "ClassNames composition",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { css, ClassNames } from "@compiled/react";\nexport const Card = () => <ClassNames>{({ css }) => <button className={css({ color: "red" })} />}</ClassNames>;',
		},
		{
			adapter: CodemodAdapterId.Compiled,
			name: "ClassNames dynamic render prop",
			expectation: "residual",
			file: "Card.tsx",
			source:
				'import { ClassNames } from "@compiled/react";\nconst color = "red";\nexport const Card = () => <ClassNames>{({ css }) => <button className={css({ color })} />}</ClassNames>;',
		},
		{
			adapter: CodemodAdapterId.Compiled,
			name: "ClassNames aliased composition",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { ClassNames as Names } from "@compiled/react";\nexport const Card = () => <Names>{({ css }) => <button className={css({ color: "red" })} />}</Names>;',
		},
		{
			adapter: CodemodAdapterId.Compiled,
			name: "CSS prop",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { css } from "@compiled/react";\nexport const Card = () => <button css={css({ color: "red" })} />;',
		},
		{
			adapter: CodemodAdapterId.ChakraUi,
			name: "recipe usage",
			expectation: "residual",
			source:
				'import { defineRecipe, useRecipe } from "@chakra-ui/react";\nconst buttonRecipe = defineRecipe({ base: { color: "red" } });\nexport const button = useRecipe({ recipe: buttonRecipe });',
		},
		{
			adapter: CodemodAdapterId.ChakraUi,
			name: "globalCss system config",
			expectation: "context",
			file: "theme.ts",
			source:
				'import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";\nconst config = defineConfig({ globalCss: { "html, body": { margin: 0 } } });\nexport const system = createSystem(defaultConfig, config);',
		},
		{
			adapter: CodemodAdapterId.ChakraUi,
			name: "token helper context",
			expectation: "context",
			file: "theme.ts",
			source:
				'import { defaultSystem } from "@chakra-ui/react";\nexport const color = defaultSystem.token("colors.red.200");',
		},
		{
			adapter: CodemodAdapterId.Mui,
			name: "styled component",
			expectation: "converted",
			source:
				'import { styled } from "@mui/system";\nexport const Card = styled("div")({ color: "red", padding: 8 });',
		},
		{
			adapter: CodemodAdapterId.Mui,
			name: "theme callback",
			expectation: "residual",
			file: "Card.tsx",
			source:
				'import { styled } from "@mui/system";\nexport const Card = styled("div")(({ theme }) => ({ color: theme.palette.primary.main }));',
		},
		{
			adapter: CodemodAdapterId.Mui,
			name: "ThemeProvider context",
			expectation: "context",
			file: "App.tsx",
			source:
				'import { ThemeProvider } from "@mui/material";\nexport const App = () => <ThemeProvider theme={{ palette: { primary: { main: "red" } } }}><div /></ThemeProvider>;',
		},
		{
			adapter: CodemodAdapterId.Mantine,
			name: "styles API",
			expectation: "residual",
			source:
				'import { Button } from "@mantine/core";\nexport const App = () => <Button styles={{ root: { color: "red" } }} />;',
		},
		{
			adapter: CodemodAdapterId.Mantine,
			name: "classNames API",
			expectation: "residual",
			file: "App.tsx",
			source:
				'import { Button } from "@mantine/core";\nexport const App = () => <Button classNames={{ root: "button-root" }} />;',
		},
		{
			adapter: CodemodAdapterId.Mantine,
			name: "MantineProvider context",
			expectation: "context",
			file: "App.tsx",
			source:
				'import { MantineProvider } from "@mantine/core";\nexport const App = () => <MantineProvider theme={{ colors: { brand: ["red"] } }}><div /></MantineProvider>;',
		},
		{
			adapter: CodemodAdapterId.NextYak,
			name: "styled tagged template",
			expectation: "converted",
			source:
				'import { styled } from "next-yak";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
		},
		{
			adapter: CodemodAdapterId.NextYak,
			name: "CSS prop",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import { css } from "next-yak";\nexport const Card = () => <button css={css`color: red;`} />;',
		},
		{
			adapter: CodemodAdapterId.Bamboo,
			name: "styled-system object",
			expectation: "converted",
			source:
				'import { css } from "styled-system/css";\nexport const card = css({ display: "flex", gap: "4" });',
		},
		{
			adapter: CodemodAdapterId.Style9,
			name: "named style map",
			expectation: "converted",
			source:
				'import style9 from "style9";\nexport const styles = style9.create({ card: { color: "red" }, muted: { opacity: 0.5 } });',
		},
		{
			adapter: CodemodAdapterId.Style9,
			name: "style9 call composition",
			expectation: "converted",
			file: "Card.tsx",
			source:
				'import style9 from "style9";\nconst styles = style9.create({ card: { color: "red" } });\nexport const Card = () => <div className={style9(styles.card)} />;',
		},
		{
			adapter: CodemodAdapterId.SolidStyled,
			name: "static component template",
			expectation: "converted",
			source:
				'import { styled } from "solid-styled-components";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
		},
		{
			adapter: CodemodAdapterId.SolidStyled,
			name: "prop callback",
			expectation: "runtime",
			file: "Card.tsx",
			source:
				'import { styled } from "solid-styled-components";\nexport const Card = styled.button`color: ${(props) => props.color};`;',
		},
		{
			adapter: CodemodAdapterId.VueStyled,
			name: "static component template",
			expectation: "converted",
			source:
				'import styled from "vue-styled-components";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
		},
		{
			adapter: CodemodAdapterId.VueStyled,
			name: "theme callback",
			expectation: "runtime",
			file: "Card.vue",
			source:
				'<script setup>\nimport styled from "vue-styled-components";\nconst Card = styled.div`color: ${props => props.color};`;\n</script>\n<template><Card color="red" /></template>',
		},
		{
			adapter: CodemodAdapterId.ReactNative,
			name: "StyleSheet named map",
			expectation: "converted",
			source:
				'import { StyleSheet } from "react-native";\nexport const styles = StyleSheet.create({ card: { padding: 8, backgroundColor: "red" } });',
		},
		{
			adapter: CodemodAdapterId.ReactNative,
			name: "inline style array",
			expectation: "converted",
			file: "App.tsx",
			source:
				'import { View } from "react-native";\nexport const App = () => <View style={[{ padding: 8 }, { backgroundColor: "red" }]} />;',
		},
		{
			adapter: CodemodAdapterId.ReactNative,
			name: "Platform.select context",
			expectation: "context",
			file: "styles.ts",
			source:
				'import { Platform } from "react-native";\nexport const style = Platform.select({ ios: { padding: 8 }, android: { padding: 4 } });',
		},
		{
			adapter: CodemodAdapterId.Tokenami,
			name: "css.compose",
			expectation: "converted",
			source:
				'import { css } from "@tokenami/css";\nexport const card = css.compose({ color: "red", padding: "1rem" });',
		},
		{
			adapter: CodemodAdapterId.Tokenami,
			name: "alias and custom property selector",
			expectation: "converted",
			file: "styles.ts",
			source:
				'import { css } from "@tokenami/css";\nexport const card = css({ "--card-color": "red", "&[data-state=active]": { color: "var(--card-color)" } });',
		},
		{
			adapter: CodemodAdapterId.Tokenami,
			name: "config context",
			expectation: "context",
			file: "tokenami.config.ts",
			source:
				'export default { aliases: { ink: "color" }, responsive: { md: "@media (min-width: 48rem)" }, tokens: { brand: "red" } };',
		},
		{
			adapter: CodemodAdapterId.UnoCSS,
			name: "variant utility",
			expectation: "residual",
			file: "App.tsx",
			source:
				'export const App = () => <div className="hover:[background-color:black] md:[display:flex]" />;',
		},
		{
			adapter: CodemodAdapterId.UnoCSS,
			name: "unknown shortcut",
			expectation: "residual",
			source: 'export const App = () => <div className="btn-primary" />;',
		},
		{
			adapter: CodemodAdapterId.UnoCSS,
			name: "preset config",
			expectation: "context",
			file: "uno.config.ts",
			source:
				'import { defineConfig } from "unocss";\nexport default defineConfig({ shortcuts: { btn: "px-4 py-2" }, presets: [] });',
		},
		{
			adapter: CodemodAdapterId.Tailwind,
			name: "arbitrary utility",
			expectation: "residual",
			file: "App.tsx",
			source:
				'export const App = () => <div className="[color:rebeccapurple] md:[display:flex]" />;',
		},
		{
			adapter: CodemodAdapterId.Tailwind,
			name: "custom variant candidate",
			expectation: "residual",
			file: "App.tsx",
			source: 'export const App = () => <div className="[&[data-state=active]]:[color:red]" />;',
		},
		{
			adapter: CodemodAdapterId.Tailwind,
			name: "unknown project utility",
			expectation: "residual",
			source: 'export const App = () => <div className="btn-primary" />;',
		},
		{
			adapter: CodemodAdapterId.Tailwind,
			name: "at-rule config",
			expectation: "context",
			file: "app.css",
			source:
				'@import "tailwindcss";\n@theme { --color-brand: #123456; }\n@utility content-auto { content-visibility: auto; }\n@custom-variant theme-midnight (&:where([data-theme="midnight"] *));\n@plugin "@tailwindcss/forms";',
		},
		{
			adapter: CodemodAdapterId.Tamagui,
			name: "createTamagui config",
			expectation: "context",
			file: "tamagui.config.ts",
			source:
				'import { createTamagui, createTokens } from "tamagui";\nexport const config = createTamagui({ tokens: createTokens({ color: { red: "#ff0000" } }) });',
		},
		{
			adapter: CodemodAdapterId.Tamagui,
			name: "styled theme callback",
			expectation: "residual",
			file: "Card.tsx",
			source:
				'import { styled, View } from "tamagui";\nexport const Card = styled(View, ({ theme }) => ({ color: theme.color }));',
		},
		{
			adapter: CodemodAdapterId.CssModules,
			name: "composes",
			expectation: "converted",
			file: "Card.module.css",
			source: ".card { color: red; }\n.primary { composes: card; font-weight: 600; }",
		},
		{
			adapter: CodemodAdapterId.Sass,
			name: "scss variables and nesting",
			expectation: "residual",
			file: "card.scss",
			source:
				"$brand: red;\n.card { color: $brand; padding: 1rem; &__title { font-weight: 600; } }",
		},
		{
			adapter: CodemodAdapterId.Less,
			name: "less variables and nesting",
			expectation: "residual",
			file: "card.less",
			source:
				"@brand: red;\n.card { color: @brand; padding: 1rem; &__title { font-weight: 600; } }",
		},
		{
			adapter: CodemodAdapterId.AuthoredCss,
			name: "at-rules",
			expectation: "residual",
			file: "card.css",
			source:
				"@media (prefers-color-scheme: dark) {\n  .card { color: white; }\n}\n@keyframes pulse {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}",
		},
		{
			adapter: CodemodAdapterId.Bamboo,
			name: "patterns and cva",
			expectation: "identity",
			source:
				'import { circle } from "styled-system/patterns";\nimport { cva } from "styled-system/recipes";\nexport const avatar = circle({ size: "8" });\nexport const button = cva({ base: { padding: "2" } });',
		},
		{
			adapter: CodemodAdapterId.CssModules,
			name: "named class map",
			expectation: "converted",
			file: "Card.module.css",
			source: ".card { color: red; padding: 1rem; }\n.title { font-weight: 600; }",
		},
		{
			adapter: CodemodAdapterId.CssModules,
			name: "global pseudo and descendant selectors",
			expectation: "residual",
			file: "Card.module.css",
			source: ":global(.footer) { color: gray; }",
		},
		{
			adapter: CodemodAdapterId.CssModules,
			name: "local pseudo selector",
			expectation: "converted",
			file: "Card.module.css",
			source: ".card:hover { color: red; }",
		},
		{
			adapter: CodemodAdapterId.Sass,
			name: "scss mixins",
			expectation: "residual",
			file: "card.scss",
			source: "@mixin flex($gap) { display: flex; gap: $gap; }\n.card { @include flex(1rem); }",
		},
		{
			adapter: CodemodAdapterId.Sass,
			name: "scss module use",
			expectation: "residual",
			file: "card.scss",
			source: '@use "sass:math";\n.card { padding: 1rem; }',
		},
		{
			adapter: CodemodAdapterId.Less,
			name: "less mixin call",
			expectation: "residual",
			file: "card.less",
			source: ".shadow() { box-shadow: 0 1px 2px black; }\n.card { .shadow(); color: red; }",
		},
		{
			adapter: CodemodAdapterId.Less,
			name: "less plain rules",
			expectation: "residual",
			file: "card.less",
			source: ".card { color: red; }\n.title { font-weight: 600; }",
		},
		{
			adapter: CodemodAdapterId.AuthoredCss,
			name: "non-class selectors",
			expectation: "residual",
			file: "card.css",
			source: ':root { --brand: red; }\n[data-theme="dark"] .card { color: white; }',
		},
		{
			adapter: CodemodAdapterId.AuthoredCss,
			name: "multi-rule stylesheet",
			expectation: "residual",
			file: "card.css",
			source: ".card { color: red; }\n.title { font-weight: 600; }",
		},
	];
}
