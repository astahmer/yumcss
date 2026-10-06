import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	createUnoCssAdapter,
	runAdapterMigration,
} from "../src/swap/index.ts";
import { routeEvidence } from "./route-spec-support.ts";

const catalog = createBuiltinCodemodCatalog();
const targets = [
	{ id: CodemodAdapterId.AuthoredCss, file: "src/Card.tsx" },
	{ id: CodemodAdapterId.CssModules, file: "src/Card.tsx" },
	{ id: CodemodAdapterId.Less, file: "src/Card.tsx" },
	{ id: CodemodAdapterId.Sass, file: "src/Card.tsx" },
] as const;

const uno = createUnoCssAdapter({
	resolver: {
		resolve(token) {
			if (token === "text-brand")
				return [
					{
						property: "color",
						value: { kind: "literal", value: "rebeccapurple" },
						conditions: [],
					},
				];
			if (token === "p-card")
				return [
					{
						property: "padding",
						value: { kind: "literal", value: "1rem" },
						conditions: [],
					},
				];
			return undefined;
		},
	},
});

const registry = createStyleAdapterRegistry([
	...catalog.adapters.filter((adapter) => adapter.id !== CodemodAdapterId.UnoCSS),
	uno,
]);

const unconfiguredRegistry = createStyleAdapterRegistry([
	...catalog.adapters.filter((adapter) => adapter.id !== CodemodAdapterId.UnoCSS),
	createUnoCssAdapter({ moduleLoader: null }),
]);

const migrate = (source: string, to: CodemodAdapterId, file: string) =>
	runAdapterMigration(source, {
		from: CodemodAdapterId.UnoCSS,
		to,
		file,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: registry,
	});

const migrateWithoutUnoConfig = (source: string, to: CodemodAdapterId, file: string) =>
	runAdapterMigration(source, {
		from: CodemodAdapterId.UnoCSS,
		to,
		file,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: unconfiguredRegistry,
	});

const evidence = (result: ReturnType<typeof migrate>) => {
	const route = routeEvidence(result);
	return {
		code: route.code,
		converted: route.converted,
		skipped: route.skipped,
		artifacts: result.generatedFiles.map(({ path, content }) => ({ path, content })),
		residuals: route.residuals.map(({ kind, hint }) => ({ kind, hint })),
		validations: route.validations.map(({ valid, lossiness }) => ({ valid, lossiness })),
	};
};

