import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { expect, test } from "vitest";
import { z } from "zod";
import { createEmptyYumCSSMeta, loadMetaFromSourcesAsync } from "../src/meta.ts";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	dedupLiteralCallSites,
	runAdapterMigration,
	runSwap,
	STYLE_MIGRATION_USE_CASE,
} from "../src/swap/index.ts";
import { MigrationOutput } from "../src/swap/migration-output.ts";
import { MigrationFilePlan } from "../src/swap/migration-file-plan.ts";

const packageRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(packageRoot, "../..");
const migrationReportSchema = z.object({
	files: z.array(
		z.object({
			file: z.string(),
			converted: z.number(),
			skipped: z.number(),
			residuals: z.number(),
		}),
	),
});

const runCli = (input: {
	readonly root: string;
	readonly from: string;
	readonly to: string;
	readonly dedup?: boolean;
	readonly force?: boolean;
}) =>
	migrationReportSchema.parse(
		JSON.parse(
			execFileSync(
				"nub",
				[
					"--conditions=yumcss",
					"src/cli.ts",
					"migrate",
					"--root",
					input.root,
					`--from=${input.from}`,
					`--to=${input.to}`,
					"--safe",
					"--no-install",
					...(input.force ? ["--force"] : []),
					...(input.dedup ? ["--dedup"] : []),
					"--report=json",
					`${input.root}/*.{ts,tsx}`,
				],
				{ cwd: packageRoot, encoding: "utf8" },
			),
		),
	);

test("standalone default styled export emits a complete forwardRef call", () => {
	const result = runAdapterMigration(
		'import "styled-components"; import styled from "styled-components"; export default styled.div({color:"red"});',
		{
			from: "styled-components",
			to: "tailwind",
			file: "Card.tsx",
			semantic: { source: { framework: "react" } },
		},
	);
	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(parseSync("Card.tsx", result.code).errors).toEqual([]);
	expect(result.code).toContain("/>);");
	expect(result.code).not.toContain("styled-components");
	expect(result.code).not.toContain('import styled from "styled-components";');
	expect(result.code).toContain(
		'import { forwardRef as __yumcssStandaloneForwardRef } from "react";',
	);
	expect(result.code).toContain('const __yumcssStandaloneClass = "[color:red]";');
	expect(result.code).toContain("export default __yumcssStandaloneComponent;");
});

test("Tailwind literal underscores survive the official compiler", async () => {
	const result = runAdapterMigration(
		'import "@emotion/css"; import {css} from "@emotion/css"; export const cls=css({fontFamily:"my_font", "--custom":"my_token"});',
		{ from: "emotion", to: "tailwind", file: "App.tsx" },
	);
	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import "@emotion/css";');
	expect(result.code).not.toContain('import {css} from "@emotion/css";');
	const require = createRequire(`${packageRoot}/package.json`);
	const { __unstable__loadDesignSystem } = require("@tailwindcss/node");
	const system = await __unstable__loadDesignSystem("", { base: packageRoot });
	const className = /cls=(.+);/u.exec(result.code)?.[1];
	expect(className).toBeDefined();
	const css = system.candidatesToCss(JSON.parse(className!).split(" ")).join("\n");
	expect(css).toContain("font-family: my_font;");
	expect(css).toContain("--custom: my_token;");
});

test("dedup keeps skipped dynamic scopes and ignores strings, comments, and shadowed calls", () => {
	const source =
		'import {css} from "./design.ts";\nexport const first=(color)=>css.class({color:color});\nexport const second=(color)=>css.class({color:color});';
	const result = runSwap(source, createEmptyYumCSSMeta(), {
		from: "auto",
		to: "tw",
		file: "App.tsx",
		dedup: true,
	});
	expect(result.converted).toBe(0);
	expect(result.skippedByMarker).toBe(2);
	expect(result.code).not.toContain("const pwStyle");
	expect(result.code).toContain("first=(color)=>css.class({color:color})");
	expect(result.code).toMatchInlineSnapshot(`
		"import {css} from "./design.ts";
		// yumcss:migrate-skip (lowering-residual: non-literal object)
		export const first=(color)=>css.class({color:color});
		// yumcss:migrate-skip (lowering-residual: non-literal object)
		export const second=(color)=>css.class({color:color});"
	`);
	const unrelated =
		'import {tw} from "./tw.ts";\nconst text="tw({color:1}) tw({color:1})";\n// tw({color:1}) tw({color:1})\nconst first=(tw)=>tw({color:1}); const second=(tw)=>tw({color:1});';
	expect(dedupLiteralCallSites(unrelated)).toBe(unrelated);
});

