#!/usr/bin/env node
/**
 * `pandwind analyze` CLI — reports how much class-merging work the build
 * eliminates for the given files.
 *
 * Usage:
 *   pnpm run analyze [globs...] [--tw <generated-tw.ts>] [--json] [--root <dir>]
 *
 * Defaults: globs = all .ts/.tsx under ./src, tw = "./src/tw.ts", root = cwd.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cac, type CAC, type Command } from "cac";
import type { createPandwindEngineContext } from "pandwind/vite";
import { createCrossModuleConstResolver } from "pandwind/vite/cross-module-consts";
import { collectFiles, type FoldSummary } from "./analyze.ts";
import {
	createAnalysisWorkspace,
	createCssBudgetService,
	createFoldAnalysisService,
} from "./analysis-service.ts";
import { collectAnnotations, formatAnnotations } from "./github-annotations.ts";
import {
	createCssReportCollector,
	formatAuthoredCssImports,
	formatCssDiagnostics,
} from "./css-diagnostics.ts";
import { runGovernanceLane, runTokenReleaseLane } from "./governance-lane.ts";
import { DEFAULT_GOVERNANCE_PRESET } from "./governance/project-context.ts";
import { MCP_COMMAND, createNodeMcpValidationPort, runMcpServer } from "./mcp/server.ts";

export interface CliArgs {
	patterns: Array<string>;
	twPath: string;
	json: boolean;
	root: string;
	css: boolean;
	githubAnnotations: boolean;
	constantsPath?: string;
	/** Absolute ceiling on minified CSS bytes — exit 1 when exceeded. */
	failOverBytes?: number;
	/** Budgets json path: per-lane caps { css, gzip, rules }. */
	budgetsPath?: string;
	/** Token-governance lane (plans/054) — emits the versioned report. */
	governance: boolean;
	/** Official preset specifier for the governance lane. */
	preset: string;
	/** Explicit baseline token document for read-only release impact analysis. */
	releaseBaselinePath?: string;
	/** Optional generated pandwind.interop/1 token snapshot to compare. */
	releaseCurrentPath?: string;
	releaseFormat: string;
	/** Explicit extra consumer roots; empty means the --root project only. */
	consumerRoots: Array<string>;
}

/** Per-lane caps for the budgets file (plans/023 CI gate). */
export interface BudgetCaps {
	css?: number;
	gzip?: number;
	rules?: number;
}

export interface AnalyzeCliDependencies {
	readonly cssPreset?: Parameters<typeof createPandwindEngineContext>[0]["preset"];
}

/** Parse a budgets json file; unknown lanes are ignored, values must be positive numbers. */
export function parseBudgets(text: string): BudgetCaps {
	const raw = JSON.parse(text) as Record<string, unknown>;
	const caps: BudgetCaps = {};
	for (const lane of ["css", "gzip", "rules"] as const) {
		const v = raw[lane];
		if (typeof v === "number" && Number.isFinite(v) && v >= 0) caps[lane] = v;
	}
	return caps;
}

/** Evaluate caps against a measured budget; returns human-readable violations. */
export function evaluateBudget(
	measured: { cssBytes: number; cssGzipBytes: number; rules: number },
	failOverBytes: number | undefined,
	caps: BudgetCaps,
): string[] {
	const violations: string[] = [];
	if (failOverBytes !== undefined && measured.cssBytes > failOverBytes) {
		violations.push(`css bytes ${measured.cssBytes} exceed --fail-over ceiling ${failOverBytes}`);
	}
	if (caps.css !== undefined && measured.cssBytes > caps.css) {
		violations.push(`css bytes ${measured.cssBytes} exceed budgets cap ${caps.css}`);
	}
	if (caps.gzip !== undefined && measured.cssGzipBytes > caps.gzip) {
		violations.push(`gzip bytes ${measured.cssGzipBytes} exceed budgets cap ${caps.gzip}`);
	}
	if (caps.rules !== undefined && measured.rules > caps.rules) {
		violations.push(`rule count ${measured.rules} exceed budgets cap ${caps.rules}`);
	}
	return violations;
}

/** Version tag stamped into `--json` output for consumers. */
export const ANALYZE_JSON_SCHEMA = "pandwind.analyze/1";
/** Version tag for the governance lane document. */
export const GOVERNANCE_JSON_SCHEMA = "pandwind.analyze.governance/1";
export { DEFAULT_GOVERNANCE_PRESET };

