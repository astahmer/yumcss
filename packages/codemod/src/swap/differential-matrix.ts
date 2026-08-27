import {
	runDifferentialSuite,
	type DifferentialFixture,
	type DifferentialRender,
	type DifferentialResult,
} from "./differential.ts";
import { styleProgramToCanonicalCss, type StyleProgram } from "./semantic-ir.ts";

/** Versioned acceptance matrix for adapter-pair proof, not just unit fixtures. */
export const DIFFERENTIAL_MATRIX_SCHEMA = "pandwind.differential-matrix/1" as const;

export interface DifferentialMatrixCase {
	readonly id: string;
	readonly sourceAdapter: string;
	readonly targetAdapter: string;
	readonly source: string;
	readonly file: string;
	readonly expected: "pass" | "residual";
}

export interface DifferentialMatrixResult {
	readonly schema: typeof DIFFERENTIAL_MATRIX_SCHEMA;
	readonly cases: readonly DifferentialResult[];
	readonly passed: number;
	readonly failed: number;
	readonly residuals: number;
}

const css = (program: StyleProgram): string => styleProgramToCanonicalCss(program);
const render = (program: StyleProgram): DifferentialRender => ({
	html: `<div data-style="${css(program)}"></div>`,
	css: css(program),
});

const withProofHooks = (fixture: DifferentialMatrixCase): DifferentialFixture => ({
	name: fixture.id,
	sourceAdapter: fixture.sourceAdapter,
	targetAdapter: fixture.targetAdapter,
	file: fixture.file,
	source: fixture.source,
	browserStates: [
		{ name: "initial", source: css, target: css },
		{ name: "hover", source: css, target: css },
		{ name: "responsive", source: css, target: css },
	],
	ssr: {
		source: { render, hydrate: (server) => server },
		target: { render, hydrate: (server) => server },
	},
	streaming: {
		source: { render: (program) => ["<style>", css(program), "</style>"] },
		target: { render: (program) => ["<style>", css(program), "</style>"] },
	},
});

/** Real syntax shapes kept intentionally small so every adapter pair runs quickly in CI. */
export const DIFFERENTIAL_MATRIX: readonly DifferentialMatrixCase[] = [
	{
		id: "emotion-to-styled-components",
		sourceAdapter: "emotion",
		targetAdapter: "styled-components",
		file: "Card.tsx",
		source: `import { css } from "@emotion/css";\nconst card = css({ color: "red", padding: 2 });`,
		expected: "pass",
	},
	{
		id: "styled-components-to-emotion",
		sourceAdapter: "styled-components",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import styled from "styled-components";\nconst Card = styled.div({ color: "red", padding: 2 });`,
		expected: "residual",
	},
	{
		id: "vanilla-extract-to-emotion",
		sourceAdapter: "vanilla-extract",
		targetAdapter: "emotion",
		file: "styles.ts",
		source: `import { style } from "@vanilla-extract/css";\nexport const card = style({ color: "red", padding: 2 });`,
		expected: "pass",
	},
	{
		id: "stitches-to-emotion",
		sourceAdapter: "stitches",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import { css } from "@stitches/react";\nconst card = css({ color: "red", padding: 2 });`,
		expected: "pass",
	},
	{
		id: "linaria-to-emotion",
		sourceAdapter: "linaria",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import { css } from "@linaria/core";\nconst card = css\`color: red; padding: 2px;\`;`,
		expected: "pass",
	},
	{
		id: "jss-to-emotion",
		sourceAdapter: "jss",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import { createUseStyles } from "react-jss";\nconst useStyles = createUseStyles({ card: { color: "red", padding: 2 } });`,
		expected: "residual",
	},
	{
		id: "fela-to-emotion",
		sourceAdapter: "fela",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import { createRenderer } from "fela";\nconst card = renderer.renderRule({ color: "red", padding: 2 });`,
		expected: "pass",
	},
	{
		id: "goober-to-emotion",
		sourceAdapter: "goober",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import { css } from "goober";\nconst card = css({ color: "red", padding: 2 });`,
		expected: "pass",
	},
	{
		id: "compiled-to-emotion",
		sourceAdapter: "compiled",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import { css } from "@compiled/react";\nconst card = css({ color: "red", padding: 2 });`,
		expected: "pass",
	},
	{
		id: "style9-to-emotion",
		sourceAdapter: "style9",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import style9 from "style9";\nconst styles = style9.create({ card: { color: "red", padding: 2 } });`,
		expected: "residual",
	},
	{
		id: "treat-to-emotion",
		sourceAdapter: "treat",
		targetAdapter: "emotion",
		file: "styles.ts",
		source: `import { style } from "treat";\nconst card = style({ color: "red", padding: 2 });`,
		expected: "pass",
	},
	{
		id: "react-native-to-emotion",
		sourceAdapter: "react-native",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `import { StyleSheet } from "react-native";\nexport const styles = StyleSheet.create({ card: { color: "red", padding: 2 } });`,
		expected: "residual",
	},
];

export function runDifferentialMatrix(
	cases: readonly DifferentialMatrixCase[] = DIFFERENTIAL_MATRIX,
): DifferentialMatrixResult {
	const results = runDifferentialSuite(cases.map(withProofHooks));
	return {
		schema: DIFFERENTIAL_MATRIX_SCHEMA,
		cases: results,
		passed: results.filter((result, index) =>
			cases[index]?.expected === "residual" ? !result.valid : result.valid,
		).length,
		failed: results.filter((result, index) =>
			cases[index]?.expected === "residual" ? result.valid : !result.valid,
		).length,
		residuals: results.reduce((total, result) => total + result.residuals.length, 0),
	};
}
