import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	CodemodAdapterId,
	runAdapterMigration,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";

type ApiExpectation = "converted" | "residual" | "identity";

interface OfficialApiFamilyCase {
	readonly adapter: CodemodAdapterId;
	readonly name: string;
	readonly expectation: ApiExpectation;
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
				source:
					'import { createCss } from "pandwind/css";\nconst css = createCss();\nexport const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });',
			},
			{
				adapter: CodemodAdapterId.Panda,
				name: "cva recipe",
				expectation: "residual",
				source:
					'import { cva } from "styled-system/recipes";\nexport const button = cva({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });',
			},
			{
				adapter: CodemodAdapterId.Panda,
				name: "sva slot recipe",
				expectation: "residual",
				source:
					'import { sva } from "styled-system/recipes";\nexport const card = sva({ slots: ["root", "label"], base: { root: { color: "red" } } });',
			},
			{
				adapter: CodemodAdapterId.Panda,
				name: "generated styled component",
				expectation: "residual",
				source:
					'import { styled } from "styled-system/jsx";\nexport const Card = styled.div({ base: { color: "red" } });',
			},
			{
				adapter: CodemodAdapterId.StyleX,
				name: "keyframes",
				expectation: "converted",
				source:
					'import stylex from "@stylexjs/stylex";\nexport const pulse = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
			},
			{
				adapter: CodemodAdapterId.StyleX,
				name: "defineVars",
				expectation: "converted",
				source:
					'import stylex from "@stylexjs/stylex";\nexport const theme = stylex.defineVars({ accent: "red" });',
			},
			{
				adapter: CodemodAdapterId.Emotion,
				name: "tagged css template",
				expectation: "converted",
				source:
					'import { css } from "@emotion/css";\nexport const card = css`color: red; padding: 1rem;`;',
			},
			{
				adapter: CodemodAdapterId.Emotion,
				name: "keyframes object",
				expectation: "converted",
				source:
					'import { keyframes } from "@emotion/css";\nexport const pulse = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });',
			},
			{
				adapter: CodemodAdapterId.Emotion,
				name: "injectGlobal object",
				expectation: "converted",
				source:
					'import { injectGlobal } from "@emotion/css";\ninjectGlobal({ body: { margin: 0 } });',
			},
			{
				adapter: CodemodAdapterId.StyledComponents,
				name: "styled tagged template",
				expectation: "converted",
				source:
					'import styled from "styled-components";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
			},
			{
				adapter: CodemodAdapterId.StyledComponents,
				name: "keyframes tagged template",
				expectation: "converted",
				source:
					'import { keyframes } from "styled-components";\nexport const pulse = keyframes`from { opacity: 0; } to { opacity: 1; }`;',
			},
			{
				adapter: CodemodAdapterId.StyledComponents,
				name: "createGlobalStyle object",
				expectation: "converted",
				source:
					'import { createGlobalStyle } from "styled-components";\nexport const Global = createGlobalStyle({ body: { margin: 0 } });',
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
				adapter: CodemodAdapterId.Linaria,
				name: "styled tagged template",
				expectation: "converted",
				source:
					'import { styled } from "@linaria/react";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
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
				adapter: CodemodAdapterId.Fela,
				name: "createComponent",
				expectation: "residual",
				source:
					'import { createComponent } from "react-fela";\nexport const Card = createComponent(() => ({ color: "red" }));',
			},
			{
				adapter: CodemodAdapterId.Goober,
				name: "styled tagged template",
				expectation: "residual",
				source:
					'import { styled } from "goober";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
			},
			{
				adapter: CodemodAdapterId.Aphrodite,
				name: "font-face array value",
				expectation: "converted",
				source:
					'import { StyleSheet } from "aphrodite";\nexport const styles = StyleSheet.create({ fonts: { fontFamily: [{ fontFamily: "Inter", src: "url(inter.woff2)" }] } });',
			},
			{
				adapter: CodemodAdapterId.Treat,
				name: "themed treat style",
				expectation: "converted",
				source:
					'import { style } from "treat";\nexport const card = style({ color: "red", padding: 8 });',
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
				adapter: CodemodAdapterId.ChakraUi,
				name: "recipe usage",
				expectation: "residual",
				source:
					'import { useRecipe } from "@chakra-ui/react";\nexport const button = useRecipe(buttonRecipe);',
			},
			{
				adapter: CodemodAdapterId.Mui,
				name: "styled component",
				expectation: "converted",
				source:
					'import { styled } from "@mui/system";\nexport const Card = styled("div")({ color: "red", padding: 8 });',
			},
			{
				adapter: CodemodAdapterId.Mantine,
				name: "styles API",
				expectation: "residual",
				source:
					'import { Button } from "@mantine/core";\nexport const App = () => <Button styles={{ root: { color: "red" } }} />;',
			},
			{
				adapter: CodemodAdapterId.NextYak,
				name: "styled tagged template",
				expectation: "converted",
				source:
					'import { styled } from "next-yak";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
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
				adapter: CodemodAdapterId.SolidStyled,
				name: "static component template",
				expectation: "converted",
				source:
					'import { styled } from "solid-styled-components";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
			},
			{
				adapter: CodemodAdapterId.VueStyled,
				name: "static component template",
				expectation: "converted",
				source:
					'import styled from "vue-styled-components";\nexport const Card = styled.div`color: red; padding: 1rem;`;',
			},
			{
				adapter: CodemodAdapterId.ReactNative,
				name: "StyleSheet named map",
				expectation: "converted",
				source:
					'import { StyleSheet } from "react-native";\nexport const styles = StyleSheet.create({ card: { padding: 8, backgroundColor: "red" } });',
			},
			{
				adapter: CodemodAdapterId.Tokenami,
				name: "css.compose",
				expectation: "converted",
				source:
					'import { css } from "@tokenami/css";\nexport const card = css.compose({ color: "red", padding: "1rem" });',
			},
			{
				adapter: CodemodAdapterId.UnoCSS,
				name: "variant utility",
				expectation: "converted",
				source: 'export const App = () => <div className="hover:bg-black md:flex" />;',
			},
			{
				adapter: CodemodAdapterId.UnoCSS,
				name: "unknown shortcut",
				expectation: "residual",
				source: 'export const App = () => <div className="btn-primary" />;',
			},
			{
				adapter: CodemodAdapterId.Tailwind,
				name: "arbitrary utility",
				expectation: "converted",
				source: 'export const App = () => <div className="[color:rebeccapurple] md:flex" />;',
			},
			{
				adapter: CodemodAdapterId.Tailwind,
				name: "unknown project utility",
				expectation: "residual",
				source: 'export const App = () => <div className="btn-primary" />;',
			},
		];
	}
}

