import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	BuiltinHostFramework,
	CodemodAdapterId,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import {
	createAdapterRouteProject,
	createAdapterRouteSpec,
	routeEvidence,
} from "./route-spec-support.ts";
import { officialApiCases, type OfficialApiCase } from "../src/swap/official-api-cases.ts";

const globalStylesheetSources = new Set([
	CodemodAdapterId.AuthoredCss,
	CodemodAdapterId.Sass,
	CodemodAdapterId.Less,
]);

const migrate = async (api: OfficialApiCase): Promise<AdapterMigrationResult> => {
	if (api.adapter === CodemodAdapterId.ChakraUi)
		return createAdapterRouteSpec(api.adapter, CodemodAdapterId.Pandwind).runAsync({
			source: api.source,
			file: api.file,
			project: createAdapterRouteProject(api.adapter, CodemodAdapterId.Pandwind, "#2a57c8"),
			semantic: {
				source: {
					framework: api.file.endsWith("x") ? BuiltinHostFramework.React : undefined,
				},
			},
		});
	return runAdapterMigration(api.source, {
		from: api.adapter,
		to: CodemodAdapterId.Pandwind,
		file: api.file,
		...(api.adapter === CodemodAdapterId.CssModules
			? { root: "/project", readFile: () => undefined, listFiles: () => [] }
			: {}),
		mode: "safe",
		semantic: {
			source: {
				framework: api.file.endsWith("x") ? BuiltinHostFramework.React : undefined,
			},
		},
	});
};

describe("official primary API forms", () => {
	test("covers every registered adapter with source-specific documented syntax", async () => {
		const cases = officialApiCases();
		const results = await Promise.all(
			cases.map(async (api) => ({ api, result: await migrate(api) })),
		);

		expect(new Set(results.map(({ api }) => api.adapter))).toEqual(
			new Set(BUILTIN_CODEMOD_ADAPTER_IDS),
		);
		for (const { api, result } of results) {
			if (api.adapter === CodemodAdapterId.Pandwind) {
				expect(result.skipped, `${api.adapter}/${api.name}: ${api.documentation}`).toBe(0);
				expect(result.residuals, `${api.adapter}/${api.name}: ${api.documentation}`).toEqual([]);
				continue;
			}
			if (globalStylesheetSources.has(api.adapter)) {
				expect(result.converted, `${api.adapter}/${api.name}`).toBe(0);
				expect(result.skipped, `${api.adapter}/${api.name}`).toBeGreaterThan(0);
				expect(result.residuals, `${api.adapter}/${api.name}`).toEqual(
					expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
				);
				expect(result.code).toContain("pandwind:migrate-skip");
				expect(result.code.endsWith(api.source)).toBe(true);
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ color: "red", padding: "8px" }) };",
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
			        "representation": "named-map",
			        "residuals": [],
			      },
			    ],
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
			  "authored-css/css rule": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.card { color: red; padding: 1rem; }",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "static",
			          "named-map",
			          "residual",
			        ],
			        "representation": "named-map",
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
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "bamboo/styled-system css object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red" });",
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
			  "chakra-ui/Chakra style props": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
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
			  },
			  "compiled/compiled css object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "8px" });",
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
			  "css-modules/module class": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ color: "red", padding: "1rem" }) };
			export default styles;",
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
			  "emotion/@emotion/css object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "fela/renderer.renderRule": {
			    "changed": true,
			    "code": "import { createRenderer } from "fela";
			import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const renderer = createRenderer();
			export const card = css.class({ color: "red" });",
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
			  "goober/css object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "jss/react-jss createUseStyles": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const useStyles = { "card": css.class({ color: "red" }) };",
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
			        "representation": "named-map",
			        "residuals": [],
			      },
			    ],
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
			  "less/less rule": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.card { color: red; padding: 1rem; }",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "static",
			          "named-map",
			          "residual",
			        ],
			        "representation": "named-map",
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
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "linaria/css template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "mantine/Mantine style props": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ color: "blue", marginInline: "auto", maxWidth: "calc(25rem * var(--mantine-scale))" })} />;",
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
			  "mui/MUI sx prop": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ color: "red", padding: "16px" })} />;",
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
			  "next-yak/next-yak css template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "panda/generated styled-system css": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", _hover: { color: "blue" } });",
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
			  "pandwind/css.class object": {
			    "changed": false,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "1rem" });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "pandwind/css.vars object": {
			    "changed": false,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.vars({ color: "var(--card-color)" });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "react-native/React Native StyleSheet": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ color: "red", padding: "8px" }) };",
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
			        "representation": "named-map",
			        "residuals": [],
			      },
			    ],
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
			  "react-strict-dom/react-strict-dom css.create": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const styles = { "card": css.class({ color: "red", padding: "1rem" }) };
			export const Card = () => <div className={styles.card} />;",
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
			        "representation": "named-map",
			        "residuals": [],
			      },
			    ],
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
			  "sass/scss rule": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.card { color: red; padding: 1rem; }",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "static",
			          "named-map",
			          "residual",
			        ],
			        "representation": "named-map",
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
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "solid-styled/solid styled template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-t6bw3o", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "stitches/css object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "style9/style9.create": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			export const styles = css.group({ card: { color: "red" } });",
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
			        "representation": "named-map",
			        "residuals": [],
			      },
			    ],
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: ["$"], attrs: {}, joinClass: cx });",
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
			  "stylex/stylex.create": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ color: "red", padding: "8px" }) };",
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
			        "representation": "named-map",
			        "residuals": [],
			      },
			    ],
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
			  "tailwind/Tailwind arbitrary utility classes": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ display: "flex", alignItems: "center", gap: "1rem" })}/>;",
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
			  "tamagui/styled component": {
			    "changed": true,
			    "code": "import { View } from "tamagui";
			import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = css.class({ color: "red", padding: "$4" });
			export const App = () => <View className={Card} />;",
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
			  "tokenami/Tokenami css object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", gap: "1rem" });",
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
			  "treat/treat style": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "8px" });",
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
			  "unocss/UnoCSS utility classes": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ display: "flex", alignItems: "center", gap: "1rem" })}/>;",
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
			  "vanilla-extract/style object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ color: "red", padding: "8px" });",
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
			  "vue-styled/vue styled template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = css.class({ color: "red", padding: "1rem" });",
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

	test.each([CodemodAdapterId.Tailwind, CodemodAdapterId.UnoCSS])(
		"projects %s class carriers to React Strict DOM html/style hosts",
		(adapter) => {
			const result = runAdapterMigration('<div className="[color:red] [padding:1rem]" />', {
				from: adapter,
				to: CodemodAdapterId.ReactStrictDom,
				file: "App.tsx",
				mode: "safe",
				semantic: { source: { framework: BuiltinHostFramework.React } },
			});
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain('import { css, html } from "react-strict-dom";');
			expect(result.code).toContain("<html.div style={css.create");
			expect(result.code).not.toContain("className=");
		},
	);
});
