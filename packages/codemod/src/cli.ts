#!/usr/bin/env node
/**
 * pandwind-codemod CLI.
 *
 * The CLI has one migration command for registered adapter routes. It writes
 * by default; `--dry-run`
 * produces the same plan without changing files. `tokens` remains a separate
 * data-format conversion command.
 */
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { cac, type CAC, type Command } from "cac";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { createEmptyPandwindMeta, loadMetaFromSourcesAsync, type PandwindMeta } from "./meta.ts";
import * as swapImport from "./swap/index.ts";
import { CodemodAdapterId, SwapSourceId, SwapTargetId } from "./swap/identifiers.ts";
import {
	createTokenDocument,
	parseDtcgResolverDocument,
	resolveInlineTokenContext,
	resolveTokenContext,
	type TokenContextSelection,
	type TokenDocument,
} from "./swap/token-document.ts";
import { tokenDocumentCodec } from "./swap/token-document-codec.ts";
import { createLocalTokenSourceLoader } from "./swap/resolver-file-loader.ts";
import {
	TOKEN_FORMAT_IDS,
	TokenFormatId as TokenFormat,
	TokenFormatLossError,
	type TokenFormatId,
} from "./swap/token-format-contracts.ts";
import { unifiedDiff } from "./diff.ts";
import { createTwCli } from "./tw/cli.ts";
import { createRuntimeCli } from "./runtime/cli.ts";
import { createLibCli } from "./lib/cli.ts";
import { createCssCli } from "./css/cli.ts";
import { extractArbitraryValueProposals } from "./arbitrary-values.ts";
import { sortStaticClassSource } from "./class-sorter.ts";
import { configureMigrateCommand } from "./swap/cli-args.ts";
import {
	createPandwindProjectSupport,
	type PandwindProjectSupport,
} from "./swap/project-bootstrap.ts";
import { PACKAGE_INSTALLER, type PackageInstallResult } from "./package-installer.ts";
import {
	AdapterDependencyKindTag,
	type AdapterDependencies,
	type AdapterProjectBindings,
} from "./swap/adapter-contract.ts";
export { unifiedDiff } from "./diff.ts";

function writeGeneratedFiles(
	root: string,
	files: readonly { readonly path: string; readonly content: string }[],
	overwrite = false,
): void {
	const resolved = files.map((file) => ({
		...file,
		absolutePath: resolve(root, file.path),
	}));
	if (overwrite) {
		for (const file of resolved) {
			mkdirSync(dirname(file.absolutePath), { recursive: true });
			writeFileSync(file.absolutePath, file.content);
		}
		return;
	}
	for (const file of resolved) {
		if (!existsSync(file.absolutePath)) continue;
		const current = readFileSync(file.absolutePath, "utf8");
		if (current !== file.content)
			throw new Error(
				`codemod: refusing to overwrite conflicting generated file ${file.absolutePath}`,
			);
	}
	for (const file of resolved) {
		if (existsSync(file.absolutePath)) continue;
		mkdirSync(dirname(file.absolutePath), { recursive: true });
		writeFileSync(file.absolutePath, file.content, { flag: "wx" });
	}
}

function validatePlannedGeneratedFiles(
	root: string,
	files: readonly { readonly path: string; readonly content: string }[],
	planned: Map<string, string>,
	overwrite = false,
): void {
	for (const file of files) {
		const plannedContent = planned.get(file.path);
		if (planned.has(file.path) && plannedContent !== file.content)
			throw new Error(`codemod: conflicting generated file ${file.path} in one migration run`);
		planned.set(file.path, file.content);
		const absolutePath = resolve(root, file.path);
		if (
			!overwrite &&
			existsSync(absolutePath) &&
			readFileSync(absolutePath, "utf8") !== file.content
		)
			throw new Error(`codemod: refusing to overwrite conflicting generated file ${absolutePath}`);
	}
}

function validatePlannedFileChanges(
	root: string,
	files: readonly {
		readonly path: string;
		readonly content: string;
		readonly expectedContent?: string;
	}[],
	planned: Map<string, string>,
): void {
	for (const file of files) {
		const path = file.path.replaceAll("\\", "/");
		if (path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.split("/").includes(".."))
			throw new Error(`codemod: file change must be project-relative: ${file.path}`);
		const plannedContent = planned.get(path);
		if (planned.has(path) && plannedContent !== file.content)
			throw new Error(`codemod: conflicting file change ${path} in one migration run`);
		planned.set(path, file.content);
		const absolutePath = resolve(root, path);
		if (!existsSync(absolutePath))
			throw new Error(`codemod: file change target does not exist ${absolutePath}`);
		const current = readFileSync(absolutePath, "utf8");
		if (file.expectedContent !== undefined && current !== file.expectedContent)
			throw new Error(`codemod: refusing stale file change ${absolutePath}`);
	}
}

function applyFileChanges(
	root: string,
	files: readonly { readonly path: string; readonly content: string }[],
): void {
	for (const file of files) writeFileSync(resolve(root, file.path), file.content);
}

type CliOptions = Readonly<Record<string, unknown>>;

const optionString = (options: CliOptions, name: string): string | undefined => {
	const value = options[name];
	return typeof value === "string" ? value : undefined;
};

const validateCommand = (command: Command): void => {
	command.checkUnknownOptions();
	command.checkOptionValue();
	command.checkRequiredArgs();
	command.checkUnusedArgs();
};

const sourceWorkspace = createSourceWorkspace();

const expandPatterns = (
	patterns: readonly string[],
	baseDir: string,
	includeUnsupported = false,
): string[] => [...sourceWorkspace.files(patterns, baseDir, { includeUnsupported })];

const readProjectFile =
	(root: string) =>
	(file: string): string | undefined => {
		const absolute = isAbsolute(file) ? file : resolve(root, file);
		try {
			return readFileSync(absolute, "utf8");
		} catch {
			return undefined;
		}
	};

const projectFiles = (root: string): readonly string[] =>
	sourceWorkspace.files(["**/*"], root, { includeUnsupported: true });

