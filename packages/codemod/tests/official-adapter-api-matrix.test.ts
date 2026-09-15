import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	BuiltinHostFramework,
	CodemodAdapterId,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";
import { officialApiCases, type OfficialApiCase } from "../src/swap/official-api-cases.ts";

function migrate(api: OfficialApiCase): AdapterMigrationResult {
	return runAdapterMigration(api.source, {
		from: api.adapter,
		to: CodemodAdapterId.Pandwind,
		file: api.file,
		mode: "safe",
		semantic: {
			source: {
				framework: api.file.endsWith("x") ? BuiltinHostFramework.React : undefined,
			},
		},
	});
}

describe("official primary API forms", () => {
	test("covers every registered adapter with source-specific documented syntax", () => {
		const cases = officialApiCases();
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: 8, color: "red" }) };",
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
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
			export const App = () => <div className={css.class({ padding: "4", backgroundColor: "red.200" })} />;",
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
			export const card = css.class({ padding: 8, color: "red" });",
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
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
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
			export const card = css.class({ padding: "1rem", color: "red" });",
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
			export const card = css.class({ padding: "1rem", color: "red" });",
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
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
			  "linaria/css template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ padding: "1rem", color: "red" });",
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
			export const App = () => <div className={css.class({ color: "blue.6", marginLeft: "auto", marginRight: "auto", maxWidth: 400 })} />;",
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
			export const App = () => <div className={css.class({ padding: "16px", color: "red" })} />;",
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
			export const card = css.class({ padding: "1rem", color: "red" });",
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
			export const card = css.class({ color: "red.300", _hover: { color: "blue.300" } });",
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
			export const styles = { "card": css.class({ padding: 8, color: "red" }) };",
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
			const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
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
			  "solid-styled/solid styled template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, attrs, joinClass }) => { const component = (props) => { const Component = props.as ?? defaultComponent; const { as: _as, ...rest } = props; return <Component {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ padding: "1rem", color: "red" }), stableClass: "pw-t6bw3o", inheritedClass: undefined, classAttribute: "className", attrs: {}, joinClass: cx });",
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
			export const card = css.class({ padding: "1rem", color: "red" });",
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
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, attrs, joinClass }) => { const component = (props) => { const Component = props.as ?? defaultComponent; const { as: _as, ...rest } = props; return <Component {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ padding: "1rem", color: "red" }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", attrs: {}, joinClass: cx });",
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
			export const styles = { "card": css.class({ padding: "8px", color: "red" }) };",
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
			export const App = () => <div className={css.class({ gap: "1rem", alignItems: "center", display: "flex" })}/>;",
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
			export const Card = css.class({ padding: "$4", color: "red" });
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
			export const card = css.class({ cardGap: "1rem", color: "red" });",
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
			export const card = css.class({ padding: 8, color: "red" });",
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
			export const App = () => <div className={css.class({ gap: "1rem", alignItems: "center", display: "flex" })}/>;",
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
			export const card = css.class({ padding: 8, color: "red" });",
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
			export const Card = css.class({ padding: "1rem", color: "red" });",
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