type CliOptions = Readonly<Record<string, unknown>>;

const optionString = (options: CliOptions, name: string): string | undefined => {
	const value = options[name];
	return typeof value === "string" ? value : undefined;
};

const optionBoolean = (options: CliOptions, name: string): boolean => options[name] === true;

const optionStrings = (options: CliOptions, name: string): Array<string> => {
	const value = options[name];
	if (typeof value === "string")
		return value
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
	if (Array.isArray(value))
		return value.filter((entry): entry is string => typeof entry === "string");
	return [];
};

const optionNumber = (options: CliOptions, name: string): number | undefined => {
	const value = options[name];
	if (typeof value === "number") return value;
	if (typeof value === "string" && value !== "") return Number(value);
	return undefined;
};

const configureAnalyzeCommand = (command: Command): void => {
	command
		.option("--tw <path>", "Generated tw.ts module", { default: "src/tw.ts" })
		.option("--root <dir>", "Project root", { default: "." })
		.option("--json", "Emit the versioned machine-readable report")
		.option("--css", "Measure the generated CSS budget")
		.option("--constants <path>", "JSON file containing imported constants")
		.option("--github-annotations", "Emit GitHub Actions annotations")
		.option("--governance", "Emit the token-governance report")
		.option("--preset <module>", "Official preset used by governance", {
			default: DEFAULT_GOVERNANCE_PRESET,
		})
		.option(
			"--release-baseline <path>",
			"Compare this explicit token document to current pandwind.interop/1 tokens",
		)
		.option(
			"--release-current <path>",
			"Current pandwind.interop/1 artifact; defaults to <consumer>/src/pandwind.interop.json",
		)
		.option("--release-format <format>", "Format of the release baseline", { default: "dtcg" })
		.option(
			"--consumer-root <dir[,dir...]>",
			"Explicit consumer project roots for release impact analysis",
		)
		.option("--fail-over <bytes>", "Fail when minified CSS exceeds this byte ceiling")
		.option("--budgets <path>", "JSON file containing CSS budget caps");
};

const createAnalyzeCli = (): CAC => {
	const cli = cac("pandwind-analyze");
	const analyze = cli.command(
		"[...patterns]",
		"Analyze source files for fold coverage, CSS provenance, and budgets",
	);
	configureAnalyzeCommand(analyze);
	cli
		.command("mcp", "Run the read-only Model Context Protocol server")
		.option("--root <dir>", "Project root", {
			default: ".",
		})
		.option(
			"--host-checks",
			"Run declared project validation scripts in an isolated temporary workspace",
		);
	return cli;
};

const validateCommand = (command: Command): void => {
	command.checkUnknownOptions();
	command.checkOptionValue();
	command.checkRequiredArgs();
	command.checkUnusedArgs();
};

function parseArgs(argv: Array<string>): CliArgs {
	const cli = createAnalyzeCli();
	cli.parse(["node", "pandwind-analyze", ...argv], { run: false });
	const command = cli.matchedCommand;
	if (command === undefined || command.name === MCP_COMMAND) {
		throw new Error(
			"analyze: expected analysis arguments; use `pandwind-analyze mcp --help` for MCP",
		);
	}
	validateCommand(command);
	const options = cli.options as CliOptions;
	const root = resolve(process.cwd(), optionString(options, "root") ?? ".");
	const failOverBytes = optionNumber(options, "failOver");
	if (failOverBytes !== undefined && (!Number.isFinite(failOverBytes) || failOverBytes < 0)) {
		throw new Error(`analyze: invalid --fail-over '${String(options.failOver)}'`);
	}
	const budgets = optionString(options, "budgets");
	const constants = optionString(options, "constants");
	const releaseBaseline = optionString(options, "releaseBaseline");
	const releaseCurrent = optionString(options, "releaseCurrent");
	const consumerRoots = optionStrings(options, "consumerRoot")
		.flatMap((value) => value.split(","))
		.map((path) => path.trim())
		.filter(Boolean)
		.map((path) => resolve(process.cwd(), path));
	if (releaseCurrent !== undefined && releaseBaseline === undefined) {
		throw new Error("analyze: --release-current requires --release-baseline");
	}
	return {
		patterns: [...cli.args],
		twPath: resolve(root, optionString(options, "tw") ?? "src/tw.ts"),
		json: optionBoolean(options, "json"),
		css: optionBoolean(options, "css"),
		githubAnnotations: optionBoolean(options, "githubAnnotations"),
		root,
		...(constants === undefined ? {} : { constantsPath: resolve(process.cwd(), constants) }),
		...(failOverBytes === undefined ? {} : { failOverBytes }),
		...(budgets === undefined ? {} : { budgetsPath: resolve(process.cwd(), budgets) }),
		governance: optionBoolean(options, "governance"),
		preset: optionString(options, "preset") ?? DEFAULT_GOVERNANCE_PRESET,
		...(releaseBaseline === undefined
			? {}
			: { releaseBaselinePath: resolve(process.cwd(), releaseBaseline) }),
		...(releaseCurrent === undefined
			? {}
			: { releaseCurrentPath: resolve(process.cwd(), releaseCurrent) }),
		releaseFormat: optionString(options, "releaseFormat") ?? "dtcg",
		consumerRoots,
	};
}

