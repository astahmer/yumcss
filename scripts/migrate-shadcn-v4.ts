/**
 * shadcn/ui v4 -> Pandwind migration corpus.
 *
 * The pinned shadcn checkout remains read-only. This runner owns the
 * migration lanes and can materialize a disposable copy of the monorepo for
 * build/browser validation. The source pass is shared by all lanes; only the
 * target binding changes.
 */
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { buildPandwindInteropArtifact } from "pandwind/tw/interop";
import { generateUtilityBridge } from "pandwind/codegen/bridge";
import { generateDesignSystem } from "pandwind/codegen/types";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createStylesheet } from "pandwind/css/create-stylesheet";
import { createCssExtractionService } from "pandwind/vite/css-extract";
import { pandwindPreset } from "pandwind/preset";
import { loadMetaFromSources, type PandwindMeta } from "pandwind-codemod/migration/meta";
import { CodemodAdapterId, SwapSourceId } from "pandwind-codemod/swap";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import {
	discoverProjectFiles,
	migrateRegisteredFile,
	type CorpusTransformResult,
} from "./registered-adapter-migration.ts";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultReferenceRoot = createReferenceWorkspace().path("shadcn-ui");
const appRootName = "apps/v4";
// Keep generated support beside the app so package-local resolution works.
// The materializer excludes metadata from Tailwind's automatic source scan;
// the explicit class catalog lives under app/ so it can still be scanned.
const supportRoot = `${appRootName}/pw`;
const sourceCatalogFile = `${appRootName}/pandwind-source.txt`;

export enum ShadcnV4MigrationLane {
	Tw = "tw",
	Css = "css",
	Dcss = "dcss",
}

export interface ShadcnV4MigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
	readonly reportPath?: string;
}

export interface ShadcnV4MigrationReport {
	readonly schema: "pandwind.shadcn-v4-migration/1";
	readonly lane: ShadcnV4MigrationLane;
	readonly referenceCommit: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly residualCount: number;
	readonly residualSamples: readonly {
		file: string;
		token: string;
		reason: string;
	}[];
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly outputByteDelta: number;
	readonly generatedUtilities: number;
	readonly generatedVariants: number;
	readonly generatedBridgeEntries: number;
}

interface GeneratedMetadata {
	readonly meta: PandwindMeta;
	readonly typesDts: string;
	readonly twTs: string;
	readonly interop: ReturnType<typeof buildPandwindInteropArtifact>;
	readonly variantConditions: Readonly<Record<string, string | readonly string[]>>;
}

interface LaneAdapter {
	readonly lane: ShadcnV4MigrationLane;
	transform(source: string, file: string, metadata: PandwindMeta): Promise<CorpusTransformResult>;
}

async function collectSourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const sourceRoots = ["app", "components", "content", "lib"];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith("."))
				continue;
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) await visit(absolute);
			else if (SOURCE_SCANNER_SERVICE.isScriptFile(entry.name)) files.push(absolute);
		}
	};
	for (const sourceRoot of sourceRoots) await visit(join(root, appRootName, sourceRoot));
	return files.toSorted();
}

async function collectSourceCatalog(root: string): Promise<string> {
	const contents: string[] = [];
	const sourceRoots = ["app", "components", "content", "lib"];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith("."))
				continue;
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(absolute);
				continue;
			}
			if (!SOURCE_SCANNER_SERVICE.isSupportedFile(entry.name)) continue;
			contents.push(await readFile(absolute, "utf8"));
		}
	};
	for (const sourceRoot of sourceRoots) await visit(join(root, appRootName, sourceRoot));
	return contents.join("\n");
}

function bridgeEntryCount(bridge: Record<string, Record<string, string>>): number {
	return Object.values(bridge).reduce((total, values) => total + Object.keys(values).length, 0);
}