test("flat migration dedup recognizes the generated project tw module", async () => {
	const appDirectory = resolve(repoRoot, "examples/example/src");
	const meta = await loadMetaFromSourcesAsync({
		typesDtsPath: resolve(appDirectory, "types.d.ts"),
		twTsPath: resolve(appDirectory, "tw.ts"),
		bridgePath: resolve(appDirectory, "bridge.ts"),
	});
	const source =
		'import {css} from "yumcss/css"; export const first=css.class({backgroundColor:"#3182ce"}); export const second=css.class({backgroundColor:"#3182ce"});';
	const result = runSwap(source, meta, {
		from: "css",
		to: "tw",
		file: "src/Card.ts",
		metaDir: "examples/example/src",
		dedup: true,
	});
	expect(result.converted).toBe(2);
	expect(result.code).toContain('from "../examples/example/src/tw"');
	expect([...result.code.matchAll(/\btw\s*\(/gu)]).toHaveLength(1);
	expect(result.code).toMatchInlineSnapshot(`
		"import { tw } from "../examples/example/src/tw";
		import {css} from "yumcss/css";
		const pwStyle1 = tw({ bgColor: "blue-500" });
		 export const first=pwStyle1; export const second=pwStyle1;"
	`);
});

test("flat migration reuses an aliased generated tw import", async () => {
	const appDirectory = resolve(repoRoot, "examples/example/src");
	const meta = await loadMetaFromSourcesAsync({
		typesDtsPath: resolve(appDirectory, "types.d.ts"),
		twTsPath: resolve(appDirectory, "tw.ts"),
		bridgePath: resolve(appDirectory, "bridge.ts"),
	});
	const source =
		'import {tw as utility} from "../examples/example/src/tw";\nimport {css} from "yumcss/css";\nexport const card=css.class({backgroundColor:"#3182ce"});';
	const result = runSwap(source, meta, {
		from: "css",
		to: "tw",
		file: "src/Card.ts",
		metaDir: "examples/example/src",
	});
	expect(result.converted).toBe(1);
	expect(result.code).toContain('utility({ bgColor: "blue-500" })');
	expect([...result.code.matchAll(/from "\.\.\/examples\/example\/src\/tw"/gu)]).toHaveLength(1);
	expect(result.code).toMatchInlineSnapshot(`
		"import {tw as utility} from "../examples/example/src/tw";
		import {css} from "yumcss/css";
		export const card=utility({ bgColor: "blue-500" });"
	`);
});

test("dedup chooses unused bindings and is idempotent", () => {
	const source =
		'import {tw as utility} from "yumcss/tw";\nexport const pwStyle1="occupied"; const first=utility({color:"red"}); const second=utility({color:"red"});';
	const result = dedupLiteralCallSites(source);
	expect(result).toContain('const pwStyle2 = utility({color:"red"});');
	expect(result).toContain("const first=pwStyle2; const second=pwStyle2;");
	expect(
		spawnSync(process.execPath, ["--check", "--input-type=module"], { input: result }).status,
	).toBe(0);
	expect(dedupLiteralCallSites(result)).toBe(result);
	expect(result).toMatchInlineSnapshot(`
		"import {tw as utility} from "yumcss/tw";
		const pwStyle2 = utility({color:"red"});

		export const pwStyle1="occupied"; const first=pwStyle2; const second=pwStyle2;"
	`);
});

test("dedup inserts before calls that precede a legal late import", () => {
	const source =
		'const first=tw({color:"red"}); import {tw} from "yumcss/tw"; const second=tw({color:"red"});';
	const result = dedupLiteralCallSites(source);
	expect(result).toMatchInlineSnapshot(`
		"
		const pwStyle1 = tw({color:"red"});
		const first=pwStyle1; import {tw} from "yumcss/tw"; const second=pwStyle1;"
	`);
	let calls = 0;
	const values = new Function(
		"tw",
		`${result.replace('import {tw} from "yumcss/tw";', "")}; return [first, second];`,
	)(() => {
		calls += 1;
		return "compiled";
	});
	expect(values).toEqual(["compiled", "compiled"]);
	expect(calls).toBe(1);
});

test.each([
	{ to: "vanilla-extract", file: "App.css.ts", name: "style" },
	{ to: "treat", file: "App.treat.ts", name: "style" },
	{ to: "stylex", file: "App.tsx", name: "stylex" },
])("$to imports avoid authored bindings", ({ to, file, name }) => {
	const result = runAdapterMigration(
		`import {css} from "@emotion/css"; const ${name}={display:"block"}; const __yumcss${name}="reserved"; export const cls=css({color:"red"});`,
		{ from: "emotion", to, file },
	);
	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain(`const ${name}={display:"block"}`);
	expect(result.code).toContain(`__yumcss${name}2`);
	expect(
		spawnSync(process.execPath, ["--check", "--input-type=module"], { input: result.code }).status,
	).toBe(0);
});

test("dedup leaves unrelated imported calls and non-script files untouched", () => {
	const foreign =
		'import {tw} from "./foreign"; const first=tw({color:"red"}); const second=tw({color:"red"});';
	expect(dedupLiteralCallSites(foreign)).toBe(foreign);

	const stylesheet = ".card { color: red; }";
	const result = runSwap(stylesheet, createEmptyYumCSSMeta(), {
		from: "auto",
		to: "css.class",
		file: "Card.module.css",
		dedup: true,
	});
	expect(result.code).toBe(stylesheet);
});

test("target imports keep source aliases that remain used elsewhere", async () => {
	const source =
		'import { css as style } from "@emotion/css"; export const original = style; export const card = style({color:"red"});';
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from: "emotion",
		to: "treat",
		file: "Card.treat.ts",
	});
	expect({ input: source, output: result.code }).toMatchInlineSnapshot(`
		{
		  "input": "import { css as style } from "@emotion/css"; export const original = style; export const card = style({color:"red"});",
		  "output": "import { style as __yumcssstyle } from "treat";
		import { css as style } from "@emotion/css"; export const original = style; export const card = __yumcssstyle({ "color": "red" });",
		}
	`);
	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("export const original = style;");
	expect(result.code).toMatch(/import \{ style as __yumcssstyle \} from "treat"/u);
	expect(result.code).toContain("export const card = __yumcssstyle");
});

