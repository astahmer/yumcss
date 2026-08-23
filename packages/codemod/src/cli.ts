/**
 * pandwind-codemod CLI.
 *
 * Usage:
 *   node --import tsx src/cli.ts <globs...> --to=tw|cx|css|keep [--diff] [--write]
 *
 * Default is analysis mode: reports what WOULD change without touching
 * files. `--diff` prints unified diffs; `--write` applies. The two are not
 * mutually exclusive — `--diff --write` shows the diffs while writing.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { loadMetaFromSources, type PandwindMeta } from "./meta.ts";
import { transformSource, type MigrateMode, type TransformResult } from "./migrate.ts";
import { parseSourceList } from "./sources.ts";

interface CliArgs {
	patterns: string[];
	mode: MigrateMode;
	diff: boolean;
	report: boolean;
	write: boolean;
	metaDir: string;
	skipMarker: string;
	sources: ReturnType<typeof parseSourceList>;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		patterns: [],
		mode: "keep",
		diff: false,
		write: false,
		metaDir: "",
		skipMarker: "pandwind:migrate-skip",
		report: false,
		sources: [],
	};
	for (const arg of argv) {
		if (arg.startsWith("--to=")) {
			const mode = arg.slice("--to=".length) as MigrateMode;
			if (!["tw", "cx", "css", "keep"].includes(mode)) {
				throw new Error(`codemod: unknown --to mode '${mode}' (expected tw|cx|css|keep)`);
			}
			args.mode = mode;
		} else if (arg === "--diff") {
			args.diff = true;
		} else if (arg === "--report") {
			args.report = true;
		} else if (arg === "--write") {
			args.write = true;
		} else if (arg.startsWith("--meta=")) {
			args.metaDir = arg.slice("--meta=".length);
		} else if (arg.startsWith("--skip-marker=")) {
			args.skipMarker = arg.slice("--skip-marker=".length);
		} else if (arg.startsWith("--from=")) {
			args.sources = parseSourceList(arg.slice("--from=".length));
		} else if (arg.startsWith("--")) {
			throw new Error(`codemod: unknown flag '${arg}'`);
		} else {
			args.patterns.push(arg);
		}
	}
	if (args.patterns.length === 0) {
		throw new Error(
			"codemod: no input patterns given.\n" +
				"usage: pandwind-codemod <globs...> --to=tw|cx|css|keep [--diff] [--write] [--meta=<dir>]\n      [--from=styled-components,stylex,panda]",
		);
	}
	return args;
}

function expandPatterns(patterns: string[], baseDir: string): string[] {
	const files = new Set<string>();
	for (const pattern of patterns) {
		const absolute = resolve(baseDir, pattern);
		let stat;
		try {
			stat = statSync(absolute);
		} catch {
			// Not a literal path — treat as a glob.
		}
		if (stat?.isDirectory()) {
			addDirectory(files, absolute);
			continue;
		}
		if (stat?.isFile()) {
			files.add(absolute);
			continue;
		}
		for (const file of globSync(pattern, { cwd: baseDir })) {
			const resolved = resolve(baseDir, file);
			try {
				if (statSync(resolved).isFile()) files.add(resolved);
			} catch {
				// ignore unreadable entries
			}
		}
	}
	return [...files].toSorted();
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function addDirectory(files: Set<string>, directory: string): void {
	let entries;
	try {
		entries = globSync("**/*", {
			cwd: directory,
			exclude: (p) => statSync(resolve(directory, p)).isDirectory(),
		});
	} catch {
		return;
	}
	for (const entry of entries) {
		const dot = entry.lastIndexOf(".");
		if (dot !== -1 && SOURCE_EXTENSIONS.has(entry.slice(dot))) {
			files.add(resolve(directory, entry));
		}
	}
}

/**
 * Real unified diff: trims the common prefix/suffix, then LCS-aligns the
 * remainder so insertions/deletions produce proper hunks with correct line
 * numbers (the previous line-by-line walk misaligned every hunk after an
 * insertion).
 */