async function generatedMetadata(referenceRoot: string): Promise<GeneratedMetadata> {
	const appRoot = join(referenceRoot, appRootName);
	const cssEntry = join(appRoot, "app/globals.css");
	const css = await readFile(cssEntry, "utf8");
	const cssBase = dirname(cssEntry);
	const generated = await generateDesignSystem(css, cssBase);
	const bridge = await generateUtilityBridge(cssEntry, cssBase);
	const interop = buildPandwindInteropArtifact({
		typesDts: generated.typesDts,
		twTs: generated.twTs,
		bridge,
		artifactDir: supportRoot,
	});
	const metadataRoot = await mkdtemp(join(tmpdir(), "pandwind-shadcn-v4-metadata-"));
	try {
		await writeFile(join(metadataRoot, "types.d.ts"), generated.typesDts);
		await writeFile(join(metadataRoot, "tw.ts"), generated.twTs);
		await writeFile(join(metadataRoot, "pandwind.interop.json"), JSON.stringify(interop));
		return {
			meta: loadMetaFromSources({ interopPath: join(metadataRoot, "pandwind.interop.json") }),
			typesDts: generated.typesDts,
			twTs: generated.twTs,
			interop,
			variantConditions: generated.variantConditions,
		};
	} finally {
		await rm(metadataRoot, { recursive: true, force: true });
	}
}

function createLane(
	lane: ShadcnV4MigrationLane,
	root: string,
	files: readonly string[],
): LaneAdapter {
	return {
		lane,
		async transform(source, file, metadata) {
			const dialect =
				lane === ShadcnV4MigrationLane.Tw
					? SwapSourceId.Tw
					: lane === ShadcnV4MigrationLane.Css
						? SwapSourceId.Css
						: SwapSourceId.Dss;
			return migrateRegisteredFile({
				source,
				file,
				root,
				files,
				meta: metadata,
				from: CodemodAdapterId.Tailwind,
				to: `${CodemodAdapterId.Pandwind}:${dialect}`,
				project:
					lane === ShadcnV4MigrationLane.Tw
						? { twModule: `${supportRoot}/tw`, cxModule: `${supportRoot}/cx` }
						: lane === ShadcnV4MigrationLane.Css
							? { cssModule: `${supportRoot}/css` }
							: { dssModule: `${supportRoot}/dss` },
			});
		},
	};
}

function laneSource(lane: ShadcnV4MigrationLane): string {
	if (lane === ShadcnV4MigrationLane.Tw)
		return `import { createCx } from "pandwind/cx";\nimport { __pandwindConfig } from "./tw";\n\nexport const cx = createCx(__pandwindConfig);\n`;
	if (lane === ShadcnV4MigrationLane.Css)
		return `import { createCss } from "pandwind/css";\nimport { pandwindPreset } from "pandwind/preset";\n\nexport const css = createCss(pandwindPreset);\n`;
	return `import { createDesignCss } from "pandwind/design";\nimport { pandwindPreset } from "pandwind/preset";\n\nexport const dss = createDesignCss(pandwindPreset);\n`;
}

