/**
 * Plan-024 project migration tests: real files in a temp project covering
 * css() conversion (incl. trailing commas), factory JSX rewriting (opening
 * + closing tags), tier-1 recipe module emission, and import rewrites.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
	renderCssBootstrap,
	renderPandaPreset,
	renderPatternModule,
	renderRecipeModule,
} from "../src/swap/adapters/panda/modules.ts";
import { expandBuiltinPattern } from "../src/swap/adapters/panda/patterns.ts";
import { detectAlias } from "../src/swap/adapters/panda/project.ts";
import { pandaStyleToIr, type PandaRecipeIR } from "../src/swap/adapters/panda/parse.ts";
import type { PandaProjectFileSystem } from "../src/swap/adapters/panda/panda-file-system.ts";
import { PandaJsxStylePropsModeTag } from "../src/swap/adapters/panda/style-props.ts";
import { PandaUtilityCatalog } from "../src/swap/adapters/panda/utilities.ts";
import { emptyPandaTheme, type PandaTheme } from "../src/swap/adapters/panda/theme.ts";
import { CodemodAdapterId, parseMigrateArgs, TokenReferenceFormat } from "../src/swap/index.ts";
import type { PandwindMeta } from "../src/meta.ts";

let meta: PandwindMeta;
try {
	meta = loadMetaFromSources({
		typesDtsPath: "../../examples/example/src/types.d.ts",
		twTsPath: "../../examples/example/src/tw.ts",
		tokens: examplePreset.tokens,
	});
} catch {
	meta = {
		bridgeInverse: new Map(),
	} as unknown as PandwindMeta;
}

const dirs: Array<string> = [];

const sideEffectImports = (source: string): Array<string> =>
	[...source.matchAll(/^[ \t]*import\s*["']([^"']+)["']\s*;?[ \t]*$/gmu)].map((match) => match[1]!);

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
			"  outdir: 'src/styled-system',",
			"  theme: { extend: { semanticTokens: { colors: { fg: { DEFAULT: { value: '#111' } } } } } },",
			"  utilities: { bg: { property: 'backgroundColor', shorthand: 'bg' }, px: { property: 'paddingX', shorthand: 'px' }, py: { property: 'paddingY', shorthand: 'py' } },",
			"};",
		].join("\n"),
	);
	writeFileSync(
		join(dir, "vite.config.ts"),
		['import { defineConfig } from "vite";', "export default defineConfig({ plugins: [] });"].join(
			"\n",
		),
	);
	mkdirSync(join(dir, "styled-system"), { recursive: true });
	mkdirSync(join(dir, "src", "styled-system"), { recursive: true });
	writeFileSync(
		join(dir, "src", "styled-system", "styles.css"),
		"/* Panda fixture stylesheet */\n",
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
	writeFileSync(join(dir, "src", "main.tsx"), 'import "@/styled-system/styles.css";\n');
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
			typesDtsPath: "../../examples/example/src/types.d.ts",
			twTsPath: "../../examples/example/src/tw.ts",
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
	it("emits an app-owned, static-first Pandwind surface", () => {
		const theme: PandaTheme = {
			...emptyPandaTheme,
			tokens: {
				colors: {
					brand: "#111111",
					accent: { _hover: "#222222", DEFAULT: "#333333" },
					"semantic.label": { base: "#444444", _dark: "#444444" },
					"component.card.border": "#111111",
					"component.card.shadow": "0 2px 0 #000000",
					"component.card.surface": { base: "#111111", _dark: "#111111" },
					"component.card.bg": { base: "#111111", _dark: "colors.accent" },
				},
				spacing: { 4: "1rem" },
				borderWidths: { thin: "1px" },
			},
			conditions: { _hover: "&:hover" },
		};
		const preset = renderPandaPreset(theme);
		const bootstrap = renderCssBootstrap();
		const recipe = renderRecipeModule(
			"badge",
			{
				kind: "cva",
				slots: null,
				className: null,
				base: { "": pandaStyleToIr({ padding: "4" }) },
				variants: { tone: { accent: { "": pandaStyleToIr({ color: "brand" }) } } },
				compoundVariants: [],
				defaultVariants: {},
				residuals: [],
			},
			meta,
			{ cssImport: 'import { css } from "../css";' },
		);
		expect(preset).toContain("define.tokens");
		expect(preset).toContain("export const preset = define.preset(");
		expect(preset).toContain("defineSemanticTokens");
		expect(preset).toContain("const componentTokens = appSemanticTokens.defineSemanticTokens");
		expect(preset).toContain("define.properties");
		expect(preset).toContain('"component.card.border"');
		expect(preset).toContain("strict: true");
		expect(preset).not.toContain('"$strict": false');
		expect(preset).toContain('"base": "colors.brand"');
		expect(preset).toContain('"_dark": "colors.accent"');
		expect(preset).toContain('"raw.semantic.label.base": "#444444"');
		expect(preset).toContain(
			'"semantic.label": {\n\t\t\t"base": "colors.raw.semantic.label.base"\n\t\t}',
		);
		expect(preset).toContain('"raw.component.card.shadow": "0 2px 0 #000000"');
		expect(preset).toContain(
			'"component.card.shadow": {\n\t\t\t"base": "colors.raw.component.card.shadow"\n\t\t}',
		);
		expect(preset).toMatch(/"component\.card\.surface": \{\n\t+"base": "colors\.brand"\n\t+\}/u);
		const appSemanticStart = preset.indexOf("const appSemanticTokens");
		const componentStart = preset.indexOf("const componentTokens");
		expect(preset.slice(appSemanticStart, componentStart)).not.toContain("component.");
		expect(preset).toContain('"borderWidth"');
		expect(preset).toContain('"display": true');
		expect(preset).not.toContain('"$all": true');
		expect(preset).not.toContain("preset.tokens");
		expect(preset).not.toContain("preset.properties");
		expect(preset).not.toContain(" as any");
		expect(bootstrap).toContain("createCss(preset)");
		expect(bootstrap).toContain("export const css");
		expect(bootstrap).not.toContain("createCssOpen");
		expect(bootstrap).not.toContain("cssRuntime");
		expect(bootstrap).not.toContain("createDesignCss");
		expect(bootstrap).not.toContain("dss");
		expect(recipe).toContain("Object.assign");
		expect(recipe).not.toContain("as Record");
		expect(recipe).not.toContain(": any");
	});

	it("emits Panda color palettes as owned static preset metadata", () => {
		const theme: PandaTheme = {
			...emptyPandaTheme,
			tokens: {
				colors: {
					"blue.500": "#3182ce",
					"blue.700": "#2c5282",
					"gray.500": "#718096",
				},
			},
		};
		const preset = renderPandaPreset(theme);

		expect(preset).toContain("defineColorPalettes");
		expect(preset).toContain("tokens.defineColorPalettes");
		expect(preset).toContain('blue: "colors.blue"');
		expect(preset).toContain('gray: "colors.gray"');
		expect(preset).toContain("colorPalettes,");
	});

	it("serializes Panda font stacks into the target token catalog", () => {
		const theme: PandaTheme = {
			...emptyPandaTheme,
			tokens: {
				colors: { brand: "#111111" },
				fonts: { body: ["Inter", "sans-serif"] },
			},
		};
		const preset = renderPandaPreset(theme);
		const tokenCatalog = /const appTokens = define\.tokens\((\{[\s\S]*?\n\})\);/u.exec(preset)?.[1];

		expect(tokenCatalog).toMatchInlineSnapshot(`
			"{
				"colors": {
					"brand": "#111111"
				},
				"fonts": {
					"body": "Inter, sans-serif"
				}
			}"
		`);
		expect(preset).toContain('"fontFamily": {\n\t\t"$tokens": "fonts"\n\t}');
	});

	it("emits one canonical underscore condition for built-in aliases", () => {
		const theme: PandaTheme = {
			...emptyPandaTheme,
			conditions: {
				hover: "&:hover",
				_hover: "&:focus-visible",
				md: "@media (min-width: 768px)",
			},
		};
		const preset = renderPandaPreset(theme);

		expect(preset).toContain('\n\t"_hover": "&:focus-visible",');
		expect(preset).not.toContain('\n\t"hover":');
		expect(preset).toContain('\n\t"md": "@media (min-width: 768px)",');
		expect(preset).not.toContain('\n\t"_md":');
	});

	it("typechecks the emitted preset and reusable modules", () => {
		const theme: PandaTheme = {
			...emptyPandaTheme,
			tokens: {
				colors: { "blue.500": "#3182ce", "blue.700": "#2c5282", brand: "#111111" },
				fonts: { body: ["Inter", "sans-serif"] },
				spacing: { 4: "1rem" },
			},
		};
		const directory = mkdtempSync(join(tmpdir(), "pandwind-emitted-types-"));
		dirs.push(directory);
		mkdirSync(join(directory, "patterns"));
		writeFileSync(join(directory, "preset.ts"), renderPandaPreset(theme));
		writeFileSync(join(directory, "css.ts"), renderCssBootstrap());
		writeFileSync(
			join(directory, "patterns", "hstack.ts"),
			renderPatternModule("hstack", {
				cssImport: "../css",
				propertyAliases: new Map([["px", "paddingX"]]),
			}),
		);
		writeFileSync(
			join(directory, "recipe.ts"),
			renderRecipeModule(
				"badge",
				{
					kind: "cva",
					slots: null,
					className: null,
					base: { "": pandaStyleToIr({ color: "brand" }) },
					variants: {},
					compoundVariants: [],
					defaultVariants: {},
					residuals: [],
				},
				meta,
				{ cssImport: 'import { css } from "./css";' },
			),
		);
		const workspaceRoot = resolve(import.meta.dirname, "../../..");
		writeFileSync(
			join(directory, "tsconfig.json"),
			JSON.stringify(
				{
					compilerOptions: {
						allowImportingTsExtensions: true,
						module: "ESNext",
						moduleResolution: "Bundler",
						noEmit: true,
						jsx: "react-jsx",
						skipLibCheck: true,
						strict: true,
						paths: {
							"pandwind/*": [resolve(workspaceRoot, "packages/pandwind/src/*")],
							react: [
								resolve(workspaceRoot, "packages/pandwind/node_modules/@types/react/index.d.ts"),
							],
							"react/*": [resolve(workspaceRoot, "packages/pandwind/node_modules/@types/react/*")],
						},
					},
					files: ["preset.ts", "css.ts", "recipe.ts", "patterns/hstack.ts"],
				},
				undefined,
				2,
			),
		);
		expect(() =>
			execFileSync("pnpm", ["exec", "tsc", "-p", join(directory, "tsconfig.json")], {
				cwd: workspaceRoot,
				stdio: "inherit",
			}),
		).not.toThrow();
	});

	it("expands built-in patterns and emits reusable modules", () => {
		const expanded = expandBuiltinPattern("hstack", { gap: "4", px: "2" });
		expect(expanded.style).toMatchObject({
			display: "flex",
			flexDirection: "row",
			gap: "4",
			px: "2",
		});
		const module = renderPatternModule("hstack", {
			cssImport: "../css",
			propertyAliases: new Map([["px", "paddingX"]]),
		});
		expect(module).toContain('import { css, type StyleProps } from "../css";');
		expect(module).not.toContain("canonicalProps");
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

	it("detects tsconfig aliases for direct JSX lowering", () => {
		const dir = makeProject();
		expect(detectAlias(dir)).toMatchObject({
			alias: "@",
			targetRoot: "src",
			source: "tsconfig.json paths",
		});
		expect(dir).toContain("pandwind-migrate");
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
		expect(folded?.text).not.toContain("cx(");
	});
});