function migrate(api: OfficialApiFamilyCase): AdapterMigrationResult {
	return runAdapterMigration(api.source, {
		from: api.adapter,
		to: CodemodAdapterId.Pandwind,
		file: api.name.includes(".treat") ? "styles.treat.ts" : "App.tsx",
		mode: "safe",
		semantic: { source: { framework: "react" } },
	});
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
				continue;
			}
			if (api.expectation === "converted") {
				expect(result.converted, `${api.adapter}/${api.name}`).toBeGreaterThan(0);
				expect(result.skipped, `${api.adapter}/${api.name}`).toBe(0);
				expect(result.residuals, `${api.adapter}/${api.name}`).toEqual([]);
				expect(result.code, `${api.adapter}/${api.name}`).not.toContain("migrate-skip");
			} else {
				expect(result.residuals, `${api.adapter}/${api.name}`).not.toEqual([]);
				expect(result.code, `${api.adapter}/${api.name}`).toContain("migrate-skip");
				expect(result.code, `${api.adapter}/${api.name}`).toContain(api.source.slice(0, 18));
			}
		}

		expect(
			Object.fromEntries(
				results.map(({ api, result }) => [`${api.adapter}/${api.name}`, routeEvidence(result)]),
			),
		).toMatchInlineSnapshot(`
			{
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

			export const card = css.class({ display: "flex", gap: "4" });",
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
			  "emotion/tagged css template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "goober/styled tagged template": {
			    "changed": true,
			    "code": "import { styled } from "goober";
			export const Card = // pandwind:migrate-skip (route: goober -> pandwind | parse-residual: component | available: named-map, residual)
			styled.div\`color: red; padding: 1rem;\`;",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Goober styled subjects require host/component lowering",
			        "kind": "component",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
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
			  "linaria/styled tagged template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ color: "red", padding: "1rem" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "mui/styled component": {
			    "changed": true,
			    "code": "import { styled } from "@mui/system";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const Card = css.class({ color: "red", padding: 8 });",
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

			export const Card = (() => { const style = css.class({ color: "red", padding: "1rem" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "solid-styled/static component template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ color: "red", padding: "1rem" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "styled-components/styled tagged template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ color: "red", padding: "1rem" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
			  "tailwind/arbitrary utility": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div  className={css.class({ color: "rebeccapurple", md: { display: "flex" } })}/>;",
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
			  "tokenami/css.compose": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: "1rem" });",
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
			  "treat/themed treat style": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "red", padding: 8 });",
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
			export const App = () => <div  className={css.class({ "&:hover": { backgroundColor: "#000" }, md: { display: "flex" } })}/>;",
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
			  "vue-styled/static component template": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createCss();

			export const Card = (() => { const style = css.class({ color: "red", padding: "1rem" }); const component = (props) => { const Component = props.as ?? "div"; const { as: _as, ...rest } = props; const attrs = {}; return <Component {...attrs} {...rest} className={cx(style, "pw-1sqdko1", props.className)} />; }; component.__pandwindClassName = "pw-1sqdko1"; return component; })();",
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