test("Emotion Unicode aliases still match their AST-resolved call sites", async () => {
	const source =
		'import { css as 样式 } from "@emotion/css"; export const original = 样式; export const card = 样式({color:"red"});';
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from: "emotion",
		to: "treat",
		file: "Card.treat.ts",
	});

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { css as 样式 } from "@emotion/css";');
	expect(result.code).toContain("export const original = 样式;");
	expect(result.code).toContain('style({ "color": "red" })');
	expect(result.code).toMatchInlineSnapshot(`
		"import { style } from "treat";
		import { css as 样式 } from "@emotion/css"; export const original = 样式; export const card = style({ "color": "red" });"
	`);
});

test("Emotion call migration handles Unicode-escaped imported identifiers", async () => {
	const source =
		'import { css as \\u0073tyle } from "@emotion/css"; export const original = \\u0073tyle; export const card = \\u0073tyle({color:"red"});';
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from: "emotion",
		to: "treat",
		file: "Card.treat.ts",
	});

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('css as \\u0073tyle } from "@emotion/css"');
	expect(result.code).toContain("export const original");
	expect(result.code).toContain('style as __yumcssstyle } from "treat"');
	expect(result.code).toContain('__yumcssstyle({ "color": "red" })');
});

test("source import cleanup preserves live braced Unicode bindings", () => {
	const sources = [
		'import { css as \\u{63}ss } from "@emotion/css"; export const original = css;',
		'import \\u{61} from "@emotion/css"; export const original = a;',
		'import * as \\u{73}tyles from "@emotion/css"; export const original = styles;',
	];

	for (const source of sources)
		expect(MigrationOutput.removeSourceImports(source, { modules: ["@emotion/css"] })).toBe(source);
});

test("source import cleanup preserves source when Oxc cannot materialize a braced JSX escape", () => {
	const source = [
		'import { css } from "@emotion/css";',
		'import { ThemeProvider as \\u{54}hemeProvider } from "@emotion/react";',
		"export const App = () => <\\u{54}hemeProvider/>;",
		'export const card = css({ color: "red" });',
	].join("\n");

	expect(MigrationOutput.removeSourceImports(source, { modules: ["@emotion/css"] })).toBe(source);
});

test("Emotion to Tailwind preserves source when Oxc cannot materialize a braced JSX escape", async () => {
	const source = [
		'import { css } from "@emotion/css";',
		'import { ThemeProvider as \\u{54}hemeProvider } from "@emotion/react";',
		"export const App = () => <\\u{54}hemeProvider/>;",
		'export const card = css({ color: "red" });',
	].join("\n");
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from: "emotion",
		to: "tailwind",
		file: "App.tsx",
	});

	expect(result.code).toBe(source);
	expect(result.changed).toBe(false);
	expect(result.converted).toBe(0);
	expect(result.residuals).toEqual(
		expect.arrayContaining([expect.objectContaining({ kind: "parse" })]),
	);
});

test("source import cleanup keeps type-only import syntax", () => {
	const source =
		'import type { Theme, css } from "@emotion/css"; export type OriginalTheme = Theme;';

	expect(MigrationOutput.removeSourceImports(source, { modules: ["@emotion/css"] })).toBe(
		'import type { Theme } from "@emotion/css"; export type OriginalTheme = Theme;',
	);
});

test("source import cleanup preserves module side effects when bindings are removed", async () => {
	const implicitSideEffect = MigrationOutput.removeSourceImports(
		'import { unused } from "@emotion/css";\nexport const value = 1;',
		{ modules: ["@emotion/css"] },
	);
	expect(implicitSideEffect).toBe('import "@emotion/css";\nexport const value = 1;');
	const typeOnlyImport = MigrationOutput.removeSourceImports(
		'import { type Theme } from "@emotion/css";\nexport const value = 1;',
		{ modules: ["@emotion/css"] },
	);
	expect(typeOnlyImport).toBe("export const value = 1;");
	const mixedTypeAndValueImport = MigrationOutput.removeSourceImports(
		'import { unused, type Theme } from "@emotion/css";\nexport type Current = Theme;',
		{ modules: ["@emotion/css"] },
	);
	expect(mixedTypeAndValueImport).toBe(
		'import { type Theme } from "@emotion/css";\nimport "@emotion/css";\nexport type Current = Theme;',
	);
	expect(MigrationOutput.removeRedundantSideEffectImports(mixedTypeAndValueImport)).toBe(
		mixedTypeAndValueImport,
	);
	const sideEffectFreeMixedImport = MigrationOutput.removeSourceImports(
		'import { unused, type Theme } from "@/styled-system/css";\nexport type Current = Theme;',
		{
			modules: ["@/styled-system/css"],
			sideEffectFreeModules: ["@/styled-system/css"],
		},
	);
	expect(sideEffectFreeMixedImport).toBe(
		'import { type Theme } from "@/styled-system/css";\nexport type Current = Theme;',
	);
	const direct = MigrationOutput.removeSourceImports(
		'import "@emotion/css"; import { unused } from "@emotion/css";',
		{ modules: ["@emotion/css"] },
	);
	expect(direct).toContain('import "@emotion/css";');
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import "@emotion/css"; import { css } from "@emotion/css"; export const card = css({ color: "red" });',
		{ from: "emotion", to: "tailwind", file: "Card.ts" },
	);
	expect(result.code).toContain('import "@emotion/css";');
});