/** Shared CSS-budget computation for both output lanes. */
async function computeCssBudget(args: CliArgs, files: Array<string>) {
	const budgetService = createCssBudgetService();
	const themeCssPath = resolve(args.root, "src/pandwind-theme.css");
	let themeCss: string | undefined;
	try {
		themeCss = readFileSync(themeCssPath, "utf8");
	} catch {
		themeCss = undefined;
	}
	return budgetService.measure({
		files: files.map((f) => resolve(args.root, f)),
		twEntry: args.twPath,
		themeCss,
		base: args.root,
	});
}

/**
 * Run the CLI and return the exact text it would print (human table or JSON
 * document). Pure apart from filesystem reads — tests assert on the return
 * value instead of spying on console.log.
 */
async function runAnalysis(
	args: CliArgs,
	dependencies: AnalyzeCliDependencies = {},
): Promise<string> {
	if (args.releaseBaselinePath !== undefined) return runTokenReleaseLane(args);
	if (args.governance) return runGovernanceLane(args);
	const patterns = args.patterns.length > 0 ? args.patterns : ["src/**/*"];
	const workspace = createAnalysisWorkspace();
	const analysis = createFoldAnalysisService();
	const config = workspace.loadConfig(args.twPath);
	const configuredConstants = args.constantsPath
		? (JSON.parse(readFileSync(args.constantsPath, "utf8")) as Record<string, string>)
		: undefined;
	const crossModuleResolver = createCrossModuleConstResolver();
	const files = [...workspace.collectFiles(patterns, args.root)];
	const sources: Array<{
		absoluteFile: string;
		content: string;
		scan: NonNullable<Parameters<typeof analysis.analyze>[2]["sourceScan"]>;
	}> = [];
	const cssCollector = createCssReportCollector();
	workspace.forEachFile(files, ({ path: absoluteFile, source: content, scan }) => {
		sources.push({ absoluteFile, content, scan });
		const file = absoluteFile.startsWith(`${args.root}/`)
			? absoluteFile.slice(args.root.length + 1)
			: absoluteFile;
		cssCollector.add({ file, content });
	});
	const cssReport = cssCollector.finish();
	let cxEngine: ReturnType<typeof createPandwindEngineContext> | undefined;
	if (dependencies.cssPreset !== undefined) {
		const vite = await import("pandwind/vite");
		cxEngine = vite.createPandwindEngineContext({ preset: dependencies.cssPreset });
	}
	const stats: ReturnType<typeof analysis.analyze>[] = sources.map(
		({ absoluteFile, content, scan }) => {
			const file = absoluteFile.startsWith(`${args.root}/`)
				? absoluteFile.slice(args.root.length + 1)
				: absoluteFile;
			const importedConstants: Record<string, string> = {};
			if (scan.program !== undefined) {
				const resolvedConstants = crossModuleResolver.importedScope(absoluteFile, scan.program);
				for (const [name, known] of resolvedConstants) {
					if (typeof known.value === "string") importedConstants[name] = known.value;
				}
			}
			return analysis.analyze(content, file, {
				config,
				importedConstants: { ...importedConstants, ...configuredConstants },
				sourceScan: scan,
				...(cxEngine === undefined
					? {}
					: {
							cxFold: {
								cssNames: cssReport.cssNamesByFile.get(file) ?? new Set<string>(),
								engine: cxEngine,
							},
						}),
			});
		},
	);
	const summary: FoldSummary = analysis.summarize(stats);
	const { authoredCss, cssSources, cssDiagnostics } = cssReport;

	if (args.json) {
		// Machine consumers (the reusable analyze-comment workflow) need the
		// missing-CSS lane and the CSS size budget in the same document.
		const missingSites = stats.flatMap((s) =>
			s.missingCss.map((m) => ({ file: s.file, line: m.line, token: m.token })),
		);
		const arbitrarySites = stats.flatMap((s) =>
			s.arbitraryValues.map((m) => ({ file: s.file, line: m.line, token: m.token })),
		);
		let cssBudgetJson:
			| import("./css-budget-contracts.ts").CssBudget
			| Record<string, unknown>
			| undefined;
		if (args.css) {
			cssBudgetJson = await computeCssBudget(args, files);
		}
		return JSON.stringify(
			{
				schema: ANALYZE_JSON_SCHEMA,
				...summary,
				missingCss: { count: missingSites.length, sites: missingSites.slice(0, 50) },
				arbitraryValues: { count: arbitrarySites.length, sites: arbitrarySites.slice(0, 50) },
				authoredCss,
				cssSources,
				cssDiagnostics,
				...(cssBudgetJson !== undefined ? { cssBudget: cssBudgetJson } : {}),
			},
			null,
			2,
		);
	}
	if (args.css && !args.json) {
		return createCssBudgetService().format(await computeCssBudget(args, files));
	}

	if (args.githubAnnotations) {
		const annotations = collectAnnotations(summary, undefined);
		const truncated = false;
		return formatAnnotations(annotations, truncated);
	}
	const report = analysis.format(summary);
	const authoredCssReport = formatAuthoredCssImports(authoredCss);
	const formattedCssReport = formatCssDiagnostics(cssDiagnostics);
	return [report, authoredCssReport, formattedCssReport].filter(Boolean).join("\n\n");
}

