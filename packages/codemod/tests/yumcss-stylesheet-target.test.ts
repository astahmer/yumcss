import { describe, expect, test } from "vitest";
import { StyleProgramResidualKindTag } from "../src/swap/semantic-ir.ts";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";

const catalog = createBuiltinCodemodCatalog();
const yumcss = CodemodAdapterId.YumCSS;
const stylesheetTargets = [
	{ target: CodemodAdapterId.AuthoredCss, file: "src/Card.tsx" },
	{ target: CodemodAdapterId.CssModules, file: "src/Card.tsx" },
	{ target: CodemodAdapterId.Less, file: "src/Card.tsx" },
	{ target: CodemodAdapterId.Sass, file: "src/Card.tsx" },
] as const;

const migrate = (source: string, target: CodemodAdapterId, file: string) =>
	runAdapterMigration(source, {
		from: yumcss,
		to: target,
		file,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
	});

const evidence = (result: ReturnType<typeof migrate>) => {
	const route = routeEvidence(result);
	return {
		code: route.code,
		converted: route.converted,
		skipped: route.skipped,
		artifacts: result.generatedFiles.map(({ path, content }) => ({ path, content })),
		residuals: route.residuals.map(({ kind, hint }) => ({ kind, hint })),
		validations: route.validations.map(({ valid, lossiness }) => ({
			valid,
			lossiness,
		})),
	};
};

const yumcssSource = (body: string) =>
	'import { createUnsafeCss } from "yumcss/unsafe/css";\n' +
	"const css = createUnsafeCss();\n" +
	body;

