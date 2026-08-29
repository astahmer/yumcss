import {
	DifferentialProofKind,
	type DifferentialMatrixCatalog,
	type StyleProgram,
} from "../src/swap/index.ts";

const canonical = (program: StyleProgram): string =>
	program.rules.map((rule) => `${rule.kind}:${rule.selector ?? rule.name ?? ""}`).join("|");
const render = (program: StyleProgram) => ({
	html: `<div data-style="${canonical(program)}"></div>`,
	css: canonical(program),
});

/** Every matrix case must own its complete evidence hooks explicitly. */
const proof = {
	proofs: [
		DifferentialProofKind.CanonicalCss,
		DifferentialProofKind.BrowserStates,
		DifferentialProofKind.SsrHydration,
		DifferentialProofKind.RscStreaming,
		DifferentialProofKind.Dependencies,
		DifferentialProofKind.Residuals,
	],
	browserStates: [
		{ name: "initial", source: canonical, target: canonical },
		{ name: "hover", source: canonical, target: canonical },
		{ name: "responsive", source: canonical, target: canonical },
	],
	ssr: {
		source: { render, hydrate: (server: ReturnType<typeof render>) => server },
		target: { render, hydrate: (server: ReturnType<typeof render>) => server },
	},
	streaming: {
		source: { render: (program: StyleProgram) => ["<style>", canonical(program), "</style>"] },
		target: { render: (program: StyleProgram) => ["<style>", canonical(program), "</style>"] },
	},
} as const;

/** CI fixture catalog; production orchestration receives this as an injected port. */
export const differentialMatrixFixtures: DifferentialMatrixCatalog = {
	cases: [
		{
			...proof,
			id: "emotion-to-styled-components",
			sourceAdapter: "emotion",
			targetAdapter: "styled-components",
			file: "Card.tsx",
			source: `import { css } from "@emotion/css";\nconst card = css({ color: "red", padding: 2 });`,
			expected: "pass",
		},
		{
			...proof,
			id: "styled-components-to-emotion",
			sourceAdapter: "styled-components",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import styled from "styled-components";\nconst Card = styled.div({ color: "red", padding: 2 });`,
			expected: "pass",
		},
		{
			...proof,
			id: "vanilla-extract-to-emotion",
			sourceAdapter: "vanilla-extract",
			targetAdapter: "emotion",
			file: "styles.ts",
			source: `import { style } from "@vanilla-extract/css";\nexport const card = style({ color: "red", padding: 2 });`,
			expected: "pass",
		},
		{
			...proof,
			id: "stitches-to-emotion",
			sourceAdapter: "stitches",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import { css } from "@stitches/react";\nconst card = css({ color: "red", padding: 2 });`,
			expected: "pass",
		},
		{
			...proof,
			id: "linaria-to-emotion",
			sourceAdapter: "linaria",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import { css } from "@linaria/core";\nconst card = css\`color: red; padding: 2px;\`;`,
			expected: "pass",
		},
		{
			...proof,
			id: "jss-to-emotion",
			sourceAdapter: "jss",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import { createUseStyles } from "react-jss";\nconst useStyles = createUseStyles({ card: { color: "red", padding: 2 } });`,
			expected: "residual",
		},
		{
			...proof,
			id: "fela-to-emotion",
			sourceAdapter: "fela",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import { createRenderer } from "fela";\nconst card = renderer.renderRule({ color: "red", padding: 2 });`,
			expected: "pass",
		},
		{
			...proof,
			id: "goober-to-emotion",
			sourceAdapter: "goober",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import { css } from "goober";\nconst card = css({ color: "red", padding: 2 });`,
			expected: "pass",
		},
		{
			...proof,
			id: "compiled-to-emotion",
			sourceAdapter: "compiled",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import { css } from "@compiled/react";\nconst card = css({ color: "red", padding: 2 });`,
			expected: "pass",
		},
		{
			...proof,
			id: "style9-to-emotion",
			sourceAdapter: "style9",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import style9 from "style9";\nconst styles = style9.create({ card: { color: "red", padding: 2 } });`,
			expected: "residual",
		},
		{
			...proof,
			id: "treat-to-emotion",
			sourceAdapter: "treat",
			targetAdapter: "emotion",
			file: "styles.ts",
			source: `import { style } from "treat";\nconst card = style({ color: "red", padding: 2 });`,
			expected: "pass",
		},
		{
			...proof,
			id: "react-native-to-emotion",
			sourceAdapter: "react-native",
			targetAdapter: "emotion",
			file: "Card.tsx",
			source: `import { StyleSheet } from "react-native";\nexport const styles = StyleSheet.create({ card: { color: "red", padding: 2 } });`,
			expected: "residual",
		},
	],
};
