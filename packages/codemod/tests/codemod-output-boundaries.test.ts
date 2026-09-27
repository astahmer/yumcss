import { describe, expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import { createAdapterRouteProject, createAdapterRouteSpec } from "./route-spec-support.ts";

const emotionSource =
	'import { css } from "@emotion/css";\nexport const card = css({ color: "red", padding: "1rem" });';
const cssSource = ".card { color: red; padding: 1rem; }";
const emotionToTreat = createAdapterRouteSpec(CodemodAdapterId.Emotion, CodemodAdapterId.Treat);
const emotionToVanillaExtract = createAdapterRouteSpec(
	CodemodAdapterId.Emotion,
	CodemodAdapterId.VanillaExtract,
);
const emotionToCssModules = createAdapterRouteSpec(
	CodemodAdapterId.Emotion,
	CodemodAdapterId.CssModules,
);
const authoredCssToTreat = createAdapterRouteSpec(
	CodemodAdapterId.AuthoredCss,
	CodemodAdapterId.Treat,
);
const authoredCssToVanillaExtract = createAdapterRouteSpec(
	CodemodAdapterId.AuthoredCss,
	CodemodAdapterId.VanillaExtract,
);
const authoredCssToCssModules = createAdapterRouteSpec(
	CodemodAdapterId.AuthoredCss,
	CodemodAdapterId.CssModules,
);
const cssModulesToTreat = createAdapterRouteSpec(
	CodemodAdapterId.CssModules,
	CodemodAdapterId.Treat,
);
const cssModulesToVanillaExtract = createAdapterRouteSpec(
	CodemodAdapterId.CssModules,
	CodemodAdapterId.VanillaExtract,
);
const outputEvidence = (result: ReturnType<typeof emotionToTreat.run>) => ({
	changed: result.changed,
	code: result.code,
	converted: result.converted,
	skipped: result.skipped,
	outputExtension: result.outputExtension,
	fileChanges: result.fileChanges ?? [],
	residuals: result.residuals.map(({ kind, hint }) => ({ kind, hint })),
	outcomes: result.outcomes.map(({ outcome, representation }) => ({ outcome, representation })),
});

describe("codemod output file boundaries", () => {
	test("keeps Treat output in a Treat module and uses its official import", () => {
		const unsupported = emotionToTreat.run({ source: emotionSource, file: "styles.ts" });
		const supported = emotionToTreat.run({ source: emotionSource, file: "styles.treat.ts" });

		expect(unsupported.converted).toBe(0);
		expect(unsupported.skipped).toBe(1);
		expect(unsupported.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
		expect(unsupported.code).toContain('css({ color: "red", padding: "1rem" });');
		expect(unsupported.code).not.toContain('from "treat"');
		expect(supported.converted).toBe(1);
		expect(supported.code).toContain('import { style } from "treat";');
		expect(supported.code).toMatchInlineSnapshot(`
			"import { style } from "treat";
			export const card = style({ "padding": "1rem", "color": "red" });"
		`);
	});

	test("keeps Vanilla Extract output in a CSS TypeScript module", () => {
		const unsupported = emotionToVanillaExtract.run({ source: emotionSource, file: "styles.ts" });
		const supported = emotionToVanillaExtract.run({ source: emotionSource, file: "styles.css.ts" });

		expect(unsupported.converted).toBe(0);
		expect(unsupported.skipped).toBe(1);
		expect(unsupported.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
		expect(unsupported.code).toContain('css({ color: "red", padding: "1rem" });');
		expect(supported.converted).toBe(1);
		expect(supported.code).toContain('import { style } from "@vanilla-extract/css";');
		expect(supported.code).toMatchInlineSnapshot(`
			"import { style } from "@vanilla-extract/css";
			export const card = style({ padding: "1rem", color: "red" });"
		`);
	});

	test("does not emit a stylesheet target as an inline TypeScript expression", () => {
		const result = emotionToCssModules.run({ source: emotionSource, file: "styles.ts" });

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
		expect(result.code).toContain('css({ color: "red", padding: "1rem" });');
		expect(result.code).not.toContain("pandwind/unsafe/css");
		expect(outputEvidence(result)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { css } from "@emotion/css";
			// pandwind:migrate-skip (route: emotion -> css-modules | lowering-residual: capability | available: static, residual)
			export const card = css({ color: "red", padding: "1rem" });",
			  "converted": 0,
			  "fileChanges": [],
			  "outcomes": [
			    {
			      "outcome": "residual",
			      "representation": "static",
			    },
			  ],
			  "outputExtension": undefined,
			  "residuals": [
			    {
			      "hint": "css-modules emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			      "kind": "capability",
			    },
			  ],
			  "skipped": 1,
			}
		`);
	});

	test("preserves global CSS when class-map output needs consumer rewrites", () => {
		const results = [
			["Treat", authoredCssToTreat.run({ source: cssSource, file: "card.css" })],
			["Vanilla Extract", authoredCssToVanillaExtract.run({ source: cssSource, file: "card.css" })],
			["CSS Modules", authoredCssToCssModules.run({ source: cssSource, file: "card.css" })],
		] as const;

		for (const [, result] of results) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBeGreaterThan(0);
			expect(result.residuals).toEqual(
				expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
			);
			expect(result.code).toContain(cssSource);
			expect(result.code).toMatch(/^\/\* pandwind:migrate-skip /u);
			expect(result.outputExtension).toBeUndefined();
			expect(result.fileChanges).toEqual([]);
		}
		expect(
			results.map(([target, result]) => ({
				target,
				converted: result.converted,
				skipped: result.skipped,
				outputExtension: result.outputExtension,
				residuals: result.residuals.map(({ kind, hint }) => ({ kind, hint })),
				code: result.code,
			})),
		).toMatchInlineSnapshot(`
			[
			  {
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.card { color: red; padding: 1rem; }",
			    "converted": 0,
			    "outputExtension": undefined,
			    "residuals": [
			      {
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "target": "Treat",
			  },
			  {
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.card { color: red; padding: 1rem; }",
			    "converted": 0,
			    "outputExtension": undefined,
			    "residuals": [
			      {
			        "hint": "global stylesheet selectors cannot become an unreferenced class map",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "target": "Vanilla Extract",
			  },
			  {
			    "code": "/* pandwind:migrate-skip (lowering-residual: capability) */
			.card { color: red; padding: 1rem; }",
			    "converted": 0,
			    "outputExtension": undefined,
			    "residuals": [
			      {
			        "hint": "global stylesheet selectors cannot move into CSS Modules without rewriting class-name consumers",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "target": "CSS Modules",
			  },
			]
		`);
	});

	test("uses the target module filename and import path for CSS Module file migrations", () => {
		const root = "/virtual/pandwind-route-project";
		const sourceFile = `${root}/src/Card.module.css`;
		const consumerFile = `${root}/src/ui/App.tsx`;
		const consumer =
			'import styles from "../Card.module.css";\nexport const App = () => <div className={styles.card} />;';
		const createProject = (target: CodemodAdapterId) => {
			const base = createAdapterRouteProject(CodemodAdapterId.CssModules, target, "#2563eb");
			return {
				...base,
				files: {
					...base.files,
					[sourceFile]: cssSource,
					[consumerFile]: consumer,
				},
			};
		};
		const treat = cssModulesToTreat.run({
			source: cssSource,
			file: "src/Card.module.css",
			project: createProject(CodemodAdapterId.Treat),
		});
		const vanillaExtract = cssModulesToVanillaExtract.run({
			source: cssSource,
			file: "src/Card.module.css",
			project: createProject(CodemodAdapterId.VanillaExtract),
		});

		expect(treat.outputExtension).toBe(".treat.ts");
		expect(treat.code).toContain('import { style } from "treat";');
		expect(treat.fileChanges).toEqual([
			expect.objectContaining({
				path: "src/ui/App.tsx",
				content: consumer.replace("../Card.module.css", "../Card.module.treat"),
			}),
		]);
		expect(vanillaExtract.outputExtension).toBe(".css.ts");
		expect(vanillaExtract.code).toContain('import { style } from "@vanilla-extract/css";');
		expect(vanillaExtract.fileChanges).toEqual([
			expect.objectContaining({
				path: "src/ui/App.tsx",
				content: consumer.replace("../Card.module.css", "../Card.module.css.ts"),
			}),
		]);
		expect({
			treat: {
				outputExtension: treat.outputExtension,
				fileChanges: treat.fileChanges,
				code: treat.code,
			},
			vanillaExtract: {
				outputExtension: vanillaExtract.outputExtension,
				fileChanges: vanillaExtract.fileChanges,
				code: vanillaExtract.code,
			},
		}).toMatchInlineSnapshot(`
			{
			  "treat": {
			    "code": "import { style } from "treat";
			export const styles = { "card": style({ "padding": "1rem", "color": "red" }) };
			export default styles;",
			    "fileChanges": [
			      {
			        "content": "import styles from "../Card.module.treat";
			export const App = () => <div className={styles.card} />;",
			        "expectedContent": "import styles from "../Card.module.css";
			export const App = () => <div className={styles.card} />;",
			        "path": "src/ui/App.tsx",
			      },
			    ],
			    "outputExtension": ".treat.ts",
			  },
			  "vanillaExtract": {
			    "code": "import { style } from "@vanilla-extract/css";
			export const styles = { "card": style({ padding: "1rem", color: "red" }) };
			export default styles;",
			    "fileChanges": [
			      {
			        "content": "import styles from "../Card.module.css.ts";
			export const App = () => <div className={styles.card} />;",
			        "expectedContent": "import styles from "../Card.module.css";
			export const App = () => <div className={styles.card} />;",
			        "path": "src/ui/App.tsx",
			      },
			    ],
			    "outputExtension": ".css.ts",
			  },
			}
		`);
	});

	test("preserves stylesheet migrations when target module imports cannot be inventoried", () => {
		const vanillaExtract = cssModulesToVanillaExtract.run({
			source: cssSource,
			file: "Card.module.css",
		});
		const treat = cssModulesToTreat.run({ source: cssSource, file: "Card.module.css" });

		expect(vanillaExtract.outputExtension).toBeUndefined();
		expect(vanillaExtract.converted).toBe(0);
		expect(vanillaExtract.skipped).toBe(1);
		expect(vanillaExtract.code).toContain(cssSource);
		expect(vanillaExtract.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: expect.any(String) })]),
		);
		expect(treat.outputExtension).toBeUndefined();
		expect(treat.converted).toBe(0);
		expect(treat.code).toContain(cssSource);
		expect(treat.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
	});
});
