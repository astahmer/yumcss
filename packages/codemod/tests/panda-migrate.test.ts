/**
 * Plan-024 project migration tests: real files in a temp project covering
 * css() conversion (incl. trailing commas), factory JSX rewriting (opening
 * + closing tags), tier-1 recipe module emission, and import rewrites.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadMetaFromSources } from "../src/meta.ts";
import { examplePreset } from "@pandwind/example-preset";
import {
	runPandaMigration,
	scanFactoryElements,
	factoryEdits,
	stripSpreadElements,
} from "../src/swap/adapters/panda/panda-migrate.ts";
import {
	foldRecipeCall,
	renderJsxIndex,
	renderPatternModule,
} from "../src/swap/adapters/panda/modules.ts";
import { expandBuiltinPattern } from "../src/swap/adapters/panda/patterns.ts";
import { detectAlias } from "../src/swap/adapters/panda/project.ts";
import { pandaStyleToIr, type PandaRecipeIR } from "../src/swap/adapters/panda/parse.ts";
import type { PandaProjectFileSystem } from "../src/swap/adapters/panda/panda-file-system.ts";
import { PandaJsxStylePropsModeTag } from "../src/swap/adapters/panda/style-props.ts";
import { PandaUtilityCatalog } from "../src/swap/adapters/panda/utilities.ts";
import { CodemodAdapterId, parseMigrateArgs, TokenReferenceFormat } from "../src/swap/index.ts";
import type { PandwindMeta } from "../src/meta.ts";

let meta: PandwindMeta;
try {
	meta = loadMetaFromSources({
		typesDtsPath: "../../apps/example/src/types.d.ts",
		twTsPath: "../../apps/example/src/tw.ts",
		tokens: examplePreset.tokens,
	});
} catch {
	meta = {
		bridgeInverse: new Map(),
	} as unknown as PandwindMeta;
}

const dirs: Array<string> = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function makeProject(): string {
	const dir = mkdtempSync(join(tmpdir(), "pandwind-migrate-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, "tsconfig.json"),
		JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
	);
	writeFileSync(
		join(dir, "panda.config.ts"),
		[
			"export default {",
			"  theme: { extend: { semanticTokens: { colors: { fg: { DEFAULT: { value: '#111' } } } } } },",
			"  utilities: { bg: { property: 'backgroundColor', shorthand: 'bg' }, px: { property: 'paddingX', shorthand: 'px' }, py: { property: 'paddingY', shorthand: 'py' } },",
			"};",
		].join("\n"),
	);
	mkdirSync(join(dir, "theme", "recipes"), { recursive: true });
	writeFileSync(
		join(dir, "theme", "recipes", "badge.recipe.ts"),
		[
			"import { defineRecipe } from '@pandacss/dev'",
			"",
			"export const badgeRecipe = defineRecipe({",
			"  className: 'badge',",
			"  base: { display: 'inline-block', px: '2' },",
			"  variants: {",
			"    tone: { neutral: { bg: 'gray.100' }, accent: { bg: 'fg' } },",
			"  },",
			"  defaultVariants: { tone: 'neutral' },",
			"})",
			"",
		].join("\n"),
	);
	mkdirSync(join(dir, "src"), { recursive: true });
	return dir;
}

describe("stripSpreadElements", () => {
	it("removes anatomy spreads and call values while keeping other entries", () => {
		const body = "{ base: parts({ root: { top: 0 } }), color: 'red', ...rest }";
		const stripped = stripSpreadElements(body);
		expect(stripped).not.toBeNull();
		expect(stripped).toContain("base: {}");
		expect(stripped).toContain("color: 'red'");
		expect(stripped).not.toContain("...");
	});
});

describe("factory elements", () => {
	it("scans literal props and flags spreads", () => {
		const src = `<panda.div px="4">x</panda.div>;\n<panda.span {...props} />`;
		const els = scanFactoryElements(src, () => false);
		expect(els).toHaveLength(2);
		expect(
			els.map(({ start, openEnd, selfClosing, tag, attrs }) => ({
				start,
				openEnd,
				selfClosing,
				tag,
				attrs: attrs.map(({ name, valueText, quoted, literal }) => ({
					name,
					valueText,
					quoted,
					literal,
				})),
			})),
		).toMatchInlineSnapshot(`
			[
			  {
			    "attrs": [
			      {
			        "literal": true,
			        "name": "px",
			        "quoted": true,
			        "valueText": "4",
			      },
			    ],
			    "openEnd": 18,
			    "selfClosing": false,
			    "start": 0,
			    "tag": "div",
			  },
			  {
			    "attrs": [
			      {
			        "literal": false,
			        "name": "...spread",
			        "quoted": false,
			        "valueText": null,
			      },
			    ],
			    "openEnd": 58,
			    "selfClosing": true,
			    "start": 33,
			    "tag": "span",
			  },
			]
		`);
		expect(els[0]?.attrs[0]?.name).toBe("px");
		expect(els[1]?.attrs[0]?.literal).toBe(false);
	});

	it("builds edits for opening tag, props, and matching closer", () => {
		const src = `<panda.div px="4" className="foo" onClick={go}>x</panda.div>`;
		const el = scanFactoryElements(src, () => false)[0]!;
		const loadedMeta = loadMetaFromSources({
			typesDtsPath: "../../apps/example/src/types.d.ts",
			twTsPath: "../../apps/example/src/tw.ts",
			tokens: examplePreset.tokens,
		});
		const edits = factoryEdits(el, src, loadedMeta, {
			tokens: {},
			conditions: {},
			tokenVars: new Map(),
			textStyles: new Map(),
			customPatterns: new Map(),
			utilityCatalog: PandaUtilityCatalog.fromConfig({
				paddingInline: { property: "paddingX", shorthand: "px" },
			}),
			jsxStyleProps: {
				mode: PandaJsxStylePropsModeTag.All,
				evidence: ["fallback"],
				matches: () => false,
			},
		});
		expect(edits).not.toBeNull();
		expect(edits?.some((edit) => edit.text.includes('"foo"'))).toBe(true);
	});
});

describe("supporting migration primitives", () => {
	it("expands built-in patterns and emits reusable modules", () => {
		const expanded = expandBuiltinPattern("hstack", { gap: "4", px: "2" });
		expect(expanded.style).toMatchObject({
			display: "flex",
			flexDirection: "row",
			gap: "4",
			px: "2",
		});
		const module = renderPatternModule("hstack", { cssImport: "../css" });
		expect(module).toContain('import { canonicalProps } from "../internal";');
		expect(module).toContain("export function hstack");
	});

	it("supports CLI flags used by project migration", () => {
		const args = parseMigrateArgs([
			"--from=panda",
			"--to=css.class",
			"--out=pandwind",
			"--force",
			"--engine",
			"--tokenize",
			"--sort",
			"--dedup",
			"site/**/*.tsx",
		]);
		expect(args.outDir).toBe("pandwind");
		expect(args.force).toBe(true);
		expect(args.patterns).toEqual(["site/**/*.tsx"]);
	});

	it("accepts external adapter sources and targets without requiring metadata", () => {
		const args = parseMigrateArgs([
			"--from=emotion",
			"--to=styled-components",
			"--report",
			"src/**/*.tsx",
		]);
		expect(args.from).toBe("emotion");
		expect(args.to).toBe("styled-components");
		expect(args.report).toBe(true);
	});

	it("uses the unified migrate spellings and writes by default", () => {
		const args = parseMigrateArgs(["-f", "tailwindcss", "-t", "pandwind-tw", "src/**/*.tsx"]);
		expect(args.from).toBe(CodemodAdapterId.Tailwind);
		expect(args.to).toBe("tw");
		expect(args.dryRun).toBe(false);
		expect(args.tokenReferenceFormat).toBe(TokenReferenceFormat.Preserve);
	});

	it("accepts explicit token spelling policies", () => {
		const args = parseMigrateArgs([
			"--token-format",
			"stitches",
			"--from",
			"emotion",
			"--to",
			"pandwind",
			"Card.tsx",
		]);
		expect(args.tokenReferenceFormat).toBe(TokenReferenceFormat.Stitches);
	});

	it("supports an explicit dry run without retaining a write flag", () => {
		const args = parseMigrateArgs(["migrate.tsx", "--dry-run"]);
		expect(args.dryRun).toBe(true);
	});

	it("keeps dependency installation opt-out explicit", () => {
		expect(parseMigrateArgs(["--no-install", "migrate.tsx"]).install).toBe(false);
		expect(parseMigrateArgs(["migrate.tsx"]).install).toBe(true);
	});

	it("accepts explicit capability policy and machine-readable reports", () => {
		const args = parseMigrateArgs([
			"--from=emotion",
			"--to=pandwind",
			"--partial",
			"--report=json",
			"Card.tsx",
		]);
		expect(args.capabilityMode).toBe("partial");
		expect(args.report).toBe(true);
		expect(args.reportFormat).toBe("json");
	});

	it("rejects unknown and conflicting command-line options", () => {
		expect(() => parseMigrateArgs(["--unknown", "Card.tsx"])).toThrow("Unknown option `--unknown`");
		expect(() => parseMigrateArgs(["--safe", "--partial", "Card.tsx"])).toThrow(
			"--safe and --partial are mutually exclusive",
		);
	});

	it("detects tsconfig aliases and emits valid JSX wrapper types", () => {
		const dir = makeProject();
		expect(detectAlias(dir)).toMatchObject({
			alias: "@",
			targetRoot: "src",
			source: "tsconfig.json paths",
		});
		const jsx = renderJsxIndex(new Set(["Box", "Wrap"]), {
			cssImport: "../css",
			aliasSpecifierFor: (subpath) => `@/pandwind/${subpath}`,
		});
		expect(jsx).toContain('import { css, cx } from "../css";');
		expect(jsx).toContain('import("react").ElementType');
		expect(jsx).toContain("splitStyleProps(rest)");
		expect(jsx).toContain('className, children, as = "div", ...rest');
		expect(jsx).toContain(">{children}</Tag>");
	});

	it("folds a single-use recipe without duplicating a shared definition", () => {
		const recipe: PandaRecipeIR = {
			kind: "cva",
			slots: null,
			className: null,
			base: { "": pandaStyleToIr({ padding: "2" }) },
			variants: { tone: { accent: { "": pandaStyleToIr({ color: "red" }) } } },
			compoundVariants: [],
			defaultVariants: {},
			residuals: [],
		};
		const folded = foldRecipeCall(recipe, { tone: "accent" }, meta);
		expect(folded?.text).toContain("css.class");
		expect(folded?.text).toContain("padding");
	});
});