test("JSX output from a TypeScript module receives a TSX extension", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import styled from "vue-styled-components"; export const Card = styled.div`color: red;`;',
		{
			from: CodemodAdapterId.VueStyled,
			to: CodemodAdapterId.Tamagui,
			file: "Card.ts",
			semantic: { source: { framework: BuiltinHostFramework.Vue } },
		},
	);

	expect(result.outputExtension).toBe(".tsx");
	expect(result.code).toContain("<__CardTamagui");
	expect(result.code).not.toContain('import styled from "vue-styled-components"');
	expect(result.code).toContain('import "vue-styled-components";');
});

test("Tokenami source import does not collide with the generated YumCSS css binding", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css } from "@tokenami/css"; export const card = css({ "--color": "red" });',
		{
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("const css = createUnsafeCss();");
	expect(result.code).not.toContain("@tokenami/css");
	expect(result.code).not.toContain("import { css } from");
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		 export const card = css.class({ color: "red" });"
	`);
});

test("live source css binding stays separate from generated YumCSS css", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css } from "@tokenami/css"; export const original = css; export const card = css({ "--color": "red" });',
		{
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { css as sourceCss } from "@tokenami/css";');
	expect(result.code).toContain("const css = createUnsafeCss();");
	expect(result.code).toContain("export const original = sourceCss;");
	expect(result.code).toContain("export const card = css.class({ color: \"red\" });");
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		import { css as sourceCss } from "@tokenami/css"; export const original = sourceCss; export const card = css.class({ color: "red" });"
	`);
});

test("generated YumCSS binding avoids an unrelated live css import and alias-like strings", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import css from "./helpers"; import styled from "@emotion/styled"; const label = "targetCss.class"; export const helperStyle = css; export const Card = styled.div({ color: "red" });',
		{
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import css from "./helpers";');
	expect(result.code).toContain('const label = "targetCss.class";');
	expect(result.code).toContain("const targetCss = createUnsafeCss();");
	expect(result.code).toContain("export const helperStyle = css;");
	expect(result.code).toContain('export const Card = targetCss.class({ color: "red" });');
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const targetCss = createUnsafeCss();
		import css from "./helpers"; import "@emotion/styled"; const label = "targetCss.class"; export const helperStyle = css; export const Card = targetCss.class({ color: "red" });"
	`);
});

test("generated YumCSS binding preserves foreign css imports and avoids local collisions", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css } from "./helpers"; import styled from "@emotion/styled"; const sourceCss = "local"; const label = "css.class"; export const helperStyle = css; export const Card = styled.div({ color: "red" });',
		{
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { css } from "./helpers";');
	expect(result.code).toContain('const sourceCss = "local";');
	expect(result.code).toContain('const label = "css.class";');
	expect(result.code).toContain("export const helperStyle = css;");
	expect(result.code).toContain('export const Card = targetCss.class({ color: "red" });');
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const targetCss = createUnsafeCss();
		import { css } from "./helpers"; import "@emotion/styled"; const sourceCss = "local"; const label = "css.class"; export const helperStyle = css; export const Card = targetCss.class({ color: "red" });"
	`);
});

test("generated YumCSS binding preserves shadowed css parameters", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css } from "./helpers"; import styled from "@emotion/styled"; export const passthrough = (css) => css; export const helperStyle = css; export const Card = styled.div({ color: "red" });',
		{
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.code).toContain('import { css } from "./helpers";');
	expect(result.code).toContain("export const passthrough = (css) => css;");
	expect(result.code).toContain("export const helperStyle = css;");
	expect(result.code).toContain('export const Card = targetCss.class({ color: "red" });');
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const targetCss = createUnsafeCss();
		import { css } from "./helpers"; import "@emotion/styled"; export const passthrough = (css) => css; export const helperStyle = css; export const Card = targetCss.class({ color: "red" });"
	`);
});

test("generated YumCSS binding preserves TypeScript-only css declarations", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import styled from "@emotion/styled"; type css = string; export const Card = styled.div({ color: "red" });',
		{
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.code).toContain("type css = string;");
	expect(result.code).toContain("const targetCss = createUnsafeCss();");
	expect(result.code).toContain('targetCss.class({ color: "red" })');
	expect(result.code).not.toContain("const css = createUnsafeCss();");
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
});

test("YumCSS binding selection ignores import-shaped strings and comments", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css } from "./helpers"; import styled from "@emotion/styled"; const prose = \'import { css } from "./helpers"; css.class\'; // import { css } from "./helpers"; css.class\nexport const helperStyle = css; export const Card = styled.div({ color: "red" });',
		{
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.code).toContain('const prose = \'import { css } from "./helpers"; css.class\';');
	expect(result.code).toContain('// import { css } from "./helpers"; css.class');
	expect(result.code).toContain('import { css } from "./helpers";');
	expect(result.code).toContain("export const helperStyle = css;");
	expect(result.code).toContain('export const Card = targetCss.class({ color: "red" });');
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const targetCss = createUnsafeCss();
		import { css } from "./helpers"; import "@emotion/styled"; const prose = 'import { css } from "./helpers"; css.class'; // import { css } from "./helpers"; css.class
		export const helperStyle = css; export const Card = targetCss.class({ color: "red" });"
	`);
});

