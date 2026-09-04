import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createPandaAdapter,
	runAdapterMigration,
	createStyleAdapterRegistry,
	runAdapterMigrationAsync,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";
import { officialApiFamilyCases, type OfficialApiFamilyCase } from "../src/swap/official-api-cases.ts";

const pandaProofRegistry = createStyleAdapterRegistry([
	createPandaAdapter({
		moduleLoader: {
			async importPackage(packageName) {
				if (packageName === "@pandacss/config")
					return { loadConfig: async () => ({ config: {} }) } as never;
				if (packageName === "@pandacss/is-valid-prop")
					return { isCssProperty: (value: string) => value === "color" } as never;
				return undefined;
			},
			async importFile() {
				return undefined;
			},
		},
	}),
	createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Pandwind)!,
]);

async function migrate(api: OfficialApiFamilyCase): Promise<AdapterMigrationResult> {
	if (api.adapter === CodemodAdapterId.Panda && api.name === "generated styled JSX style props")
		return runAdapterMigrationAsync(api.source, {
			from: api.adapter,
			to: CodemodAdapterId.Pandwind,
			file: api.file ?? "App.tsx",
			root: "/project",
			adapterRegistry: pandaProofRegistry,
			readFile: (file) => (file.endsWith("panda.config.ts") ? "export default {};" : undefined),
			listFiles: () => ["/project/panda.config.ts"],
		});
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
	test("covers every registered adapter's documented secondary forms", async () => {
		const cases = officialApiFamilyCases();
		const results = await Promise.all(
			cases.map(async (api) => ({ api, result: await migrate(api) })),
		);
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

			export const styles = { "fonts": (css.sheet.registerSemanticRules([{ kind: "font-face", declarations: [{ property: "fontFamily", value: "Inter" }, { property: "src", value: "url(inter.woff2)" } ] }]), css.group({  })) };",
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
			  "authored-css/at-rules": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const css = createRuntimeCss(pandwindPreset);
			export const styles = { "card": css.class({ color: "white" }), "pulse": (css.sheet.registerSemanticRules([{ kind: "keyframes", name: "pw-kf-animation", children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: "0" }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: "1" }] }] }]), "pw-kf-animation") };
			export default styles;",
			    "converted": 2,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [
			      {
			        "differences": [
			          "canonical CSS differs",
			        ],
			        "lossiness": "unsupported",
			        "valid": false,
			      },
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  "authored-css/multi-rule stylesheet": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ color: "red" }), "title": css.class({ fontWeight: "600" }) };
			export default styles;",
			    "converted": 2,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  "authored-css/non-class selectors": {
			    "changed": false,
			    "code": "// pandwind:migrate-skip (lowering-residual: capability)
			:root { --brand: red; }
			[data-theme="dark"] .card { color: white; }",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [
			      {
			        "hint": "stylesheet migration requires a single local class selector",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			      {
			        "hint": "stylesheet migration requires a single local class selector",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
			  },
			  "bamboo/patterns and cva": {
			    "changed": false,
			    "code": "import { circle, cva } from "styled-system/patterns";
			export const avatar = circle({ size: "8" });
			export const button = cva({ base: { padding: "2" } });",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
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
			  "css-modules/composes": {
			    "changed": false,
			    "code": "// pandwind:migrate-skip (lowering-residual: composition)
			.card { color: red; }
			.primary { composes: card; font-weight: 600; }",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [
			      {
			        "hint": "preprocessor or CSS Modules composition needs its source context",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "css-modules/global pseudo and descendant selectors": {
			    "changed": false,
			    "code": "// pandwind:migrate-skip (lowering-residual: capability)
			:global(.footer) { color: gray; }
			.card:hover { color: red; }",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [
			      {
			        "hint": "stylesheet migration requires a single local class selector",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			      {
			        "hint": "stylesheet migration requires a single local class selector",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
			  },
			  "css-modules/named class map": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }), "title": css.class({ fontWeight: "600" }) };
			export default styles;",
			    "converted": 2,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
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

			export const sheet = { "card": css.class({ color: "red" }) };",
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

			const sheet = { "card": css.class({ color: "red" }) };

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
			  "less/less mixin call": {
			    "changed": false,
			    "code": "// pandwind:migrate-skip (lowering-residual: parse)
			.card { .shadow(); color: red; }",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [
			      {
			        "hint": "stylesheet declaration requires a property and value",
			        "kind": "parse",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "less/less plain rules": {
			    "changed": true,
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ color: "red" }), "title": css.class({ fontWeight: "600" }) };
			export default styles;",
			    "converted": 2,
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  "less/less variables and nesting": {
			    "changed": false,
			    "code": "// pandwind:migrate-skip (lowering-residual: parse, nesting)
			@brand: red;
			.card { color: @brand; padding: 1rem; &__title { font-weight: 600; } }",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [
			      {
			        "hint": "stylesheet statement is preserved outside the style program",
			        "kind": "parse",
			        "preserved": undefined,
			      },
			      {
			        "hint": "nested stylesheet rules require selector-aware lowering",
			        "kind": "nesting",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
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

			export const styles = { "card": css.class({ padding: 8, backgroundColor: "red" }) };",
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
			  "sass/scss mixins": {
			    "changed": false,
			    "code": "// pandwind:migrate-skip (lowering-residual: capability, parse)
			@mixin flex($gap) { display: flex; gap: $gap; }
			.card { @include flex(1rem); }",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [
			      {
			        "hint": "stylesheet at-rule is not safely representable by the selected style target",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			      {
			        "hint": "stylesheet declaration requires a property and value",
			        "kind": "parse",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
			  },
			  "sass/scss module use": {
			    "changed": false,
			    "code": "// pandwind:migrate-skip (lowering-residual: parse)
			@use "sass:math";
			.card { padding: 1rem; }",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [
			      {
			        "hint": "stylesheet statement is preserved outside the style program",
			        "kind": "parse",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "sass/scss variables and nesting": {
			    "changed": false,
			    "code": "// pandwind:migrate-skip (lowering-residual: parse, nesting)
			$brand: red;
			.card { color: $brand; padding: 1rem; &__title { font-weight: 600; } }",
			    "converted": 0,
			    "outcomes": [],
			    "residuals": [
			      {
			        "hint": "stylesheet statement is preserved outside the style program",
			        "kind": "parse",
			        "preserved": undefined,
			      },
			      {
			        "hint": "nested stylesheet rules require selector-aware lowering",
			        "kind": "nesting",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
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

			export const styles = { "card": css.class({ color: "red" }), "muted": css.class({ opacity: 0.5 }) };",
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

			const styles = { "card": css.class({ color: "red" }) };
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
			const css = createCss();

			const Link = (props: { href: string }) => <a {...props} />;
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

			const styles = { "card": css.class({ color: "red" }) };
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
			  "tamagui/createTamagui config": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: tamagui -> pandwind | parse-residual: configuration)
			import { createTamagui, createTokens } from "tamagui";
			export const config = createTamagui({ tokens: createTokens({ color: { red: "#ff0000" } }) });",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Tamagui tokens and compiler configuration require official project context",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			      {
			        "hint": "Tamagui tokens and compiler configuration require official project context",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "tamagui/styled theme callback": {
			    "changed": true,
			    "code": "import { styled, View } from "tamagui";
			export const Card = // pandwind:migrate-skip (route: tamagui -> pandwind | parse-residual: function-dynamic | available: named-map, residual)
			styled(View, ({ theme }) => ({ color: theme.color }));",
			    "converted": 0,
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "residual",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "Tamagui function-valued styles require a theme/props wrapper",
			        "kind": "function-dynamic",
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
			    "code": "import { createCss } from "pandwind/css";
			const css = createCss();

			export const variants = { "primary": css.class({ color: "red" }) };",
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