describe("runPandaMigration", () => {
	it("uses the injected project-file port for host integration and emission", async () => {
		const dir = makeProject();
		writeFileSync(join(dir, "src", "page.tsx"), "export const Page = () => <div />;\n");
		const files = new Map<string, string>([
			[join(dir, "next.config.mjs"), "export default { webpack(config) { return config; } };\n"],
			[join(dir, "package.json"), JSON.stringify({ scripts: { prepare: "panda codegen" } })],
		]);
		const writes = new Map<string, string>();
		const projectFiles: PandaProjectFileSystem = {
			read: (path) => files.get(path),
			exists: (path) => files.has(path),
			write: (path, content) => writes.set(path, content),
			ensureDirectory: () => undefined,
		};

		await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.tsx"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
			fileSystem: projectFiles,
		});

		expect(writes.get(join(dir, "next.config.mjs"))).toContain("pandwindWebpackCss");
		expect(writes.get(join(dir, "package.json"))).not.toContain("panda codegen");
		expect([...writes.keys()].some((path) => path.endsWith("/preset.ts"))).toBe(true);
	});

	it("migrates a small project end-to-end", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "app.tsx"),
			[
				"import { css } from '@/styled-system/css'",
				"import { badge } from '@/styled-system/recipes'",
				"",
				"export const App = () => (",
				'  <panda.div px="4" py="2">',
				"    <span className={badge({ tone: 'accent' })} />",
				"    <div className={css({ bg: 'gray.100', _hover: { bg: 'white', }, })}>hi</div>",
				"  </panda.div>",
				");",
				"",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.{ts,tsx}", "theme/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		expect(report.filesScanned).toBeGreaterThanOrEqual(2);
		expect(report.cssCallsConverted).toBeGreaterThanOrEqual(1);

		const app = readFileSync(join(dir, "src", "app.tsx"), "utf8");
		expect(app).toContain("@/pandwind/css");
		expect(app).toContain("@/pandwind/recipes");
		expect(app).not.toContain("styled-system");
		expect(app).toContain("<div className={css.class(");
		expect(app).toContain("</div>");
		// The fixture only declares the custom `fg` token, so the unknown Panda
		// default path remains an authored dotted value until target metadata
		// proves a matching Pandwind token.
		expect(app).toContain('css.class({ backgroundColor: "gray.100"');

		// recipe module emitted with identical public name
		const barrel = readFileSync(join(dir, "src", "pandwind", "recipes", "index.ts"), "utf8");
		expect(barrel).toContain("badgeRecipe");
		const badgeModule = readFileSync(
			join(dir, "src", "pandwind", "recipes", "badgeRecipe.ts"),
			"utf8",
		);
		expect(badgeModule).toContain('"tone"');
		expect(badgeModule).toContain("export function badge");

		// bootstrap exists and binds css/cx
		const bootstrap = readFileSync(join(dir, "src", "pandwind", "css.ts"), "utf8");
		expect(bootstrap).toContain("createDesignCss");
		expect(bootstrap).toContain("createCx");
	});

	it("removes a local recipe call including its closing parenthesis", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "local.tsx"),
			[
				"import { cva } from '@/styled-system/css'",
				"const local = cva({ base: { padding: '2' } })",
				"export const Local = () => <div className={local({})} />",
			].join("\n"),
		);
		await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.tsx"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});
		const output = readFileSync(join(dir, "src", "local.tsx"), "utf8");
		expect(output).not.toMatch(/^\s*\)\s*$/m);
		expect(output).toContain("css.class");
	});

	it("inserts generated imports after a client directive", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "client.tsx"),
			[
				"'use client'",
				"import { cva } from '@/styled-system/css'",
				"const local = cva({ base: { padding: '2' } })",
				"export const Client = () => (",
				"  <>",
				"    <div className={local({})} />",
				"    <div className={local({})} />",
				"  </>",
				")",
			].join("\n"),
		);
		await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.tsx"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});
		const output = readFileSync(join(dir, "src", "client.tsx"), "utf8");
		expect(output).toMatch(/^'use client'\nimport \{ local as local \}/);
	});

	it("does not duplicate residual markers on reruns", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "residual.ts"),
			[
				"import { css } from '@/styled-system/css'",
				"export const styles = css({ '& > *': { mt: '2' } })",
			].join("\n"),
		);
		const migration = {
			projectRoot: dir,
			patterns: ["src/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		};
		await runPandaMigration(migration);
		const once = readFileSync(join(dir, "src", "residual.ts"), "utf8");
		const report = await runPandaMigration(migration);
		const twice = readFileSync(join(dir, "src", "residual.ts"), "utf8");
		expect(twice).toBe(once);
		expect(report.filesChanged).toBe(0);
	});

	it("is idempotent on an already-migrated project", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "plain.ts"),
			[
				"import { css } from '@/styled-system/css'",
				"",
				"export const cls = css({ p: '2' });",
				"",
			].join("\n"),
		);
		await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});
		const once = readFileSync(join(dir, "src", "plain.ts"), "utf8");
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});
		const twice = readFileSync(join(dir, "src", "plain.ts"), "utf8");
		expect(twice).toBe(once);
		expect(report.filesChanged).toBe(0);
	});

	it("keeps the current Next virtual stylesheet integration stable", async () => {
		const dir = makeProject();
		mkdirSync(join(dir, "app"), { recursive: true });
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({
				scripts: { prepare: "panda codegen", prebuild: "pnpm build && panda codegen" },
			}),
		);
		writeFileSync(
			join(dir, "next.config.mjs"),
			[
				'import { pandwindWebpackCss } from "pandwind/unplugin";',
				'import { preset } from "./src/pandwind/preset.ts";',
				"export default {",
				"\twebpack(config) {",
				'\t\tconfig.plugins.push(pandwindWebpackCss({ preset, virtualId: "pandwind-css.css" }));',
				"\t\treturn config;",
				"\t},",
				"};",
			].join("\n"),
		);
		writeFileSync(
			join(dir, "app", "layout.tsx"),
			'import "pandwind-css.css";\nexport default function Layout() { return null; }\n',
		);
		writeFileSync(join(dir, "src", "page.tsx"), "export const Page = () => <div />;\n");

		await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.tsx"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		expect(readFileSync(join(dir, "next.config.mjs"), "utf8")).toContain(
			'virtualId: "pandwind-css.css"',
		);
		expect(readFileSync(join(dir, "app", "layout.tsx"), "utf8")).toBe(
			'import "pandwind-css.css";\nexport default function Layout() { return null; }\n',
		);
		expect(readFileSync(join(dir, "src", "pandwind", "virtual.d.ts"), "utf8")).toContain(
			'declare module "pandwind-css.css"',
		);
		const packageJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		expect(packageJson.scripts.prepare).toBeUndefined();
		expect(packageJson.scripts.prebuild).toBe("pnpm build");
	});

	it("lowers defineTextStyles so the migrated theme has no invalid Panda helper", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "theme", "text-styles.ts"),
			[
				"import { defineTextStyles } from '@pandacss/dev'",
				"export const textStyles = defineTextStyles({ body: { value: { fontSize: '1rem' } } })",
			].join("\n"),
		);
		await runPandaMigration({
			projectRoot: dir,
			patterns: ["theme/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});
		const output = readFileSync(join(dir, "theme", "text-styles.ts"), "utf8");
		expect(output).not.toContain("defineTextStyles");
		expect(output).not.toContain("@pandacss/dev");
		expect(output).toContain("export const textStyles = {");
	});
});