function staticStylesheetSource(
	transformed: ReadonlyMap<string, string>,
	lane: ShadcnV4MigrationLane,
	variantConditions: Readonly<Record<string, string | readonly string[]>>,
): string {
	const matchers = lane === ShadcnV4MigrationLane.Css ? ["css"] : ["dss"];
	const extractionPreset = {
		...pandwindPreset,
		conditions: { ...pandwindPreset.conditions, ...variantConditions },
	};
	const service = createCssExtractionService({ matchers, preset: extractionPreset });
	const stylesheet = createStylesheet(extractionPreset);
	let callSites = 0;
	let extracted = 0;
	for (const [file, code] of transformed) {
		const inspection = service.inspect(code, file);
		callSites += inspection.cssSources.length;
		const dynamic = inspection.cssSources.filter((site) => site.dynamicArguments > 0);
		if (dynamic.length > 0)
			throw new Error(
				`${lane} static artifact cannot safely lower dynamic calls in ${file}: ` +
					`${dynamic.length} call site(s) require the runtime CSS transport`,
			);
		const extraction = service.extractFile(code, file);
		extracted += extraction.sources.length;
		for (const { style } of extraction.sources) {
			try {
				stylesheet.process([style]);
			} catch (error) {
				throw new Error(
					`${lane} static artifact failed for ${file}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		for (const key of extraction.varKeys) stylesheet.processVarKey(key);
	}
	if (callSites !== extracted)
		throw new Error(
			`${lane} static artifact lost ${callSites - extracted} call site(s) during extraction`,
		);
	return [stylesheet.gen.tokens(), stylesheet.gen.atomic(), stylesheet.gen.varRules()]
		.filter(Boolean)
		.join("\n");
}

function supportFiles(
	metadata: GeneratedMetadata,
	lane: ShadcnV4MigrationLane,
	sourceCatalog: string,
	staticCss: string,
): Record<string, string> {
	const files: Record<string, string> = {
		[`${supportRoot}/types.d.ts`]: metadata.typesDts,
		[`${supportRoot}/tw.ts`]: metadata.twTs,
		[`${supportRoot}/pandwind.interop.json`]: `${JSON.stringify(metadata.interop, null, 2)}\n`,
	};
	if (lane === ShadcnV4MigrationLane.Tw) {
		files[`${supportRoot}/cx.ts`] = laneSource(lane);
	} else {
		files[`${supportRoot}/${lane === ShadcnV4MigrationLane.Css ? "css" : "dss"}.ts`] =
			laneSource(lane);
		files[`${supportRoot}/styles.css`] = staticCss;
	}
	files[sourceCatalogFile] = sourceCatalog;
	return files;
}

async function materialize(
	referenceRoot: string,
	outputRoot: string,
	lane: ShadcnV4MigrationLane,
	metadata: GeneratedMetadata,
	transformed: ReadonlyMap<string, string>,
	sourceCatalog: string,
	staticCss: string,
): Promise<void> {
	await mkdir(outputRoot, { recursive: true });
	for (const entry of await readdir(referenceRoot, { withFileTypes: true })) {
		if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next") continue;
		await cp(join(referenceRoot, entry.name), join(outputRoot, entry.name), {
			recursive: true,
			force: true,
			filter: (path) =>
				!path.split("/").includes("node_modules") && !path.split("/").includes(".next"),
		});
	}
	for (const [file, code] of transformed) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	for (const [file, code] of Object.entries(
		supportFiles(metadata, lane, sourceCatalog, staticCss),
	)) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	const configFile = join(outputRoot, appRootName, "next.config.mjs");
	const config = await readFile(configFile, "utf8");
	if (!config.includes('transpilePackages: ["pandwind"]'))
		await writeFile(
			configFile,
			config.replace(
				"const nextConfig = {",
				'const nextConfig = {\n  transpilePackages: ["pandwind"],',
			),
		);
	const packageFile = join(outputRoot, appRootName, "package.json");
	const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	packageJson.dependencies = {
		...packageJson.dependencies,
		pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
	};
	await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
	const stylesheet = join(outputRoot, appRootName, "app/globals.css");
	const source = await readFile(stylesheet, "utf8");
	const supportSource = relative(`${appRootName}/app`, supportRoot).replaceAll("\\", "/");
	const exclusionDirectives = [
		`@source not "${supportSource}";`,
		`@source not "../app";`,
		`@source not "../components";`,
		`@source not "../content";`,
		`@source not "../lib";`,
	];
	const sourceDirective = `@source "${relative(`${appRootName}/app`, sourceCatalogFile).replaceAll("\\", "/")}";`;
	const directives = [...exclusionDirectives, sourceDirective];
	const missingDirectives = directives.filter((directive) => !source.includes(directive));
	if (missingDirectives.length > 0)
		await writeFile(stylesheet, `${source}\n${missingDirectives.join("\n")}\n`);
	if (lane !== ShadcnV4MigrationLane.Tw) {
		const staticImport = `@import "${supportSource}/styles.css";`;
		const current = await readFile(stylesheet, "utf8");
		if (!current.includes(staticImport)) await writeFile(stylesheet, `${staticImport}\n${current}`);
	}
}

export class ShadcnV4Migration {
	static readonly lanes: readonly ShadcnV4MigrationLane[] = [
		ShadcnV4MigrationLane.Tw,
		ShadcnV4MigrationLane.Css,
		ShadcnV4MigrationLane.Dcss,
	];

	static async run(
		lane: ShadcnV4MigrationLane,
		options: ShadcnV4MigrationOptions = {},
	): Promise<ShadcnV4MigrationReport> {
		const referenceRoot = resolve(options.referenceRoot ?? defaultReferenceRoot);
		const referenceCommit = (
			await execFileAsync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })
		).stdout.trim();
		const metadata = await generatedMetadata(referenceRoot);
		const adapter = createLane(lane, referenceRoot, await discoverProjectFiles(referenceRoot));
		const transformed = new Map<string, string>();
		const sourceCatalogParts: string[] = [];
		const residuals: ShadcnV4MigrationReport["residualSamples"][number][] = [];
		let sourceFiles = 0;
		let changedFiles = 0;
		let convertedCallSites = 0;
		let residualCount = 0;
		let sourceBytes = 0;
		let outputBytes = 0;
		for (const absolute of await collectSourceFiles(referenceRoot)) {
			const source = await readFile(absolute, "utf8");
			const file = relative(referenceRoot, absolute).replaceAll("\\", "/");
			const result = await adapter.transform(source, file, metadata.meta);
			if (!result.changed && result.unmappedTokens.length === 0) {
				if (lane !== ShadcnV4MigrationLane.Tw) sourceCatalogParts.push(source);
				continue;
			}
			if (lane !== ShadcnV4MigrationLane.Tw) sourceCatalogParts.push(result.code);
			sourceFiles++;
			if (result.changed) changedFiles++;
			convertedCallSites += result.converted;
			residualCount += result.unmappedTokens.length;
			if (residuals.length < 50)
				residuals.push(...result.unmappedTokens.slice(0, 50 - residuals.length));
			sourceBytes += Buffer.byteLength(source);
			outputBytes += Buffer.byteLength(result.code);
			transformed.set(file, result.code);
		}
		const sourceCatalog =
			lane === ShadcnV4MigrationLane.Tw
				? await collectSourceCatalog(referenceRoot)
				: sourceCatalogParts.join("\n");
		const staticCss =
			lane === ShadcnV4MigrationLane.Tw
				? ""
				: staticStylesheetSource(transformed, lane, metadata.variantConditions);
		if (options.outputRoot !== undefined)
			await materialize(
				referenceRoot,
				resolve(options.outputRoot),
				lane,
				metadata,
				transformed,
				sourceCatalog,
				staticCss,
			);
		const report: ShadcnV4MigrationReport = {
			schema: "pandwind.shadcn-v4-migration/1",
			lane,
			referenceCommit,
			sourceFiles,
			changedFiles,
			convertedCallSites,
			residualCount,
			residualSamples: residuals,
			sourceBytes,
			outputBytes,
			outputByteDelta: outputBytes - sourceBytes,
			generatedUtilities: metadata.interop.utilities.length,
			generatedVariants: Object.keys(metadata.interop.tw.variants).length,
			generatedBridgeEntries: bridgeEntryCount(metadata.interop.bridge),
		};
		if (options.reportPath !== undefined) {
			const reportPath = resolve(options.reportPath);
			await mkdir(dirname(reportPath), { recursive: true });
			await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
		}
		return report;
	}
}

if (process.argv[1]?.endsWith("migrate-shadcn-v4.ts")) {
	const lane = process.argv[2] as ShadcnV4MigrationLane | undefined;
	if (lane === undefined || !ShadcnV4Migration.lanes.includes(lane))
		throw new Error(
			`usage: nub scripts/migrate-shadcn-v4.ts ${ShadcnV4Migration.lanes.join("|")} [output-root] [--report=path]`,
		);
	const outputRoot = process.argv.slice(3).find((argument) => !argument.startsWith("--"));
	const reportArgument = process.argv.slice(3).find((argument) => argument.startsWith("--report="));
	console.log(
		JSON.stringify(
			await ShadcnV4Migration.run(lane, {
				outputRoot,
				reportPath: reportArgument?.slice("--report=".length),
			}),
			null,
			2,
		),
	);
}