describe("runPandaMigration", () => {
	it("uses the injected project-file port for host integration and emission", async () => {
		const dir = makeProject();
		rmSync(join(dir, "theme", "recipes", "badge.recipe.ts"), { force: true });
		writeFileSync(join(dir, "src", "page.tsx"), "export const Page = () => <div />;\n");
		const files = new Map<string, string>([
			[join(dir, "next.config.mjs"), "export default { webpack(config) { return config; } };\n"],
			[join(dir, "package.json"), JSON.stringify({ scripts: { prepare: "panda codegen" } })],
			[join(dir, "src", "styled-system", "styles.css"), "/* Panda fixture stylesheet */\n"],
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
		expect(report.cssCallsConverted).toBe(1);
		expect(report.cssCallsFlagged).toBe(0);
		expect(report.tier1Modules).toContain("badgeRecipe");
		expect(report.residualsByKind).toEqual({});

		const app = readFileSync(join(dir, "src", "app.tsx"), "utf8");
		expect(app).toContain("@/pandwind/css");
		expect(app).toContain("@/pandwind/recipes");
		expect(app).not.toContain("@/styled-system/");
		expect(app).toContain('className={css.class({ "paddingInline": "4", "paddingBlock": "2" })}');
		expect(app).toContain('css.class({ background: "gray.100", _hover: { background: "white" } })');
		expect(app).not.toContain("pandwind:migrate-skip");
		expect(app).toMatchInlineSnapshot(`
			"import { css } from '@/pandwind/css';
			import { badge } from '@/pandwind/recipes'

			export const App = () => (
			  <div className={css.class({ "paddingInline": "4", "paddingBlock": "2" })}>
			    <span className={badge({ tone: 'accent' })} />
			    <div className={css.class({ background: "gray.100", _hover: { background: "white" } })}>hi</div>
			  </div>
			);
			"
		`);

		// bootstrap owns the configured css binding
		const bootstrap = readFileSync(join(dir, "src", "pandwind", "css.ts"), "utf8");
		expect(bootstrap).toContain("createCss(preset)");
		expect(bootstrap).not.toContain("createDesignCss");
		expect(bootstrap).not.toContain("createCx");
		expect(readFileSync(join(dir, "src", "pandwind", "css.ts"), "utf8")).toContain(
			"export type StyleProps",
		);
	});

	it("lowers static Panda JSX components to native elements and Stack", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "layout.tsx"),
			[
				'import { Box, VStack } from "@/styled-system/jsx";',
				"",
				"export const Layout = () => (",
				'  <VStack gap="4" align="center">',
				'    <Box px="4">Content</Box>',
				"  </VStack>",
				");",
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

		const output = readFileSync(join(dir, "src", "layout.tsx"), "utf8");
		expect(output).toContain('from "@/pandwind/stack"');
		expect(output).not.toContain("styled-system/jsx");
		expect(output).toContain('direction="column"');
		expect(output).toContain('className={css.class({ "paddingInline": "4" })}');
		expect(output).toContain("paddingInline");
		expect(output).toContain("</div>");
		expect(output).not.toContain("<Box");
		expect(readFileSync(join(dir, "src", "pandwind", "stack.tsx"), "utf8")).toContain(
			"createStack(css)",
		);
	});

	it("does not rewrite Panda examples embedded in template strings", async () => {
		const dir = makeProject();
		const sample = [
			'import { outdent } from "outdent";',
			"const example = outdent`",
			'import { css } from "./styled-system/css";',
			'const className = css({ color: "red" });',
			"`;",
			'export const App = () => css({ color: "blue" });',
			"",
		].join("\n");
		writeFileSync(join(dir, "src", "examples.tsx"), sample);

		await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.tsx"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const output = readFileSync(join(dir, "src", "examples.tsx"), "utf8");
		expect(output).toContain('import { css } from "./styled-system/css";');
		expect(output).toContain('const className = css({ color: "red" });');
		expect(output).toContain('export const App = () => css.class({ color: "blue" });');
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
		const input = [
			"import { css } from '@/styled-system/css'",
			"export const styles = css({ color: 'auditUnknown.400' })",
		].join("\n");
		writeFileSync(join(dir, "src", "residual.ts"), input);
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
		expect(once).toContain("import { css } from '@/styled-system/css'");
		expect(once).toContain("css({ color: 'auditUnknown.400' })");
		expect(once).not.toContain("from '@/pandwind/css'");
		expect(once).toContain("pandwind:migrate-skip");
		const stylesEntry = readFileSync(join(dir, "src", "main.tsx"), "utf8");
		expect(stylesEntry).toContain('import "@/styled-system/styles.css";');
		expect(stylesEntry).toContain('import "pandwind:css";');
		expect(report.notes).toContain(
			"kept Panda stylesheet imports because the migration scope does not cover every project source file",
		);
		expect(report.notes).not.toContain(
			"kept Panda codegen scripts because residual Panda source still uses its generated system",
		);
		expect(once).toMatchInlineSnapshot(`
			"import { css } from '@/styled-system/css'
			// pandwind:migrate-skip (token "auditUnknown.400" is not in the ingested panda theme; add it to the Pandwind preset before migration)
			export const styles = css({ color: 'auditUnknown.400' })"
		`);
	});

	it("deduplicates a Panda stylesheet import against a target import in the same entry", async () => {
		const dir = makeProject();
		rmSync(join(dir, "theme", "recipes", "badge.recipe.ts"), { force: true });
		writeFileSync(
			join(dir, "src", "main.tsx"),
			'import "@/styled-system/styles.css";\nimport "pandwind:css";\n',
		);
		writeFileSync(
			join(dir, "src", "page.tsx"),
			[
				"import { css } from '@/styled-system/css'",
				"export const Page = () => <div className={css({ color: 'rebeccapurple' })} />",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.{ts,tsx}"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const stylesEntry = readFileSync(join(dir, "src", "main.tsx"), "utf8");
		expect(report.cssCallsConverted).toBe(1);
		expect(report.residualsByKind).toEqual({});
		expect(stylesEntry.match(/import "pandwind:css";/gu)).toHaveLength(1);
		expect(stylesEntry).not.toContain("styled-system/styles.css");
		expect(sideEffectImports(stylesEntry)).toMatchInlineSnapshot(`
			[
			  "pandwind:css",
			]
		`);
	});

	it("replaces Panda CSS @import with the Pandwind Vite entry", async () => {
		const dir = makeProject();
		rmSync(join(dir, "theme", "recipes", "badge.recipe.ts"), { force: true });
		writeFileSync(
			join(dir, "src", "main.tsx"),
			'// import "pandwind:css";\nimport "./global.css";\n',
		);
		writeFileSync(join(dir, "src", "global.css"), '@import "./styled-system/styles.css";\n');
		writeFileSync(
			join(dir, "src", "page.tsx"),
			[
				"import { css } from '@/styled-system/css'",
				"export const Page = () => <div className={css({ color: 'rebeccapurple' })} />",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.{ts,tsx}"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const globalStylesheet = readFileSync(join(dir, "src", "global.css"), "utf8");
		const main = readFileSync(join(dir, "src", "main.tsx"), "utf8");
		expect(report.cssCallsConverted).toBe(1);
		expect(report.residualsByKind).toEqual({});
		expect(globalStylesheet).toBe("\n");
		expect(main).toContain('// import "pandwind:css";');
		expect(sideEffectImports(main)).toMatchInlineSnapshot(`
			[
			  "./global.css",
			  "pandwind:css",
			]
		`);
	});

	it("moves a nested Panda CSS @import to its JavaScript entrypoint", async () => {
		const dir = makeProject();
		rmSync(join(dir, "theme", "recipes", "badge.recipe.ts"), { force: true });
		mkdirSync(join(dir, "src", "styles"), { recursive: true });
		writeFileSync(join(dir, "src", "main.tsx"), 'import "./styles/index.css";\n');
		writeFileSync(join(dir, "src", "styles", "index.css"), '@import "./panda.css";\n');
		writeFileSync(
			join(dir, "src", "styles", "panda.css"),
			'@import "../styled-system/styles.css";\n',
		);
		writeFileSync(
			join(dir, "src", "page.tsx"),
			[
				"import { css } from '@/styled-system/css'",
				"export const Page = () => <div className={css({ color: 'rebeccapurple' })} />",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.{ts,tsx}"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const pandaStylesheet = readFileSync(join(dir, "src", "styles", "panda.css"), "utf8");
		const main = readFileSync(join(dir, "src", "main.tsx"), "utf8");
		expect(report.cssCallsConverted).toBe(1);
		expect(report.residualsByKind).toEqual({});
		expect(pandaStylesheet).toBe("\n");
		expect(sideEffectImports(main)).toMatchInlineSnapshot(`
			[
			  "./styles/index.css",
			  "pandwind:css",
			]
		`);
	});

	it("keeps both CSS engines available for residual Panda styles in a CSS @import", async () => {
		const dir = makeProject();
		rmSync(join(dir, "theme", "recipes", "badge.recipe.ts"), { force: true });
		writeFileSync(join(dir, "src", "main.tsx"), 'import "./global.css";\n');
		writeFileSync(join(dir, "src", "global.css"), '@import "./styled-system/styles.css";\n');
		writeFileSync(
			join(dir, "src", "page.tsx"),
			[
				"import { css } from '@/styled-system/css'",
				"export const Page = () => <div className={css({ color: 'auditUnknown.400' })} />",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.{ts,tsx}"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const globalStylesheet = readFileSync(join(dir, "src", "global.css"), "utf8");
		const main = readFileSync(join(dir, "src", "main.tsx"), "utf8");
		expect(report.cssCallsFlagged).toBe(1);
		expect(report.residualsByKind).toEqual({ "unknown-value": 1 });
		expect(globalStylesheet).toBe('@import "./styled-system/styles.css";\n');
		expect(sideEffectImports(main)).toMatchInlineSnapshot(`
			[
			  "./global.css",
			  "pandwind:css",
			]
		`);
	});

	it("preserves Panda when its CSS stylesheet has no JavaScript entrypoint", async () => {
		const dir = makeProject();
		rmSync(join(dir, "theme", "recipes", "badge.recipe.ts"), { force: true });
		writeFileSync(join(dir, "src", "main.tsx"), "export {};\n");
		writeFileSync(join(dir, "src", "global.css"), '@import "./styled-system/styles.css";\n');
		writeFileSync(
			join(dir, "src", "page.tsx"),
			[
				"import { css } from '@/styled-system/css'",
				"export const Page = () => <div className={css({ color: 'rebeccapurple' })} />",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.{ts,tsx}"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		expect(report.cssCallsConverted).toBe(0);
		expect(report.residualsByKind.unrepresentable).toBe(1);
		expect(readFileSync(join(dir, "src", "page.tsx"), "utf8")).toContain("styled-system/css");
		expect(readFileSync(join(dir, "src", "global.css"), "utf8")).toBe(
			'@import "./styled-system/styles.css";\n',
		);
	});

	it("converts resolvable Panda styles beside an unresolved token without rebinding Panda css", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "mixed.ts"),
			[
				"import { css } from '@/styled-system/css'",
				"export const known = css({ color: 'rebeccapurple' })",
				"export const unknown = css({ color: 'auditUnknown.400' })",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const output = readFileSync(join(dir, "src", "mixed.ts"), "utf8");
		expect(report.cssCallsConverted).toBe(1);
		expect(report.cssCallsFlagged).toBe(1);
		expect(output).toContain("import { css } from '@/styled-system/css'");
		expect(output).toContain('import { css as pandwindCss } from "@/pandwind/css";');
		expect(output).toContain('pandwindCss.class({ color: "rebeccapurple" })');
		expect(output).toContain("css({ color: 'auditUnknown.400' })");
		expect(output).toMatchInlineSnapshot(`
			"import { css as pandwindCss } from "@/pandwind/css";
			import { css } from '@/styled-system/css'
			export const known = pandwindCss.class({ color: "rebeccapurple" })
			// pandwind:migrate-skip (token "auditUnknown.400" is not in the ingested panda theme; add it to the Pandwind preset before migration)
			export const unknown = css({ color: 'auditUnknown.400' })"
		`);
	});

	it("migrates aliased Panda css imports through their local binding", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "aliased.ts"),
			[
				"import { css as pandaCss } from '@/styled-system/css'",
				"export const styles = pandaCss({ color: 'rebeccapurple' })",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const output = readFileSync(join(dir, "src", "aliased.ts"), "utf8");
		expect(report.cssCallsConverted).toBe(1);
		expect(report.cssCallsFlagged).toBe(0);
		expect(output).toContain("import { css as pandaCss } from '@/pandwind/css'");
		expect(output).toContain('pandaCss.class({ color: "rebeccapurple" })');
		expect(output).not.toContain("pandwind:migrate-skip");
		expect(output).toMatchInlineSnapshot(`
			"import { css as pandaCss } from '@/pandwind/css';
			export const styles = pandaCss.class({ color: "rebeccapurple" })"
		`);
	});

	it("preserves dynamic Panda css calls and required generated-system scripts", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({
				scripts: { prepare: "panda codegen", prebuild: "pnpm build && panda codegen" },
			}),
		);
		writeFileSync(
			join(dir, "src", "dynamic.ts"),
			[
				"import { css } from '@/styled-system/css'",
				"declare const runtimeStyle: Record<string, string>",
				"export const styles = css(runtimeStyle)",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const output = readFileSync(join(dir, "src", "dynamic.ts"), "utf8");
		const packageJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		expect(report.cssCallsConverted).toBe(0);
		expect(report.cssCallsFlagged).toBe(1);
		expect(report.residualsByKind.dynamic).toBe(1);
		expect(output).toContain("import { css } from '@/styled-system/css'");
		expect(output).toContain("css(runtimeStyle)");
		expect(output).toContain("pandwind:migrate-skip");
		expect(packageJson.scripts).toEqual({
			prepare: "panda codegen",
			prebuild: "pnpm build && panda codegen",
		});
		expect(report.notes).toContain(
			"kept Panda codegen scripts because residual Panda source still uses its generated system",
		);
		expect(output).toMatchInlineSnapshot(`
			"import { css } from '@/styled-system/css'
			declare const runtimeStyle: Record<string, string>
			// pandwind:migrate-skip (non-literal Panda css() call)
			export const styles = css(runtimeStyle)"
		`);
	});

	it("leaves unrelated css imports alone when lowering Panda factories", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "unrelated-css.tsx"),
			[
				"import { css } from '@emotion/css'",
				"export const styles = css({ color: 'rebeccapurple' })",
				'export const App = () => <panda.div px="4" />',
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.tsx"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const output = readFileSync(join(dir, "src", "unrelated-css.tsx"), "utf8");
		expect(report.cssCallsConverted).toBe(0);
		expect(report.cssCallsFlagged).toBe(0);
		expect(report.factoryElementsConverted).toBe(1);
		expect(output).toContain("import { css } from '@emotion/css'");
		expect(output).toContain("css({ color: 'rebeccapurple' })");
		expect(output).toContain('import { css as pandwindCss } from "@/pandwind/css";');
		expect(output).toContain('className={pandwindCss.class({ "paddingInline": "4" })}');
		expect(output).toMatchInlineSnapshot(`
			"import { css as pandwindCss } from "@/pandwind/css";
			import { css } from '@emotion/css'
			export const styles = css({ color: 'rebeccapurple' })
			export const App = () => <div className={pandwindCss.class({ "paddingInline": "4" })}/>"
		`);
	});

	it("preserves Panda factory props when a token is absent from verified theme metadata", async () => {
		const dir = makeProject();
		writeFileSync(
			join(dir, "src", "factory.tsx"),
			'export const App = () => <panda.div color="auditUnknown.400" px="4" />;',
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.tsx"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const output = readFileSync(join(dir, "src", "factory.tsx"), "utf8");
		expect(report.factoryElementsConverted).toBe(0);
		expect(report.factoryElementsFlagged).toBe(1);
		expect(output).toContain('<panda.div color="auditUnknown.400" px="4" />');
		expect(output).not.toContain("css.class");
		expect(output).toContain("pandwind:migrate-skip");
		expect(output).toMatchInlineSnapshot(`
			"// pandwind:migrate-skip (token "auditUnknown.400" is not in the ingested panda theme; add it to the Pandwind preset before migration)
			export const App = () => <panda.div color="auditUnknown.400" px="4" />;"
		`);
	});

	it("preserves local recipes whose nested styles contain unresolved tokens", async () => {
		const dir = makeProject();
		const input = [
			"import { cva } from '@/styled-system/css'",
			"const button = cva({ base: { color: 'auditUnknown.400' }, variants: { tone: { quiet: { color: 'rebeccapurple' } } } })",
			"export const buttonClass = button({ tone: 'quiet' })",
		].join("\n");
		writeFileSync(join(dir, "src", "button.ts"), input);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/**/*.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		const output = readFileSync(join(dir, "src", "button.ts"), "utf8");
		expect(report.tier0Folded).not.toContain("button");
		expect(report.tier1Modules).not.toContain("button");
		expect(output).toContain("import { cva } from '@/styled-system/css'");
		expect(output).toContain("const button = cva({ base: { color: 'auditUnknown.400' }");
		expect(output).toContain("button({ tone: 'quiet' })");
		expect(output).toContain("pandwind:migrate-skip");
		expect(output).toMatchInlineSnapshot(`
			"import { cva } from '@/styled-system/css'
			// pandwind:migrate-skip (token "auditUnknown.400" is not in the ingested panda theme; add it to the Pandwind preset before migration)
			const button = cva({ base: { color: 'auditUnknown.400' }, variants: { tone: { quiet: { color: 'rebeccapurple' } } } })
			export const buttonClass = button({ tone: 'quiet' })"
		`);
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
		rmSync(join(dir, "vite.config.ts"), { force: true });
		rmSync(join(dir, "src", "main.tsx"), { force: true });
		rmSync(join(dir, "theme", "recipes", "badge.recipe.ts"), { force: true });
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
			'import "@/styled-system/styles.css";\nexport default function Layout() { return null; }\n',
		);
		writeFileSync(join(dir, "src", "page.tsx"), "export const Page = () => <div />;\n");

		await runPandaMigration({
			projectRoot: dir,
			patterns: ["**/*.tsx", "theme/**/*.ts"],
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

	it("generates an executable Next integration when package metadata proves the host", async () => {
		const dir = makeProject();
		rmSync(join(dir, "vite.config.ts"), { force: true });
		rmSync(join(dir, "src", "main.tsx"), { force: true });
		rmSync(join(dir, "theme", "recipes", "badge.recipe.ts"), { force: true });
		mkdirSync(join(dir, "app"), { recursive: true });
		writeFileSync(
			join(dir, "app", "layout.tsx"),
			'import "@/styled-system/styles.css";\nexport default function Layout() { return null; }\n',
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["app/**/*.tsx"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
			packageJson: { dependencies: { next: "15.0.0" } },
		});

		const nextConfig = readFileSync(join(dir, "next.config.mjs"), "utf8");
		const layout = readFileSync(join(dir, "app", "layout.tsx"), "utf8");
		const runtimePreset = readFileSync(join(dir, "src", "pandwind", "preset.mjs"), "utf8");
		expect(report.residualsByKind).toEqual({});
		expect(report.emittedModules).toContain("src/pandwind/preset.mjs");
		expect(nextConfig).toContain('from "./src/pandwind/preset.mjs"');
		expect(nextConfig).toContain("pandwindWebpackCss");
		expect(layout).toBe(
			'import "pandwind-css.css";\nexport default function Layout() { return null; }\n',
		);
		expect(runtimePreset).toContain('import { define } from "pandwind/preset";');
		expect(runtimePreset).not.toContain("PandwindProperties");
		expect(runtimePreset).not.toContain(" as const");
		expect(nextConfig).toMatchInlineSnapshot(`
			"import { pandwindWebpackCss } from "pandwind/unplugin";
			import { preset } from "./src/pandwind/preset.mjs";

			const config = {
				webpack(config) {
					config.plugins.push(
						pandwindWebpackCss({ preset: preset, root: process.cwd(), virtualId: "pandwind-css.css" })
					);
					return config;
				},
			};

			export default config;
			"
		`);
	});

	it("preserves Panda source with a typed residual when no host extractor exists", async () => {
		const dir = makeProject();
		rmSync(join(dir, "vite.config.ts"), { force: true });
		writeFileSync(
			join(dir, "src", "unhosted.ts"),
			[
				"import { css } from '@/styled-system/css'",
				"export const styles = css({ color: 'rebeccapurple' })",
			].join("\n"),
		);
		const report = await runPandaMigration({
			projectRoot: dir,
			patterns: ["src/unhosted.ts"],
			meta,
			outDirName: "pandwind",
			write: true,
			diff: false,
			skipMarker: "pandwind:migrate-skip",
		});

		expect(report.cssCallsConverted).toBe(0);
		expect(report.residualsByKind.unrepresentable).toBe(1);
		expect(readFileSync(join(dir, "src", "unhosted.ts"), "utf8")).toContain(
			"css({ color: 'rebeccapurple' })",
		);
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
