import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createLessAdapter,
	createSassAdapter,
	runAdapterMigration,
	runAdapterMigrationAsync,
	createStyleAdapterRegistry,
	styleProgramToCanonicalCss,
} from "../src/swap/index.ts";
import { PlainStylesheetSource, parseStylesheetPrograms } from "../src/swap/stylesheet-source.ts";

const catalog = createBuiltinCodemodCatalog();

function migrate(source: string, from: CodemodAdapterId, file: string) {
	return runAdapterMigration(source, {
		from,
		to: CodemodAdapterId.Pandwind,
		file,
		mode: "safe",
		adapterRegistry: catalog.registry,
	});
}

describe("stylesheet source adapters", () => {
	test("maps local CSS rules into StyleProgram before a target projection", () => {
		const parsed = parseStylesheetPrograms(
			".card { color: red; padding: 1rem; } @media (min-width: 40rem) { .card { color: blue; } }",
			{
				file: "styles.css",
				source: "",
				config: { adapter: CodemodAdapterId.AuthoredCss, files: [], values: {} },
			},
			new PlainStylesheetSource(),
		);

		expect(parsed.residuals).toEqual([]);
		expect(parsed.matches).toHaveLength(2);
		expect(styleProgramToCanonicalCss(parsed.matches[0]!.program)).toBe(
			".card{padding:1rem;color:red}",
		);
		expect(styleProgramToCanonicalCss(parsed.matches[1]!.program)).toBe(
			"@media (min-width: 40rem){.card{color:blue}}",
		);
		expect(parsed.matches[0]!.program).toMatchInlineSnapshot(`
			{
			  "canonicalization": undefined,
			  "compositions": [],
			  "declarations": [],
			  "emissionHints": [],
			  "plugins": [],
			  "residuals": [],
			  "rules": [
			    {
			      "children": [],
			      "conditions": [],
			      "declarations": [
			        {
			          "conditions": [],
			          "property": "padding",
			          "value": {
			            "kind": "literal",
			            "value": "1rem",
			          },
			        },
			        {
			          "conditions": [],
			          "property": "color",
			          "value": {
			            "kind": "literal",
			            "value": "red",
			          },
			        },
			      ],
			      "kind": "style",
			      "name": "card",
			      "order": 0,
			      "selector": ".card",
			      "source": {
			        "adapter": "authored-css",
			        "end": 36,
			        "file": "styles.css",
			        "start": 0,
			      },
			    },
			  ],
			  "runtime": undefined,
			  "schema": "pandwind.style-program/4",
			  "source": {
			    "adapter": "authored-css",
			    "end": 36,
			    "file": "styles.css",
			    "start": 0,
			  },
			  "sourceMap": [
			    {
			      "adapter": "authored-css",
			      "end": 36,
			      "file": "styles.css",
			      "start": 0,
			    },
			  ],
			  "themes": [],
			}
		`);
	});

	test("retains layers, supports, nesting, keyframes, and font faces as rule-level IR", () => {
		const parsed = parseStylesheetPrograms(
			[
				"@layer components { .card { color: red; &:hover { color: blue; } } }",
				"@supports (display: grid) { .grid { display: grid; } }",
				"@keyframes fade { from { opacity: 0; } to { opacity: 1; } }",
				'@font-face { font-family: Demo; src: url("demo.woff2"); }',
			].join("\n"),
			{
				file: "styles.css",
				source: "",
				config: { adapter: CodemodAdapterId.AuthoredCss, files: [], values: {} },
			},
		);

		expect(parsed.residuals).toEqual([]);
		expect(parsed.matches).toHaveLength(4);
		expect(parsed.matches.map((match) => match.program.rules[0]?.kind)).toEqual([
			"layer",
			"supports",
			"keyframes",
			"font-face",
		]);
		expect(parsed.matches[0]?.program).toMatchInlineSnapshot(`
			{
			  "canonicalization": undefined,
			  "compositions": [],
			  "declarations": [],
			  "emissionHints": [],
			  "plugins": [],
			  "residuals": [],
			  "rules": [
			    {
			      "children": [
			        {
			          "children": [
			            {
			              "children": [],
			              "conditions": [],
			              "declarations": [
			                {
			                  "conditions": [],
			                  "property": "color",
			                  "value": {
			                    "kind": "literal",
			                    "value": "blue",
			                  },
			                },
			              ],
			              "kind": "style",
			              "name": undefined,
			              "order": 40,
			              "selector": "&:hover",
			              "source": {
			                "adapter": "authored-css",
			                "end": 64,
			                "file": "styles.css",
			                "start": 40,
			              },
			            },
			          ],
			          "conditions": [],
			          "declarations": [
			            {
			              "conditions": [],
			              "property": "color",
			              "value": {
			                "kind": "literal",
			                "value": "red",
			              },
			            },
			          ],
			          "kind": "style",
			          "name": "card",
			          "order": 20,
			          "selector": ".card",
			          "source": {
			            "adapter": "authored-css",
			            "end": 66,
			            "file": "styles.css",
			            "start": 20,
			          },
			        },
			      ],
			      "conditions": [],
			      "declarations": [],
			      "kind": "layer",
			      "layer": "components",
			      "name": "components",
			      "order": 0,
			    },
			  ],
			  "runtime": undefined,
			  "schema": "pandwind.style-program/4",
			  "source": undefined,
			  "sourceMap": [
			    {
			      "adapter": "authored-css",
			      "end": 66,
			      "file": "styles.css",
			      "start": 20,
			    },
			    {
			      "adapter": "authored-css",
			      "end": 64,
			      "file": "styles.css",
			      "start": 40,
			    },
			  ],
			  "themes": [],
			}
		`);
	});

	test("converts a simple CSS Module into a typed Pandwind module", () => {
		const result = migrate(
			".card { color: red; padding: 1rem; }",
			CodemodAdapterId.CssModules,
			"Card.module.css",
		);

		expect(result.changed).toBe(true);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.outputExtension).toBe(".ts");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;"
		`);
	});

	test("resolves local stylesheet imports transitively before emitting one module", () => {
		const files = new Map([
			["Card.module.css", '@import "./tokens.css"; .card { color: red; }'],
			["tokens.css", ".token { color: blue; }"],
		]);
		const result = runAdapterMigration(files.get("Card.module.css")!, {
			from: CodemodAdapterId.CssModules,
			to: CodemodAdapterId.Pandwind,
			file: "Card.module.css",
			root: ".",
			readFile: (file) => files.get(file.replace(/^\.\//u, "")),
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.changed).toBe(true);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"token"');
		expect(result.code).toContain('"card"');
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ color: "red" }), "token": css.class({ color: "blue" }) };
			export default styles;",
			  "converted": 2,
			  "dependencies": [
			    {
			      "packages": [
			        {
			          "kind": "runtime",
			          "name": "pandwind",
			        },
			      ],
			    },
			  ],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "static",
			        "named-map",
			        "residual",
			      ],
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [],
			        "plugins": [],
			        "residuals": [],
			        "rules": [
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "red",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": undefined,
			            "order": 24,
			            "selector": undefined,
			            "source": {
			              "adapter": "css-modules",
			              "end": 45,
			              "file": "Card.module.css",
			              "start": 24,
			            },
			          },
			        ],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "css-modules",
			          "end": 45,
			          "file": "Card.module.css",
			          "start": 24,
			        },
			        "sourceMap": [
			          {
			            "adapter": "css-modules",
			            "end": 45,
			            "file": "Card.module.css",
			            "start": 24,
			          },
			        ],
			        "themes": [],
			      },
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
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [],
			        "plugins": [],
			        "residuals": [],
			        "rules": [
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "blue",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": undefined,
			            "order": 0,
			            "selector": undefined,
			            "source": {
			              "adapter": "css-modules",
			              "end": 23,
			              "file": "tokens.css",
			              "start": 0,
			            },
			          },
			        ],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "css-modules",
			          "end": 23,
			          "file": "tokens.css",
			          "start": 0,
			        },
			        "sourceMap": [
			          {
			            "adapter": "css-modules",
			            "end": 23,
			            "file": "tokens.css",
			            "start": 0,
			          },
			        ],
			        "themes": [],
			      },
			      "representation": "static",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			      "sourceStart": 24,
			      "sourceText": ".card { color: red; }",
			    },
			    {
			      "outcome": "static",
			      "representation": "static",
			      "sourceStart": 0,
			      "sourceText": ".token { color: blue; }",
			    },
			  ],
			  "outputExtension": ".ts",
			  "reports": [],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "canonicalSource": "&{color:red}",
			      "canonicalTarget": "&{color:red}",
			      "differences": [],
			      "lossiness": "lossless",
			      "residuals": [],
			      "valid": true,
			    },
			    {
			      "canonicalSource": "&{color:blue}",
			      "canonicalTarget": "&{color:blue}",
			      "differences": [],
			      "lossiness": "lossless",
			      "residuals": [],
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("rewrites CSS Module consumers when the workspace is available", () => {
		const source = ".card { color: red; }";
		const consumer =
			'import styles from "../Card.module.css";\nexport const App = () => <div className={styles.card} />;';
		const files = new Map([
			["/project/Card.module.css", source],
			["/project/src/App.tsx", consumer],
		]);
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.CssModules,
			to: CodemodAdapterId.Pandwind,
			file: "Card.module.css",
			root: "/project",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.fileChanges).toEqual([
			{
				path: "src/App.tsx",
				content:
					'import styles from "../Card.module.ts";\nexport const App = () => <div className={styles.card} />;',
				expectedContent: consumer,
			},
		]);
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ color: "red" }) };
			export default styles;",
			  "converted": 1,
			  "dependencies": [
			    {
			      "packages": [
			        {
			          "kind": "runtime",
			          "name": "pandwind",
			        },
			      ],
			    },
			  ],
			  "fileChanges": [
			    {
			      "content": "import styles from "../Card.module.ts";
			export const App = () => <div className={styles.card} />;",
			      "expectedContent": "import styles from "../Card.module.css";
			export const App = () => <div className={styles.card} />;",
			      "path": "src/App.tsx",
			    },
			  ],
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "static",
			        "named-map",
			        "residual",
			      ],
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [],
			        "plugins": [],
			        "residuals": [],
			        "rules": [
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "red",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": undefined,
			            "order": 0,
			            "selector": undefined,
			            "source": {
			              "adapter": "css-modules",
			              "end": 21,
			              "file": "Card.module.css",
			              "start": 0,
			            },
			          },
			        ],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "css-modules",
			          "end": 21,
			          "file": "Card.module.css",
			          "start": 0,
			        },
			        "sourceMap": [
			          {
			            "adapter": "css-modules",
			            "end": 21,
			            "file": "Card.module.css",
			            "start": 0,
			          },
			        ],
			        "themes": [],
			      },
			      "representation": "static",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			      "sourceStart": 0,
			      "sourceText": ".card { color: red; }",
			    },
			  ],
			  "outputExtension": ".ts",
			  "reports": [],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "canonicalSource": "&{color:red}",
			      "canonicalTarget": "&{color:red}",
			      "differences": [],
			      "lossiness": "lossless",
			      "residuals": [],
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("fails closed for CSS Module composition instead of dropping it", () => {
		const source = ".card { composes: base; color: red; }";
		const result = migrate(source, CodemodAdapterId.CssModules, "Card.module.css");

		expect(result.changed).toBe(false);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain(source);
		expect(result.converted).toBe(0);
		expect(result.residuals).toEqual([
			expect.objectContaining({ kind: "composition", text: "composes: base" }),
		]);
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": false,
			  "code": "// pandwind:migrate-skip (lowering-residual: composition)
			.card { composes: base; color: red; }",
			  "converted": 0,
			  "dependencies": [],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "named-map",
			        "residual",
			      ],
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [],
			        "plugins": [],
			        "residuals": [
			          {
			            "hint": "preprocessor or CSS Modules composition needs its source context",
			            "kind": "composition",
			            "text": "composes: base",
			          },
			        ],
			        "rules": [
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "red",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": undefined,
			            "order": 0,
			            "selector": undefined,
			            "source": {
			              "adapter": "css-modules",
			              "end": 37,
			              "file": "Card.module.css",
			              "start": 0,
			            },
			          },
			        ],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "css-modules",
			          "end": 37,
			          "file": "Card.module.css",
			          "start": 0,
			        },
			        "sourceMap": [
			          {
			            "adapter": "css-modules",
			            "end": 37,
			            "file": "Card.module.css",
			            "start": 0,
			          },
			        ],
			        "themes": [],
			      },
			      "representation": "residual",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "detail": "stylesheet migration preserved the source with residuals",
			      "outcome": "residual",
			      "representation": "residual",
			      "sourceStart": 0,
			      "sourceText": ".card { composes: base; color: red; }",
			    },
			  ],
			  "reports": [],
			  "residuals": [
			    {
			      "hint": "preprocessor or CSS Modules composition needs its source context",
			      "kind": "composition",
			      "text": "composes: base",
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});

	test("preserves Sass interpolation and Less mixin semantics", () => {
		for (const [from, file, source, residualKind] of [
			[CodemodAdapterId.Sass, "styles.scss", ".card { color: #{$tone}; }", "composition"],
			[CodemodAdapterId.Less, "styles.less", ".card { .rounded(); color: red; }", "parse"],
		] as const) {
			const result = migrate(source, from, file);
			expect(result.changed).toBe(false);
			expect(result.code).toContain("pandwind:migrate-skip");
			expect(result.code).toContain(source);
			expect(result.residuals.some((residual) => residual.kind === residualKind)).toBe(true);
		}
	});

	test("uses the installed Sass compiler through the adapter port", async () => {
		const pandwind = catalog.registry.get(CodemodAdapterId.Pandwind);
		const sass = createSassAdapter({
			async importPackage<T>() {
				return {
					compileString: (source: string) => ({
						css: source.replace("$tone", "red"),
					}),
				} as T;
			},
			async importFile() {
				return undefined;
			},
		});
		const result = await runAdapterMigrationAsync(".card { color: $tone; }", {
			from: CodemodAdapterId.Sass,
			to: CodemodAdapterId.Pandwind,
			file: "styles.scss",
			root: "/project",
			adapterRegistry: createStyleAdapterRegistry([sass, pandwind!]),
			mode: "safe",
		});

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "red"');
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ color: "red" }) };
			export default styles;",
			  "converted": 1,
			  "dependencies": [
			    {
			      "packages": [
			        {
			          "kind": "runtime",
			          "name": "pandwind",
			        },
			      ],
			    },
			  ],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "static",
			        "named-map",
			        "residual",
			      ],
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [],
			        "plugins": [],
			        "residuals": [],
			        "rules": [
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "red",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": undefined,
			            "order": 0,
			            "selector": undefined,
			            "source": {
			              "adapter": "sass",
			              "end": 21,
			              "file": "styles.scss",
			              "start": 0,
			            },
			          },
			        ],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "sass",
			          "end": 21,
			          "file": "styles.scss",
			          "start": 0,
			        },
			        "sourceMap": [
			          {
			            "adapter": "sass",
			            "end": 21,
			            "file": "styles.scss",
			            "start": 0,
			          },
			        ],
			        "themes": [],
			      },
			      "representation": "static",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			      "sourceStart": 0,
			      "sourceText": ".card { color: red; }",
			    },
			  ],
			  "outputExtension": ".ts",
			  "reports": [],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "canonicalSource": "&{color:red}",
			      "canonicalTarget": "&{color:red}",
			      "differences": [],
			      "lossiness": "lossless",
			      "residuals": [],
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("fails closed when an official Less/Sass compiler cannot be loaded", async () => {
		const pandwind = catalog.registry.get(CodemodAdapterId.Pandwind);
		const sass = createSassAdapter({
			async importPackage() {
				return undefined;
			},
			async importFile() {
				return undefined;
			},
		});
		const result = await runAdapterMigrationAsync(".card { color: red; }", {
			from: CodemodAdapterId.Sass,
			to: CodemodAdapterId.Pandwind,
			file: "styles.scss",
			root: "/project",
			adapterRegistry: createStyleAdapterRegistry([sass, pandwind!]),
			mode: "safe",
		});

		expect(result.changed).toBe(false);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain(".card { color: red; }");
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "configuration" })]),
		);
	});

	test("can intentionally lower a preprocessor to authored CSS with source-map evidence", async () => {
		const sass = createSassAdapter({
			async importPackage<T>() {
				return {
					compileString: () => ({
						css: ".card { color: red; }",
						sourceMap: '{"version":3,"sources":["styles.scss"]}',
					}),
				} as T;
			},
			async importFile() {
				return undefined;
			},
		});
		const authored = catalog.registry.get(CodemodAdapterId.AuthoredCss);
		const result = await runAdapterMigrationAsync(".card { color: $tone; }", {
			from: CodemodAdapterId.Sass,
			to: CodemodAdapterId.AuthoredCss,
			file: "styles.scss",
			root: "/project",
			adapterRegistry: createStyleAdapterRegistry([sass, authored!]),
			mode: "safe",
		});

		expect(result.changed).toBe(true);
		expect(result.outputExtension).toBe(".css");
		expect(result.code).toBe(".card { color: red; }");
		expect(result.sourceMaps).toEqual(['{"version":3,"sources":["styles.scss"]}']);
		expect(result.residuals).toEqual([]);
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": ".card { color: red; }",
			  "converted": 1,
			  "dependencies": [],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [
			        "dynamic-and-theme",
			      ],
			      "availableRepresentations": [
			        "static",
			        "residual",
			      ],
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [],
			        "plugins": [],
			        "residuals": [],
			        "rules": [
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "red",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": "card",
			            "order": 0,
			            "selector": ".card",
			            "source": {
			              "adapter": "authored-css",
			              "end": 21,
			              "file": "styles.scss",
			              "start": 0,
			            },
			          },
			        ],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "authored-css",
			          "end": 21,
			          "file": "styles.scss",
			          "start": 0,
			        },
			        "sourceMap": [
			          {
			            "adapter": "authored-css",
			            "end": 21,
			            "file": "styles.scss",
			            "start": 0,
			          },
			        ],
			        "themes": undefined,
			      },
			      "representation": "static",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			      "sourceStart": 0,
			      "sourceText": ".card { color: red; }",
			    },
			  ],
			  "outputExtension": ".css",
			  "reports": [],
			  "residuals": [],
			  "skipped": 0,
			  "sourceMaps": [
			    "{"version":3,"sources":["styles.scss"]}",
			  ],
			  "validations": [
			    {
			      "canonicalSource": ".card{color:red}",
			      "canonicalTarget": ".card{color:red}",
			      "differences": [],
			      "lossiness": "lossless",
			      "residuals": [],
			      "valid": true,
			    },
			  ],
			}
		`);
	});

	test("keeps Less official compilation behind the same compiler port", async () => {
		const less = createLessAdapter({
			async importPackage<T>() {
				return {
					render: async () => ({ css: ".card { color: red; }" }),
				} as T;
			},
			async importFile() {
				return undefined;
			},
		});
		const authored = catalog.registry.get(CodemodAdapterId.AuthoredCss);
		const result = await runAdapterMigrationAsync(".card { color: @tone; }", {
			from: CodemodAdapterId.Less,
			to: CodemodAdapterId.AuthoredCss,
			file: "styles.less",
			root: "/project",
			adapterRegistry: createStyleAdapterRegistry([less, authored!]),
			mode: "safe",
		});

		expect(result.changed).toBe(true);
		expect(result.outputExtension).toBe(".css");
		expect(result.code).toBe(".card { color: red; }");
		expect(result.residuals).toEqual([]);
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": ".card { color: red; }",
			  "converted": 1,
			  "dependencies": [],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [
			        "dynamic-and-theme",
			      ],
			      "availableRepresentations": [
			        "static",
			        "residual",
			      ],
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [],
			        "plugins": [],
			        "residuals": [],
			        "rules": [
			          {
			            "children": [],
			            "conditions": [],
			            "declarations": [
			              {
			                "conditions": [],
			                "property": "color",
			                "value": {
			                  "kind": "literal",
			                  "value": "red",
			                },
			              },
			            ],
			            "kind": "style",
			            "name": "card",
			            "order": 0,
			            "selector": ".card",
			            "source": {
			              "adapter": "authored-css",
			              "end": 21,
			              "file": "styles.less",
			              "start": 0,
			            },
			          },
			        ],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "authored-css",
			          "end": 21,
			          "file": "styles.less",
			          "start": 0,
			        },
			        "sourceMap": [
			          {
			            "adapter": "authored-css",
			            "end": 21,
			            "file": "styles.less",
			            "start": 0,
			          },
			        ],
			        "themes": undefined,
			      },
			      "representation": "static",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "static",
			      "representation": "static",
			      "sourceStart": 0,
			      "sourceText": ".card { color: red; }",
			    },
			  ],
			  "outputExtension": ".css",
			  "reports": [],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "canonicalSource": ".card{color:red}",
			      "canonicalTarget": ".card{color:red}",
			      "differences": [],
			      "lossiness": "lossless",
			      "residuals": [],
			      "valid": true,
			    },
			  ],
			}
		`);
	});
});
