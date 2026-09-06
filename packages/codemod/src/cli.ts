#!/usr/bin/env node
/**
 * pandwind-codemod CLI.
 *
 * The CLI has one migration command for both the historical class-string
 * pass and registered adapter routes. It writes by default; `--dry-run`
 * produces the same plan without changing files. `tokens` remains a separate
 * data-format conversion command.
 */
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import cac, { type CAC, type Command } from "cac";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { loadMetaFromSourcesAsync, type PandwindMeta } from "./meta.ts";
import { transformSource, type MigrateMode, type TransformResult } from "./migrate.ts";
import * as swapImport from "./swap/index.ts";
import { CodemodAdapterId, SwapSourceId, SwapTargetId } from "./swap/identifiers.ts";
import { tokenSetCodec } from "./swap/token-set.ts";
import type { TokenFormatId } from "./swap/token-format-contracts.ts";
import { TokenFormatId as TokenFormat } from "./swap/token-format-contracts.ts";
import { unifiedDiff } from "./diff.ts";
import { configureMigrateCommand } from "./swap/cli-args.ts";
import { createPandwindProjectSupport, type PandwindProjectSupport } from "./swap/project-bootstrap.ts";
export { unifiedDiff } from "./diff.ts";

function writeGeneratedFiles(
	root: string,
	files: readonly { readonly path: string; readonly content: string }[],
): void {
	const resolved = files.map((file) => ({
		...file,
		absolutePath: resolve(root, file.path),
	}));
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
): void {
	for (const file of files) {
		const plannedContent = planned.get(file.path);
		if (planned.has(file.path) && plannedContent !== file.content)
			throw new Error(`codemod: conflicting generated file ${file.path} in one migration run`);
		planned.set(file.path, file.content);
		const absolutePath = resolve(root, file.path);
		if (existsSync(absolutePath) && readFileSync(absolutePath, "utf8") !== file.content)
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

const optionBoolean = (options: CliOptions, name: string): boolean => options[name] === true;

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

const readProjectFile = (root: string) => (file: string): string | undefined => {
	const absolute = file.startsWith(root) ? file : resolve(root, file);
	try {
		return readFileSync(absolute, "utf8");
	} catch {
		return undefined;
	}
};

const projectFiles = (root: string): readonly string[] =>
	sourceWorkspace.files(["**/*"], root, { includeUnsupported: true });

function shouldBootstrapPandwindProject(args: swapImport.MigrateCliArgs): boolean {
	if (args.to === SwapTargetId.Tw)
		return args.from === CodemodAdapterId.Tailwind || args.from === SwapSourceId.Auto;
	return (
		args.to === CodemodAdapterId.Pandwind ||
		(args.to === SwapTargetId.CssClass && isExternalAdapterId(args.from))
	);
}

/** Ascend from cwd to the workspace root (the dir containing pnpm-workspace.yaml). */
function findRepoRoot(): string {
	let dir = process.cwd();
	for (;;) {
		try {
			statSync(resolve(dir, "pnpm-workspace.yaml"));
			return dir;
		} catch {
			const parent = resolve(dir, "..");
			if (parent === dir) return process.cwd();
			dir = parent;
		}
	}
}

const LEGACY_MODES: readonly MigrateMode[] = ["tw", "cx", "css", "keep"];

const isLegacyMode = (args: swapImport.MigrateCliArgs): boolean =>
	(args.to === "cx" || args.to === "css" || args.to === "keep") || args.sources.length > 0;

async function mainMigrate(argv: string[]): Promise<void> {
	const args = swapImport.parseMigrateArgs(argv);
	const root = findRepoRoot();
	if (isLegacyMode(args)) {
		await runDefault(args);
		return;
	}
	const filePaths = expandPatterns(args.patterns, root, isExternalSwap(args));
	if (isExternalSwap(args)) {
		let meta: PandwindMeta | undefined;
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
					`codemod swap: failed to load generated metadata from ${metaDir}\n` +
						"  remove --meta for literal-safe output, or regenerate the target metadata\n" +
						`  (${(error as Error).message})`,
				);
				process.exitCode = 1;
				return;
			}
		}
		await runExternalAdapterSwap(args, filePaths, root, meta);
		return;
	}
	const metaDirRelative = args.metaDir !== "" ? args.metaDir : "apps/example/src";
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
				"  run `nub exec pandwind-tw generate --bridge` first, or pass --meta=<dir>\n" +
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
		});
		return;
	}

	if (filePaths.length === 0) {
		console.error("codemod migrate: no matching files");
		process.exitCode = 1;
		return;
	}

	// Wired for the upcoming --engine resolution pass; unused until then.
	let _engineResolver: import("./swap/engine.ts").TwMissResolver | undefined;
	if (args.engine) {
		_engineResolver = await swapImport
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

function isExternalSwap(args: swapImport.MigrateCliArgs): boolean {
	if (isFlatRoute(args)) return false;
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

async function runExternalAdapterSwap(
	args: swapImport.MigrateCliArgs,
	filePaths: Array<string>,
	root: string,
	meta?: PandwindMeta,
): Promise<void> {
	if (filePaths.length === 0) {
		console.error("codemod migrate: no matching files");
		process.exitCode = 1;
		return;
	}
	const target = isExternalAdapterId(args.to)
		? args.to
		: args.to === SwapTargetId.CssClass
			? CodemodAdapterId.Pandwind
			: undefined;
	if (target === undefined) {
		console.error(
			`codemod migrate: external adapters currently emit to css.class (or an external adapter), not '${args.to}'`,
		);
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
	}> = [];
	const plannedGeneratedFiles = new Map<string, string>();
	const plannedFileChanges = new Map<string, string>();
	const projectFiles = sourceWorkspace.files(["**/*"], root, { includeUnsupported: true });
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
		const result = await swapImport.STYLE_MIGRATION_USE_CASE.runAsync(source, {
			from,
			to: target,
			file: relative,
			root,
			readFile: (candidate) => {
				try {
					return readFileSync(candidate, "utf8");
				} catch {
					return undefined;
				}
			},
			listFiles: () => projectFiles,
			mode: args.capabilityMode ?? "safe",
			skipMarker: args.skipMarker,
			meta,
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
		});
		totalConverted += result.converted;
		totalSkipped += result.skipped;
		totalResiduals += result.residuals.length;
		if (!result.changed && !codeChanged && result.generatedFiles.length === 0) {
			if (args.reportFormat !== "json") console.log(`${relative}: no changes (${from}->${target})`);
			continue;
		}
		totalChanged++;
		if (args.diff && args.reportFormat !== "json")
			console.log(unifiedDiff(source, result.code, relative));
		if (!args.dryRun) {
			if (outputFile !== file && existsSync(outputFile))
				throw new Error(
					`codemod: refusing to overwrite existing host-conversion output ${outputFile}`,
				);
			validatePlannedGeneratedFiles(root, result.generatedFiles, plannedGeneratedFiles);
			validatePlannedFileChanges(root, result.fileChanges, plannedFileChanges);
			pendingWrites.push({ file, outputFile, relative, result });
		}
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
	if (!args.dryRun) {
		for (const pending of pendingWrites) {
			writeGeneratedFiles(root, pending.result.generatedFiles);
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
	}
	if (args.reportFormat !== "json")
		console.log(
			`\nsummary: ${filePaths.length} file(s) scanned · ${totalChanged} changed · ` +
				`${totalConverted} converted · ${totalSkipped} skipped · ${totalResiduals} residual(s) · ` +
			(args.dryRun ? "dry-run (no files written)" : "WRITTEN"),
		);
	if (args.report && args.reportFormat === "json") {
		console.log(
			JSON.stringify({
				from: args.from,
				to: target,
				mode: args.capabilityMode ?? "safe",
				files: reportEntries,
			}),
		);
	}
}

async function runDefault(args: swapImport.MigrateCliArgs): Promise<void> {
	const root = findRepoRoot();
	const metaDirRelative = args.metaDir !== "" ? args.metaDir : "apps/example/src";
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
			`codemod: failed to load generated metadata from ${metaDir}\n` +
				"  run `nub exec pandwind-tw generate --bridge` first, or pass --meta=<dir>\n" +
				`  (${(error as Error).message})`,
		);
		process.exitCode = 1;
		return;
	}

	const filePaths = expandPatterns(args.patterns, root);
	const fileResults: Array<{ relative: string; result: TransformResult }> = [];
	if (filePaths.length === 0) {
		console.error("codemod: no matching files");
		process.exitCode = 1;
		return;
	}

	let totalConverted = 0;
	let totalChanged = 0;
	let totalUnmapped = 0;
	const mode = LEGACY_MODES.includes(args.to as MigrateMode)
		? (args.to as MigrateMode)
		: args.to === SwapTargetId.Tw
			? "tw"
			: args.to === SwapTargetId.CssClass
				? "css"
				: "keep";

	for (const file of filePaths) {
		const relative = file.slice(root.length + 1);
		let source: string;
		try {
			source = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const result: TransformResult = transformSource(source, meta, {
			mode,
			file: relative,
			metaDir: metaDirRelative,
			skipMarker: args.skipMarker,
			sources: args.sources,
		});
		totalConverted += result.converted;
		totalUnmapped += result.unmappedTokens.length;
		fileResults.push({ relative, result });

		if (!result.changed) {
			console.log(`${relative}: no changes`);
			continue;
		}
		totalChanged++;
		if (args.diff) console.log(unifiedDiff(source, result.code, relative));
		if (!args.dryRun) writeFileSync(file, result.code);
		console.log(
			`${relative}: ${args.dryRun ? "would change" : "written"} — ${result.converted} call site(s), ` +
				`${result.unmappedTokens.length} token(s) left verbatim` +
				(result.skippedByMarker > 0 ? `, ${result.skippedByMarker} skipped by marker` : ""),
		);
	}

	console.log(
		`\nsummary: ${filePaths.length} file(s) scanned · ${totalChanged} changed · ` +
			`${totalConverted} converted · ${totalUnmapped} verbatim token(s) · mode=${mode} · ` +
			(args.dryRun ? "dry-run (no files written)" : "WRITTEN"),
	);

	if (args.report) {
		console.log(buildReport(fileResults));
	}
}

export interface ReportEntry {
	relative: string;
	result: TransformResult;
}

/**
 * Migration-completeness score: how much of the scanned class-string
 * surface flows through pandwind APIs vs what stays manual. Pure so the
 * math is unit-testable without spawning the CLI.
 */
export function buildReport(fileResults: Array<ReportEntry>): string {
	const totalConverted = fileResults.reduce((acc, f) => acc + f.result.converted, 0);
	const totalSkipped = fileResults.reduce((acc, f) => acc + f.result.skippedByMarker, 0);
	const totalVerbatim = fileResults.reduce((acc, f) => acc + f.result.unmappedTokens.length, 0);
	const manualWork = fileResults.filter(
		(f) => f.result.skippedByMarker > 0 || f.result.unmappedTokens.length > 0,
	);
	const totalSites = totalConverted + totalSkipped;
	const lines: Array<string> = [];
	lines.push("migration report:");
	lines.push(
		`  call sites through pandwind: ${totalConverted}/${totalSites}` +
			(totalSites > 0 ? ` (${Math.round((totalConverted / totalSites) * 100)}%)` : ""),
	);
	lines.push(`  flagged for manual work: ${totalSkipped} site(s)`);
	lines.push(`  tokens kept verbatim (unknown to metadata): ${totalVerbatim}`);
	if (manualWork.length > 0) {
		lines.push("  files needing attention:");
		for (const f of manualWork.slice(0, 20)) {
			lines.push(
				`    - ${f.relative}: ${f.result.skippedByMarker} flagged, ${f.result.unmappedTokens.length} verbatim`,
			);
		}
		if (manualWork.length > 20) lines.push(`    … and ${manualWork.length - 20} more`);
	}
	return lines.join("\n");
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
		.option("--from <format>", "Input token format")
		.option("--to <format>", "Output token format")
		.option("--out <file>", "Write the converted token set to a file");
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
	const migrate = cli.command("migrate [...patterns]", "Migrate a project between styling adapters");
	configureMigrateCommand(migrate);
	const tokens = cli.command("tokens <input>", "Convert token files between supported formats");
	configureTokensCommand(tokens);
	return cli;
};

/** Normalize the old root/swap spellings into the one migration command. */
const normalizeCommand = (argv: readonly string[]): string[] => {
	const [first, ...rest] = argv;
	if (first === "migrate" || first === "tokens") return [...argv];
	if (first === "swap") return ["migrate", ...rest];
	return ["migrate", ...argv];
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
	const cli = createCodemodCli();
	cli.help();
	const normalizedArgv = normalizeCommand(argv);
	try {
		cli.parse(["node", "pandwind-codemod", ...normalizedArgv], { run: false });
		if (cli.matchedCommand === undefined) return;
		if (cli.matchedCommand.name === "migrate") {
			await mainMigrate(normalizedArgv.slice(1));
			return;
		}
		if (cli.matchedCommand.name === "tokens") {
			await mainTokens(normalizedArgv.slice(1));
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
