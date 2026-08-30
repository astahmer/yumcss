/**
 * Materialize a static-first migration of the pinned Emotion documentation
 * site. The upstream checkout is read-only; all edits land in a disposable
 * candidate and are exercised by the verifier.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../packages/codemod/src/swap/index.ts";
import type { AdapterMigrationResult } from "../packages/codemod/src/swap/index.ts";
import { createCssExtractionService } from "../packages/pandwind/src/vite/css-extract.ts";
import { createStylesheet } from "../packages/pandwind/src/css/create-stylesheet.ts";
import type { StyleObject } from "../packages/pandwind/src/types/typings.ts";

export enum EmotionSiteMigrationLane {
	CssClass = "css-class",
}

export interface EmotionSiteMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
	readonly baselineOut?: string;
}

export interface EmotionSiteMigrationReport {
	readonly lane: EmotionSiteMigrationLane;
	readonly referenceCommit: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly skippedCallSites: number;
	readonly preservedRuntimeFiles: readonly string[];
	readonly residuals: readonly {
		readonly file: string;
		readonly kind: string;
		readonly text: string;
		readonly hint?: string;
	}[];
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly outputByteDelta: number;
	readonly staticCssBytes: number;
	readonly globalCssBytes: number;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultReferenceRoot = "/Users/astahmer/.references/emotion-clean";
const staticPreset = {
	strict: false,
	properties: {},
	tokens: {},
	conditions: {
		base: "",
		sm: "@media (min-width: 576px)",
		md: "@media (min-width: 768px)",
		lg: "@media (min-width: 992px)",
		xl: "@media (min-width: 1200px)",
		xxl: "@media (min-width: 1400px)",
	},
} as const;

async function collectSourceFiles(root: string): Promise<readonly string[]> {
	const files: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if ([".git", ".next", "node_modules", "out"].includes(entry.name)) continue;
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "live-editor") continue;
				await visit(absolute);
				continue;
			}
			if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) files.push(absolute);
		}
	};
	await visit(join(root, "site"));
	return files.toSorted();
}

function resolveLocalImport(
	importer: string,
	specifier: string,
	sourceFiles: ReadonlySet<string>,
): string | undefined {
	if (!specifier.startsWith(".")) return undefined;
	const base = resolve(dirname(importer), specifier);
	for (const candidate of [
		base,
		`${base}.js`,
		`${base}.jsx`,
		`${base}.ts`,
		`${base}.tsx`,
		join(base, "index.js"),
		join(base, "index.jsx"),
		join(base, "index.ts"),
		join(base, "index.tsx"),
	]) {
		if (sourceFiles.has(candidate)) return candidate;
	}
	return undefined;
}

function localImports(source: string): readonly string[] {
	return [...source.matchAll(/\b(?:from|import)\s*[('"]([^'"]+)['"]\)?/g)]
		.map((match) => match[1])
		.filter((specifier): specifier is string => specifier !== undefined);
}

function readFileOrUndefined(file: string): string | undefined {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
}

function transform(
	source: string,
	file: string,
	root: string,
	adapter = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Emotion)!,
): AdapterMigrationResult {
	return runAdapterMigration(source, {
		from: adapter.id,
		to: CodemodAdapterId.Pandwind,
		file,
		root,
		mode: "safe",
		readFile: readFileOrUndefined,
	});
}

function staticCssFromSource(files: ReadonlyMap<string, string>): string {
	const extraction = createCssExtractionService({
		matchers: ["css"],
		preset: staticPreset as never,
	});
	const sheet = createStylesheet(staticPreset as never);
	const styles: StyleObject[] = [];
	for (const [file, source] of files) {
		const names = new Set(["css"]);
		styles.push(...extraction.extract(source, file, names).map(({ style }) => style));
		for (const key of extraction.findVarKeys(source, file, names)) sheet.processVarKey(key);
	}
	return [sheet.generate(styles), sheet.gen.varRules()].filter((value) => value !== "").join("\n");
}

async function globalCssFromBaseline(baselineOut: string): Promise<string> {
	const styles = new Set<string>();
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const file = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(file);
				continue;
			}
			if (!entry.name.endsWith(".html")) continue;
			const html = await readFile(file, "utf8");
			for (const match of html.matchAll(
				/<style data-emotion="css-global [^"]*">([\s\S]*?)<\/style>/g,
			)) {
				if (match[1] !== undefined) styles.add(match[1]);
			}
		}
	};
	await visit(baselineOut);
	return [...styles].join("\n");
}

async function materialize(
	referenceRoot: string,
	outputRoot: string,
	transformed: ReadonlyMap<string, string>,
	staticCss: string,
	globalCss: string,
): Promise<void> {
	await rm(outputRoot, { recursive: true, force: true });
	await mkdir(outputRoot, { recursive: true });
	for (const entry of await readdir(referenceRoot, { withFileTypes: true })) {
		if ([".git", "node_modules", ".next", "out"].includes(entry.name)) continue;
		await cp(join(referenceRoot, entry.name), join(outputRoot, entry.name), {
			recursive: true,
			force: true,
		});
	}
	const packageFile = join(outputRoot, "site/package.json");
	const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	packageJson.dependencies = {
		...packageJson.dependencies,
		"@emotion/babel-plugin": "^11.13.5",
		"@emotion/cache": "^11.14.0",
		"@emotion/css": "^11.13.5",
		"@emotion/is-prop-valid": "^1.3.0",
		"@emotion/react": "^11.14.0",
		"@emotion/styled": "^11.14.1",
		"@docsearch/css": "3.1.1",
		"@docsearch/react": "3.1.1",
		"@next/bundle-analyzer": "12.2.0",
		next: "12.2.0",
		stylis: "^4.2.0",
		pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
	};
	const referenceVersions = {
		"@babel/standalone": "7.18.9",
		"@docsearch/css": "3.1.1",
		"@docsearch/react": "3.1.1",
		"@fortawesome/fontawesome-svg-core": "6.1.1",
		"@fortawesome/free-solid-svg-icons": "6.1.1",
		"@fortawesome/react-fontawesome": "0.2.0",
		"@next/bundle-analyzer": "12.2.0",
		"@types/babel__standalone": "7.1.4",
		"@types/js-yaml": "4.0.5",
		"@types/node": "12.20.37",
		"@types/prismjs": "1.26.0",
		"@types/react": "18.3.12",
		"@types/remark-prism": "1.3.3",
		facepaint: "1.2.1",
		"gray-matter": "4.0.3",
		"js-yaml": "4.1.0",
		next: "12.2.0",
		"next-mdx-remote": "4.0.3",
		"prism-react-renderer": "1.3.5",
		react: "16.14.0",
		"react-dom": "16.14.0",
		"react-simple-code-editor": "0.11.2",
		"rehype-autolink-headings": "6.1.1",
		"rehype-slug": "5.0.1",
		"remark-gfm": "3.0.1",
		"remark-prism": "1.3.6",
		sharp: "0.30.7",
		typescript: "5.4.5",
		"unist-util-visit": "4.1.0",
	} as const;
	packageJson.dependencies = { ...packageJson.dependencies, ...referenceVersions };
	await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
	await execFileSync("pnpm", ["install", "--no-frozen-lockfile", "--ignore-scripts"], {
		cwd: join(outputRoot, "site"),
		stdio: "inherit",
	});
	await packagePandwind(outputRoot);
	for (const [file, code] of transformed) {
		const target = join(outputRoot, "site", file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(
			target,
			code
				.replaceAll(
					'import { createCss } from "pandwind/css";',
					'import { createCss, type CssFn } from "pandwind/css";',
				)
				.replaceAll("const css = createCss();", "const css = createCss() as CssFn;"),
		);
		const migrated = await readFile(target, "utf8");
		await writeFile(
			target,
			migrated.replaceAll(
				"const css = createRuntimeCss(pandwindPreset);",
				"const css = createRuntimeCss(pandwindPreset) as any;",
			),
		);
	}
	const tsconfigFile = join(outputRoot, "site/tsconfig.json");
	const tsconfig = JSON.parse(await readFile(tsconfigFile, "utf8")) as {
		compilerOptions: {
			baseUrl?: string;
			paths?: Record<string, readonly string[]>;
		};
	};
	tsconfig.compilerOptions.baseUrl = ".";
	tsconfig.compilerOptions.paths = {
		...tsconfig.compilerOptions.paths,
		"pandwind/css": ["node_modules/pandwind/css"],
		"pandwind/css/runtime": ["node_modules/pandwind/runtime"],
		"pandwind/cx": ["node_modules/pandwind/cx"],
		"pandwind/preset": ["node_modules/pandwind/preset"],
	};
	await writeFile(tsconfigFile, `${JSON.stringify(tsconfig, null, 2)}\n`);
	const cssFile = join(outputRoot, "site/pandwind-static.css");
	await writeFile(cssFile, `${globalCss}\n${staticCss}\n`);
	const appFile = join(outputRoot, "site/pages/_app.tsx");
	const app = await readFile(appFile, "utf8");
	if (!app.includes("../pandwind-static.css"))
		await writeFile(appFile, `import '../pandwind-static.css'\n${app}`);
}

async function packagePandwind(outputRoot: string): Promise<void> {
	const packageRoot = join(outputRoot, "site/node_modules/pandwind");
	await rm(packageRoot, { recursive: true, force: true });
	await mkdir(packageRoot, { recursive: true });
	const entries = {
		css: "packages/pandwind/src/css/index.ts",
		runtime: "packages/pandwind/src/css/runtime.ts",
		cx: "packages/pandwind/src/cx/index.ts",
		preset: "packages/pandwind/src/preset/index.ts",
	} as const;
	const esbuild = resolve(
		repositoryRoot,
		"node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/bin/esbuild",
	);
	for (const [name, entry] of Object.entries(entries)) {
		await execFileSync(
			esbuild,
			[
				resolve(repositoryRoot, entry),
				"--bundle",
				"--platform=browser",
				"--format=cjs",
				`--outfile=${join(packageRoot, `${name}.js`)}`,
			],
			{ cwd: outputRoot, stdio: "inherit" },
		);
	}
	await writeFile(
		join(packageRoot, "package.json"),
		`${JSON.stringify(
			{
				name: "pandwind",
				version: "0.0.0-proof",
				main: "index.js",
				exports: {
					".": "./cx.js",
					"./css": "./css.js",
					"./css/runtime": "./runtime.js",
					"./cx": "./cx.js",
					"./preset": "./preset.js",
				},
			},
			null,
			2,
		)}\n`,
	);
	await writeFile(
		join(packageRoot, "css.d.ts"),
		"export type CssFn = any; export const createCss: (...args: any[]) => any;\n",
	);
	await writeFile(
		join(packageRoot, "runtime.d.ts"),
		"export const createRuntimeCss: (...args: any[]) => any; export const createRuntimeSheet: (...args: any[]) => any;\n",
	);
	await writeFile(
		join(packageRoot, "cx.d.ts"),
		"export const createCx: (...args: any[]) => any;\n",
	);
	await writeFile(
		join(packageRoot, "preset.d.ts"),
		"export const pandwindPreset: any; export const definePreset: any;\n",
	);
}

export class EmotionSiteMigration {
	static readonly lanes = [EmotionSiteMigrationLane.CssClass] as const;

	static async run(
		lane: EmotionSiteMigrationLane = EmotionSiteMigrationLane.CssClass,
		options: EmotionSiteMigrationOptions = {},
	): Promise<EmotionSiteMigrationReport> {
		const referenceRoot = resolve(options.referenceRoot ?? defaultReferenceRoot);
		const referenceCommit = execFileSync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
		const transformed = new Map<string, string>();
		const residuals: EmotionSiteMigrationReport["residuals"][number][] = [];
		const preservedRuntimeFiles = new Set(["components/live-editor/**"]);
		const sourceFilePaths = new Set(await collectSourceFiles(referenceRoot));
		const sourceByAbsolute = new Map<string, string>();
		for (const absolute of sourceFilePaths)
			sourceByAbsolute.set(absolute, await readFile(absolute, "utf8"));
		const sourceRecords: {
			readonly absolute: string;
			readonly file: string;
			readonly source: string;
			readonly result: AdapterMigrationResult;
			readonly requiresRuntimeFallback: boolean;
		}[] = [];
		const fallbackFiles = new Set<string>();
		const fallbackQueue: string[] = [];
		for (const absolute of sourceFilePaths) {
			const source = sourceByAbsolute.get(absolute)!;
			const file = relative(join(referenceRoot, "site"), absolute).replaceAll("\\", "/");
			const result = transform(source, absolute, join(referenceRoot, "site"));
			const requiresRuntimeFallback = /\b(?:createRuntimeCss|css\.vars)\b/.test(result.code);
			sourceRecords.push({ absolute, file, source, result, requiresRuntimeFallback });
			if (requiresRuntimeFallback) {
				fallbackFiles.add(file);
				fallbackQueue.push(absolute);
			}
		}
		while (fallbackQueue.length > 0) {
			const importer = fallbackQueue.pop()!;
			const source = sourceByAbsolute.get(importer)!;
			for (const specifier of localImports(source)) {
				const imported = resolveLocalImport(importer, specifier, sourceFilePaths);
				if (imported === undefined) continue;
				const file = relative(join(referenceRoot, "site"), imported).replaceAll("\\", "/");
				if (fallbackFiles.has(file)) continue;
				fallbackFiles.add(file);
				fallbackQueue.push(imported);
			}
		}
		for (const file of fallbackFiles) preservedRuntimeFiles.add(file);
		let sourceFiles = 0;
		let changedFiles = 0;
		let convertedCallSites = 0;
		let skippedCallSites = 0;
		let sourceBytes = 0;
		let outputBytes = 0;
		for (const { file, source, result } of sourceRecords) {
			if (fallbackFiles.has(file)) {
				sourceFiles++;
				sourceBytes += Buffer.byteLength(source);
				outputBytes += Buffer.byteLength(source);
				continue;
			}
			if (!result.changed && result.residuals.length === 0) continue;
			sourceFiles++;
			changedFiles += Number(result.changed);
			convertedCallSites += result.converted;
			skippedCallSites += result.skipped;
			sourceBytes += Buffer.byteLength(source);
			outputBytes += Buffer.byteLength(result.code);
			transformed.set(file, result.code);
			for (const residual of result.residuals)
				residuals.push({
					file,
					kind: residual.kind,
					text: residual.text,
					...(residual.hint === undefined ? {} : { hint: residual.hint }),
				});
		}
		const baselineOut = resolve(options.baselineOut ?? join(referenceRoot, "site/out"));
		const staticCss = staticCssFromSource(transformed);
		// A runtime fallback dependency closure may retain the original Global
		// component. Do not also copy its SSR artifact into the static bundle: it
		// would duplicate rules and violate the CSS-size comparison.
		const globalCss = preservedRuntimeFiles.has("components/global-styles.tsx")
			? ""
			: await globalCssFromBaseline(baselineOut);
		if (options.outputRoot !== undefined)
			await materialize(
				referenceRoot,
				resolve(options.outputRoot),
				transformed,
				staticCss,
				globalCss,
			);
		return {
			lane,
			referenceCommit,
			sourceFiles,
			changedFiles,
			convertedCallSites,
			skippedCallSites,
			preservedRuntimeFiles: [...preservedRuntimeFiles].toSorted(),
			residuals,
			sourceBytes,
			outputBytes,
			outputByteDelta: outputBytes - sourceBytes,
			staticCssBytes: Buffer.byteLength(staticCss),
			globalCssBytes: Buffer.byteLength(globalCss),
		};
	}
}

if (process.argv[1]?.endsWith("migrate-emotion-site.ts")) {
	const outputRoot = process.argv[2];
	console.log(
		JSON.stringify(
			await EmotionSiteMigration.run(EmotionSiteMigrationLane.CssClass, {
				...(outputRoot === undefined ? {} : { outputRoot }),
			}),
			null,
			2,
		),
	);
}
