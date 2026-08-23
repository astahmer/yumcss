/**
 * Source-library migration fixtures — styled-components, stylex, panda-css.
 *
 * Contract under test (plans/008 + 011 §5):
 * - literal-only patterns convert onto pandwind APIs (css.class / tw / cx);
 * - interpolated/nested/pseudo/shorthand shapes are FLAGGED with an
 *   inserted migrate-skip comment — never half-converted;
 * - conversions require an existing pandwind css binding in the file;
 * - every path is idempotent: a second run is a no-op;
 * - detectors are opt-in via `sources` — without them nothing changes.
 */
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loadMetaFromSources } from "../src/meta.ts";
import { transformSource } from "../src/migrate.ts";

const appDir = resolve(import.meta.dirname, "../../../apps/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
});

const CSS_BINDING = "const css = createDesignCss(examplePreset);";

/** styled-components pass with a css binding pre-seeded into the file. */
function styled(source: string) {
	return transformSource(`${CSS_BINDING}\n${source}`, meta, {
		mode: "keep",
		file: "test.tsx",
		sources: ["styled-components"],
	});
}

function stylex(source: string) {
	return transformSource(`${CSS_BINDING}\n${source}`, meta, {
		mode: "keep",
		file: "test.tsx",
		sources: ["stylex"],
	});
}

function panda(source: string) {
	return transformSource(`${CSS_BINDING}\n${source}`, meta, {
		mode: "keep",
		file: "test.tsx",
		sources: ["panda"],
	});
}

describe("styled-components source", () => {
	test("flat literal template converts to a typed tw() const and rewrites JSX usage", () => {
		const result = styled(`
const Card = styled.div\`
	color: #3182ce;
	background-color: gray;
\`;
export const App = () => (
	<Card className="p-4">hi</Card>
);`);
		expect(result.changed).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.code).not.toContain("styled.div");
		expect(result.code).toContain("css.class({");
		// JSX tag swapped to the intrinsic element; the existing static
		// className merges with the styled const via cx().
		expect(result.code).toContain('<div className={cx(Card, "p-4")}>');
		expect(result.code).toContain("</div>");
	});

	test("declarations the bridge knows map onto typed tw keys", () => {
		const result = styled(`
const Text = styled.span\`
	background-color: #3182ce;
\`;`);
		expect(result.code).toContain("tw({");
		expect(result.code).toContain('"bgColor": "blue-500"');
	});

	test("interpolated templates are flagged with a marker, not converted", () => {
		const result = styled(`
const Dyn = styled.button\`
	color: \${props => props.color};
\`;`);
		expect(result.changed).toBe(true);
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("styled.button");
	});

	test("nested selectors are flagged, not converted", () => {
		const result = styled(`
const Nested = styled.div\`
	color: red;
	&:hover {
		color: blue;
	}
\`;`);
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("nested selectors");
	});

	test("styled(<Component>) inheritance stays as-is", () => {
		const result = styled(`
const Extended = styled(Base)\`
	color: red;
\`;`);
		expect(result.converted).toBe(0);
		expect(result.code).toContain("component inheritance");
	});

	test("no pandwind css binding -> flagged", () => {
		const result = transformSource("const Card = styled.div`\n\tcolor: red;\n`;", meta, {
			mode: "keep",
			file: "t.tsx",
			sources: ["styled-components"],
		});
		expect(result.converted).toBe(0);
		expect(result.code).toContain("needs an existing pandwind css binding");
	});
});

describe("stylex source", () => {
	test("literal stylex.create becomes an object of css.class values", () => {
		const result = stylex(`
import * as stylex from "@stylexjs/stylex";
const styles = stylex.create({
	card: {
		color: "#3182ce",
		backgroundColor: "gray",
	},
});
export const A = () => <div className={styles.card} />;`);
		expect(result.changed).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.code).not.toContain("stylex.create");
		expect(result.code).not.toContain("@stylexjs/stylex");
		expect(result.code).toContain('"card": css.class({');
	});

	test("stylex.props merges become cx calls", () => {
		const result = stylex(`
import * as stylex from "@stylexjs/stylex";
export const cls = stylex.props(styles.a, styles.b);`);
		expect(result.code).toContain("cx(styles.a, styles.b)");
	});

	test("pseudo/media entries flag the whole create call", () => {
		const result = stylex(`
import * as stylex from "@stylexjs/stylex";
const styles = stylex.create({
	card: {
		color: "red",
		":hover": { color: "blue" },
	},
});`);
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("pseudo/media");
		expect(result.code).toContain("stylex.create");
	});
});