test("foreign namespace css import avoids the generated YumCSS binding collision", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import * as css from "./helpers"; import styled from "@emotion/styled"; export const helperStyle = css; export const Card = styled.div({ color: "red" });',
		{
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.code).toContain('import * as css from "./helpers";');
	expect(result.code).toContain("export const helperStyle = css;");
	expect(result.code).toContain('export const Card = targetCss.class({ color: "red" });');
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const targetCss = createUnsafeCss();
		import * as css from "./helpers"; import "@emotion/styled"; export const helperStyle = css; export const Card = targetCss.class({ color: "red" });"
	`);
});

test("source CSS binding normalization preserves shadowed parameters", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css } from "@tokenami/css"; export const passthrough = (css) => css; export const original = css; export const card = css({ "--color": "red" });',
		{
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.code).toContain('import { css } from "@tokenami/css";');
	expect(result.code).toContain("export const passthrough = (css) => css;");
	expect(result.code).toContain("export const original = css;");
	expect(result.code).toContain('export const card = targetCss.class({ color: "red" });');
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const targetCss = createUnsafeCss();
		import { css } from "@tokenami/css"; export const passthrough = (css) => css; export const original = css; export const card = targetCss.class({ color: "red" });"
	`);
});

test("source CSS binding normalization edits imports without touching strings or comments", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css } from "@tokenami/css"; const prose = \'import { css } from "@tokenami/css"; css.class\'; // import { css } from "@tokenami/css"; css.class\nexport const original = css; export const card = css({ "--color": "red" });',
		{
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.code).toContain('import { css as sourceCss } from "@tokenami/css";');
	expect(result.code).toContain('const prose = \'import { css } from "@tokenami/css"; css.class\';');
	expect(result.code).toContain('// import { css } from "@tokenami/css"; css.class');
	expect(result.code).toContain("export const original = sourceCss;");
	expect(result.code).toContain('export const card = css.class({ color: "red" });');
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		import { css as sourceCss } from "@tokenami/css"; const prose = 'import { css } from "@tokenami/css"; css.class'; // import { css } from "@tokenami/css"; css.class
		export const original = sourceCss; export const card = css.class({ color: "red" });"
	`);
});

test("generated binding aliasing preserves CSS string values that resemble identifiers", async () => {
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css } from "./helpers"; import styled from "@emotion/styled"; export const Card = styled.div({ content: "css.class" });',
		{
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			file: "Card.ts",
		},
	);

	expect(result.code).toContain('content: "css.class"');
	expect(result.code).toContain('export const Card = targetCss.class({ content: "css.class" });');
	expect(parseSync("Card.ts", result.code).errors).toEqual([]);
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const targetCss = createUnsafeCss();
		import { css } from "./helpers"; import "@emotion/styled"; export const Card = targetCss.class({ content: "css.class" });"
	`);
});

test("source import cleanup removes evaluation only for side-effect-free modules", () => {
	const result = MigrationOutput.removeSourceImports(
		'import "@/styled-system/css";\nexport const value = 1;',
		{
			modules: ["@/styled-system/css"],
			sideEffectFreeModules: ["@/styled-system/css"],
		},
	);
	expect(result).toBe("export const value = 1;");
});

test("source import cleanup leaves import-looking string literals unchanged", async () => {
	const source =
		'import { css } from "@emotion/css";\n' +
		"const message = 'import { css } from \"@emotion/css\";';\n" +
		'export const card = css({color:"red"});';
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from: "emotion",
		to: "tailwind",
		file: "Card.ts",
	});

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("const message = 'import { css } from \"@emotion/css\";';");
});

test("source import cleanup preserves references inside template expressions", async () => {
	const source =
		'import { css } from "@emotion/css";\n' +
		"export const original = `kept: ${css}`;\n" +
		'export const card = css({color:"red"});';
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from: "emotion",
		to: "tailwind",
		file: "Card.ts",
	});

	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('import { css } from "@emotion/css";');
	expect(result.code).toContain("export const original = `kept: ${css}`;");
});

test("source import cleanup preserves live JSX component imports on residual paths", async () => {
	const source =
		'import { css, ThemeProvider } from "@emotion/react"; const theme = {}; export const App = () => <ThemeProvider theme={theme}><div css={css({color:"red"})} /></ThemeProvider>;';
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from: "emotion",
		to: "tailwind",
		file: "App.tsx",
	});

	expect(result.converted).toBe(1);
	expect(result.residuals.length).toBeGreaterThan(0);
	expect(result.code).toContain('import { ThemeProvider } from "@emotion/react"');
	expect(result.code).toContain("<ThemeProvider");
});

