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
import { loadMetaFromSourcesAsync, type PandwindMeta } from "./meta.ts";
import * as swapImport from "./swap/index.ts";
import { CodemodAdapterId, SwapSourceId, SwapTargetId } from "./swap/identifiers.ts";
import { tokenSetCodec } from "./swap/token-set.ts";
import type { TokenFormatId } from "./swap/token-format-contracts.ts";
import { TokenFormatId as TokenFormat } from "./swap/token-format-contracts.ts";
import { unifiedDiff } from "./diff.ts";
import { createTwCli } from "./tw/cli.ts";
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

const existingProjectSupport = (
	root: string,
	directory: string,
	meta: PandwindMeta,
): PandwindProjectSupport => {
	const relativeDirectory = projectOutputDirectory(root, directory);
	const modulePath = (name: string): string | undefined =>
		existsSync(resolve(root, relativeDirectory, name)) ? `${relativeDirectory}/${name}` : undefined;
	const bindings: AdapterProjectBindings = {
		...(modulePath("css.ts") === undefined ? {} : { cssModule: modulePath("css.ts") }),
		...(modulePath("runtime.ts") === undefined
			? {}
			: { runtimeCssModule: modulePath("runtime.ts") }),
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
	const explicitlyExternal = isExternalRoute(args);
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
		const packageJson = readPackageJson(root);
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

	let meta: PandwindMeta;
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
				"  run `pandwind-codemod tw generate --bridge` first, or pass --meta=<dir>\n" +
				`  (${(error as Error).message})`,
		);
		process.exitCode = 1;
		return;
	}

	const projectMigration = swapImport.getProjectMigrationCommand(args.from);
	if (projectMigration !== undefined) {
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
		});
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
			dedup: args.dedup,
			tokenReferenceFormat: args.tokenReferenceFormat,
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
	const projectGeneratedFiles = project?.files ?? [];
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

/**
 * Token-config conversions (plans/022): DTCG JSON <-> @theme css <->
 * definePreset <-> panda.config tokens. One TokenSet IR in between.
 */
const TOKEN_FORMATS: readonly TokenFormatId[] = [
	TokenFormat.Dtcg,
	TokenFormat.Theme,
	TokenFormat.Panda,
	TokenFormat.Preset,
	TokenFormat.StyleDictionary,
	TokenFormat.Figma,
	TokenFormat.RootCss,
	TokenFormat.StyleX,
];

const configureTokensCommand = (command: Command): void => {
	command
		.option("-f, --from <format>", "Input token format")
		.option("-t, --to <format>", "Output token format")
		.option("-o, --out <file>", "Write the converted token set to a file");
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
}

const parseTokenArgs = (argv: readonly string[]): TokenCliArgs => {
	const cli = cac("pandwind-codemod tokens");
	const command = cli.command("<input>", "Convert a token file between supported formats");
	configureTokensCommand(command);
	cli.parse(["node", "pandwind-codemod tokens", ...argv], { run: false });
	if (cli.matchedCommand === undefined) throw new Error("codemod tokens: input file is required");
	validateCommand(cli.matchedCommand);
	const options = cli.options as CliOptions;
	const from = tokenFormat(optionString(options, "from"), "from");
	return {
		from,
		to: tokenFormat(optionString(options, "to") ?? from, "to"),
		input: cli.args[0]!,
		...(optionString(options, "out") === undefined ? {} : { out: optionString(options, "out") }),
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
	cli.command("tw [...args]", "Generate and inspect Pandwind Tailwind artifacts");
	return cli;
};

async function mainTokens(argv: string[]): Promise<void> {
	const { from, to, input, out } = parseTokenArgs(argv);
	const set = await tokenSetCodec.fromFile(from, resolve(input));

	const groupCount = Object.keys(set.groups).length;
	const tokenCount = Object.values(set.groups).reduce((a, g) => a + Object.keys(g).length, 0);

	const result = tokenSetCodec.to(to, set);

	if (out !== undefined) {
		writeFileSync(resolve(out), result);
		console.log(
			`codemod tokens: ${groupCount} group(s), ${tokenCount} token(s) -> ${resolve(out)}`,
		);
	} else {
		process.stdout.write(result);
		console.error(
			`\n// ${groupCount} group(s), ${tokenCount} token(s), converted ${from} -> ${to}`,
		);
	}
}

async function main(argv = process.argv.slice(2)): Promise<void> {
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
