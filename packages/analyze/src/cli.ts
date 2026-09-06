#!/usr/bin/env node
/**
 * `pandwind analyze` CLI — reports how much class-merging work the build
 * eliminates for the given files.
 *
 * Usage:
 *   nub run analyze [globs...] [--tw <generated-tw.ts>] [--json] [--root <dir>]
 *
 * Defaults: globs = all .ts/.tsx under ./src, tw = "./src/tw.ts", root = cwd.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
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
import { runGovernanceLane } from "./governance-lane.ts";

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
}

/** Per-lane caps for the budgets file (plans/023 CI gate). */
export interface BudgetCaps {
	css?: number;
	gzip?: number;
	rules?: number;
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
export const ANALYZE_JSON_SCHEMA = "pandwind.analyze/2";
/** Version tag for the governance lane document. */
export const GOVERNANCE_JSON_SCHEMA = "pandwind.analyze.governance/1";
/** Default official preset for the governance lane. */
export const DEFAULT_GOVERNANCE_PRESET = "pandwind/preset/example-preset";

function parseArgs(argv: Array<string>): CliArgs {
	const patterns: Array<string> = [];
	let twPath = "src/tw.ts";
	let json = false;
	let css = false;
	let githubAnnotations = false;
	let root = process.cwd();
	let constantsPath: string | undefined;
	let failOverBytes: number | undefined;
	let budgetsPath: string | undefined;
	let governance = false;
	let preset = DEFAULT_GOVERNANCE_PRESET;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--tw") {
			twPath = argv[++i] ?? twPath;
		} else if (arg === "--css") {
			css = true;
		} else if (arg === "--github-annotations") {
			githubAnnotations = true;
		} else if (arg === "--json") {
			json = true;
		} else if (arg === "--root") {
			root = resolve(process.cwd(), argv[++i] ?? ".");
		} else if (arg === "--constants") {
			constantsPath = resolve(process.cwd(), argv[++i] ?? "");
		} else if (arg === "--governance") {
			governance = true;
		} else if (arg === "--preset") {
			preset = argv[++i] ?? preset;
		} else if (arg !== undefined && arg.startsWith("--fail-over=")) {
			failOverBytes = Number(arg.slice("--fail-over=".length));
			if (!Number.isFinite(failOverBytes) || failOverBytes < 0) {
				throw new Error(`analyze: invalid --fail-over '${arg}'`);
			}
		} else if (arg !== undefined && arg.startsWith("--budgets=")) {
			budgetsPath = resolve(process.cwd(), arg.slice("--budgets=".length));
		} else if (arg !== undefined && arg.startsWith("--preset=")) {
			preset = arg.slice("--preset=".length);
		} else if (arg !== undefined) {
			patterns.push(arg);
		}
	}
	return {
		patterns,
		twPath: resolve(root, twPath),
		json,
		css,
		githubAnnotations,
		root,
		constantsPath,
		failOverBytes,
		budgetsPath,
		governance,
		preset,
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
export async function runCli(argv: Array<string>): Promise<string> {
	const args = parseArgs(argv);
	if (args.governance) return runGovernanceLane(args);
	const patterns = args.patterns.length > 0 ? args.patterns : ["src/**/*.{ts,tsx}"];
	const workspace = createAnalysisWorkspace();
	const analysis = createFoldAnalysisService();
	const config = workspace.loadConfig(args.twPath);
	const importedConstants = args.constantsPath
		? (JSON.parse(readFileSync(args.constantsPath, "utf8")) as Record<string, string>)
		: undefined;
	const files = workspace
		.collectFiles(patterns, args.root)
		.filter((f) => SOURCE_SCANNER_SERVICE.isTypeScriptFile(f));
	const stats: ReturnType<typeof analysis.analyze>[] = [];
	const cssCollector = createCssReportCollector();
	workspace.forEachFile(files, ({ path: absoluteFile, source: content, scan }) => {
		const file = absoluteFile.startsWith(`${args.root}/`)
			? absoluteFile.slice(args.root.length + 1)
			: absoluteFile;
		stats.push(
			analysis.analyze(content, file, {
				config,
				importedConstants,
				sourceScan: scan,
			}),
		);
		cssCollector.add({ file, content });
	});
	const summary: FoldSummary = analysis.summarize(stats);
	const cssReport = cssCollector.finish();
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

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	if (argv[0] === "mcp") {
		const { runMcpCommand } = await import("./mcp/server.ts");
		await runMcpCommand(argv.slice(1));
		return;
	}
	const args = parseArgs(argv);
	console.log(await runCli(argv));

	// CI gate (plans/023): nonzero exit when the measured budget violates
	// --fail-over ceiling or any --budgets cap. PR-relative deltas compose by
	// running the CLI twice (base + head) in the workflow layer.
	if ((args.failOverBytes !== undefined || args.budgetsPath !== undefined) && args.css) {
		const workspace = createAnalysisWorkspace();
		const files = workspace
			.collectFiles(args.patterns.length > 0 ? args.patterns : ["src/**/*.{ts,tsx}"], args.root)
			.filter((f) => SOURCE_SCANNER_SERVICE.isTypeScriptFile(f));
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

const invokedDirectly =
	process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("analyze/src/cli.ts");
if (invokedDirectly) main();

export { main, parseArgs, collectFiles };
