/**
 * Source-library migration fixtures — styled-components, stylex.
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
import { examplePreset } from "pandwind/preset";

const appDir = resolve(import.meta.dirname, "../../../apps/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
	tokens: examplePreset.tokens,
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

// Corpus ported from astahmer/pandabox codemods (styled2panda fixtures,
// plans/012 §1d): same input shapes, asserting OUR documented behavior.
describe("styled2panda corpus parity", () => {
	test("import transform: the styled-components import is removed on conversion", () => {
		const result = styled(`
import styled from 'styled-components';

const Link = styled.a\`
	background: papayawhip;
	color: #bf4f74;
\`;`);
		expect(result.converted).toBe(1);
		expect(result.code).not.toContain("from 'styled-components'");
		expect(result.code).toContain("css.class({");
	});

	test("cross-component selector interpolation (${Link}:hover &) is flagged, not converted", () => {
		const result = styled(`
import styled from 'styled-components'

const Icon = styled.svg\`
	width: 48px;
\${Link}:hover & {
	fill: rebeccapurple;
}
\`;`);
		expect(result.converted).toBe(0);
		expect(result.skippedByMarker).toBe(1);
		expect(result.code).toContain("pandwind:migrate-skip");
		// the original template survives untouched
		expect(result.code).toContain("rebeccapurple");
	});

	test("composition file: flat siblings convert while styled(<Component>) stays as-is", () => {
		const result = styled(`
import styled from 'styled-components'

const Button = styled.button\`
	color: #BF4F74;
	font-size: 1em;
	margin: 1em;
\`;

const TomatoButton = styled(Button)\`
	color: tomato;
	border-color: tomato;
\`;`);
		expect(result.converted).toBe(1);
		expect(result.code).toContain("css.class({"); // Button converted
		expect(result.code).toContain("styled(Button)"); // inheritance kept
		expect(result.code).toContain("component inheritance");
	});
});

// Context awareness: patterns inside comments and string literals are
// documentation/examples, not code — they must be left untouched.
describe("context awareness", () => {
	test("a styled.div pattern inside a comment is not converted or mangled", () => {
		const source = `${CSS_BINDING}
// docs: const Fake = styled.div\`color: red;\`;
export const Icon = styled.div\`
	color: blue;
\`;`;
		const result = transformSource(source, meta, {
			mode: "keep",
			file: "c.tsx",
			sources: ["styled-components"],
		});
		expect(result.converted).toBe(1); // only the REAL component
		expect(result.code).toContain("// docs: const Fake = styled.div");
		expect(result.code).not.toContain("Fake = css.class");
	});

	test("a styled.div example inside a string literal is left untouched", () => {
		const source = `${CSS_BINDING}
const snippet = "const Fake = styled.div\`color: red;\`";
export const Card = styled.div\`
	color: blue;
\`;`;
		const result = transformSource(source, meta, {
			mode: "keep",
			file: "s.tsx",
			sources: ["styled-components"],
		});
		expect(result.converted).toBe(1);
		expect(result.code).toContain('snippet = "const Fake = styled.div');
		expect(result.code).not.toContain('snippet = "const Fake = css.class');
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