describe("YumCSS stylesheet targets", () => {
	test("emits static class-string artifacts for every stylesheet target", () => {
		const source = yumcssSource(
			'export const card = css.class({ color: "red", padding: "1rem" });',
		);
		const results = stylesheetTargets.map(({ target, file }) => {
			const result = migrate(source, target, file);
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.generatedFiles).toHaveLength(1);
			expect(result.generatedFiles[0]?.content).toContain("color: red");
			expect(result.generatedFiles[0]?.content).toContain("padding: 1rem");
			expect(routeEvidence(result).validations.every(({ valid }) => valid)).toBe(true);
			expect(result.code).not.toContain("yumcss/");
			if (target === CodemodAdapterId.CssModules) {
				expect(result.code).toContain("import __yumcsscardStyles from");
				expect(result.code).toContain("__yumcsscardStyles[");
			} else {
				expect(result.code).toContain('import "');
				expect(result.generatedFiles[0]?.content).toMatch(/^\.[\w-]+ \{/u);
			}
			return { target, ...evidence(result) };
		});

		expect(results).toMatchInlineSnapshot(`
			[
			  {
			    "artifacts": [
			      {
			        "content": ".pw-card-124ugb9 { color: red; padding: 1rem; }
			",
			        "path": "src/Card.styles.css",
			      },
			    ],
			    "code": "import "./Card.styles.css";
			export const card = "pw-card-124ugb9";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "authored-css",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-card-124ugb9 { color: red; padding: 1rem; }
			",
			        "path": "src/Card.yumcss-pw-card-124ugb9.module.css",
			      },
			    ],
			    "code": "import __yumcsscardStyles from "./Card.yumcss-pw-card-124ugb9.module.css";
			export const card = __yumcsscardStyles["pw-card-124ugb9"];",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "css-modules",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-card-124ugb9 { color: red; padding: 1rem; }
			",
			        "path": "src/Card.styles.less",
			      },
			    ],
			    "code": "import "./Card.styles.less";
			export const card = "pw-card-124ugb9";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "less",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-card-124ugb9 { color: red; padding: 1rem; }
			",
			        "path": "src/Card.styles.scss",
			      },
			    ],
			    "code": "import "./Card.styles.scss";
			export const card = "pw-card-124ugb9";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "sass",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			]
		`);
	});

	test("resolves aliased CSS factories for static class calls", () => {
		const source =
			'import { createUnsafeCss as makeStyles } from "yumcss/unsafe/css";\n' +
			"const design = makeStyles();\n" +
			'export const card = design.class({ color: "rebeccapurple" });';
		const results = stylesheetTargets.map(({ target, file }) => {
			const result = migrate(source, target, file);
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.generatedFiles).toHaveLength(1);
			expect(result.generatedFiles[0]?.content).toContain("color: rebeccapurple");
			return { target, ...evidence(result) };
		});

		expect(results).toMatchInlineSnapshot(`
			[
			  {
			    "artifacts": [
			      {
			        "content": ".pw-card-124ugb9 { color: rebeccapurple; }
			",
			        "path": "src/Card.styles.css",
			      },
			    ],
			    "code": "import { createUnsafeCss as makeStyles } from "yumcss/unsafe/css";
			import "./Card.styles.css";
			const design = makeStyles();
			export const card = "pw-card-124ugb9";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "authored-css",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-card-124ugb9 { color: rebeccapurple; }
			",
			        "path": "src/Card.yumcss-pw-card-124ugb9.module.css",
			      },
			    ],
			    "code": "import { createUnsafeCss as makeStyles } from "yumcss/unsafe/css";
			import __yumcsscardStyles from "./Card.yumcss-pw-card-124ugb9.module.css";
			const design = makeStyles();
			export const card = __yumcsscardStyles["pw-card-124ugb9"];",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "css-modules",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-card-124ugb9 { color: rebeccapurple; }
			",
			        "path": "src/Card.styles.less",
			      },
			    ],
			    "code": "import { createUnsafeCss as makeStyles } from "yumcss/unsafe/css";
			import "./Card.styles.less";
			const design = makeStyles();
			export const card = "pw-card-124ugb9";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "less",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-card-124ugb9 { color: rebeccapurple; }
			",
			        "path": "src/Card.styles.scss",
			      },
			    ],
			    "code": "import { createUnsafeCss as makeStyles } from "yumcss/unsafe/css";
			import "./Card.styles.scss";
			const design = makeStyles();
			export const card = "pw-card-124ugb9";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "sass",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			]
		`);
	});

	test("emits static named groups as class maps and stylesheet artifacts", () => {
		const source = yumcssSource(
			'export const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });',
		);
		const results = stylesheetTargets.map(({ target, file }) => {
			const result = migrate(source, target, file);
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.generatedFiles).toHaveLength(1);
			expect(result.generatedFiles[0]?.content).toContain("color: red");
			expect(result.generatedFiles[0]?.content).toContain("opacity: 0.5");
			expect(result.code).toContain('"card":');
			expect(result.code).toContain('"muted":');
			expect(routeEvidence(result).validations.every(({ valid }) => valid)).toBe(true);
			return { target, ...evidence(result) };
		});

		expect(results).toMatchInlineSnapshot(`
			[
			  {
			    "artifacts": [
			      {
			        "content": ".pw-styles-card-1raj28m { color: red; }
			.pw-styles-muted-58cpf3 { opacity: 0.5; }
			",
			        "path": "src/Card.styles.css",
			      },
			    ],
			    "code": "import "./Card.styles.css";
			export const styles = { "card": "pw-styles-card-1raj28m", "muted": "pw-styles-muted-58cpf3" };",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "authored-css",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-styles-card-1raj28m { color: red; }
			.pw-styles-muted-58cpf3 { opacity: 0.5; }
			",
			        "path": "src/Card.yumcss-pw-group0-gxa0u.module.css",
			      },
			    ],
			    "code": "import __yumcssstylesStyles from "./Card.yumcss-pw-group0-gxa0u.module.css";
			export const styles = { "card": __yumcssstylesStyles["pw-styles-card-1raj28m"], "muted": __yumcssstylesStyles["pw-styles-muted-58cpf3"] };",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "css-modules",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-styles-card-1raj28m { color: red; }
			.pw-styles-muted-58cpf3 { opacity: 0.5; }
			",
			        "path": "src/Card.styles.less",
			      },
			    ],
			    "code": "import "./Card.styles.less";
			export const styles = { "card": "pw-styles-card-1raj28m", "muted": "pw-styles-muted-58cpf3" };",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "less",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-styles-card-1raj28m { color: red; }
			.pw-styles-muted-58cpf3 { opacity: 0.5; }
			",
			        "path": "src/Card.styles.scss",
			      },
			    ],
			    "code": "import "./Card.styles.scss";
			export const styles = { "card": "pw-styles-card-1raj28m", "muted": "pw-styles-muted-58cpf3" };",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "sass",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			]
		`);
	});

	test("extracts static keyframes to global stylesheet targets", () => {
		const source = yumcssSource(
			"export const fade = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });",
		);
		const results = stylesheetTargets.map(({ target, file }) => {
			const result = migrate(source, target, file);
			if (target === CodemodAdapterId.CssModules) {
				expect(result.converted, JSON.stringify(evidence(result), null, 2)).toBe(0);
				expect(result.skipped).toBe(1);
				expect(result.residuals).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ kind: StyleProgramResidualKindTag.Capability }),
					]),
				);
				expect(result.code).toContain(
					"css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })",
				);
				expect(result.generatedFiles).toEqual([]);
			} else {
				expect(result.converted).toBe(1);
				expect(result.skipped).toBe(0);
				expect(result.residuals).toEqual([]);
				expect(result.generatedFiles).toHaveLength(1);
				expect(result.generatedFiles[0]?.content).toMatch(
					/^@keyframes pw-kf-[\w-]+ \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}\n$/u,
				);
				expect(result.code).toContain('export const fade = "pw-kf-');
				expect(result.code).toContain('import "');
				expect(routeEvidence(result).validations.every(({ valid }) => valid)).toBe(true);
			}
			return { target, ...evidence(result) };
		});

		expect(results).toMatchInlineSnapshot(`
			[
			  {
			    "artifacts": [
			      {
			        "content": "@keyframes pw-kf-keyframes0-1ek0lvs { from { opacity: 0; } to { opacity: 1; } }
			",
			        "path": "src/Card.styles.css",
			      },
			    ],
			    "code": "import "./Card.styles.css";
			export const fade = "pw-kf-keyframes0-1ek0lvs";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "authored-css",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [],
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			// yumcss:migrate-skip (route: yumcss -> css-modules | lowering-residual: capability | available: static, named-map, residual)
			export const fade = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });",
			    "converted": 0,
			    "residuals": [
			      {
			        "hint": "css-modules cannot reference a generated keyframe name without a verified global keyframe artifact",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "target": "css-modules",
			    "validations": [],
			  },
			  {
			    "artifacts": [
			      {
			        "content": "@keyframes pw-kf-keyframes0-1ek0lvs { from { opacity: 0; } to { opacity: 1; } }
			",
			        "path": "src/Card.styles.less",
			      },
			    ],
			    "code": "import "./Card.styles.less";
			export const fade = "pw-kf-keyframes0-1ek0lvs";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "less",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			  {
			    "artifacts": [
			      {
			        "content": "@keyframes pw-kf-keyframes0-1ek0lvs { from { opacity: 0; } to { opacity: 1; } }
			",
			        "path": "src/Card.styles.scss",
			      },
			    ],
			    "code": "import "./Card.styles.scss";
			export const fade = "pw-kf-keyframes0-1ek0lvs";",
			    "converted": 1,
			    "residuals": [],
			    "skipped": 0,
			    "target": "sass",
			    "validations": [
			      {
			        "lossiness": "lossless",
			        "valid": true,
			      },
			    ],
			  },
			]
		`);
	});

	test("preserves unsupported projections and dynamic styles as typed residuals", () => {
		const cases = [
			{
				name: "property-keyed css map",
				body: 'export const card = css({ color: "red", padding: "1rem" });',
				preserved: 'css({ color: "red", padding: "1rem" })',
			},
			{
				name: "dynamic css.vars",
				body: "export const color = css.vars({ color: theme.foreground });",
				preserved: "css.vars({ color: theme.foreground })",
			},
			{
				name: "dynamic css.class",
				body: "export const card = css.class({ color: theme.foreground });",
				preserved: "css.class({ color: theme.foreground })",
			},
			{
				name: "dynamic css.group input",
				body: 'export const styles = css.group({ banner: { $input: {} as { color: string }, color: css.input("color") } });',
				preserved: "css.group({",
			},
			{
				name: "css.raw object projection",
				body: 'export const style = css.raw({ color: "red" });',
				preserved: 'css.raw({ color: "red" })',
			},
			{
				name: "css.props host projection",
				body: 'export const props = css.props("existing");',
				preserved: 'css.props("existing")',
			},
		];
		const results = cases.map(({ name, body, preserved }) => {
			const source = yumcssSource(body);
			const result = migrate(source, CodemodAdapterId.AuthoredCss, "src/Card.tsx");

			expect(result.converted).toBe(0);
			expect(result.skipped).toBe(1);
			expect(result.residuals).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: StyleProgramResidualKindTag.Capability }),
				]),
			);
			expect(result.code).toContain(preserved);
			expect(result.generatedFiles).toEqual([]);
			return { name, ...evidence(result) };
		});

		expect(results).toMatchInlineSnapshot(`
			[
			  {
			    "artifacts": [],
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			// yumcss:migrate-skip (route: yumcss -> authored-css | parse-residual: capability | lowering-residual: capability | available: named-map, residual)
			export const card = css({ color: "red", padding: "1rem" });",
			    "converted": 0,
			    "name": "property-keyed css map",
			    "residuals": [
			      {
			        "hint": "YumCSS css() returns a property-keyed CompiledStyles map whose precedence and css.props consumers cannot be preserved by emitting one target class",
			        "kind": "capability",
			      },
			      {
			        "hint": "css emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  {
			    "artifacts": [],
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			// yumcss:migrate-skip (route: yumcss -> authored-css | lowering-residual: capability | available: named-map, residual, portable-artifact)
			export const color = css.vars({ color: theme.foreground });",
			    "converted": 0,
			    "name": "dynamic css.vars",
			    "residuals": [
			      {
			        "hint": "css emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  {
			    "artifacts": [],
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			// yumcss:migrate-skip (route: yumcss -> authored-css | lowering-residual: capability | available: named-map, residual, portable-artifact)
			export const card = css.class({ color: theme.foreground });",
			    "converted": 0,
			    "name": "dynamic css.class",
			    "residuals": [
			      {
			        "hint": "css emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  {
			    "artifacts": [],
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			// yumcss:migrate-skip (route: yumcss -> authored-css | lowering-residual: dynamic, capability | capability-blocked: dynamic-values: dynamic: {} as { color: string } | available: named-map, residual)
			export const styles = css.group({ banner: { $input: {} as { color: string }, color: css.input("color") } });",
			    "converted": 0,
			    "name": "dynamic css.group input",
			    "residuals": [
			      {
			        "hint": "dynamic-values: dynamic: {} as { color: string }",
			        "kind": "capability",
			      },
			      {
			        "hint": "target lacks runtime dynamic values",
			        "kind": "dynamic",
			      },
			      {
			        "hint": "target lacks runtime dynamic values",
			        "kind": "dynamic",
			      },
			      {
			        "hint": "css emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  {
			    "artifacts": [],
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			// yumcss:migrate-skip (route: yumcss -> authored-css | parse-residual: capability | lowering-residual: capability | available: named-map, residual)
			export const style = css.raw({ color: "red" });",
			    "converted": 0,
			    "name": "css.raw object projection",
			    "residuals": [
			      {
			        "hint": "YumCSS css.raw() returns an uncompiled style object; preserving it as a stylesheet requires its consumer and precedence context",
			        "kind": "capability",
			      },
			      {
			        "hint": "css emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			  {
			    "artifacts": [],
			    "code": "import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			// yumcss:migrate-skip (route: yumcss -> authored-css | parse-residual: capability | lowering-residual: capability | available: named-map, residual)
			export const props = css.props("existing");",
			    "converted": 0,
			    "name": "css.props host projection",
			    "residuals": [
			      {
			        "hint": "YumCSS css.props() projects compiled classes and runtime variables into host props; the target host contract is not available at this call site",
			        "kind": "capability",
			      },
			      {
			        "hint": "css emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			        "kind": "capability",
			      },
			    ],
			    "skipped": 1,
			    "validations": [],
			  },
			]
		`);
	});

	test("emits distinct artifacts for multiple static styles", () => {
		const source = yumcssSource(
			'export const card = css.class({ color: "red" });\n' +
				'export const panel = css.class({ backgroundColor: "white" });',
		);
		const result = migrate(source, CodemodAdapterId.AuthoredCss, "src/Card.tsx");

		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.generatedFiles).toHaveLength(2);
		expect(new Set(result.generatedFiles.map(({ path }) => path)).size).toBe(2);
		expect(evidence(result)).toMatchInlineSnapshot(`
			{
			  "artifacts": [
			    {
			      "content": ".pw-card-124ugb9 { color: red; }
			",
			      "path": "src/Card.styles.css",
			    },
			    {
			      "content": ".pw-panel-qoe6jv { background-color: white; }
			",
			      "path": "src/Card-panel.styles.css",
			    },
			  ],
			  "code": "import "./Card.styles.css";
			import "./Card-panel.styles.css";
			export const card = "pw-card-124ugb9";
			export const panel = "pw-panel-qoe6jv";",
			  "converted": 2,
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "lossiness": "lossless",
			      "valid": true,
			    },
			    {
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});
});