describe("panda-css source", () => {
	const PANDA_IMPORT = 'import { css } from "styled-system/css";';

	test("literal known-property css() converts to css.class", () => {
		const result = panda(`
${PANDA_IMPORT}
export const card = css({ color: "red", backgroundColor: "blue" });`);
		expect(result.changed).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.code).toContain("css.class({");
		expect(result.code).toContain('"color": "red"');
		expect(result.code).not.toContain("styled-system");
	});

	test("shorthand keys are flagged, not converted", () => {
		const result = panda(`
${PANDA_IMPORT}
export const card = css({ bg: "red", p: "4" });`);
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("bg, p");
	});

	test("token references are flagged", () => {
		const result = panda(`
${PANDA_IMPORT}
export const card = css({ color: "tokens.colors.red.500" });`);
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
	});

	test("base-only cva converts; variants cva is flagged", () => {
		const ok = panda(`
${PANDA_IMPORT}
import { cva } from "styled-system/recipes"
export const btn = cva({ base: { color: "red" } });`);
		expect(ok.converted).toBe(1);
		expect(ok.code).toContain("css.class");

		const flagged = panda(`
${PANDA_IMPORT}
export const btn = cva({
	base: { color: "red" },
	variants: { size: { sm: { fontSize: "sm" } } },
});`);
		expect(flagged.converted).toBe(0);
		expect(flagged.code).toContain("cva with variants");
	});
});

describe("safety rails across sources", () => {
	test("detectors are opt-in — no sources means no changes", () => {
		const source = "const Card = styled.div`\n\tcolor: red;\n`;";
		const result = transformSource(source, meta, { mode: "keep", file: "t.tsx" });
		expect(result.changed).toBe(false);
	});

	test("skip markers on library patterns keep them untouched", () => {
		const result = transformSource(
			[
				CSS_BINDING,
				"// pandwind:migrate-skip (hand-tuned)",
				"const Card = styled.div`",
				"\tcolor: red;",
				"`;",
			].join("\n"),
			meta,
			{ mode: "keep", file: "t.tsx", sources: ["styled-components"] },
		);
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("styled.div");
	});

	test("composed with --to=tw: source conversion then mode pass both apply", () => {
		const result = transformSource(
			[
				CSS_BINDING,
				"const Card = styled.div`",
				"\tcolor: #3182ce;",
				"`;",
				'export const A = () => <div className="p-4" />;',
			].join("\n"),
			meta,
			{ mode: "tw", file: "test.tsx", sources: ["styled-components"] },
		);
		expect(result.code).toContain("css.class({");
		expect(result.code).toContain("tw({");
	});

	test("idempotency: converting twice changes nothing the second time", () => {
		const source = [
			CSS_BINDING,
			'import * as stylex from "@stylexjs/stylex";',
			"const styles = stylex.create({",
			'\tcard: { color: "#3182ce" },',
			"});",
			"const Card = styled.div`",
			"\tbackground-color: gray;",
			"`;",
		].join("\n");
		const first = transformSource(source, meta, {
			mode: "keep",
			file: "t.ts",
			sources: ["styled-components", "stylex"],
		});
		expect(first.changed).toBe(true);
		const second = transformSource(first.code, meta, {
			mode: "keep",
			file: "t.ts",
			sources: ["styled-components", "stylex"],
		});
		expect(second.changed).toBe(false);
		expect(second.converted).toBe(0);
		expect(second.skippedByMarker).toBe(0);
		expect(second.code).toBe(first.code);
	});
});
