import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
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
		semantic: { source: { framework: api.file.endsWith("x") ? "react" : undefined } },
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
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const styles = { "card": css.class({ padding: 8, color: "red" }) };",
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
			  "authored-css/css rule": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;",
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
			export const App = () => <Box className={css.class({ padding: "var(--chakra-spacing-4)", backgroundColor: "var(--chakra-colors-red-200)" })}/>;",
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
			  "css-modules/module class": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;",
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
			  "emotion/@emotion/css object": {
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
			  "jss/react-jss createUseStyles": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const useStyles = { "card": css.class({ color: "red" }) };",
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
			  "less/less rule": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;",
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
			  "mantine/Mantine style props": {
			    "changed": true,
			    "code": "import { Box } from "@mantine/core";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <Box className={css.class({ color: "blue.6", marginLeft: "var(--mantine-spacing-auto)", marginRight: "var(--mantine-spacing-auto)", maxWidth: 400 })}/>;",
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
			export const App = () => <Box className={css.class({ padding: "16px", color: "red" })}/>;",
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

			export const styles = { "card": css.class({ padding: 8, color: "red" }) };",
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
			  "sass/scss rule": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;",
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

			export const Card = (() => { const style = css.class({ padding: "1rem", color: "red" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-t6bw3o", props.className)} />; }; component.__pandwindClassName = "pw-t6bw3o"; return component; })();",
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
			  "style9/style9.create": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const styles = { "card": css.class({ color: "red" }) };",
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
			  "stylex/stylex.create": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const styles = { "card": css.class({ padding: "8px", color: "red" }) };",
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
			  "tailwind/Tailwind arbitrary utility classes": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div className={css.class({ gap: "1rem", alignItems: "center", display: "flex" })}/>;",
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
			  "tamagui/styled component": {
			    "changed": true,
			    "code": "import { View } from "tamagui";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const Card = css.class({ padding: "$4", color: "red" });
			export const App = () => <View className={Card} />;",
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

			export const card = css.class({ cardGap: "1rem", color: "red" });",
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
			  "unocss/UnoCSS utility classes": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div className={css.class({ gap: "1rem", alignItems: "center", display: "flex" })}/>;",
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
			  "vue-styled/vue styled template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const Card = css.class({ padding: "1rem", color: "red" });",
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
