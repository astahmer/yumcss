import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	CodemodAdapterId,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";

type ApiExpectation = "converted" | "runtime" | "residual" | "identity" | "context";

interface OfficialApiFamilyCase {
	readonly adapter: CodemodAdapterId;
	readonly name: string;
	readonly expectation: ApiExpectation;
	readonly file?: string;
	readonly source: string;
}

/**
 * The primary matrix proves one public form per adapter. This catalog proves
 * the remaining documented syntax families that have different IR semantics:
 * rules, maps, templates, components, globals, keyframes, and composition.
 */
class OfficialAdapterApiFamilyCatalog {
	static cases(): readonly OfficialApiFamilyCase[] {
		return [
			{
				adapter: CodemodAdapterId.Pandwind,
				name: "css.group named map",
				expectation: "identity",
				file: "styles.ts",
				source:
					'import { createCss } from "pandwind/css";\nconst css = createCss();\nexport const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });',
			},
			{
				adapter: CodemodAdapterId.Panda,
				name: "cva recipe",
				expectation: "residual",
				file: "styles.ts",
				source:
					'import { cva } from "styled-system/recipes";\nexport const button = cva({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });',
			},
			{
				adapter: CodemodAdapterId.Panda,
				name: "sva slot recipe",
				expectation: "residual",
				file: "styles.ts",
				source:
					'import { sva } from "styled-system/recipes";\nexport const card = sva({ slots: ["root", "label"], base: { root: { color: "red" } } });',
			},
			{
				adapter: CodemodAdapterId.Panda,
				name: "generated styled component",
				expectation: "residual",
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
					'import stylex from "@stylexjs/stylex";\nexport const styles = stylex.create({ card: { color: "red" } });',
			},
			{
				adapter: CodemodAdapterId.StyleX,
				name: "keyframes",
				expectation: "converted",
				file: "styles.ts",
				source:
					'import stylex from "@stylexjs/stylex";\nexport const pulse = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
			},
			{
				adapter: CodemodAdapterId.StyleX,
				name: "defineVars",
				expectation: "converted",
				file: "styles.ts",
				source:
					'import stylex from "@stylexjs/stylex";\nexport const theme = stylex.defineVars({ accent: "red" });',
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
					'import stylex from "@stylexjs/stylex";\nimport { vars } from "./vars";\nexport const theme = stylex.createTheme(vars, { accent: "blue" });',
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
				name: "injectGlobal object",
				expectation: "converted",
				file: "styles.ts",
				source:
					'import { injectGlobal } from "@emotion/css";\ninjectGlobal({ body: { margin: 0 } });',
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
				name: "createGlobalStyle object",
				expectation: "converted",
				file: "styles.ts",
				source:
					'import { createGlobalStyle } from "styled-components";\nexport const Global = createGlobalStyle({ body: { margin: 0 } });',
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
				expectation: "residual",
				source:
					'import { styleVariants } from "@vanilla-extract/css";\nexport const variants = styleVariants({ primary: { color: "red" } });',
			},
			{
				adapter: CodemodAdapterId.VanillaExtract,
				name: "recipe",
				expectation: "residual",
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
				expectation: "context",
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
				expectation: "residual",
				source:
					'import { createComponent } from "react-fela";\nexport const Card = createComponent(() => ({ color: "red" }));',
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
				source:
					'import { css } from "goober";\nexport const card = css`color: red; padding: 1rem;`;',
			},
			{
				adapter: CodemodAdapterId.Goober,
				name: "setup context",
				expectation: "context",
				file: "setup.ts",
				source: 'import { setup } from "goober";\nsetup({ prefix: "pw-" });',
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
				expectation: "residual",
				source:
					'import { cssMap } from "@compiled/react";\nexport const colors = cssMap({ red: { color: "red" } });',
			},
			{
				adapter: CodemodAdapterId.Compiled,
				name: "keyframes",
				expectation: "residual",
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
				expectation: "residual",
				file: "Card.tsx",
				source:
					'import { ClassNames } from "@compiled/react";\nexport const Card = () => <ClassNames>{null}</ClassNames>;',
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
					'import { useRecipe } from "@chakra-ui/react";\nexport const button = useRecipe(buttonRecipe);',
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
				expectation: "converted",
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
				expectation: "converted",
				file: "App.tsx",
				source:
					'export const App = () => <div className="[color:rebeccapurple] md:[display:flex]" />;',
			},
			{
				adapter: CodemodAdapterId.Tailwind,
				name: "custom variant candidate",
				expectation: "converted",
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
		];
	}
}

function migrate(api: OfficialApiFamilyCase): AdapterMigrationResult {
	return runAdapterMigration(api.source, {
		from: api.adapter,
		to: CodemodAdapterId.Pandwind,
		file: api.file ?? "App.tsx",
		mode: "safe",
		semantic: { source: { framework: "react" } },
	});
}

function withoutMigrationMarkers(code: string): string {
	return code.replace(/\/\/ pandwind:migrate-skip[^\n]*\n/g, "");
}

function normalizeSource(code: string): string {
	return withoutMigrationMarkers(code).replace(/\s+/g, " ").trim();
}

describe("official adapter API families", () => {
	test("covers every registered adapter's documented secondary forms", () => {
		const cases = OfficialAdapterApiFamilyCatalog.cases();
		const results = cases.map((api) => ({ api, result: migrate(api) }));
		const covered = new Set(results.map(({ api }) => api.adapter));

		expect(covered).toEqual(new Set(BUILTIN_CODEMOD_ADAPTER_IDS));
		for (const { api, result } of results) {
			if (api.expectation === "identity") {
				expect(result.converted, `${api.adapter}/${api.name}`).toBe(0);
				expect(result.skipped, `${api.adapter}/${api.name}`).toBe(0);
				expect(result.residuals, `${api.adapter}/${api.name}`).toEqual([]);
				expect(normalizeSource(result.code), `${api.adapter}/${api.name}`).toBe(
					normalizeSource(api.source),
				);
				continue;
			}
			if (api.expectation === "converted") {
				expect(result.converted, `${api.adapter}/${api.name}`).toBeGreaterThan(0);
				expect(result.skipped, `${api.adapter}/${api.name}`).toBe(0);
				expect(result.residuals, `${api.adapter}/${api.name}`).toEqual([]);
				expect(result.code, `${api.adapter}/${api.name}`).not.toContain("migrate-skip");
				if (api.name === "custom variant candidate") {
					expect(result.code).toContain("data-state");
					expect(result.code).not.toContain("dataState=active]]");
					expect(result.code).not.toContain('"[color:red"');
				}
				if (api.name === "generated styled JSX style props") {
					expect(result.code).toContain("<button");
					expect(result.code).toContain("css.class");
					expect(result.code).not.toContain("<styled.button");
				}
				if (api.name === "CSS prop" && api.adapter === CodemodAdapterId.Compiled) {
					expect(result.code).toContain("className={css.class");
					expect(result.code).not.toContain(" css={");
				}
				if (api.name === "imperative applyTo") {
					expect(result.code).toContain("element.classList.add(sheet.card)");
					expect(result.code).not.toContain("sheet.attach()");
				}
				if (api.name === "Global component") {
					expect(result.code).toContain('kind: "global", selector: "body"');
					expect(result.code).not.toContain("=> () =>");
					expect(result.code).not.toContain("<Global");
				}
				if (api.name === "styled component" && api.adapter === CodemodAdapterId.Stitches) {
					expect(result.code).toContain('props.as ?? "div"');
					expect(result.code).toContain("props.className");
				}
				if (api.name === "styled tagged template" && api.adapter === CodemodAdapterId.Goober) {
					expect(result.code).toContain("css.class");
					expect(result.code).not.toContain("pandwind:migrate-skip");
				}
			} else if (api.expectation === "runtime") {
				expect(result.converted, `${api.adapter}/${api.name}`).toBeGreaterThan(0);
				expect(result.skipped, `${api.adapter}/${api.name}`).toBe(0);
				expect(result.residuals, `${api.adapter}/${api.name}`).toEqual([]);
				expect(result.code, `${api.adapter}/${api.name}`).not.toContain("migrate-skip");
				expect(result.outcomes, `${api.adapter}/${api.name}`).toEqual(
					expect.arrayContaining([expect.objectContaining({ outcome: "host-runtime" })]),
				);
			} else if (api.expectation === "context") {
				expect(result.converted, `${api.adapter}/${api.name}`).toBe(0);
				if (result.skipped === 0) {
					expect(result.residuals, `${api.adapter}/${api.name}`).toEqual([]);
					expect(normalizeSource(result.code), `${api.adapter}/${api.name}`).toBe(
						normalizeSource(api.source),
					);
				} else {
					expect(result.residuals, `${api.adapter}/${api.name}`).not.toEqual([]);
					expect(result.code, `${api.adapter}/${api.name}`).toContain("migrate-skip");
					expect(normalizeSource(result.code), `${api.adapter}/${api.name}`).toBe(
						normalizeSource(api.source),
					);
				}
			} else {
				expect(result.residuals, `${api.adapter}/${api.name}`).not.toEqual([]);
				expect(result.code, `${api.adapter}/${api.name}`).toContain("migrate-skip");
				expect(normalizeSource(result.code), `${api.adapter}/${api.name}`).toBe(
					normalizeSource(api.source),
				);
			}
		}

		expect(
			Object.fromEntries(
				results.map(({ api, result }) => [`${api.adapter}/${api.name}`, routeEvidence(result)]),
			),
		).toMatchInlineSnapshot(`
			{
			  "aphrodite/array composition": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const styles = css.vars({ card: [{ color: "red" }, { padding: 8 }] });",
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
			  },
			  "aphrodite/font-face array value": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const styles = (css.sheet.registerSemanticRules([{ kind: "font-face", declarations: [{ property: "fontFamily", value: "Inter" }, { property: "src", value: "url(inter.woff2)" } ] }]), css.group({ fonts: {  } }));",
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
			  "bamboo/styled-system object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ gap: "4", display: "flex" });",
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
			  "chakra-ui/globalCss system config": {
			    "changed": false,
			    "code": "import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
			const config = defineConfig({ globalCss: { "html, body": { margin: 0 } } });
			export const system = createSystem(defaultConfig, config);",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "chakra-ui/recipe usage": {
			    "changed": true,
			    "code": "import { useRecipe } from "@chakra-ui/react";
			export const button = // pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			useRecipe(buttonRecipe);",
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
			  "chakra-ui/token helper context": {
			    "changed": false,
			    "code": "import { defaultSystem } from "@chakra-ui/react";
			export const color = defaultSystem.token("colors.red.200");",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "compiled/CSS prop": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const Card = () => <button className={css.class({ color: "red" })}/>;",
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
			  "compiled/ClassNames composition": {
			    "changed": true,
			    "code": "import { ClassNames } from "@compiled/react";
			export const Card = () => // pandwind:migrate-skip (route: compiled -> pandwind | parse-residual: component | available: named-map, residual)
			<ClassNames>{null}</ClassNames>;",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Compiled ClassNames requires a host-aware render-prop lowering",
			        "kind": "component",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "compiled/cssMap": {
			    "changed": true,
			    "code": "import { cssMap } from "@compiled/react";
			export const colors = // pandwind:migrate-skip (route: compiled -> pandwind | parse-residual: composition | available: named-map, residual)
			cssMap({ red: { color: "red" } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Compiled cssMap requires a named target map lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "compiled/keyframes": {
			    "changed": true,
			    "code": "import { keyframes } from "@compiled/react";
			export const pulse = // pandwind:migrate-skip (route: compiled -> pandwind | parse-residual: keyframes | available: named-map, residual)
			keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Compiled keyframes require rule-level target lowering",
			        "kind": "keyframes",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "compiled/styled component": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const Card = css.class({ color: "red" });",
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
			  "emotion/Global component": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const App = () => (css.sheet.registerSemanticRules([{ kind: "global", selector: "body", declarations: [{ property: "margin", value: 0 }], children: [] }]), null);",
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
			  "emotion/css prop": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const Card = () => <button className={css.class({ color: "red" })}/>;",
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
			  "emotion/injectGlobal object": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			() => (css.sheet.registerSemanticRules([{ kind: "global", selector: "body", declarations: [{ property: "margin", value: 0 }], children: [] }]), null);",
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
			  "emotion/keyframes object": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const pulse = (css.sheet.registerSemanticRules([{ kind: "keyframes", name: "pw-kf-pulse", children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]), "pw-kf-pulse");",
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
			  "emotion/styled component object": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ color: "red" }); const component = (props) => { const Component = props.as ?? "button"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1fn70s4", props.className)} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
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
			  "emotion/tagged css template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ padding: "1rem", color: "red" });",
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
			  "fela/createComponent": {
			    "changed": true,
			    "code": "import { createComponent } from "react-fela";
			export const Card = // pandwind:migrate-skip (route: fela -> pandwind | parse-residual: component | available: named-map, residual)
			createComponent(() => ({ color: "red" }));",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Fela createComponent requires a host/component lowering",
			        "kind": "component",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "fela/renderer plugins context": {
			    "changed": true,
			    "code": "import { createRenderer } from "fela";
			const plugin = (element) => element;
			export const renderer = // pandwind:migrate-skip (route: fela -> pandwind | parse-residual: configuration | available: named-map, residual)
			createRenderer({ plugins: [plugin] });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Fela renderer configuration and plugins require target-aware lowering",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "goober/css tagged template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ padding: "1rem", color: "red" });",
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
			  "goober/setup context": {
			    "changed": true,
			    "code": "import { setup } from "goober";
			// pandwind:migrate-skip (route: goober -> pandwind | parse-residual: configuration | available: named-map, residual)
			setup({ prefix: "pw-" });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Goober setup changes runtime rendering and requires target-aware lowering",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "goober/styled tagged template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ padding: "1rem", color: "red" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "jss/createRule named map": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const rule = css.class({ color: "red" });",
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
			  "jss/createStyleSheet named map": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const sheet = css.group({ card: { color: "red" } });",
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
			  "jss/imperative applyTo": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const sheet = css.group({ card: { color: "red" } });

			element.classList.add(sheet.card);",
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
			  "linaria/css prop": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const Card = () => <button css={css.class({ color: "red" })} />;",
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
			  "linaria/styled tagged template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ padding: "1rem", color: "red" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "mantine/MantineProvider context": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: mantine -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			import { MantineProvider } from "@mantine/core";
			export const App = () => // pandwind:migrate-skip (route: mantine -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			<MantineProvider theme={{ colors: { brand: ["red"] } }}><div /></MantineProvider>;",
			    "converted": 0,
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
			        "hint": "MantineProvider requires target-aware theme and runtime-context lowering",
			        "kind": "runtime-context",
			        "preserved": undefined,
			      },
			      {
			        "hint": "MantineProvider requires target-aware theme and runtime-context lowering",
			        "kind": "runtime-context",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
			  },
			  "mantine/classNames API": {
			    "changed": true,
			    "code": "import { Button } from "@mantine/core";
			export const App = () => <Button // pandwind:migrate-skip (route: mantine -> pandwind | parse-residual: host-framework | available: named-map, residual)
			classNames={{ root: "button-root" }} />;",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Mantine styles, classNames, and vars require component-aware host lowering",
			        "kind": "host-framework",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "mantine/styles API": {
			    "changed": true,
			    "code": "import { Button } from "@mantine/core";
			export const App = () => <Button // pandwind:migrate-skip (route: mantine -> pandwind | parse-residual: host-framework | available: named-map, residual)
			styles={{ root: { color: "red" } }} />;",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Mantine styles, classNames, and vars require component-aware host lowering",
			        "kind": "host-framework",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "mui/ThemeProvider context": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			import { ThemeProvider } from "@mui/material";
			export const App = () => // pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			<ThemeProvider theme={{ palette: { primary: { main: "red" } } }}><div /></ThemeProvider>;",
			    "converted": 0,
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
			        "hint": "MUI providers require target-aware theme and style-engine lowering",
			        "kind": "runtime-context",
			        "preserved": undefined,
			      },
			      {
			        "hint": "MUI providers require target-aware theme and style-engine lowering",
			        "kind": "runtime-context",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
			  },
			  "mui/styled component": {
			    "changed": true,
			    "code": "import { styled } from "@mui/system";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const Card = css.class({ padding: 8, color: "red" });",
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
			  "mui/theme callback": {
			    "changed": true,
			    "code": "import { styled } from "@mui/system";
			export const Card = // pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			styled("div")(({ theme }) => ({ color: theme.palette.primary.main }));",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "MUI styled theme callbacks require target-aware theme lowering",
			        "kind": "runtime-context",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "next-yak/CSS prop": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const Card = () => <button className={css.class({ color: "red" })}/>;",
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
			  "next-yak/styled tagged template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ padding: "1rem", color: "red" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "panda/cva recipe": {
			    "changed": true,
			    "code": "import { cva } from "styled-system/recipes";
			export const button = // pandwind:migrate-skip (route: panda -> pandwind | parse-residual: composition | available: named-map, residual)
			cva({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Panda cva recipes require variant-aware target lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "panda/defineRecipe config": {
			    "changed": false,
			    "code": "import { defineRecipe } from "@pandacss/dev";
			export const button = defineRecipe({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "panda/defineSlotRecipe config": {
			    "changed": false,
			    "code": "import { defineSlotRecipe } from "@pandacss/dev";
			export const card = defineSlotRecipe({ slots: ["root"], base: { root: { color: "red" } } });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "panda/generated styled JSX style props": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const Button = () => <button className={css.class({ color: "red" })} />;",
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
			  "panda/generated styled component": {
			    "changed": true,
			    "code": "import { styled } from "styled-system/jsx";
			export const Card = // pandwind:migrate-skip (route: panda -> pandwind | parse-residual: component | available: named-map, residual)
			styled.div({ base: { color: "red" } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Panda generated styled components require host/component lowering",
			        "kind": "component",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "panda/globalCss config": {
			    "changed": false,
			    "code": "import { defineConfig, defineGlobalStyles } from "@pandacss/dev";
			const globalCss = defineGlobalStyles({ "html, body": { margin: 0 } });
			export default defineConfig({ globalCss });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "panda/sva slot recipe": {
			    "changed": true,
			    "code": "import { sva } from "styled-system/recipes";
			export const card = // pandwind:migrate-skip (route: panda -> pandwind | parse-residual: composition | available: named-map, residual)
			sva({ slots: ["root", "label"], base: { root: { color: "red" } } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Panda sva slot recipes require slot-aware target lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "panda/token helper context": {
			    "changed": false,
			    "code": "import { token } from "styled-system/tokens";
			export const color = token("colors.red.400");",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "pandwind/css.group named map": {
			    "changed": false,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "react-native/Platform.select context": {
			    "changed": true,
			    "code": "import { Platform } from "react-native";
			export const style = // pandwind:migrate-skip (route: react-native -> pandwind | parse-residual: framework-semantics | available: named-map, residual)
			Platform.select({ ios: { padding: 8 }, android: { padding: 4 } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "React Native Platform.select requires platform-aware target lowering",
			        "kind": "framework-semantics",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "react-native/StyleSheet named map": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const styles = css.group({ card: { padding: 8, backgroundColor: "red" } });",
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
			  "react-native/inline style array": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const App = () => <View className={css.vars({ style: [{ padding: 8 }, { backgroundColor: "red" }] }).class} style={css.vars({ style: [{ padding: 8 }, { backgroundColor: "red" }] }).style}/>;",
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
			  },
			  "solid-styled/prop callback": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const staticClass = ""; const component = (props) => {  const dynamic = css.vars({ color: ((props) => props.color)(props) }); const Component = props.as ?? "button"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(staticClass, dynamic.class, "pw-1fn70s4", props.className)} style={{ ...props.style, ...dynamic.style }} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
			    "converted": 1,
			    "outcomes": [
			      {
			        "outcome": "host-runtime",
			        "representation": "residual",
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
			  "solid-styled/static component template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ padding: "1rem", color: "red" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "stitches/createTheme context": {
			    "changed": false,
			    "code": "import { createStitches } from "@stitches/react";
			export const { createTheme } = createStitches({ theme: { colors: { brand: "red" } } });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "stitches/globalCss": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const reset = () => (css.sheet.registerSemanticRules([{ kind: "global", selector: "body", declarations: [{ property: "margin", value: 0 }], children: [] }]), null);",
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
			  "stitches/keyframes": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const pulse = (css.sheet.registerSemanticRules([{ kind: "keyframes", name: "pw-kf-pulse", children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]), "pw-kf-pulse");",
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
			  "stitches/styled component": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ color: "red" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1fn70s4", props.className)} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
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
			  "stitches/variants": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createRecipe } from "pandwind/recipe";
			const css = createCss();

			export const button = createRecipe(css, { base: { compoundVariants: [{ size: "sm", css: { color: "red" } }] }, variants: { "size": { "sm": { padding: 4 } } } });",
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
			  },
			  "style9/named style map": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });",
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
			  "style9/style9 call composition": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			const styles = css.group({ card: { color: "red" } });
			export const Card = () => <div className={cx(styles.card)} />;",
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
			  "styled-components/ThemeProvider context": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: styled-components -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			import { ThemeProvider } from "styled-components";
			export const App = () => // pandwind:migrate-skip (route: styled-components -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			<ThemeProvider theme={{ colors: { brand: "red" } }}><div /></ThemeProvider>;",
			    "converted": 0,
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
			        "hint": "styled-components runtime providers require target-aware context lowering",
			        "kind": "runtime-context",
			        "preserved": undefined,
			      },
			      {
			        "hint": "styled-components runtime providers require target-aware context lowering",
			        "kind": "runtime-context",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
			  },
			  "styled-components/createGlobalStyle object": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const Global = () => (css.sheet.registerSemanticRules([{ kind: "global", selector: "body", declarations: [{ property: "margin", value: 0 }], children: [] }]), null);",
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
			  "styled-components/keyframes tagged template": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const pulse = (css.sheet.registerSemanticRules([{ kind: "keyframes", name: "pw-kf-pulse", children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: "0" }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: "1" }] }] }]), "pw-kf-pulse");",
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
			  "styled-components/polymorphic as": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const Card = css.class({ color: "red" });
			export const App = () => <div as="a" href="/docs" className={Card} />;",
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
			  "styled-components/styled component subject": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			const Link = (props: { href: string }) => <a {...props} />;
			export const Card = (() => { const style = css.class({ color: "red" }); const component = (props) => { const Component = props.as ?? (Link); const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1fn70s4", props.className)} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
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
			  "styled-components/styled tagged template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ padding: "1rem", color: "red" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1fn70s4", props.className)} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
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
			  "styled-components/theme callback": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const staticClass = ""; const component = (props) => {  const dynamic = css.vars({ color: (({ theme }) => theme.colors.brand)(props) }); const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(staticClass, dynamic.class, "pw-1fn70s4", props.className)} style={{ ...props.style, ...dynamic.style }} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
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
			  },
			  "stylex/create": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
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
			  "stylex/createTheme context": {
			    "changed": true,
			    "code": "import stylex from "@stylexjs/stylex";
			import { vars } from "./vars";
			export const theme = // pandwind:migrate-skip (route: stylex -> pandwind | parse-residual: configuration | available: named-map, residual)
			stylex.createTheme(vars, { accent: "blue" });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "StyleX createTheme requires variable-aware theme lowering",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "stylex/defineVars": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const theme = (css.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [{ property: "--accent", value: "red" }] }]), { "accent": "var(--accent)" });",
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
			  "stylex/keyframes": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const pulse = (css.sheet.registerSemanticRules([{ kind: "keyframes", name: "pw-kf-pulse", children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]), "pw-kf-pulse");",
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
			  "stylex/props host projection": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			const styles = css.group({ card: { color: "red" } });
			export const Card = () => <div {...css.props(styles.card)} />;",
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
			  "tailwind/arbitrary utility": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div className={css.class({ color: "rebeccapurple", md: { display: "flex" } })}/>;",
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
			  "tailwind/at-rule config": {
			    "changed": false,
			    "code": "@import "tailwindcss";
			@theme { --color-brand: #123456; }
			@utility content-auto { content-visibility: auto; }
			@custom-variant theme-midnight (&:where([data-theme="midnight"] *));
			@plugin "@tailwindcss/forms";",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "tailwind/custom variant candidate": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div className={css.class({ "[&[data-state=active]]": { color: "red" } })}/>;",
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
			  "tailwind/unknown project utility": {
			    "changed": true,
			    "code": "export const App = () => // pandwind:migrate-skip (route: tailwind -> pandwind | parse-residual: unknown-utility | available: named-map, residual)
			<div className="btn-primary" />;",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Tailwind utility requires the project engine or a custom preset",
			        "kind": "unknown-utility",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "tokenami/alias and custom property selector": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ cardColor: "red", "&[data-state=active]": { color: "var(--card-color)" } });",
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
			  "tokenami/config context": {
			    "changed": false,
			    "code": "export default { aliases: { ink: "color" }, responsive: { md: "@media (min-width: 48rem)" }, tokens: { brand: "red" } };",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "tokenami/css.compose": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ padding: "1rem", color: "red" });",
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
			  "treat/createTheme context": {
			    "changed": true,
			    "code": "import { createTheme } from "treat";
			export const theme = // pandwind:migrate-skip (route: treat -> pandwind | parse-residual: configuration | available: named-map, residual)
			createTheme({ colors: { brand: "red" } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Treat createTheme requires theme-aware target lowering",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "treat/treat style": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ padding: 8, color: "red" });",
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
			  "unocss/preset config": {
			    "changed": false,
			    "code": "import { defineConfig } from "unocss";
			export default defineConfig({ shortcuts: { btn: "px-4 py-2" }, presets: [] });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "unocss/unknown shortcut": {
			    "changed": true,
			    "code": "export const App = () => // pandwind:migrate-skip (route: unocss -> pandwind | parse-residual: unknown-utility | available: named-map, residual)
			<div className="btn-primary" />;",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "UnoCSS utility requires the project resolver/preset to be loaded",
			        "kind": "unknown-utility",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "unocss/variant utility": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div className={css.class({ hover: { backgroundColor: "black" }, md: { display: "flex" } })}/>;",
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
			  "vanilla-extract/createTheme": {
			    "changed": true,
			    "code": "import { createTheme } from "@vanilla-extract/css";
			export const themeClass = // pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: configuration | available: named-map, residual)
			createTheme({ colors: { brand: "red" } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Vanilla Extract themes require static contract/config lowering",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "vanilla-extract/createVar": {
			    "changed": true,
			    "code": "import { createVar } from "@vanilla-extract/css";
			export const brand = // pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: configuration | available: named-map, residual)
			createVar();",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Vanilla Extract createVar requires contract-aware variable lowering",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "vanilla-extract/fontFace": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const inter = (css.sheet.registerSemanticRules([{ kind: "font-face", declarations: [{ property: "fontFamily", value: "Inter" }, { property: "src", value: "url(inter.woff2)" } ] }]), css.group({  }));",
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
			  "vanilla-extract/globalStyle": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			() => (css.sheet.registerSemanticRules([{ kind: "global", selector: "body", declarations: [{ property: "margin", value: 0 }], children: [] }]), null);",
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
			  "vanilla-extract/keyframes": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);

			export const pulse = (css.sheet.registerSemanticRules([{ kind: "keyframes", name: "pw-kf-pulse", children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]), "pw-kf-pulse");",
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
			  "vanilla-extract/recipe": {
			    "changed": true,
			    "code": "import { recipe } from "@vanilla-extract/recipes";
			export const button = // pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: composition | available: named-map, residual)
			recipe({ base: { color: "red" }, variants: { size: { sm: { padding: 4 } } } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Vanilla Extract recipes require variant-aware target lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "vanilla-extract/styleVariants": {
			    "changed": true,
			    "code": "import { styleVariants } from "@vanilla-extract/css";
			export const variants = // pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: composition | available: named-map, residual)
			styleVariants({ primary: { color: "red" } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Vanilla Extract styleVariants require variant-aware target lowering",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "vanilla-extract/theme contract": {
			    "changed": true,
			    "code": "import { createThemeContract } from "@vanilla-extract/css";
			export const vars = // pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: configuration | available: named-map, residual)
			createThemeContract({ colors: { brand: null } });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Vanilla Extract theme contracts require contract-aware variable lowering",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "vue-styled/static component template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ padding: "1rem", color: "red" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "vue-styled/theme callback": {
			    "changed": true,
			    "code": "<script setup>

			import { createCx } from "pandwind/cx";
			import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);
			const cx = createCx();
			const Card = (props) => <div {...props} className={cx((props) => { const style = css.vars({ color: (props => props.color)(props) }); const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style.class, props.className)} style={{ ...props.style, ...style.style }} />; }, props.className)} />;
			</script>
			<template><Card color="red" /></template>",
			    "converted": 1,
			    "outcomes": [
			      {
			        "outcome": "host-runtime",
			        "representation": "residual",
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
