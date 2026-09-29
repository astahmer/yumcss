import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	BuiltinHostFramework,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createPandaAdapter,
	runAdapterMigration,
	createStyleAdapterRegistry,
	runAdapterMigrationAsync,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";
import {
	officialApiFamilyCases,
	type OfficialApiFamilyCase,
} from "../src/swap/official-api-cases.ts";

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
		...(api.adapter === CodemodAdapterId.CssModules
			? { root: "/project", readFile: () => undefined, listFiles: () => [] }
			: {}),
		mode: "safe",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});
}

function withoutMigrationMarkers(code: string): string {
	return code
		.replace(/^[ \t]*\/\/ pandwind:migrate-skip[^\n]*\r?\n/gmu, "")
		.replace(/^[ \t]*\/\* pandwind:migrate-skip[^\n]*\*\/[ \t]*\r?\n/gmu, "")
		.replace(/^[ \t]*<!-- pandwind:migrate-skip[^\n]*-->[ \t]*\r?\n/gmu, "");
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
			if (api.adapter === CodemodAdapterId.Tokenami && api.name === "css.compose") {
				expect(result.converted).toBe(0);
				expect(result.skipped).toBeGreaterThan(0);
				expect(result.residuals).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							kind: "composition",
							text: "css.compose",
							hint: expect.stringContaining("callable API"),
						}),
					]),
				);
				expect(normalizeSource(result.code)).toBe(normalizeSource(api.source));
			}
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
				if (
					api.name.includes("ClassNames") &&
					api.adapter === CodemodAdapterId.Compiled &&
					api.expectation === "converted"
				) {
					expect(result.code).toContain("<button className={css.class");
					expect(result.code).not.toContain("ClassNames");
					expect(result.code).not.toContain("migrate-skip");
				}
				if (api.name === "imperative applyTo") {
					expect(result.code).toContain("element!.classList.add(sheet.card)");
					expect(result.code).not.toContain("sheet.attach()");
				}
				if (api.adapter === CodemodAdapterId.StyledComponents && api.name === "polymorphic as") {
					expect(result.code).toContain('defaultComponent: "div"');
					expect(result.code).toContain("props.as ?? defaultComponent");
					expect(result.code).toContain('<Card as="a" href="/docs" />');
					expect(result.code).not.toContain('<div as="a"');
				}
				if (api.adapter === CodemodAdapterId.Mui && api.name === "styled component") {
					expect(result.code).toContain("const __pandwindSlot =");
					expect(result.code).toContain("export const Card = __pandwindSlot(");
					expect(result.code).not.toContain("export const Card = css.class");
				}
				if (api.adapter === CodemodAdapterId.StyledComponents && api.name === "styled attrs") {
					expect(result.code).toContain('type: "button"');
					expect(result.code).toContain('"aria-label": "Save"');
					expect(result.code).toContain('color: "red"');
				}
				if (api.name === "Global component") {
					expect(result.code).toContain('kind: "global", selector: "body"');
					expect(result.code).not.toContain("=> () =>");
					expect(result.code).not.toContain("<Global");
				}
				if (api.name === "styled component" && api.adapter === CodemodAdapterId.Stitches) {
					expect(result.code).toContain("const __pandwindSlot =");
					expect(result.code).toContain("export const Card = __pandwindSlot(");
					expect(result.code).toContain(
						'classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx',
					);
				}
				if (api.name === "styled tagged template" && api.adapter === CodemodAdapterId.Goober) {
					expect(result.code).toContain("css.class");
					expect(result.code).not.toContain("pandwind:migrate-skip");
				}
				if (
					(api.name === "cva recipe" && api.adapter === CodemodAdapterId.Panda) ||
					(api.name === "recipe" && api.adapter === CodemodAdapterId.VanillaExtract)
				) {
					expect(result.code).toContain("createRecipe(css");
					expect(result.code).toContain('"size": { "sm"');
					expect(result.code).not.toContain("migrate-skip");
				}
				if (api.name === "sva slot recipe" && api.adapter === CodemodAdapterId.Panda) {
					expect(result.code).toContain("createSlotRecipe(css");
					expect(result.code).toContain('"label": {  }');
					expect(result.code).not.toContain("migrate-skip");
				}
				if (api.name === "generated styled component" && api.adapter === CodemodAdapterId.Panda) {
					expect(result.code).toContain("__pandwindSlot");
					expect(result.code).toContain('defaultComponent: "div"');
					expect(result.code).not.toContain("migrate-skip");
				}
				if (api.name === "createComponent" && api.adapter === CodemodAdapterId.Fela) {
					expect(result.code).toContain("__pandwindSlot");
					expect(result.code).toContain('defaultComponent: "button"');
					expect(result.code).not.toContain("createComponent");
				}
				if (api.name === "composes" && api.adapter === CodemodAdapterId.CssModules) {
					expect(result.code).toContain('"primary": css.class');
					expect(result.code).toContain('color: "red"');
					expect(result.code).not.toContain("migrate-skip");
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = css.vars({ card: [{ color: "red" }, { padding: 8 }] });",
			    "converted": 1,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "target-native",
			          "residual",
			        ],
			        "representation": "target-native",
			        "residuals": [],
			      },
			    ],
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
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const styles = { "fonts": (runtimeCss.sheet.registerSemanticRules([{ kind: "font-face", declarations: [{ property: "fontFamily", value: "Inter" }, { property: "src", value: "url(inter.woff2)" } ] }]), runtimeCss.group({  })) };",
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
			  "authored-css/at-rules": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			@media (prefers-color-scheme: dark) {
			  .card { color: white; }
			}
			@keyframes pulse {
			  from { opacity: 0; }
			  to { opacity: 1; }
			}",
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
			    "skipped": 2,
			    "validations": [],
			  },
			  "authored-css/multi-rule stylesheet": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.card { color: red; }
			.title { font-weight: 600; }",
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
			    "skipped": 2,
			    "validations": [],
			  },
			  "authored-css/non-class selectors": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			:root { --brand: red; }
			[data-theme="dark"] .card { color: white; }",
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
			        "representation": "static",
			        "residuals": [],
			      },
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
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
			  },
			  "bamboo/patterns and cva": {
			    "changed": false,
			    "code": "import { circle } from "styled-system/patterns";
			import { cva } from "styled-system/recipes";
			export const avatar = circle({ size: "8" });
			export const button = cva({ base: { padding: "2" } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "bamboo/styled-system object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ display: "flex", gap: "4" });",
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
			  "chakra-ui/globalCss system config": {
			    "changed": false,
			    "code": "import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";
			const config = defineConfig({ globalCss: { "html, body": { margin: 0 } } });
			export const system = createSystem(defaultConfig, config);",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "chakra-ui/recipe usage": {
			    "changed": true,
			    "code": "import { defineRecipe, useRecipe } from "@chakra-ui/react";
			// pandwind:migrate-skip (route: chakra-ui -> pandwind | parse-residual: composition | available: named-map, residual)
			const buttonRecipe = defineRecipe({ base: { color: "red" } });
			export const button = useRecipe({ recipe: buttonRecipe });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			        "hint": "Chakra recipes and attached factory styles require explicit composition lowering",
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
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "compiled/CSS prop": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = () => <button className={css.class({ color: "red" })}/>;",
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
			  "compiled/ClassNames aliased composition": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = () => <button className={css.class({ color: "red" })}/>;",
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
			  "compiled/ClassNames composition": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = () => <button className={css.class({ color: "red" })}/>;",
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
			  "compiled/ClassNames dynamic render prop": {
			    "changed": true,
			    "code": "import { ClassNames } from "@compiled/react";
			const color = "red";
			// pandwind:migrate-skip (route: compiled -> pandwind | parse-residual: component | available: named-map, residual)
			export const Card = () => <ClassNames>{({ css }) => <button className={css({ color })} />}</ClassNames>;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const colors = { "red": css.class({ color: "red" }) };",
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
			  "compiled/keyframes": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const pulse = (() => { const name = "pw-kf-pulse"; runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]); return name; })();",
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
			  "compiled/styled component": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "button", style: css.class({ color: "red" }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "css-modules/composes": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ color: "red" }), "primary": css.class({ color: "red", fontWeight: "600" }) };
			export default styles;",
			    "converted": 2,
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
			      {
			        "differences": [],
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  "css-modules/global pseudo and descendant selectors": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			:global(.footer) { color: gray; }",
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
			        "representation": "static",
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
			        "hint": "stylesheet migration requires a single local class selector",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "css-modules/local pseudo selector": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ _hover: { color: "red" } }) };
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
			  "css-modules/named class map": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ color: "red", padding: "1rem" }), "title": css.class({ fontWeight: "600" }) };
			export default styles;",
			    "converted": 2,
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
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const App = () => (runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: "body", conditions: [], declarations: [{ property: "margin", value: 0 }], children: [] }]), null);",
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
			  "emotion/css prop": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = () => <button className={css.class({ color: "red" })}/>;",
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
			  "emotion/injectGlobal tagged template": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			() => (runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: "body", conditions: [], declarations: [{ property: "margin", value: "0" }], children: [] }]), null);",
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
			  "emotion/keyframes object": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const pulse = (() => { const name = "pw-kf-pulse"; runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]); return name; })();",
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
			  "emotion/styled component object": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "button", style: css.class({ color: "red" }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "emotion/tagged css template": {
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
			  "fela/createComponent": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "button", style: css.class({ color: "red" }), stableClass: "pw-1sqdko1", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "fela/renderer plugins context": {
			    "changed": true,
			    "code": "import { createRenderer } from "fela";
			const plugin = (element) => element;
			// pandwind:migrate-skip (route: fela -> pandwind | parse-residual: configuration | available: named-map, residual)
			export const renderer = createRenderer({ plugins: [plugin] });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			  "goober/setup context": {
			    "changed": true,
			    "code": "import React from "react";
			import { setup } from "goober";
			// pandwind:migrate-skip (route: goober -> pandwind | parse-residual: configuration | available: named-map, residual)
			setup(React.createElement);",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-1sqdko1", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "jss/createRule named map": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const rule = css.class({ color: "red" });",
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
			  "jss/createStyleSheet named map": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const sheet = { "card": css.class({ color: "red" }) };",
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
			  "jss/imperative applyTo": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const sheet = { "card": css.class({ color: "red" }) };

			element!.classList.add(sheet.card);",
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
			  "less/less mixin call": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.shadow() { box-shadow: 0 1px 2px black; }
			.card { .shadow(); color: red; }",
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
			        "representation": "static",
			        "residuals": [],
			      },
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
			        "residuals": [],
			      },
			    ],
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
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 2,
			    "validations": [],
			  },
			  "less/less plain rules": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.card { color: red; }
			.title { font-weight: 600; }",
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
			    "skipped": 2,
			    "validations": [],
			  },
			  "less/less variables and nesting": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			@brand: red;
			.card { color: @brand; padding: 1rem; &__title { font-weight: 600; } }",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			        "hint": "stylesheet statement is preserved outside the style program",
			        "kind": "parse",
			        "preserved": undefined,
			      },
			      {
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "linaria/css prop": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = () => <button css={css.class({ color: "red" })} />;",
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
			  "linaria/styled tagged template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-1sqdko1", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "mantine/MantineProvider context": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: mantine -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			import { MantineProvider } from "@mantine/core";
			// pandwind:migrate-skip (route: mantine -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			export const App = () => <MantineProvider theme={{ colors: { brand: ["red"] } }}><div /></MantineProvider>;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
			        "residuals": [],
			      },
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
			        "residuals": [],
			      },
			    ],
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
			// pandwind:migrate-skip (route: mantine -> pandwind | parse-residual: host-framework | available: named-map, residual)
			export const App = () => <Button classNames={{ root: "button-root" }} />;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			// pandwind:migrate-skip (route: mantine -> pandwind | parse-residual: host-framework | available: named-map, residual)
			export const App = () => <Button styles={{ root: { color: "red" } }} />;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			// pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			export const App = () => <ThemeProvider theme={{ palette: { primary: { main: "red" } } }}><div /></ThemeProvider>;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
			        "residuals": [],
			      },
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
			        "residuals": [],
			      },
			    ],
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: 8 }), stableClass: "pw-1sqdko1", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "mui/theme callback": {
			    "changed": true,
			    "code": "import { styled } from "@mui/system";
			// pandwind:migrate-skip (route: mui -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			export const Card = styled("div")(({ theme }) => ({ color: theme.palette.primary.main }));",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = () => <button className={css.class({ color: "red" })}/>;",
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
			  "next-yak/styled tagged template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-1sqdko1", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "panda/cva recipe": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createRecipe as __pandwindcreateRecipe } from "./__pandwind/recipe";
			const css = createUnsafeCss();
			export const button = __pandwindcreateRecipe(css, { base: { color: "red" }, variants: { "size": { "sm": { padding: "2" } } } });",
			    "converted": 1,
			    "generatedFiles": [
			      {
			        "path": "__pandwind/recipe.ts",
			        "purpose": "shared recipe runtime used by migrated source",
			      },
			    ],
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
			  "panda/defineRecipe config": {
			    "changed": false,
			    "code": "import { defineRecipe } from "@pandacss/dev";
			export const button = defineRecipe({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
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
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "panda/generated styled JSX style props": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Button = () => <button className={css.class({ color: "red" })} />;",
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
			  "panda/generated styled component": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red" }), stableClass: "pw-jifjss", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "panda/globalCss config": {
			    "changed": false,
			    "code": "import { defineConfig, defineGlobalStyles } from "@pandacss/dev";
			const globalCss = defineGlobalStyles({ "html, body": { margin: 0 } });
			export default defineConfig({ globalCss });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "panda/sva slot recipe": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createSlotRecipe as __pandwindcreateSlotRecipe } from "./__pandwind/recipe";
			const css = createUnsafeCss();
			export const card = __pandwindcreateSlotRecipe(css, { slots: { "root": { color: "red" }, "label": {  } }, slotVariants: {  } });",
			    "converted": 1,
			    "generatedFiles": [
			      {
			        "path": "__pandwind/recipe.ts",
			        "purpose": "shared recipe runtime used by migrated source",
			      },
			    ],
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
			  "panda/token helper context": {
			    "changed": false,
			    "code": "import { token } from "styled-system/tokens";
			export const color = token("colors.red.400");",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "pandwind/css.group named map": {
			    "changed": false,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "react-native/Platform.select context": {
			    "changed": true,
			    "code": "import { Platform } from "react-native";
			// pandwind:migrate-skip (route: react-native -> pandwind | parse-residual: framework-semantics | available: named-map, residual)
			export const style = Platform.select({ ios: { padding: 8 }, android: { padding: 4 } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: "8px", backgroundColor: "red" }) };",
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
			  "react-native/inline style array": {
			    "changed": true,
			    "code": "import { View } from "react-native";
			import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <View {...css.props(css.vars({ style: [{ padding: 8 }, { backgroundColor: "red" }] }))} />;",
			    "converted": 1,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "target-native",
			          "residual",
			        ],
			        "representation": "target-native",
			        "residuals": [],
			      },
			    ],
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
			  "react-strict-dom/compat.native boundary": {
			    "changed": true,
			    "code": "import { compat } from "react-strict-dom";
			import { Text } from "react-native";
			// pandwind:migrate-skip (route: react-strict-dom -> pandwind | parse-residual: capability | available: named-map, residual)
			export const Label = () => <compat.native as="text">{(props) => <Text {...props} />}</compat.native>;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			        "hint": "React Strict DOM compat.native requires an explicit native host boundary",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "react-strict-dom/css.createTheme context": {
			    "changed": true,
			    "code": "import { css } from "react-strict-dom";
			// pandwind:migrate-skip (route: react-strict-dom -> pandwind | parse-residual: configuration | available: named-map, residual)
			export const theme = css.createTheme({ accent: "red" });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			        "hint": "React Strict DOM css.createTheme needs the platform compiler and theme context",
			        "kind": "configuration",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "react-strict-dom/css.defineVars": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const theme = (runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [{ property: "--accent", value: "red" }] }]), { "accent": "var(--accent)" });",
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
			  "react-strict-dom/css.keyframes": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const pulse = (() => { const name = "pw-kf-pulse"; runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]); return name; })();",
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
			  "sass/scss mixins": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			@mixin flex($gap) { display: flex; gap: $gap; }
			.card { @include flex(1rem); }",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			        "hint": "stylesheet at-rule is not safely representable by the selected style target",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			      {
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "sass/scss module use": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			@use "sass:math";
			.card { padding: 1rem; }",
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
			        "hint": "stylesheet statement is preserved outside the style program",
			        "kind": "parse",
			        "preserved": undefined,
			      },
			      {
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "sass/scss variables and nesting": {
			    "changed": true,
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			$brand: red;
			.card { color: $brand; padding: 1rem; &__title { font-weight: 600; } }",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			        "hint": "stylesheet statement is preserved outside the style program",
			        "kind": "parse",
			        "preserved": undefined,
			      },
			      {
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "solid-styled/prop callback": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = (() => { const staticClass = ""; const component = (props) => {  const dynamic = css.vars({ color: ((props) => props.color)(props) }); const attrs = {}; const Component = attrs.as ?? props.as ?? "button"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = { ...rest, ...attrsProps }; return <Component {...forwarded} className={css.props(staticClass, dynamic, "pw-1fn70s4", attrs.className, props.className).className} style={{ ...props.style, ...dynamic.style, ...attrs.style }} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
			    "converted": 1,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			          "target-native",
			        ],
			        "representation": "target-native",
			        "residuals": [],
			      },
			    ],
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
			  "solid-styled/static component template": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-1sqdko1", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "stitches/createTheme context": {
			    "changed": false,
			    "code": "import { createStitches } from "@stitches/react";
			export const { createTheme } = createStitches({ theme: { colors: { brand: "red" } } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "stitches/globalCss": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const reset = () => (runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: "body", conditions: [], declarations: [{ property: "margin", value: 0 }], children: [] }]), null);",
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
			  "stitches/keyframes": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const pulse = (() => { const name = "pw-kf-pulse"; runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]); return name; })();",
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
			  "stitches/styled component": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red" }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "stitches/variants": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createRecipe as __pandwindcreateRecipe } from "./__pandwind/recipe";
			const css = createUnsafeCss();

			export const button = __pandwindcreateRecipe(css, { base: { compoundVariants: [{ size: "sm", css: { color: "red" } }] }, variants: { "size": { "sm": { padding: 4 } } } });",
			    "converted": 1,
			    "generatedFiles": [
			      {
			        "path": "__pandwind/recipe.ts",
			        "purpose": "shared recipe runtime used by migrated source",
			      },
			    ],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "target-native",
			          "residual",
			        ],
			        "representation": "target-native",
			        "residuals": [],
			      },
			    ],
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			export const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });",
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
			  "style9/style9 call composition": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const styles = css.group({ card: { color: "red" } });
			export const Card = () => <div className={cx(styles.card)} />;",
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
			  "styled-components/ThemeProvider context": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: styled-components -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			import { ThemeProvider } from "styled-components";
			// pandwind:migrate-skip (route: styled-components -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			export const App = () => <ThemeProvider theme={{ colors: { brand: "red" } }}><div /></ThemeProvider>;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
			        "residuals": [],
			      },
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
			        "residuals": [],
			      },
			    ],
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
			  "styled-components/createGlobalStyle tagged template": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const Global = () => (runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: "body", conditions: [], declarations: [{ property: "margin", value: "0" }], children: [] }]), null);",
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
			  "styled-components/keyframes tagged template": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const pulse = (() => { const name = "pw-kf-pulse"; runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: "0" }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: "1" }] }] }]); return name; })();",
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
			  "styled-components/polymorphic as": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red" }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: ["$"], attrs: {}, joinClass: cx });
			export const App = () => <Card as="a" href="/docs" />;",
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
			  "styled-components/styled attrs": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Button = __pandwindSlot({ defaultComponent: "button", style: css.class({ color: "red" }), stableClass: "pw-1f4hbee", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: ["$"], attrs: ({ type: "button", "aria-label": "Save" }), joinClass: cx });",
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
			  "styled-components/styled component subject": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			const Link = (props: { href: string }) => <a {...props} />;
			export const Card = __pandwindSlot({ defaultComponent: (Link), style: css.class({ color: "red" }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: ["$"], attrs: {}, joinClass: cx });",
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
			  "styled-components/styled tagged template": {
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
			  "styled-components/theme callback": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const Card = (() => { const staticClass = ""; const component = (props) => {  const dynamic = css.vars({ color: (({ theme }) => theme.colors.brand)(props) }); const attrs = {}; const Component = attrs.as ?? props.as ?? "div"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))); return <Component {...forwarded} className={css.props(staticClass, dynamic, "pw-1fn70s4", attrs.className, props.className).className} style={{ ...props.style, ...dynamic.style, ...attrs.style }} />; }; component.__pandwindClassName = "pw-1fn70s4"; return component; })();",
			    "converted": 1,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			          "target-native",
			        ],
			        "representation": "target-native",
			        "residuals": [],
			      },
			    ],
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ color: "red" }) };",
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
			  "stylex/createTheme context": {
			    "changed": true,
			    "code": "import * as stylex from "@stylexjs/stylex";
			import { vars } from "./vars";
			// pandwind:migrate-skip (route: stylex -> pandwind | parse-residual: configuration | available: named-map, residual)
			export const theme = stylex.createTheme(vars, { accent: "blue" });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const theme = (runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [{ property: "--accent", value: "red" }] }]), { "accent": "var(--accent)" });",
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
			  "stylex/keyframes": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const pulse = (() => { const name = "pw-kf-pulse"; runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]); return name; })();",
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
			  "stylex/props host projection": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const styles = { "card": css.class({ color: "red" }) };
			export const Card = () => <div {...css.props(styles.card)} />;",
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
			  "tailwind/arbitrary utility": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: tailwind -> pandwind | lowering-residual: capability, validation)
			export const App = () => <div className="[color:rebeccapurple] md:[display:flex]" />;",
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
			        "representation": "static",
			        "residuals": [],
			      },
			    ],
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "static",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "condition is not declared by the Pandwind preset or project condition catalog",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			      {
			        "hint": "1 residual conversion(s)",
			        "kind": "validation",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [
			      {
			        "differences": [
			          "1 residual conversion(s)",
			        ],
			        "lossiness": "lossy",
			        "valid": false,
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
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "tailwind/custom variant candidate": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: tailwind -> pandwind | lowering-residual: capability, validation)
			export const App = () => <div className="[&[data-state=active]]:[color:red]" />;",
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
			        "representation": "static",
			        "residuals": [],
			      },
			    ],
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "static",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "condition is not declared by the Pandwind preset or project condition catalog",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			      {
			        "hint": "1 residual conversion(s)",
			        "kind": "validation",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [
			      {
			        "differences": [
			          "1 residual conversion(s)",
			        ],
			        "lossiness": "lossy",
			        "valid": false,
			      },
			    ],
			  },
			  "tailwind/unknown project utility": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: tailwind -> pandwind | parse-residual: unknown-utility | available: named-map, residual)
			export const App = () => <div className="btn-primary" />;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "generatedFiles": [],
			    "loweringPlans": [],
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
			// pandwind:migrate-skip (route: tamagui -> pandwind | parse-residual: function-dynamic | available: named-map, residual)
			export const Card = styled(View, ({ theme }) => ({ color: theme.color }));",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const card = css.class({ "--card-color": "red", "&[data-state=active]": { color: "var(---, var(--card-color))" } });",
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
			  "tokenami/config context": {
			    "changed": false,
			    "code": "import { createConfig } from "@tokenami/css";
			export default createConfig({ aliases: { ink: ["color"] }, responsive: { md: "@media (min-width: 48rem)" }, theme: { color: { brand: "red" } } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "tokenami/css.compose": {
			    "changed": true,
			    "code": "import { css } from "@tokenami/css";
			// pandwind:migrate-skip (route: tokenami -> pandwind | parse-residual: composition | available: named-map, residual)
			export const card = css.compose({ "--color": "red", "--padding": "1rem" });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			        "hint": "Tokenami css.compose returns a reusable class/style helper; flattening it to a style value changes its callable API",
			        "kind": "composition",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  "treat/createTheme context": {
			    "changed": true,
			    "code": "import { createTheme } from "treat";
			// pandwind:migrate-skip (route: treat -> pandwind | parse-residual: configuration | available: named-map, residual)
			export const theme = createTheme({ colors: { brand: "red" } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			  "unocss/preset config": {
			    "changed": false,
			    "code": "import { defineConfig } from "unocss";
			export default defineConfig({ shortcuts: { btn: "px-4 py-2" }, presets: [] });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "unocss/unknown shortcut": {
			    "changed": true,
			    "code": "// pandwind:migrate-skip (route: unocss -> pandwind | parse-residual: unknown-utility | available: named-map, residual)
			export const App = () => <div className="btn-primary" />;",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "code": "// pandwind:migrate-skip (route: unocss -> pandwind | lowering-residual: capability, validation)
			export const App = () => <div className="hover:[background-color:black] md:[display:flex]" />;",
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
			        "representation": "static",
			        "residuals": [],
			      },
			    ],
			    "outcomes": [
			      {
			        "outcome": "residual",
			        "representation": "static",
			      },
			    ],
			    "residuals": [
			      {
			        "hint": "condition is not declared by the Pandwind preset or project condition catalog",
			        "kind": "capability",
			        "preserved": undefined,
			      },
			      {
			        "hint": "1 residual conversion(s)",
			        "kind": "validation",
			        "preserved": undefined,
			      },
			    ],
			    "skipped": 1,
			    "validations": [
			      {
			        "differences": [
			          "1 residual conversion(s)",
			        ],
			        "lossiness": "lossy",
			        "valid": false,
			      },
			    ],
			  },
			  "vanilla-extract/createTheme": {
			    "changed": true,
			    "code": "import { createTheme } from "@vanilla-extract/css";
			// pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: configuration | available: named-map, residual)
			export const themeClass = createTheme({ colors: { brand: "red" } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "code": "export const brand = "--pw-brand";",
			    "converted": 1,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
			        "residuals": [],
			      },
			    ],
			    "outcomes": [],
			    "residuals": [],
			    "skipped": 0,
			    "validations": [],
			  },
			  "vanilla-extract/fontFace": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const inter = (runtimeCss.sheet.registerSemanticRules([{ kind: "font-face", declarations: [{ property: "fontFamily", value: "Inter" }, { property: "src", value: "url(inter.woff2)" } ] }]), runtimeCss.group({  }));",
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
			  "vanilla-extract/globalStyle": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			(runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: "body", conditions: [], declarations: [{ property: "margin", value: 0 }], children: [] }]), null);",
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
			  "vanilla-extract/keyframes": {
			    "changed": true,
			    "code": "import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export const pulse = (() => { const name = "pw-kf-pulse"; runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [{ kind: "style", selector: "from", declarations: [{ property: "opacity", value: 0 }] }, { kind: "style", selector: "to", declarations: [{ property: "opacity", value: 1 }] }] }]); return name; })();",
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
			  "vanilla-extract/recipe": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createRecipe as __pandwindcreateRecipe } from "./__pandwind/recipe";
			const css = createUnsafeCss();
			export const button = __pandwindcreateRecipe(css, { base: { color: "red" }, variants: { "size": { "sm": { padding: "4px" } } } });",
			    "converted": 1,
			    "generatedFiles": [
			      {
			        "path": "__pandwind/recipe.ts",
			        "purpose": "shared recipe runtime used by migrated source",
			      },
			    ],
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
			  "vanilla-extract/styleVariants": {
			    "changed": true,
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const variants = { "primary": css.class({ color: "red" }) };",
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
			  "vanilla-extract/theme contract": {
			    "changed": true,
			    "code": "import { createThemeContract } from "@vanilla-extract/css";
			// pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: configuration | available: named-map, residual)
			export const vars = createThemeContract({ colors: { brand: null } });",
			    "converted": 0,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			        ],
			        "representation": "residual",
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
			    "code": "import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: "div", style: css.class({ color: "red", padding: "1rem" }), stableClass: "pw-1sqdko1", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });",
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
			  "vue-styled/theme callback": {
			    "changed": true,
			    "code": "<script setup>
			import { forwardRef as __pandwindForwardRef } from "react";
			import { createRuntimeCss } from "pandwind/css/runtime";
			import { defaultPreset } from "pandwind/preset/default";
			import type * as React from "react";
			const runtimeCss = createRuntimeCss(defaultPreset);

			const Card = __pandwindForwardRef<React.ComponentRef<"div">, { readonly as?: React.ElementType; readonly className?: string; readonly style?: React.CSSProperties; readonly children?: React.ReactNode; readonly [key: string]: unknown }>((props: { readonly as?: React.ElementType; readonly className?: string; readonly style?: React.CSSProperties; readonly children?: React.ReactNode; readonly [key: string]: unknown }, ref) => { const style = runtimeCss.vars({ color: (props => props.color)(props) }); const attrs = {}; const ResolvedComponent = attrs.as ?? props.as ?? "div"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = { ...rest, ...attrsProps }; return <ResolvedComponent {...forwarded} ref={ref} className={runtimeCss.props(style, attrs.className, props.className).className} style={{ ...props.style, ...style.style, ...attrs.style }} />; });
			</script>
			<template><Card color="red" /></template>",
			    "converted": 1,
			    "generatedFiles": [],
			    "loweringPlans": [
			      {
			        "applied": [],
			        "availableRepresentations": [
			          "named-map",
			          "residual",
			          "target-native",
			        ],
			        "representation": "target-native",
			        "residuals": [],
			      },
			    ],
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
			}
		`);
	});
});
