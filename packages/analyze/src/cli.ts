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

interface CliArgs {
	patterns: Array<string>;
	twPath: string;
	json: boolean;
	root: string;
}

function parseArgs(argv: Array<string>): CliArgs {
	const patterns: Array<string> = [];
	let twPath = "src/tw.ts";
	let json = false;
	let root = process.cwd();
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--tw") {
			twPath = argv[++i] ?? twPath;
		} else if (arg === "--json") {
			json = true;
		} else if (arg === "--root") {
			root = resolve(process.cwd(), argv[++i] ?? ".");
		} else if (arg !== undefined) {
			patterns.push(arg);
		}
	}
	return { patterns, twPath: resolve(root, twPath), json, root };
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const patterns = args.patterns.length > 0 ? args.patterns : ["src/**/*.{ts,tsx}"];
	const config = loadTwConfig(args.twPath);
	const files = collectFiles(patterns, args.root).filter(
		(f) => f.endsWith(".ts") || f.endsWith(".tsx"),
	);

	const stats = files.map((file) =>
		analyzeSource(readFileSync(file, "utf8"), file.replace(args.root + "/", ""), { config }),
	);
	const summary: FoldSummary = summarize(stats);

	if (args.json) {
		console.log(JSON.stringify(summary, null, 2));
		return;
	}
	console.log(formatReport(summary));
}

const invokedDirectly =
	process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("analyze/src/cli.ts");
if (invokedDirectly) main();

export { main, parseArgs, collectFiles };
