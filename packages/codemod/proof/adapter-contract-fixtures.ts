import { CodemodAdapterId } from "../src/swap/index.ts";
import type { AdapterContractFixture } from "../src/swap/index.ts";

/** One representative source shape for every built-in adapter. */
export const adapterContractFixtures: readonly AdapterContractFixture[] = [
	{
		adapter: CodemodAdapterId.YumCSS,
		file: "yumcss.ts",
		source: "css.class({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.Panda,
		file: "panda.ts",
		source: "import { css } from 'styled-system/css'; css({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.Emotion,
		file: "emotion.ts",
		source: "import { css } from '@emotion/css'; css({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.StyledComponents,
		file: "styled-components.ts",
		source: "import styled from 'styled-components'; styled.div({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.VanillaExtract,
		file: "vanilla-extract.ts",
		source: "import { style } from '@vanilla-extract/css'; style({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.Stitches,
		file: "stitches.ts",
		source: "import { css } from '@stitches/react'; css({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.Linaria,
		file: "linaria.ts",
		source: "import { css } from '@linaria/core'; css`color: red;`",
	},
	{
		adapter: CodemodAdapterId.Jss,
		file: "jss.ts",
		source:
			"import { createUseStyles } from 'react-jss'; createUseStyles({ button: { color: 'red' } })",
	},
	{
		adapter: CodemodAdapterId.Fela,
		file: "fela.ts",
		source: "import { createRenderer } from 'fela'; renderer.renderRule({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.Goober,
		file: "goober.ts",
		source: "import { css } from 'goober'; css({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.Aphrodite,
		file: "aphrodite.ts",
		source:
			"import { StyleSheet } from 'aphrodite'; StyleSheet.create({ button: { color: 'red' } })",
	},
	{
		adapter: CodemodAdapterId.Style9,
		file: "style9.ts",
		source: "import style9 from 'style9'; style9.create({ button: { color: 'red' } })",
	},
	{
		adapter: CodemodAdapterId.Treat,
		file: "treat.ts",
		source: "import { style } from './styles.treat'; style({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.Compiled,
		file: "compiled.ts",
		source: "import { css } from '@compiled/react'; css({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.StyleX,
		file: "stylex.ts",
		source: "import stylex from '@stylexjs/stylex'; stylex.create({ card: { color: 'red' } })",
	},
	{
		adapter: CodemodAdapterId.ReactStrictDom,
		file: "react-strict-dom.tsx",
		source:
			'import { css, html } from "react-strict-dom";\n' +
			'const styles = css.create({ card: { color: "red", padding: "1rem" } });\n' +
			"export const Card = () => <html.div style={styles.card} />;",
	},
	{
		adapter: CodemodAdapterId.SolidStyled,
		file: "solid-styled.ts",
		source: "import { styled } from 'solid-styled-components'; styled.div`color: red;`",
	},
	{
		adapter: CodemodAdapterId.VueStyled,
		file: "vue-styled.ts",
		source: "import styled from 'vue-styled-components'; styled.div`color: red;`",
	},
	{
		adapter: CodemodAdapterId.ReactNative,
		file: "react-native.ts",
		source:
			"import { StyleSheet } from 'react-native'; StyleSheet.create({ button: { color: 'red' } })",
	},
	{
		adapter: CodemodAdapterId.Bamboo,
		file: "bamboo.ts",
		source: "import { css } from 'styled-system/css'; css({ color: 'red' })",
	},
	{
		adapter: CodemodAdapterId.NextYak,
		file: "next-yak.ts",
		source: "import { css } from 'next-yak'; css`color: red;`",
	},
	{
		adapter: CodemodAdapterId.ChakraUi,
		file: "chakra-ui.tsx",
		source: "import { Box } from '@chakra-ui/react'; <Box css={{ color: 'tomato' }} />",
	},
	{
		adapter: CodemodAdapterId.Mui,
		file: "mui.tsx",
		source: "import { Box } from '@mui/material'; <Box sx={{ color: 'red' }} />",
	},
	{
		adapter: CodemodAdapterId.Mantine,
		file: "mantine.tsx",
		source: "import { Box } from '@mantine/core'; <Box c='red' />",
	},
	{
		adapter: CodemodAdapterId.Tokenami,
		file: "tokenami.tsx",
		source: "import { css } from '@tokenami/css'; css({ '--hover_color': 'red' })",
	},
	{
		adapter: CodemodAdapterId.Tailwind,
		file: "tailwind.tsx",
		// The dependency-free contract fixture must use syntax the fallback can
		// prove without inventing Tailwind's default utility catalog. Standard
		// utilities are covered by the official-loader fixtures.
		source: "<div className='[color:red] [padding:1rem]' />",
	},
	{
		adapter: CodemodAdapterId.UnoCSS,
		file: "unocss.tsx",
		source: '<div className="[color:red] [padding:1rem]" />',
	},
	{
		adapter: CodemodAdapterId.Tamagui,
		file: "card.tamagui.tsx",
		source: "import { styled, View } from 'tamagui'; styled(View, { color: 'red', padding: '$4' })",
	},
	{
		adapter: CodemodAdapterId.CssModules,
		file: "card.module.css",
		source: ":root { color: red; padding: 1rem; }",
	},
	{
		adapter: CodemodAdapterId.Sass,
		file: "card.scss",
		source: ":root { color: red; padding: 1rem; }",
	},
	{
		adapter: CodemodAdapterId.Less,
		file: "card.less",
		source: ":root { color: red; padding: 1rem; }",
	},
	{
		adapter: CodemodAdapterId.AuthoredCss,
		file: "card.css",
		source: ":root { color: red; padding: 1rem; }",
	},
];