function shouldBootstrapPandwindProject(args: swapImport.MigrateCliArgs): boolean {
	if (
		args.to === SwapTargetId.Tw ||
		args.to === SwapTargetId.Dss ||
		args.to === SwapTargetId.Design
	)
		return args.from !== SwapSourceId.Tw;
	return (
		(args.to === CodemodAdapterId.Pandwind && args.from !== CodemodAdapterId.Pandwind) ||
		(args.to === SwapTargetId.CssClass && isExternalAdapterId(args.from))
	);
}

const PROJECT_ROOT_MARKERS = [
	"package.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"package-lock.json",
	"bun.lock",
	"bun.lockb",
	"pnpm-workspace.yaml",
] as const;

const nearestProjectRoot = (start: string): string => {
	let directory = resolve(start);
	try {
		if (!statSync(directory).isDirectory()) directory = dirname(directory);
	} catch {
		directory = dirname(directory);
	}
	for (;;) {
		if (PROJECT_ROOT_MARKERS.some((marker) => existsSync(resolve(directory, marker))))
			return directory;
		const parent = dirname(directory);
		if (parent === directory) return resolve(start);
		directory = parent;
	}
};

const absolutePatternRoot = (patterns: readonly string[]): string | undefined => {
	const absolute = patterns.find((pattern) => isAbsolute(pattern));
	if (absolute === undefined) return undefined;
	const wildcard = absolute.search(/[!*?[{]/u);
	const prefix = wildcard < 0 ? absolute : absolute.slice(0, wildcard);
	return nearestProjectRoot(prefix.endsWith("/") ? prefix.slice(0, -1) : dirname(prefix));
};

const migrationRoot = (args: swapImport.MigrateCliArgs): string => {
	if (args.root !== undefined) return resolve(process.cwd(), args.root);
	return nearestProjectRoot(absolutePatternRoot(args.patterns) ?? process.cwd());
};

const readPackageJson = (root: string): Readonly<Record<string, unknown>> | undefined => {
	try {
		const parsed: unknown = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
		return parsed !== null && typeof parsed === "object"
			? (parsed as Readonly<Record<string, unknown>>)
			: undefined;
	} catch {
		return undefined;
	}
};

const projectOutputDirectory = (root: string, output: string): string => {
	const absolute = isAbsolute(output) ? output : resolve(root, output);
	const relativePath = relative(root, absolute).replaceAll("\\", "/");
	if (relativePath === "" || relativePath.startsWith("../") || relativePath === "..")
		throw new Error(`codemod: --out must stay inside the project root: ${output}`);
	return relativePath;
};

const projectModuleSpecifier = (file: string, modulePath: string): string => {
	const withoutExtension = modulePath.replace(/\.(?:[cm]?tsx?|jsx?)$/u, "");
	let specifier = relative(dirname(file), withoutExtension).replaceAll("\\", "/");
	if (!specifier.startsWith(".")) specifier = "./" + specifier;
	return specifier;
};

const usesProjectModule = (file: string, modulePath: string, source: string): boolean => {
	const specifier = projectModuleSpecifier(file, modulePath).replace(/[.*+?^$()|[\]\\]/g, "\\$&");
	return new RegExp(`from\\s+["']${specifier}["']`, "u").test(source);
};

const existingProjectSupport = (
	root: string,
	directory: string,
	meta: PandwindMeta,
): PandwindProjectSupport => {
	const relativeDirectory = projectOutputDirectory(root, directory);
	const modulePath = (name: string): string | undefined =>
		existsSync(resolve(root, relativeDirectory, name)) ? `${relativeDirectory}/${name}` : undefined;
	const runtimeModule = modulePath("runtime.ts");
	const runtimeSource =
		runtimeModule === undefined ? undefined : readFileSync(resolve(root, runtimeModule), "utf8");
	const runtimeCssBinding = runtimeSource?.match(
		/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createRuntimeCss\(/u,
	)?.[1];
	const bindings: AdapterProjectBindings = {
		...(modulePath("css.ts") === undefined ? {} : { cssModule: modulePath("css.ts") }),
		...(modulePath("stack.tsx") === undefined ? {} : { stackModule: modulePath("stack.tsx") }),
		...(runtimeModule === undefined
			? {}
			: {
					runtimeCssModule: runtimeModule,
					...(runtimeCssBinding === undefined ? {} : { runtimeCssBinding }),
				}),
		...(modulePath("dss.ts") === undefined ? {} : { dssModule: modulePath("dss.ts") }),
		...(modulePath("tw.ts") === undefined ? {} : { twModule: modulePath("tw.ts") }),
		...(modulePath("cx.ts") === undefined ? {} : { cxModule: modulePath("cx.ts") }),
	};
	return {
		metaDirectory: relativeDirectory,
		bindings,
		files: [],
		fileChanges: [],
		meta,
		sourceConfig: { adapter: CodemodAdapterId.Pandwind, root, files: [], values: {} },
	};
};

const projectAdapterFor = (
	args: swapImport.MigrateCliArgs,
	filePaths: readonly string[],
	root: string,
): string | undefined => {
	if (isExternalAdapterId(args.from)) return args.from;
	for (const file of filePaths) {
		const source = readProjectFile(root)(file);
		if (source === undefined) continue;
		const detected = detectExternalSource(source, file.slice(root.length + 1), root);
		if (detected !== undefined) return detected;
	}
	return undefined;
};

const printPackageInstall = (result: PackageInstallResult): void => {
	if (result.installed.length === 0) {
		if (result.alreadyPresent.length > 0)
			console.log(`dependencies: already present (${result.alreadyPresent.toSorted().join(", ")})`);
		return;
	}
	console.log(`dependencies: installed with ${result.manager} (${result.installed.join(", ")})`);
};

async function mainMigrate(argv: string[]): Promise<void> {
	const args = swapImport.parseMigrateArgs(argv);
	const root = migrationRoot(args);
	const packageJson = readPackageJson(root);
	const projectMigration = swapImport.getProjectMigrationCommand(args.from);
	const ownsProjectRoute = projectMigration?.targets.includes(args.to) ?? false;
	const explicitlyExternal = isExternalRoute(args) && !ownsProjectRoute;
	const candidateFilePaths = expandPatterns(
		args.patterns,
		root,
		explicitlyExternal || args.from === SwapSourceId.Auto,
	);
	const autoExternal =
		!explicitlyExternal &&
		args.from === SwapSourceId.Auto &&
		(args.to === SwapTargetId.CssClass ||
			args.to === SwapTargetId.Design ||
			args.to === SwapTargetId.Dss ||
			args.to === SwapTargetId.Tw) &&
		candidateFilePaths.some((file) => {
			const source = readProjectFile(root)(file);
			if (source === undefined) return false;
			const detected = detectExternalSource(source, file.slice(root.length + 1), root);
			return (
				detected !== undefined &&
				(detected !== CodemodAdapterId.Pandwind || args.to !== SwapTargetId.CssClass)
			);
		});
	const external = explicitlyExternal || autoExternal;
	const filePaths = external ? candidateFilePaths : expandPatterns(args.patterns, root);
	if (external) {
		let meta: PandwindMeta | undefined;
		let project: PandwindProjectSupport | undefined;
		if (args.metaDir !== "") {
			const metaDir = resolve(root, args.metaDir);
			try {
				const bridgePath = resolve(metaDir, "bridge.ts");
				meta = await loadMetaFromSourcesAsync({
					typesDtsPath: resolve(metaDir, "types.d.ts"),
					twTsPath: resolve(metaDir, "tw.ts"),
					bridgePath: existsSync(bridgePath) ? bridgePath : undefined,
				});
			} catch (error) {
				console.error(
					`codemod migrate: failed to load generated metadata from ${metaDir}\n` +
						"  remove --meta for literal-safe output, or regenerate the target metadata\n" +
						`  (${(error as Error).message})`,
				);
				process.exitCode = 1;
				return;
			}
			try {
				project = existingProjectSupport(root, args.metaDir, meta);
			} catch {
				// An explicitly supplied metadata directory may belong to a separate
				// build workspace. It can still drive token lowering, but generated
				// source must fall back to package imports rather than crossing the
				// project-root boundary with an unsafe absolute module path.
				project = undefined;
			}
		}
		if (meta === undefined && shouldBootstrapPandwindProject(args)) {
			const sourceAdapter = projectAdapterFor(args, filePaths, root);
			if (sourceAdapter !== undefined) {
				project = await createPandwindProjectSupport({
					root,
					sourceAdapter,
					targetAdapter: args.to,
					outputDirectory: projectOutputDirectory(root, args.outDir || "pandwind"),
					readFile: readProjectFile(root),
					listFiles: projectFiles,
					...(packageJson === undefined ? {} : { packageJson }),
				});
				meta = project.meta;
			}
		}
		await runAdapterRoute(args, filePaths, root, meta, project, packageJson);
		return;
	}
	const metaDirRelative = args.metaDir !== "" ? args.metaDir : "examples/example/src";
	const metaDir = resolve(root, metaDirRelative);

	let meta: PandwindMeta = createEmptyPandwindMeta();
	const typesDtsPath = resolve(metaDir, "types.d.ts");
	const twTsPath = resolve(metaDir, "tw.ts");
	if (existsSync(typesDtsPath) && existsSync(twTsPath)) {
		try {
			const bridgePath = resolve(metaDir, "bridge.ts");
			meta = await loadMetaFromSourcesAsync({
				typesDtsPath,
				twTsPath,
				bridgePath: existsSync(bridgePath) ? bridgePath : undefined,
			});
		} catch (error) {
			console.error(
				`codemod migrate: failed to load generated metadata from ${metaDir}\n` +
					"  run `pandwind-codemod tw generate --bridge` first, or pass --meta=<dir>\n" +
					`  (${(error as Error).message})`,
			);
			process.exitCode = 1;
			return;
		}
	} else if (!ownsProjectRoute) {
		console.error(
			`codemod migrate: generated metadata is missing from ${metaDir}\n` +
				"  run `pandwind-codemod tw generate --bridge` first, or pass --meta=<dir>",
		);
		process.exitCode = 1;
		return;
	}

	if (projectMigration !== undefined) {
		if (!ownsProjectRoute) {
			console.error(
				`codemod migrate: project adapter '${args.from}' does not support target '${args.to}'`,
			);
			process.exitCode = 1;
			return;
		}
		await projectMigration.run({
			patterns: args.patterns,
			filePaths,
			meta,
			...(args.outDir === undefined ? {} : { outDir: args.outDir }),
			...(args.force === undefined ? {} : { force: args.force }),
			diff: args.diff,
			report: args.report,
			write: !args.dryRun,
			skipMarker: args.skipMarker,
			tokenReferenceFormat: args.tokenReferenceFormat,
			hoistStaticStyles: args.hoistStaticStyles,
		});
		if (
			!args.dryRun &&
			args.install &&
			projectMigration.dependencies !== undefined &&
			packageJson !== undefined &&
			filePaths.length > 0
		) {
			const installed = await PACKAGE_INSTALLER.install({
				root,
				packageJson,
				dependencies: [projectMigration.dependencies],
			});
			if (args.reportFormat !== "json") printPackageInstall(installed);
		}
		return;
	}

	if (filePaths.length === 0) {
		console.error("codemod migrate: no matching files");
		process.exitCode = 1;
		return;
	}

	let engineResolver: import("./swap/engine.ts").TwMissResolver | undefined;
	if (args.engine) {
		engineResolver = await swapImport
			.createEngineMissResolver({
				css: readFileSync(resolve(metaDir, "tailwind.css"), "utf8"),
				base: metaDir,
			})
			.catch((error: unknown) => {
				console.error(`codemod migrate: --engine failed to boot (${(error as Error).message})`);
				return undefined;
			});
	}

	let totalConverted = 0;
	let totalChanged = 0;
	let totalResiduals = 0;
	const reportEntries: Array<{
		file: string;
		changed: boolean;
		converted: number;
		residuals: number;
		skipped: number;
	}> = [];
	for (const file of filePaths) {
		const relative = file.slice(root.length + 1);
		let source: string;
		try {
			source = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const result = swapImport.runSwap(source, meta, {
			from: args.from,
			to: args.to as swapImport.SwapTarget,
			file: relative,
			metaDir: metaDirRelative,
			skipMarker: args.skipMarker,
			capabilityMode: args.capabilityMode,
			engineResolver,
			tokenize: args.tokenize,
			sort: args.sort,
			nearestTokens: args.nearestTokens,
			dedup: args.dedup,
			tokenReferenceFormat: args.tokenReferenceFormat,
			hoistStaticStyles: args.hoistStaticStyles,
		});
		totalConverted += result.converted;
		totalResiduals += result.unmappedTokens.length;
		reportEntries.push({
			file: relative,
			changed: result.changed,
			converted: result.converted,
			residuals: result.unmappedTokens.length,
			skipped: result.skippedByMarker,
		});
		if (!result.changed) {
			if (args.reportFormat !== "json") console.log(`${relative}: no changes`);
			continue;
		}
		totalChanged++;
		if (args.diff && args.reportFormat !== "json")
			console.log(unifiedDiff(source, result.code, relative));
		if (!args.dryRun) writeFileSync(file, result.code);
		if (args.reportFormat !== "json")
			console.log(
				`${relative}: ${args.dryRun ? "would change" : "written"} — ${result.converted} call site(s) swapped to ${args.to}, ` +
					`${result.unmappedTokens.length} residual(s), ${result.skippedByMarker} skipped by marker`,
			);
	}

	if (args.reportFormat !== "json")
		console.log(
			`\nsummary: ${filePaths.length} file(s) scanned · ${totalChanged} changed · ` +
				`${totalConverted} swapped · ${totalResiduals} residual(s) · swap ${args.from}->${args.to} · ` +
				(args.dryRun ? "dry-run (no files written)" : "WRITTEN"),
		);
	if (args.report && args.reportFormat === "text") {
		const lines = [
			"migration report:",
			`  call sites through the target API: ${totalConverted}`,
			`  residuals needing attention: ${totalResiduals}`,
		];
		console.log(lines.join("\n"));
	} else if (args.report && args.reportFormat === "json") {
		console.log(
			JSON.stringify({
				from: args.from,
				to: args.to,
				...(args.capabilityMode === undefined ? {} : { mode: args.capabilityMode }),
				files: reportEntries,
			}),
		);
	}
}

function isExternalAdapterId(value: string): value is import("./swap/index.ts").ExternalAdapterId {
	return swapImport.listCodemodAdapterIds().includes(value);
}

/**
 * Keep the flat SwapIR path as the cheap projection for its
 * native source dialects. Those target names are also registered as v2
 * adapters, but selecting them from a flat source must not silently switch
 * token-aware semantics to the generic object renderer.
 */
function isFlatRoute(args: swapImport.MigrateCliArgs): boolean {
	const flatSources: readonly string[] = [
		SwapSourceId.Auto,
		SwapSourceId.Tw,
		SwapSourceId.Css,
		SwapSourceId.Design,
	];
	const flatTargets: readonly string[] = [
		CodemodAdapterId.Panda,
		CodemodAdapterId.Tailwind,
		CodemodAdapterId.StyleX,
	];
	return flatSources.includes(args.from) && flatTargets.includes(args.to as string);
}

function isExternalRoute(args: swapImport.MigrateCliArgs): boolean {
	if (isFlatRoute(args)) return false;
	if (args.to === SwapTargetId.Tw && args.from !== SwapSourceId.Tw) return true;
	return isExternalAdapterId(args.from) || isExternalAdapterId(args.to);
}

function detectExternalSource(
	source: string,
	file: string,
	root: string,
): import("./swap/index.ts").ExternalAdapterId | undefined {
	return swapImport
		.listCodemodAdapterIds()
		.flatMap((id) => {
			const adapter = swapImport.getCodemodAdapter(id);
			if (adapter === undefined) return [];
			return [{ id, result: adapter.detect({ file, source, root }) }];
		})
		.filter(({ result }) => result.matched)
		.toSorted((a, b) => b.result.confidence - a.result.confidence)[0]?.id;
}

async function runAdapterRoute(
	args: swapImport.MigrateCliArgs,
	filePaths: Array<string>,
	root: string,
	meta?: PandwindMeta,
	project?: PandwindProjectSupport,
	packageJson?: Readonly<Record<string, unknown>>,
): Promise<void> {
	if (filePaths.length === 0) {
		console.error("codemod migrate: no matching files");
		process.exitCode = 1;
		return;
	}
	const target = isExternalAdapterId(args.to)
		? args.to
		: args.to === SwapTargetId.Tw
			? `${CodemodAdapterId.Pandwind}:${SwapSourceId.Tw}`
			: args.to === SwapTargetId.Dss
				? `${CodemodAdapterId.Pandwind}:${SwapSourceId.Dss}`
				: args.to === SwapTargetId.Design
					? `${CodemodAdapterId.Pandwind}:${SwapSourceId.Css}`
					: args.to === SwapTargetId.CssClass
						? CodemodAdapterId.Pandwind
						: undefined;
	if (target === undefined) {
		console.error(`codemod migrate: no registered target adapter for '${args.to}'`);
		process.exitCode = 1;
		return;
	}

	let totalConverted = 0;
	let totalSkipped = 0;
	let totalResiduals = 0;
	let totalChanged = 0;
	const reportEntries: Array<{
		file: string;
		outputFile?: string;
		generatedFiles: readonly string[];
		from: string;
		converted: number;
		skipped: number;
		residuals: number;
		canonical: {
			checked: boolean;
			equal: boolean;
			sourceBytes: number;
			targetBytes: number;
			differences: readonly string[];
		};
		residualDetails: readonly {
			kind: string;
			text: string;
			hint?: string;
		}[];
		routeProof?: ReturnType<typeof swapImport.findMigrationRouteProof>;
	}> = [];
	const plannedGeneratedFiles = new Map<string, string>();
	const plannedFileChanges = new Map<string, string>();
	const projectFiles = sourceWorkspace.files(["**/*"], root, { includeUnsupported: true });
	let projectGeneratedFiles = project?.files ?? [];
	const projectFileChanges = project?.fileChanges ?? [];
	const projectFileChangeByPath = new Map(
		projectFileChanges.map((change) => [change.path, change]),
	);
	const targetDependencies: AdapterDependencies[] =
		project === undefined
			? []
			: [
					{
						packages: [{ name: "pandwind", kind: AdapterDependencyKindTag.Runtime }],
					},
				];
	const dependencies: AdapterDependencies[] = [...targetDependencies];
	const pendingWrites: Array<{
		file: string;
		outputFile: string;
		relative: string;
		result: Awaited<ReturnType<typeof swapImport.runAdapterMigrationAsync>>;
	}> = [];
	for (const file of filePaths) {
		const relative = file.slice(root.length + 1);
		let source: string;
		try {
			source = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const from = isExternalAdapterId(args.from)
			? args.from
			: detectExternalSource(source, relative, root);
		if (from === undefined) {
			if (args.reportFormat !== "json") console.log(`${relative}: no external adapter detected`);
			continue;
		}
		const projectFileChange = projectFileChangeByPath.get(relative);
		const migrationSource =
			projectFileChange?.expectedContent === source ? projectFileChange.content : source;
		const result = await swapImport.STYLE_MIGRATION_USE_CASE.runAsync(migrationSource, {
			from,
			to: target,
			file: relative,
			root,
			readFile: readProjectFile(root),
			listFiles: () => projectFiles,
			mode: args.capabilityMode ?? "safe",
			skipMarker: args.skipMarker,
			meta,
			packageJson,
			project: project?.bindings,
			tokenReferenceFormat: args.tokenReferenceFormat,
			hoistStaticStyles: args.hoistStaticStyles,
		});
		const codeChanged = result.code !== source;
		const outputFile =
			result.outputExtension === undefined
				? file
				: resolve(dirname(file), `${basename(file, extname(file))}${result.outputExtension}`);
		reportEntries.push({
			file: relative,
			...(outputFile === file ? {} : { outputFile: outputFile.slice(root.length + 1) }),
			generatedFiles: result.generatedFiles.map((generatedFile) => generatedFile.path),
			from,
			converted: result.converted,
			skipped: result.skipped,
			residuals: result.residuals.length,
			canonical: {
				checked: result.validations.length > 0,
				equal:
					result.validations.length > 0 &&
					result.validations.every(
						(validation) => validation.canonicalSource === validation.canonicalTarget,
					),
				sourceBytes: result.validations.reduce(
					(total, validation) => total + Buffer.byteLength(validation.canonicalSource),
					0,
				),
				targetBytes: result.validations.reduce(
					(total, validation) => total + Buffer.byteLength(validation.canonicalTarget),
					0,
				),
				differences: result.validations.flatMap((validation) => validation.differences),
			},
			residualDetails: result.residuals.map((residual) => ({
				kind: residual.kind,
				text: residual.text,
				...(residual.hint === undefined ? {} : { hint: residual.hint }),
			})),
			routeProof: swapImport.findMigrationRouteProof(
				from,
				target,
				swapImport.BUILTIN_CODEMOD_CATALOG.registry,
			),
		});
		totalConverted += result.converted;
		totalSkipped += result.skipped;
		totalResiduals += result.residuals.length;
		dependencies.push(...result.dependencies);
		if (!result.changed && !codeChanged && result.generatedFiles.length === 0) {
			if (args.reportFormat !== "json") console.log(`${relative}: no changes (${from}->${target})`);
			continue;
		}
		totalChanged++;
		if (args.diff && args.reportFormat !== "json")
			console.log(unifiedDiff(source, result.code, relative));
		if (outputFile !== file && existsSync(outputFile))
			throw new Error(
				`codemod: refusing to overwrite existing host-conversion output ${outputFile}`,
			);
		validatePlannedGeneratedFiles(root, result.generatedFiles, plannedGeneratedFiles, args.force);
		validatePlannedFileChanges(root, result.fileChanges, plannedFileChanges);
		pendingWrites.push({
			file,
			outputFile,
			relative,
			result,
		});
		if (args.dryRun && args.reportFormat !== "json")
			console.log(
				`${relative}: would change — ${result.converted} converted, ` +
					`${result.skipped} skipped, ${result.residuals.length} residual(s), ${from}->${target}`,
			);
		if (args.report && args.reportFormat === "text") {
			for (const report of result.reports) {
				if (report.blockers.length > 0)
					console.log(`  blocker: ${report.blockers.map((issue) => issue.detail).join("; ")}`);
			}
		}
	}
	const runtimeCssModule = project?.bindings.runtimeCssModule;
	if (runtimeCssModule !== undefined) {
		const runtimeUsed = pendingWrites.some(({ file, result }) =>
			usesProjectModule(file.slice(root.length + 1), runtimeCssModule, result.code),
		);
		if (!runtimeUsed)
			projectGeneratedFiles = projectGeneratedFiles.filter(
				(file) => file.path !== runtimeCssModule,
			);
	}
	if (pendingWrites.length > 0 && projectGeneratedFiles.length > 0) {
		validatePlannedGeneratedFiles(root, projectGeneratedFiles, plannedGeneratedFiles, args.force);
	}
	if (pendingWrites.length > 0 && projectFileChanges.length > 0) {
		validatePlannedFileChanges(root, projectFileChanges, plannedFileChanges);
	}
	if (!args.dryRun) {
		if (pendingWrites.length > 0 || args.force)
			writeGeneratedFiles(root, projectGeneratedFiles, args.force);
		applyFileChanges(root, projectFileChanges);
		for (const pending of pendingWrites) {
			writeGeneratedFiles(root, pending.result.generatedFiles, args.force);
			if (pending.outputFile === pending.file) writeFileSync(pending.file, pending.result.code);
			else {
				writeFileSync(pending.outputFile, pending.result.code, { flag: "wx" });
				unlinkSync(pending.file);
			}
			if (args.reportFormat !== "json")
				console.log(
					`${pending.relative}: written — ${pending.result.converted} converted, ` +
						`${pending.result.skipped} skipped, ${pending.result.residuals.length} residual(s)`,
				);
		}
		for (const pending of pendingWrites) applyFileChanges(root, pending.result.fileChanges);
		if (
			args.install &&
			pendingWrites.length > 0 &&
			dependencies.length > 0 &&
			packageJson !== undefined
		) {
			const installed = await PACKAGE_INSTALLER.install({ root, packageJson, dependencies });
			if (args.reportFormat !== "json") printPackageInstall(installed);
		}
	}
	if (args.reportFormat !== "json")
		console.log(
			`\nsummary: ${filePaths.length} file(s) scanned · ${totalChanged} changed · ` +
				`${totalConverted} converted · ${totalSkipped} skipped · ${totalResiduals} residual(s) · ` +
				(args.dryRun ? "dry-run (no files written)" : "WRITTEN"),
		);
	if (projectGeneratedFiles.length > 0 && args.reportFormat !== "json")
		console.log(
			`${args.dryRun ? "support files would be generated" : "support files generated"}: ` +
				projectGeneratedFiles.map((file) => file.path).join(", "),
		);
	if (args.report && args.reportFormat === "text") {
		const routeProof = swapImport.findMigrationRouteProof(
			args.from,
			target,
			swapImport.BUILTIN_CODEMOD_CATALOG.registry,
		);
		const residualDetails = reportEntries.flatMap((entry) =>
			entry.residualDetails.map((residual) => ({ file: entry.file, ...residual })),
		);
		const lines = [
			"migration report:",
			`  route proof: ${routeProof === undefined ? "unregistered" : `${routeProof.maturity} / ${routeProof.execution}`}`,
			`  call sites through the target API: ${totalConverted}`,
			`  residuals needing attention: ${totalResiduals}`,
		];
		if (residualDetails.length > 0) {
			lines.push("  residual details:");
			for (const residual of residualDetails.slice(0, 20))
				lines.push(
					`    - ${residual.file}: ${residual.kind} ${residual.text}` +
						(residual.hint === undefined ? "" : ` — ${residual.hint}`),
				);
			if (residualDetails.length > 20) lines.push(`    … and ${residualDetails.length - 20} more`);
		}
		console.log(lines.join("\n"));
	}
	if (args.report && args.reportFormat === "json") {
		console.log(
			JSON.stringify({
				from: args.from,
				to: target,
				mode: args.capabilityMode ?? "safe",
				routeProof: swapImport.findMigrationRouteProof(
					args.from,
					target,
					swapImport.BUILTIN_CODEMOD_CATALOG.registry,
				),
				projectGeneratedFiles: projectGeneratedFiles.map((file) => file.path),
				files: reportEntries,
			}),
		);
	}
}

/** Token-document exchange; adapters report any semantics they cannot preserve. */
const TOKEN_FORMATS: readonly TokenFormatId[] = TOKEN_FORMAT_IDS;

const configureTokensCommand = (command: Command): void => {
	command
		.option("-f, --from <format>", "Input token format")
		.option("-t, --to <format>", "Output token format")
		.option("-o, --out <file>", "Write the converted token document to a file")
		.option("--resolver <file>", "Attach a DTCG Resolver document to a DTCG token file")
		.option("--resolver-out <file>", "Write the DTCG Resolver sidecar document")
		.option(
			"--context <source=name[,source=name...]>",
			"Select explicit token contexts before export",
		)
		.option("--allow-lossy", "Allow a conversion that reports fidelity losses")
		.option("--validate", "Validate the input document without exporting")
		.option("--report-format <format>", "Report format: text or json", { default: "text" });
};

const tokenFormat = (value: string | undefined, flag: string): TokenFormatId => {
	if (value !== undefined && TOKEN_FORMATS.includes(value as TokenFormatId))
		return value as TokenFormatId;
	throw new Error(
		`codemod tokens: unknown --${flag} '${value ?? ""}' (expected ${TOKEN_FORMATS.join("|")})`,
	);
};

interface TokenCliArgs {
	from: TokenFormatId;
	to: TokenFormatId;
	input: string;
	out?: string;
	resolver?: string;
	resolverOut?: string;
	context?: TokenContextSelection;
	allowLossy: boolean;
	validate: boolean;
	reportFormat: "text" | "json";
}

const tokenContextSelection = (value: string | undefined): TokenContextSelection | undefined => {
	if (value === undefined) return undefined;
	const contexts: Record<string, string> = {};
	for (const selection of value.split(",")) {
		const separator = selection.indexOf("=");
		const source = selection.slice(0, separator).trim();
		const context = selection.slice(separator + 1).trim();
		if (separator < 1 || source.length === 0 || context.length === 0)
			throw new Error("codemod tokens: --context must use source=name pairs separated by commas");
		if (Object.hasOwn(contexts, source))
			throw new Error(`codemod tokens: --context selects '${source}' more than once`);
		contexts[source] = context;
	}
	return { contexts };
};

const parseTokenArgs = (argv: readonly string[]): TokenCliArgs => {
	const cli = cac("pandwind-codemod tokens");
	const command = cli.command("<input>", "Convert a token file between supported formats");
	configureTokensCommand(command);
	cli.parse(["node", "pandwind-codemod tokens", ...argv], { run: false });
	if (cli.matchedCommand === undefined) throw new Error("codemod tokens: input file is required");
	validateCommand(cli.matchedCommand);
	const options = cli.options as CliOptions;
	const from = tokenFormat(optionString(options, "from"), "from");
	const reportFormat = optionString(options, "reportFormat") ?? "text";
	if (reportFormat !== "text" && reportFormat !== "json")
		throw new Error(
			`codemod tokens: unknown --report-format '${reportFormat}' (expected text|json)`,
		);
	const context = tokenContextSelection(optionString(options, "context"));
	return {
		from,
		to: tokenFormat(optionString(options, "to") ?? from, "to"),
		input: cli.args[0]!,
		...(optionString(options, "out") === undefined ? {} : { out: optionString(options, "out") }),
		...(optionString(options, "resolver") === undefined
			? {}
			: { resolver: optionString(options, "resolver") }),
		...(optionString(options, "resolverOut") === undefined
			? {}
			: { resolverOut: optionString(options, "resolverOut") }),
		...(context === undefined ? {} : { context }),
		allowLossy: options.allowLossy === true,
		validate: options.validate === true,
		reportFormat,
	};
};

const createCodemodCli = (): CAC => {
	const cli = cac("pandwind-codemod");
	const migrate = cli.command(
		"migrate [...patterns]",
		"Migrate a project between styling adapters",
	);
	configureMigrateCommand(migrate);
	const tokens = cli.command("tokens <input>", "Convert token files between supported formats");
	configureTokensCommand(tokens);
	const polish = cli.command(
		"polish <mode> [...patterns]",
		"Inspect or normalize static codemod source shapes",
	);
	configurePolishCommand(polish);
	cli.command("tw [...args]", "Generate and inspect Pandwind Tailwind artifacts");
	cli.command("runtime [...args]", "Generate a specialized Pandwind CSS runtime");
	cli.command("lib [...args]", "Build a publishable Pandwind design-system artifact");
	cli.command("css [...args]", "Generate concrete Pandwind CSS types");
	return cli;
};

async function mainTokens(argv: string[]): Promise<void> {
	const {
		from,
		to,
		input,
		out,
		resolver,
		resolverOut,
		context,
		allowLossy,
		validate,
		reportFormat,
	} = parseTokenArgs(argv);
	if (resolver !== undefined && from !== TokenFormat.Dtcg)
		throw new Error("codemod tokens: --resolver can only accompany --from=dtcg");
	if (resolverOut !== undefined && to !== TokenFormat.Dtcg)
		throw new Error("codemod tokens: --resolver-out can only accompany --to=dtcg");
	if (context !== undefined && validate)
		throw new Error(
			"codemod tokens: --context cannot be combined with --validate; validation checks every context",
		);
	if (context !== undefined && resolverOut !== undefined)
		throw new Error(
			"codemod tokens: --context selects one state and cannot be combined with --resolver-out",
		);
	let document = await tokenDocumentCodec.fromFile(from, resolve(input));
	if (resolver !== undefined) {
		const resolverDocument = parseDtcgResolverDocument(readFileSync(resolve(resolver), "utf8"));
		document = createTokenDocument({
			format: document.format,
			formatVersion: document.formatVersion,
			root: document.root,
			resolver: resolverDocument,
			sourceLosses: document.sourceLosses,
			sourceText: `${document.sourceFingerprint}:${resolverDocument.version}`,
		});
	}
	if (context !== undefined) {
		const resolved =
			document.resolver === undefined
				? resolveInlineTokenContext(document, context)
				: await resolveTokenContext(
						document,
						context,
						createLocalTokenSourceLoader(resolve(resolver ?? input)),
					);
		document = createTokenDocument({
			format: resolved.format,
			formatVersion: resolved.formatVersion,
			root: resolved.root,
			sourceLosses: resolved.sourceLosses,
			sourceText: `${resolved.sourceFingerprint}:${JSON.stringify(context.contexts)}`,
		});
	}
	const countTokens = (group: TokenDocument["root"]): number =>
		Object.values(group.children).reduce(
			(count, child) => count + (child.kind === "token" ? 1 : countTokens(child)),
			group.root === undefined ? 0 : 1,
		);
	const tokenCount = countTokens(document.root);
	const baseReport = {
		schema: "pandwind.token-operation-report/1",
		input: resolve(input),
		from,
		to,
		tokenCount,
		...(context === undefined ? {} : { contextSelection: context.contexts }),
	};
	if (validate) {
		const report = {
			...baseReport,
			operation: "validate",
			status: "valid",
			fidelity: {
				status: document.sourceLosses?.length ? "lossy" : "lossless",
				losses: document.sourceLosses ?? [],
			},
		};
		if (reportFormat === "json") process.stdout.write(`${JSON.stringify(report, null, "\t")}\n`);
		else console.log(`codemod tokens: valid ${from} document, ${tokenCount} token(s)`);
		return;
	}
	try {
		const output = tokenDocumentCodec.to(to, document, {
			allowLossy,
			resolverSidecar: resolverOut !== undefined,
		});
		if (resolverOut !== undefined) {
			if (output.resolverText === undefined)
				throw new Error(
					"codemod tokens: --resolver-out requires a Resolver document or contextual token values",
				);
			writeFileSync(resolve(resolverOut), output.resolverText);
		}
		if (out !== undefined) writeFileSync(resolve(out), output.text);
		if (reportFormat === "json") {
			process.stdout.write(
				`${JSON.stringify(
					{
						...baseReport,
						operation: "convert",
						status: "converted",
						outputFile: out === undefined ? undefined : resolve(out),
						resolverFile: resolverOut === undefined ? undefined : resolve(resolverOut),
						fidelity: output.fidelity,
						...(out === undefined ? { output: output.text } : {}),
					},
					null,
					"\t",
				)}\n`,
			);
		} else if (out === undefined) {
			process.stdout.write(output.text);
			console.error(`\n// ${tokenCount} token(s), converted ${from} -> ${to}`);
		} else {
			console.log(`codemod tokens: ${tokenCount} token(s) -> ${resolve(out)}`);
		}
		if (output.fidelity.losses.length > 0 && reportFormat === "text")
			for (const loss of output.fidelity.losses)
				console.error(`codemod tokens: loss ${loss.path} · ${loss.feature}: ${loss.reason}`);
	} catch (error) {
		if (!(error instanceof TokenFormatLossError)) throw error;
		const report = {
			...baseReport,
			operation: "convert",
			status: "blocked-lossy-export",
			fidelity: error.output.fidelity,
		};
		if (reportFormat === "json") process.stdout.write(`${JSON.stringify(report, null, "\t")}\n`);
		else {
			console.error(error.message);
			for (const loss of error.output.fidelity.losses)
				console.error(`  ${loss.path} · ${loss.feature}: ${loss.reason}`);
		}
		process.exitCode = 1;
	}
}

const configurePolishCommand = (command: Command): void => {
	command
		.option("--meta <dir>", "Generated Pandwind metadata directory")
		.option("--root <dir>", "Project root (defaults to cwd or the absolute-pattern root)")
		.option("--write", "Write class-sort changes to source files")
		.option("--diff", "Print class-sort unified diffs")
		.option("--report-format <format>", "Report format: text or json", { default: "text" })
		.option("--min-occurrences <count>", "Only report arbitrary values used this many times")
		.option("--max-suggestions <count>", "Maximum nearest-token suggestions per arbitrary value");
};

const polishNumber = (options: CliOptions, name: string, fallback: number): number => {
	const value = optionString(options, name);
	if (value === undefined) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1)
		throw new Error(`codemod polish: --${name} must be a positive integer`);
	return parsed;
};

const polishReportFormat = (options: CliOptions): "text" | "json" => {
	const value = optionString(options, "reportFormat") ?? "text";
	if (value === "text" || value === "json") return value;
	throw new Error("codemod polish: --report-format must be text or json");
};

const polishRoot = (patterns: readonly string[], options: CliOptions): string => {
	const explicit = optionString(options, "root");
	return explicit === undefined
		? nearestProjectRoot(absolutePatternRoot(patterns) ?? process.cwd())
		: resolve(process.cwd(), explicit);
};

const polishMeta = async (root: string, options: CliOptions): Promise<PandwindMeta> => {
	const directory = optionString(options, "meta");
	if (directory === undefined)
		throw new Error("codemod polish: --meta <dir> is required for metadata-aware tooling");
	const metaDir = resolve(root, directory);
	const bridgePath = resolve(metaDir, "bridge.ts");
	return loadMetaFromSourcesAsync({
		typesDtsPath: resolve(metaDir, "types.d.ts"),
		twTsPath: resolve(metaDir, "tw.ts"),
		bridgePath: existsSync(bridgePath) ? bridgePath : undefined,
	});
};

const printArbitraryReport = (
	report: ReturnType<typeof extractArbitraryValueProposals>,
	format: "text" | "json",
): void => {
	if (format === "json") {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		return;
	}
	if (report.proposals.length === 0) {
		console.log("codemod polish: no arbitrary values found");
		return;
	}
	for (const proposal of report.proposals) {
		const property =
			proposal.properties.length > 0 ? proposal.properties.join(", ") : "unknown property";
		const exact = proposal.exactTokens.map((token) => `${token.group}.${token.ref}`).join(", ");
		const nearest = proposal.nearestTokens
			.map((token) => `${token.group}.${token.ref} (${token.distance.toFixed(3)})`)
			.join(", ");
		console.log(`${proposal.count}x ${property}: ${JSON.stringify(proposal.value)}`);
		if (exact !== "") console.log(`  exact tokens: ${exact}`);
		if (nearest !== "") console.log(`  nearest tokens: ${nearest}`);
		console.log(`  files: ${proposal.files.join(", ")}`);
	}
};

async function mainPolish(argv: string[]): Promise<void> {
	const cli = cac("pandwind-codemod polish");
	const command = cli.command(
		"<mode> [...patterns]",
		"Inspect or normalize static codemod source shapes",
	);
	configurePolishCommand(command);
	cli.parse(["node", "pandwind-codemod polish", ...argv], { run: false });
	if (cli.matchedCommand === undefined)
		throw new Error("codemod polish: mode is required (sort or arbitrary)");
	validateCommand(cli.matchedCommand);
	const options = cli.options as CliOptions;
	const mode = cli.args[0];
	if (mode !== "sort" && mode !== "arbitrary")
		throw new Error(`codemod polish: unknown mode '${mode ?? ""}' (expected sort|arbitrary)`);
	const patterns = cli.args.slice(1).map(String);
	if (patterns.length === 0)
		throw new Error("codemod polish: at least one source pattern is required");
	const root = polishRoot(patterns, options);
	const meta = await polishMeta(root, options);
	const filePaths = expandPatterns(patterns, root);
	if (mode === "arbitrary") {
		const report = extractArbitraryValueProposals(
			filePaths.map((file) => ({ file: relative(root, file), source: readFileSync(file, "utf8") })),
			meta,
			{
				minOccurrences: polishNumber(options, "minOccurrences", 1),
				maxSuggestions: polishNumber(options, "maxSuggestions", 5),
			},
		);
		printArbitraryReport(report, polishReportFormat(options));
		return;
	}
	const changes: Array<{ readonly file: string; readonly code: string; readonly edits: number }> =
		[];
	for (const file of filePaths) {
		const source = readFileSync(file, "utf8");
		const result = sortStaticClassSource(source, meta, file);
		if (!result.changed) continue;
		changes.push({ file, code: result.code, edits: result.edits });
		if (options.diff === true) process.stdout.write(unifiedDiff(source, result.code, file));
		if (options.write === true) writeFileSync(file, result.code);
	}
	if (polishReportFormat(options) === "json") {
		process.stdout.write(
			`${JSON.stringify({ files: changes.map((change) => ({ file: relative(root, change.file), edits: change.edits })) }, null, 2)}\n`,
		);
	} else {
		console.log(
			`codemod polish: ${changes.length} file(s) ${options.write === true ? "updated" : "would change"}`,
		);
	}
}

async function main(argv = process.argv.slice(2)): Promise<void> {
	if (argv[0] === "runtime") {
		try {
			await createRuntimeCli().run(argv.slice(1));
		} catch (error) {
			console.error(
				`pandwind-codemod runtime: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exitCode = 1;
		}
		return;
	}
	if (argv[0] === "tw") {
		try {
			await createTwCli().run(argv.slice(1));
		} catch (error) {
			console.error(
				`pandwind-codemod tw: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exitCode = 1;
		}
		return;
	}
	if (argv[0] === "lib") {
		try {
			await createLibCli().run(argv.slice(1));
		} catch (error) {
			console.error(
				`pandwind-codemod lib: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exitCode = 1;
		}
		return;
	}
	if (argv[0] === "css") {
		try {
			await createCssCli().run(argv.slice(1));
		} catch (error) {
			console.error(
				`pandwind-codemod css: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exitCode = 1;
		}
		return;
	}
	const cli = createCodemodCli();
	cli.help();
	try {
		cli.parse(["node", "pandwind-codemod", ...argv], { run: false });
		if (cli.matchedCommand === undefined) {
			if (argv.includes("-h") || argv.includes("--help")) return;
			cli.outputHelp();
			return;
		}
		if (cli.matchedCommand.name === "migrate") {
			await mainMigrate(argv.slice(1));
			return;
		}
		if (cli.matchedCommand.name === "tokens") {
			await mainTokens(argv.slice(1));
			return;
		}
		if (cli.matchedCommand.name === "polish") {
			await mainPolish(argv.slice(1));
			return;
		}
	} catch (error) {
		console.error(`pandwind-codemod: ${error instanceof Error ? error.message : String(error)}`);
		cli.outputHelp();
		process.exitCode = 1;
	}
}

// Run only when invoked as the CLI entry — importing the module from
// tests must not execute the program.
const invokedDirectly = /cli\.[mc]?[tj]sx?$/.test(process.argv[1] ?? "");
if (invokedDirectly) void main();