describe("UnoCSS stylesheet targets", () => {
	test("emits proven static class attributes for every stylesheet target", () => {
		const source =
			'export const Card = () => <div className="text-brand p-card" data-kind="card" />;';
		const results = targets.map(({ id, file }) => {
			const result = migrate(source, id, file);
			expect(result.converted, `${id} should convert the static class`).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.generatedFiles).toHaveLength(1);
			expect(result.generatedFiles[0]?.content).toContain("color: rebeccapurple");
			expect(result.generatedFiles[0]?.content).toContain("padding: 1rem");
			expect(result.code).toContain("<div className={");
			expect(result.code).toContain('data-kind="card"');
			expect(result.code).not.toContain("text-brand p-card");
			expect(routeEvidence(result).validations.every(({ valid }) => valid)).toBe(true);
			if (id === CodemodAdapterId.CssModules) {
				expect(result.code).toMatch(/import __yumcss[A-Za-z0-9]+Styles from/u);
			} else {
				expect(result.code).toContain('import "./Card.styles.');
			}
			return { target: id, ...evidence(result) };
		});

		expect(results).toMatchInlineSnapshot(`
			[
			  {
			    "artifacts": [
			      {
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; padding: 1rem; }
			",
			        "path": "src/Card.styles.css",
			      },
			    ],
			    "code": "import "./Card.styles.css";
			export const Card = () => <div className={"pw-style0-ixxmek"} data-kind="card" />;",
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
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; padding: 1rem; }
			",
			        "path": "src/Card.yumcss-pw-style0-ixxmek.module.css",
			      },
			    ],
			    "code": "import __yumcssstyle0Styles from "./Card.yumcss-pw-style0-ixxmek.module.css";
			export const Card = () => <div className={__yumcssstyle0Styles["pw-style0-ixxmek"]} data-kind="card" />;",
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
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; padding: 1rem; }
			",
			        "path": "src/Card.styles.less",
			      },
			    ],
			    "code": "import "./Card.styles.less";
			export const Card = () => <div className={"pw-style0-ixxmek"} data-kind="card" />;",
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
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; padding: 1rem; }
			",
			        "path": "src/Card.styles.scss",
			      },
			    ],
			    "code": "import "./Card.styles.scss";
			export const Card = () => <div className={"pw-style0-ixxmek"} data-kind="card" />;",
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

	test("emits multiple static hosts without conflicting stylesheet artifacts", () => {
		const source =
			'export const App = () => <><div className="text-brand" /><span className="p-card" /></>;';
		const results = targets.map(({ id, file }) => {
			const result = migrate(source, id, file);
			expect(result.converted, `${id} should convert both class attributes`).toBe(2);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.generatedFiles.length).toBeGreaterThan(0);
			expect(result.generatedFiles.map(({ content }) => content).join("\n")).toContain(
				"color: rebeccapurple",
			);
			expect(result.generatedFiles.map(({ content }) => content).join("\n")).toContain(
				"padding: 1rem",
			);
			expect(result.code).toMatch(/className=\{[^}]+\}/u);
			expect(result.code).toContain("<span");
			expect(routeEvidence(result).validations.every(({ valid }) => valid)).toBe(true);
			return { target: id, ...evidence(result) };
		});

		expect(results).toMatchInlineSnapshot(`
			[
			  {
			    "artifacts": [
			      {
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; }
			",
			        "path": "src/Card.styles.css",
			      },
			      {
			        "content": ".pw-style1-j7x83j { padding: 1rem; }
			",
			        "path": "src/Card-style1.styles.css",
			      },
			    ],
			    "code": "import "./Card.styles.css";
			import "./Card-style1.styles.css";
			export const App = () => <><div className={"pw-style0-ixxmek"} /><span className={"pw-style1-j7x83j"} /></>;",
			    "converted": 2,
			    "residuals": [],
			    "skipped": 0,
			    "target": "authored-css",
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
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; }
			",
			        "path": "src/Card.yumcss-pw-style0-ixxmek.module.css",
			      },
			      {
			        "content": ".pw-style1-j7x83j { padding: 1rem; }
			",
			        "path": "src/Card.yumcss-pw-style1-j7x83j.module.css",
			      },
			    ],
			    "code": "import __yumcssstyle0Styles from "./Card.yumcss-pw-style0-ixxmek.module.css";
			import __yumcssstyle1Styles from "./Card.yumcss-pw-style1-j7x83j.module.css";
			export const App = () => <><div className={__yumcssstyle0Styles["pw-style0-ixxmek"]} /><span className={__yumcssstyle1Styles["pw-style1-j7x83j"]} /></>;",
			    "converted": 2,
			    "residuals": [],
			    "skipped": 0,
			    "target": "css-modules",
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
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; }
			",
			        "path": "src/Card.styles.less",
			      },
			      {
			        "content": ".pw-style1-j7x83j { padding: 1rem; }
			",
			        "path": "src/Card-style1.styles.less",
			      },
			    ],
			    "code": "import "./Card.styles.less";
			import "./Card-style1.styles.less";
			export const App = () => <><div className={"pw-style0-ixxmek"} /><span className={"pw-style1-j7x83j"} /></>;",
			    "converted": 2,
			    "residuals": [],
			    "skipped": 0,
			    "target": "less",
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
			  },
			  {
			    "artifacts": [
			      {
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; }
			",
			        "path": "src/Card.styles.scss",
			      },
			      {
			        "content": ".pw-style1-j7x83j { padding: 1rem; }
			",
			        "path": "src/Card-style1.styles.scss",
			      },
			    ],
			    "code": "import "./Card.styles.scss";
			import "./Card-style1.styles.scss";
			export const App = () => <><div className={"pw-style0-ixxmek"} /><span className={"pw-style1-j7x83j"} /></>;",
			    "converted": 2,
			    "residuals": [],
			    "skipped": 0,
			    "target": "sass",
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
			  },
			]
		`);
	});

	test("converts static class bindings without leaving a dynamic host residual", () => {
		const source =
			'const classes = "text-brand p-card"; export const Card = () => <div className={classes} data-kind="card" />;';
		const results = targets.map(({ id, file }) => {
			const result = migrate(source, id, file);
			expect(result.converted, `${id} should convert the resolved class binding`).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.generatedFiles).toHaveLength(1);
			expect(result.code).toContain("className={classes}");
			expect(result.code).toContain('data-kind="card"');
			expect(result.code).not.toContain("text-brand p-card");
			expect(routeEvidence(result).validations.every(({ valid }) => valid)).toBe(true);
			return { target: id, ...evidence(result) };
		});

		expect(results).toMatchInlineSnapshot(`
			[
			  {
			    "artifacts": [
			      {
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; padding: 1rem; }
			",
			        "path": "src/Card.styles.css",
			      },
			    ],
			    "code": "import "./Card.styles.css";
			const classes = "pw-style0-ixxmek"; export const Card = () => <div className={classes} data-kind="card" />;",
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
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; padding: 1rem; }
			",
			        "path": "src/Card.yumcss-pw-style0-ixxmek.module.css",
			      },
			    ],
			    "code": "import __yumcssstyle0Styles from "./Card.yumcss-pw-style0-ixxmek.module.css";
			const classes = __yumcssstyle0Styles["pw-style0-ixxmek"]; export const Card = () => <div className={classes} data-kind="card" />;",
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
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; padding: 1rem; }
			",
			        "path": "src/Card.styles.less",
			      },
			    ],
			    "code": "import "./Card.styles.less";
			const classes = "pw-style0-ixxmek"; export const Card = () => <div className={classes} data-kind="card" />;",
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
			        "content": ".pw-style0-ixxmek { color: rebeccapurple; padding: 1rem; }
			",
			        "path": "src/Card.styles.scss",
			      },
			    ],
			    "code": "import "./Card.styles.scss";
			const classes = "pw-style0-ixxmek"; export const Card = () => <div className={classes} data-kind="card" />;",
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

	test("emits static named maps through CSS Modules with an artifact import", () => {
		const source = 'export const classes = { card: "text-brand p-card", icon: "text-brand" };';
		const context = {
			file: "src/classes.ts",
			source,
			config: uno.loadConfig({ file: "src/classes.ts", source }),
		};
		const parsed = uno.parse(source, context);
		expect(parsed.matches).toHaveLength(1);
		expect(uno.detect({ file: context.file, source }).matched).toBe(true);
		const result = migrate(source, CodemodAdapterId.CssModules, "src/classes.ts");

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.generatedFiles).toHaveLength(1);
		expect(result.code).toContain('"card"');
		expect(result.code).toContain('"icon"');
		expect(result.code).toContain("import __yumcssgroup0Styles from");
		expect(result.generatedFiles[0]?.content.match(/\.pw-/gu)).toHaveLength(2);
		expect(routeEvidence(result).validations.every(({ valid }) => valid)).toBe(true);
		expect(evidence(result)).toMatchInlineSnapshot(`
			{
			  "artifacts": [
			    {
			      "content": ".pw-group0-card-8789kj { color: rebeccapurple; padding: 1rem; }
			.pw-group0-icon-yf080s { color: rebeccapurple; }
			",
			      "path": "src/classes.yumcss-pw-group0-18w4ti.module.css",
			    },
			  ],
			  "code": "import __yumcssgroup0Styles from "./classes.yumcss-pw-group0-18w4ti.module.css";
			export const classes = { "card": __yumcssgroup0Styles["pw-group0-card-8789kj"], "icon": __yumcssgroup0Styles["pw-group0-icon-yf080s"] };",
			  "converted": 1,
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "lossiness": "lossless",
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("preserves a named map when any utility lacks project evidence", () => {
		const source = 'export const classes = { card: "text-brand custom-shortcut" };';
		const result = migrate(source, CodemodAdapterId.CssModules, "src/classes.ts");

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.generatedFiles).toEqual([]);
		expect(result.code).toContain(source);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "unknown-utility",
					text: "custom-shortcut",
				}),
			]),
		);
		expect(evidence(result)).toMatchInlineSnapshot(`
			{
			  "artifacts": [],
			  "code": "// yumcss:migrate-skip (route: unocss -> css-modules | parse-residual: unknown-utility | lowering-residual: capability | available: named-map, residual)
			export const classes = { card: "text-brand custom-shortcut" };",
			  "converted": 0,
			  "residuals": [
			    {
			      "hint": "UnoCSS utility requires the project resolver or a custom preset",
			      "kind": "unknown-utility",
			    },
			    {
			      "hint": "css-modules emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			      "kind": "capability",
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});

	test("reports unknown-only named maps when the source config is unavailable", () => {
		const source = 'export const classes = { card: "custom-shortcut" };';
		const result = migrateWithoutUnoConfig(source, CodemodAdapterId.CssModules, "src/classes.ts");

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.generatedFiles).toEqual([]);
		expect(result.code).toContain(source);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "unknown-utility",
					text: "custom-shortcut",
				}),
			]),
		);
		expect(evidence(result)).toMatchInlineSnapshot(`
			{
			  "artifacts": [],
			  "code": "// yumcss:migrate-skip (route: unocss -> css-modules | parse-residual: unknown-utility | lowering-residual: capability | available: named-map, residual)
			export const classes = { card: "custom-shortcut" };",
			  "converted": 0,
			  "residuals": [
			    {
			      "hint": "UnoCSS utility requires the project resolver or a custom preset",
			      "kind": "unknown-utility",
			    },
			    {
			      "hint": "css-modules emits stylesheet documents and cannot represent a TypeScript style call without a generated stylesheet artifact",
			      "kind": "capability",
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});

	test("keeps stylesheet class artifacts residual when the host is not JSX", () => {
		const source = '<div class="text-brand" data-kind="card"></div>';
		const result = migrate(source, CodemodAdapterId.AuthoredCss, "src/Card.vue");

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.generatedFiles).toEqual([]);
		expect(result.code).toContain(source);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "host-framework" })]),
		);
		expect(evidence(result)).toMatchInlineSnapshot(`
			{
			  "artifacts": [],
			  "code": "// yumcss:migrate-skip (route: unocss -> authored-css | lowering-residual: host-framework | capability-blocked: framework-semantics: vue | available: static, named-map, residual)
			<div class="text-brand" data-kind="card"></div>",
			  "converted": 0,
			  "residuals": [
			    {
			      "hint": "framework-semantics: vue",
			      "kind": "capability",
			    },
			    {
			      "hint": "stylesheet class artifacts require a JSX host with a static class attribute",
			      "kind": "host-framework",
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});
});