test("named import pruning ignores import-shaped string literals", () => {
	const source =
		"const message = 'import { css } from \"@emotion/css\";';\n" +
		'import { css } from "@emotion/css";\n' +
		"export const card = 1;";

	for (const output of [
		MigrationOutput.removeNamedImportSpecifiers(source, ["@emotion/css"], ["css"]),
		MigrationOutput.removeUnreferencedImportSpecifiers(source, ["css"]),
	]) {
		expect(output).toContain("const message = 'import { css } from \"@emotion/css\";';");
		expect(output).not.toContain('\nimport { css } from "@emotion/css";');
	}
});

test("source import cleanup preserves live dollar-prefixed and suffixed bindings", async () => {
	for (const alias of ["$css", "css$"]) {
		const source =
			"import { css as " +
			alias +
			' } from "@emotion/css"; export const original = ' +
			alias +
			"; export const card = " +
			alias +
			'({color:"red"});';
		const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
			from: "emotion",
			to: "treat",
			file: "Card.treat.ts",
		});

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("import { css as " + alias + ' } from "@emotion/css";');
		expect(result.code).toContain("export const original = " + alias + ";");
	}
});

test("source import cleanup preserves a live unaliased binding", async () => {
	const source =
		'import { css } from "@emotion/css"; export const original = css; export const card = css({color:"red"});';
	const result = await STYLE_MIGRATION_USE_CASE.runAsync(source, {
		from: "emotion",
		to: "treat",
		file: "Card.treat.ts",
	});

	expect(result.converted).toBe(1);
	expect(result.code).toContain('import { css } from "@emotion/css";');
	expect(result.code).toContain("export const original = css;");
	expect(result.code).toContain('import { style } from "treat";');
	expect(result.code).toContain('style({ "color": "red" })');

	const fullyConverted = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import "@emotion/css"; import { css } from "@emotion/css"; export const card = css({color:"red"});',
		{ from: "emotion", to: "treat", file: "Card.treat.ts" },
	);
	expect(fullyConverted.converted).toBe(1);
	expect(fullyConverted.code).toContain('import "@emotion/css";');
	expect(fullyConverted.code).not.toContain('import { css } from "@emotion/css";');
	expect(fullyConverted.code).toContain('style({ "color": "red" })');

	const retainedSibling = await STYLE_MIGRATION_USE_CASE.runAsync(
		'import { css, keyframes } from "@emotion/css"; export const animationFactory = keyframes; export const card = css({color:"red"});',
		{ from: "emotion", to: "treat", file: "Card.treat.ts" },
	);
	expect(retainedSibling.code).toContain('import { keyframes } from "@emotion/css";');
	expect(retainedSibling.code).toContain("export const animationFactory = keyframes;");
	expect(retainedSibling.code).not.toContain("{ css, keyframes }");
});

test("module edits compose into migrated output and reject semantic conflicts", () => {
	const baseline = 'import {a} from "./a"; import {b} from "./b"; export const cls=old();';
	const changes = MigrationFilePlan.compose({
		changes: [
			{
				path: "consumer.ts",
				expectedContent: baseline,
				content: baseline.replace('"./a"', '"./a.treat"'),
			},
			{
				path: "consumer.ts",
				expectedContent: baseline,
				content: baseline.replace('"./b"', '"./b.treat"'),
			},
		],
	});
	expect(changes).toHaveLength(1);
	const rewritten = MigrationFilePlan.rewrite({
		file: "consumer.ts",
		source: baseline.replace("old()", "newStyle()"),
		change: changes[0]!,
	});
	expect(rewritten).toContain("newStyle()");
	expect(rewritten).toMatchInlineSnapshot(
		`"import {a} from "./a.treat"; import {b} from "./b.treat"; export const cls=newStyle();"`,
	);
	const aliasedChanges = MigrationFilePlan.compose({
		changes: [
			{
				path: "src/./consumer.ts",
				expectedContent: baseline,
				content: baseline.replace('"./a"', '"./a.treat"'),
			},
			{
				path: "src/consumer.ts",
				expectedContent: baseline,
				content: baseline.replace('"./a"', '"./a.treat"'),
			},
		],
	});
	expect(aliasedChanges).toHaveLength(1);
	expect(aliasedChanges[0]?.path).toBe("src/consumer.ts");
	expect(() =>
		MigrationFilePlan.compose({
			changes: [
				{
					path: "consumer.ts",
					expectedContent: baseline,
					content: baseline.replace('"./a"', '"./first"'),
				},
				{
					path: "consumer.ts",
					expectedContent: baseline,
					content: baseline.replace('"./a"', '"./second"'),
				},
			],
		}),
	).toThrow("conflicting import destinations");
	expect(() =>
		MigrationFilePlan.compose({
			changes: [
				{
					path: "consumer.ts",
					expectedContent: baseline,
					content: baseline.replace("old()", "first()"),
				},
				{
					path: "consumer.ts",
					expectedContent: baseline,
					content: baseline.replace("old()", "second()"),
				},
			],
		}),
	).toThrow("conflicting non-import");
	expect(() =>
		MigrationFilePlan.compose({
			changes: [
				{
					path: "src/./consumer.ts",
					expectedContent: baseline,
					content: baseline.replace('"./a"', '"./first"'),
				},
				{
					path: "src/consumer.ts",
					expectedContent: baseline,
					content: baseline.replace('"./a"', '"./second"'),
				},
			],
		}),
	).toThrow("conflicting import destinations");
});