export async function runCli(
	argv: Array<string>,
	dependencies: AnalyzeCliDependencies = {},
): Promise<string> {
	return runAnalysis(parseArgs(argv), dependencies);
}

async function runAnalyzeCommand(args: CliArgs): Promise<void> {
	console.log(await runAnalysis(args));

	// CI gate (plans/023): nonzero exit when the measured budget violates
	// --fail-over ceiling or any --budgets cap. PR-relative deltas compose by
	// running the CLI twice (base + head) in the workflow layer.
	if ((args.failOverBytes !== undefined || args.budgetsPath !== undefined) && args.css) {
		const workspace = createAnalysisWorkspace();
		const files = [
			...workspace.collectFiles(args.patterns.length > 0 ? args.patterns : ["src/**/*"], args.root),
		];
		const measured = await computeCssBudget(args, files);
		const caps =
			args.budgetsPath !== undefined ? parseBudgets(readFileSync(args.budgetsPath!, "utf8")) : {};
		const violations = evaluateBudget(measured, args.failOverBytes, caps);
		if (violations.length > 0) {
			for (const v of violations) console.error(`analyze: BUDGET VIOLATION — ${v}`);
			process.exitCode = 1;
		}
	}
}

async function main(argv = process.argv.slice(2)): Promise<void> {
	const cli = createAnalyzeCli();
	cli.help();
	try {
		cli.parse(["node", "pandwind-analyze", ...argv], { run: false });
		const command = cli.matchedCommand;
		if (command === undefined) return;
		validateCommand(command);
		if (command.name === MCP_COMMAND) {
			const root = resolve(process.cwd(), optionString(cli.options as CliOptions, "root") ?? ".");
			await runMcpServer(root, {
				validation: optionBoolean(cli.options as CliOptions, "hostChecks")
					? createNodeMcpValidationPort()
					: undefined,
			});
			return;
		}
		await runAnalyzeCommand(parseArgs(argv));
	} catch (error) {
		console.error(`pandwind-analyze: ${error instanceof Error ? error.message : String(error)}`);
		cli.outputHelp();
		process.exitCode = 1;
	}
}

const invokedDirectly =
	process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

export { main, parseArgs, collectFiles };