export function unifiedDiff(before: string, after: string, file: string): string {
	if (before === after) return "";
	const a = before.split("\n");
	const b = after.split("\n");
	// common prefix / suffix trimming keeps the LCS table small
	let pre = 0;
	while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
	let suf = 0;
	while (
		suf < a.length - pre &&
		suf < b.length - pre &&
		a[a.length - 1 - suf] === b[b.length - 1 - suf]
	)
		suf++;
	const ca = a.slice(pre, a.length - suf);
	const cb = b.slice(pre, b.length - suf);

	// LCS table over the trimmed remainder
	const dp: Array<Array<number>> = Array.from({ length: ca.length + 1 }, () =>
		Array.from({ length: cb.length + 1 }, () => 0 as number),
	);
	for (let i = ca.length - 1; i >= 0; i--) {
		for (let j = cb.length - 1; j >= 0; j--) {
			dp[i]![j] =
				ca[i] === cb[j]
					? (dp[i + 1]?.[j + 1] ?? 0) + 1
					: Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
		}
	}
	type Op = { kind: "-" | "+" | " "; text: string; aLine?: number; bLine?: number };
	const ops: Op[] = [];
	for (const [k, text] of a.slice(0, pre).entries())
		ops.push({ kind: " ", text, aLine: k + 1, bLine: k + 1 });
	let i = 0;
	let j = 0;
	while (i < ca.length && j < cb.length) {
		if (ca[i] === cb[j]) {
			ops.push({ kind: " ", text: ca[i]!, aLine: pre + i + 1, bLine: pre + j + 1 });
			i++;
			j++;
		} else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
			ops.push({ kind: "-", text: ca[i]!, aLine: pre + i + 1 });
			i++;
		} else {
			ops.push({ kind: "+", text: cb[j]!, bLine: pre + j + 1 });
			j++;
		}
	}
	while (i < ca.length) {
		ops.push({ kind: "-", text: ca[i]!, aLine: pre + i + 1 });
		i++;
	}
	while (j < cb.length) {
		ops.push({ kind: "+", text: cb[j]!, bLine: pre + j + 1 });
		j++;
	}
	for (const [k, text] of a.slice(a.length - suf).entries()) {
		ops.push({ kind: " ", text, aLine: a.length - suf + k + 1, bLine: b.length - suf + k + 1 });
	}

	// group into hunks with up to 3 context lines around changes
	const lines: string[] = [`--- a/${file}`, `+++ b/${file}`];
	let idx = 0;
	while (idx < ops.length) {
		if (ops[idx]!.kind === " ") {
			idx++;
			continue;
		}
		let start = Math.max(0, idx - 3);
		let end = idx;
		while (end < ops.length) {
			if (ops[end]!.kind !== " ") {
				end++;
				continue;
			}
			// lookahead: stop after 3 consecutive context lines
			let run = 0;
			let probe = end;
			while (probe < ops.length && ops[probe]!.kind === " ") {
				run++;
				probe++;
				if (run >= 3) break;
			}
			end =
				run >= 3
					? end
					: probe < ops.length && ops[probe]!.kind !== " "
						? probe
						: end + Math.min(run, 3);
			break;
		}
		end = Math.min(ops.length, Math.max(end, idx + 1));
		const slice = ops.slice(start, end);
		const aStart = slice.find((o) => o.aLine !== undefined)?.aLine ?? 0;
		const bStart = slice.find((o) => o.bLine !== undefined)?.bLine ?? 0;
		lines.push(
			`@@ -${aStart},${slice.filter((o) => o.kind !== "+").length} +${bStart},${slice.filter((o) => o.kind !== "-").length} @@`,
		);
		for (const op of slice) lines.push(`${op.kind}${op.text}`);
		idx = end;
	}
	return lines.join("\n");
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

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const root = findRepoRoot();
	const metaDir =
		args.metaDir !== "" ? resolve(root, args.metaDir) : resolve(root, "apps/example/src");

	let meta: PandwindMeta;
	try {
		meta = loadMetaFromSources({
			typesDtsPath: resolve(metaDir, "types.d.ts"),
			twTsPath: resolve(metaDir, "tw.ts"),
			bridgePath: resolve(metaDir, "bridge.ts"),
		});
	} catch (error) {
		console.error(
			`codemod: failed to load generated metadata from ${metaDir}\n` +
				"  run `pnpm tw:codegen && pnpm tw:bridge` first, or pass --meta=<dir>\n" +
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

	for (const file of filePaths) {
		const relative = file.slice(root.length + 1);
		let source: string;
		try {
			source = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const result: TransformResult = transformSource(source, meta, {
			mode: args.mode,
			file: relative,
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
		if (args.write) writeFileSync(file, result.code);
		console.log(
			`${relative}: ${args.write ? "written" : "would change"} — ${result.converted} call site(s), ` +
				`${result.unmappedTokens.length} token(s) left verbatim` +
				(result.skippedByMarker > 0 ? `, ${result.skippedByMarker} skipped by marker` : ""),
		);
	}

	console.log(
		`\nsummary: ${filePaths.length} file(s) scanned · ${totalChanged} changed · ` +
			`${totalConverted} converted · ${totalUnmapped} verbatim token(s) · mode=${args.mode} · ` +
			(args.write ? "WRITTEN" : "dry-run (use --write to apply)"),
	);

	if (args.report) {
		// Migration-completeness score: how much of the scanned class-string
		// surface flows through pandwind APIs vs what stays manual.
		const totalSkipped = fileResults.reduce((acc, f) => acc + f.result.skippedByMarker, 0);
		const totalVerbatim = fileResults.reduce((acc, f) => acc + f.result.unmappedTokens.length, 0);
		const manualWork = fileResults.filter(
			(f) => f.result.skippedByMarker > 0 || f.result.unmappedTokens.length > 0,
		);
		const totalSites = totalConverted + totalSkipped;
		console.log("\nmigration report:");
		console.log(
			`  call sites through pandwind: ${totalConverted}/${totalSites}` +
				(totalSites > 0 ? ` (${Math.round((totalConverted / totalSites) * 100)}%)` : ""),
		);
		console.log(`  flagged for manual work: ${totalSkipped} site(s)`);
		console.log(`  tokens kept verbatim (unknown to metadata): ${totalVerbatim}`);
		if (manualWork.length > 0) {
			console.log("  files needing attention:");
			for (const f of manualWork.slice(0, 20)) {
				console.log(
					`    - ${f.relative}: ${f.result.skippedByMarker} flagged, ${f.result.unmappedTokens.length} verbatim`,
				);
			}
			if (manualWork.length > 20) console.log(`    … and ${manualWork.length - 20} more`);
		}
	}
}
// Run only when invoked as the CLI entry — importing the module from
// tests must not execute the program.
const invokedDirectly = /cli\.mts?$/.test(process.argv[1] ?? "");
if (invokedDirectly) void main();