test("CLI applies adapter-owned static dedup when requested", () => {
	const root = mkdtempSync(`${repoRoot}/.tmp-adversarial-dedup-`);
	try {
		writeFileSync(`${root}/package.json`, '{"type":"module"}');
		writeFileSync(
			`${root}/Card.ts`,
			'import "@emotion/css"; import { css } from "@emotion/css"; export const first = css({color:"red"}); export const second = css({color:"red"});',
		);
		const report = runCli({ root, from: "emotion", to: "treat", dedup: true });
		const output = readFileSync(`${root}/Card.treat.ts`, "utf8");

		expect(report.files[0]?.converted).toBe(2);
		expect([...output.matchAll(/style\(\{/gu)]).toHaveLength(1);
		expect(output).toContain('const pwStyle1 = style({ "color": "red" });');
		expect(output).toContain('import { style } from "treat";');
		expect(output).toContain('import "@emotion/css";');
		expect(output).toContain("export const first = pwStyle1;");
		expect(output).toContain("export const second = pwStyle1;");
		expect(output).not.toContain('import { css } from "@emotion/css";');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("CLI rejects an escaping symlink at the host-conversion output path", () => {
	const root = mkdtempSync(`${repoRoot}/.tmp-adversarial-output-link-`);
	const outside = mkdtempSync(`${repoRoot}/.tmp-adversarial-output-outside-`);
	try {
		writeFileSync(`${root}/package.json`, '{"type":"module"}');
		writeFileSync(
			`${root}/Card.ts`,
			'import {css} from "@emotion/css"; export const card=css({color:"red"});',
		);
		writeFileSync(`${outside}/sentinel.ts`, "outside sentinel");
		symlinkSync(`${outside}/sentinel.ts`, `${root}/Card.treat.ts`);
		expect(() => runCli({ root, from: "emotion", to: "treat" })).toThrow();
		expect(readFileSync(`${outside}/sentinel.ts`, "utf8")).toBe("outside sentinel");
		expect(readFileSync(`${root}/Card.ts`, "utf8")).toContain("@emotion/css");
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	}
});

test("CLI refuses in-place writes through project hardlinks", () => {
	const root = mkdtempSync(`${repoRoot}/.tmp-adversarial-source-hardlink-`);
	const outside = mkdtempSync(`${repoRoot}/.tmp-adversarial-source-hardlink-outside-`);
	const source = 'import { css } from "@emotion/css"; export const card = css({ color: "red" });\n';
	try {
		writeFileSync(`${root}/package.json`, '{"type":"module"}');
		writeFileSync(`${outside}/Card.ts`, source);
		linkSync(`${outside}/Card.ts`, `${root}/Card.ts`);

		expect(() => runCli({ root, from: "emotion", to: "tailwind" })).toThrow();
		expect(readFileSync(`${root}/Card.ts`, "utf8")).toBe(source);
		expect(readFileSync(`${outside}/Card.ts`, "utf8")).toBe(source);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	}
});

test("CLI refuses forced generated-file overwrites through project hardlinks", () => {
	const root = mkdtempSync(`${repoRoot}/.tmp-adversarial-generated-hardlink-`);
	const outside = mkdtempSync(`${repoRoot}/.tmp-adversarial-generated-hardlink-outside-`);
	const source =
		'import "virtual:uno.css";\nexport const App = () => <div className="my-color" />;';
	const preset = "outside preset sentinel";
	try {
		writeFileSync(`${root}/package.json`, '{"type":"module"}');
		writeFileSync(
			`${root}/uno.config.ts`,
			'export default { rules: [["my-color", { color:"red" }]] };',
		);
		writeFileSync(`${root}/App.tsx`, source);
		writeFileSync(
			`${root}/vite.config.ts`,
			'import UnoCSS from "unocss/vite"; export default {plugins:[UnoCSS()]};',
		);
		writeFileSync(`${outside}/preset.ts`, preset);
		mkdirSync(`${root}/yumcss`, { recursive: true });
		linkSync(`${outside}/preset.ts`, `${root}/yumcss/preset.ts`);

		expect(() => runCli({ root, from: "unocss", to: "yumcss", force: true })).toThrow();
		expect(readFileSync(`${root}/App.tsx`, "utf8")).toBe(source);
		expect(readFileSync(`${root}/yumcss/preset.ts`, "utf8")).toBe(preset);
		expect(readFileSync(`${outside}/preset.ts`, "utf8")).toBe(preset);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	}
});

test("CLI preflights project file-change hardlinks before writing generated files", () => {
	const root = mkdtempSync(`${repoRoot}/.tmp-adversarial-project-change-hardlink-`);
	const outside = mkdtempSync(`${repoRoot}/.tmp-adversarial-project-change-hardlink-outside-`);
	const source =
		'import "virtual:uno.css";\nexport const App = () => <div className="my-color" />;';
	const vite = 'import UnoCSS from "unocss/vite"; export default {plugins:[UnoCSS()]};';
	try {
		writeFileSync(`${root}/package.json`, '{"type":"module"}');
		writeFileSync(
			`${root}/uno.config.ts`,
			'export default { rules: [["my-color", { color:"red" }]] };',
		);
		writeFileSync(`${root}/App.tsx`, source);
		writeFileSync(`${outside}/vite.config.ts`, vite);
		linkSync(`${outside}/vite.config.ts`, `${root}/vite.config.ts`);

		expect(() => runCli({ root, from: "unocss", to: "yumcss" })).toThrow();
		expect(readFileSync(`${root}/App.tsx`, "utf8")).toBe(source);
		expect(readFileSync(`${outside}/vite.config.ts`, "utf8")).toBe(vite);
		expect(existsSync(`${root}/yumcss/preset.ts`)).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	}
});

test("CLI applies rename edits to final destinations without resurrecting source", () => {
	const root = mkdtempSync(`${repoRoot}/.tmp-adversarial-renames-`);
	try {
		writeFileSync(`${root}/package.json`, '{"type":"module"}');
		writeFileSync(
			`${root}/styles.ts`,
			'import {css} from "@emotion/css"; export const card=css({color:"red"});',
		);
		writeFileSync(
			`${root}/consumer.ts`,
			'import {card} from "./styles"; import "@emotion/css"; import {css} from "@emotion/css"; export const second=css({color:"blue"}); export {card};',
		);
		const report = runCli({ root, from: "emotion", to: "treat" });
		expect(
			report.files.every(
				(file: { converted: number; residuals: number }) =>
					file.converted === 1 && file.residuals === 0,
			),
		).toBe(true);
		expect(existsSync(`${root}/consumer.ts`)).toBe(false);
		expect(existsSync(`${root}/styles.ts`)).toBe(false);
		const consumer = readFileSync(`${root}/consumer.treat.ts`, "utf8");
		expect(consumer).toContain('from "./styles.treat"');
		expect(consumer).toContain('from "treat"');
		expect(consumer).toContain('import "@emotion/css";');
		expect(consumer).not.toContain('import {css} from "@emotion/css";');
		expect(consumer).toContain('style({ "color": "blue" })');
		expect(parseSync("consumer.treat.ts", consumer).errors).toEqual([]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("configuration-blocked migration preserves stylesheet and build wiring", () => {
	const root = mkdtempSync(`${repoRoot}/.tmp-adversarial-bootstrap-`);
	try {
		writeFileSync(`${root}/package.json`, '{"type":"module","devDependencies":{"unocss":"1.0.0"}}');
		const source =
			'import "virtual:uno.css";\nexport const App=()=> <div className="my-custom-utility" />;';
		const vite = 'import UnoCSS from "unocss/vite"; export default {plugins:[UnoCSS()]};';
		writeFileSync(`${root}/App.tsx`, source);
		writeFileSync(`${root}/vite.config.ts`, vite);
		const report = runCli({ root, from: "unocss", to: "yumcss" });
		expect(report.files.find((file: { file: string }) => file.file === "App.tsx")).toMatchObject({
			converted: 0,
			skipped: 1,
			residuals: 1,
		});
		expect(readFileSync(`${root}/App.tsx`, "utf8")).toContain('import "virtual:uno.css";');
		expect(readFileSync(`${root}/vite.config.ts`, "utf8")).toBe(vite);
		expect(existsSync(`${root}/yumcss/preset.ts`)).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("verified UnoCSS configuration permits complete bootstrap, while unresolved utilities preserve all files", () => {
	for (const className of ["my-color", "my-color unknown-utility"]) {
		const root = mkdtempSync(`${repoRoot}/.tmp-adversarial-verified-bootstrap-`);
		try {
			writeFileSync(`${root}/package.json`, '{"type":"module"}');
			writeFileSync(
				`${root}/uno.config.ts`,
				'export default { rules: [["my-color", { color:"red" }]] };',
			);
			const source = `import "virtual:uno.css";\nexport const App=()=> <div className="${className}"/>;`;
			const vite = 'import UnoCSS from "unocss/vite"; export default {plugins:[UnoCSS()]};';
			writeFileSync(`${root}/App.tsx`, source);
			writeFileSync(`${root}/vite.config.ts`, vite);
			if (className !== "my-color") {
				expect(() => runCli({ root, from: "unocss", to: "yumcss" })).toThrow();
				expect(readFileSync(`${root}/App.tsx`, "utf8")).toBe(source);
				expect(readFileSync(`${root}/vite.config.ts`, "utf8")).toBe(vite);
				expect(existsSync(`${root}/yumcss/preset.ts`)).toBe(false);
				continue;
			}
			const report = runCli({ root, from: "unocss", to: "yumcss" });
			expect(report.files.find((file: { file: string }) => file.file === "App.tsx")).toMatchObject({
				converted: 1,
				skipped: 0,
				residuals: 0,
			});
			expect(readFileSync(`${root}/App.tsx`, "utf8")).not.toContain("virtual:uno.css");
			expect(readFileSync(`${root}/vite.config.ts`, "utf8")).toContain("yumcssExtractVite");
			expect(existsSync(`${root}/yumcss/preset.ts`)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});
