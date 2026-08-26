/**
 * `pandwind analyze` CLI — reports how much class-merging work the build
 * eliminates for the given files.
 *
 * Usage:
 *   pnpm analyze [globs...] [--tw <generated-tw.ts>] [--json] [--root <dir>]
 *
 * Defaults: globs = all .ts/.tsx under ./src, tw = "./src/tw.ts", root = cwd.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	analyzeSource,
	collectFiles,
	formatReport,
	loadTwConfig,
	summarize,
	type FoldSummary,
} from "./analyze.ts";
import { cssBudget, formatCssBudget } from "./css-budget.ts";
import { collectAnnotations, formatAnnotations } from "./github-annotations.ts";

interface CliArgs {
	patterns: Array<string>;
	twPath: string;
	json: boolean;
	root: string;
	css: boolean;
	githubAnnotations: boolean;
	constantsPath?: string;
}

/** Version tag stamped into `--json` output for consumers. */
export const ANALYZE_JSON_SCHEMA = "pandwind.analyze/1";

function parseArgs(argv: Array<string>): CliArgs {
	const patterns: Array<string> = [];
	let twPath = "src/tw.ts";
	let json = false;
	let css = false;
	let githubAnnotations = false;
	let root = process.cwd();
	let constantsPath: string | undefined;
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
	};
}

/**
 * Run the CLI and return the exact text it would print (human table or JSON
 * document). Pure apart from filesystem reads — tests assert on the return
 * value instead of spying on console.log.
 */
export async function runCli(argv: Array<string>): Promise<string> {
	const args = parseArgs(argv);
	const patterns = args.patterns.length > 0 ? args.patterns : ["src/**/*.{ts,tsx}"];
	const config = loadTwConfig(args.twPath);
	const importedConstants = args.constantsPath
		? (JSON.parse(readFileSync(args.constantsPath, "utf8")) as Record<string, string>)
		: undefined;
	const files = collectFiles(patterns, args.root).filter(
		(f) => f.endsWith(".ts") || f.endsWith(".tsx"),
	);

	const stats = files.map((file) =>
		analyzeSource(readFileSync(file, "utf8"), file.replace(args.root + "/", ""), {
			config,
			importedConstants,
		}),
	);
	const summary: FoldSummary = summarize(stats);

	if (args.json) {
		// Machine consumers (the reusable analyze-comment workflow) need the
		// missing-CSS lane and the CSS size budget in the same document.
		const missingSites = stats.flatMap((s) =>
			s.missingCss.map((m) => ({ file: s.file, line: m.line, token: m.token })),
		);
		let cssBudgetJson: Record<string, unknown> | undefined;
		if (args.css) {
			const themeCssPath = resolve(args.root, "src/pandwind-theme.css");
			let themeCss: string | undefined;
			try {
				themeCss = readFileSync(themeCssPath, "utf8");
			} catch {
				themeCss = undefined;
			}
			const budget = await cssBudget({
				files: files.map((f) => resolve(args.root, f)),
				twEntry: args.twPath,
				themeCss,
				base: args.root,
			});
			cssBudgetJson = {
				liveCandidates: budget.liveCandidates,
				deadCandidates: budget.deadCandidates,
				cssBytes: budget.cssBytes,
				cssGzipBytes: budget.cssGzipBytes,
				rules: budget.rules,
			};
		}
		return JSON.stringify(
			{
				schema: ANALYZE_JSON_SCHEMA,
				...summary,
				missingCss: { count: missingSites.length, sites: missingSites.slice(0, 50) },
				...(cssBudgetJson !== undefined ? { cssBudget: cssBudgetJson } : {}),
			},
			null,
			2,
		);
	}
	if (args.css && !args.json) {
		// CSS budget lane (human format; --json embeds the budget above) — compiles the scanned tw() surface through the
		// real engine. Needs the generated tw runtime (same file the app
		// imports) and optionally the @theme bridge for token utilities.
		const themeCssPath = resolve(args.root, "src/pandwind-theme.css");
		let themeCss: string | undefined;
		try {
			themeCss = readFileSync(themeCssPath, "utf8");
		} catch {
			themeCss = undefined;
		}
		const budget = await cssBudget({
			files: files.map((f) => resolve(args.root, f)),
			twEntry: args.twPath,
			themeCss,
			base: args.root,
		});
		return formatCssBudget(budget);
	}

	if (args.githubAnnotations) {
		const annotations = collectAnnotations(summary, undefined);
		const truncated = false;
		return formatAnnotations(annotations, truncated);
	}
	return formatReport(summary);
}

async function main(): Promise<void> {
	console.log(await runCli(process.argv.slice(2)));
}

const invokedDirectly =
	process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("analyze/src/cli.ts");
if (invokedDirectly) main();

export { main, parseArgs, collectFiles };
