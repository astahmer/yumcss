/**
 * pandwind-codemod CLI.
 *
 * Usage:
 *   node --import tsx src/cli.ts <globs...> --to=tw|cx|css|keep [--diff] [--write]
 *   node --import tsx src/cli.ts swap --from=<auto|tw|css|design> \
 *        --to=<css.class|design|dss|tw> [--safe|--partial] [--write] [--diff] [--report[=json]] <globs...>
 *
 * Default is analysis mode: reports what WOULD change without touching
 * files. `--diff` prints unified diffs; `--write` applies. The two are not
 * mutually exclusive — `--diff --write` shows the diffs while writing.
 *
 * The `swap` subcommand converts BETWEEN pandwind APIs (plans/022): tw()
 * object literals, css.class()/css() literals and the design vocabulary,
 * plus outbound emission to plain tailwind classes via the tw target.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { loadMetaFromSourcesAsync, type PandwindMeta } from "./meta.ts";
import { transformSource, type MigrateMode, type TransformResult } from "./migrate.ts";
import { parseSourceList } from "./sources.ts";
import * as swapImport from "./swap/index.ts";
import { CodemodAdapterId, SwapTargetId } from "./swap/identifiers.ts";
import { tokenSetCodec } from "./swap/token-set.ts";
import type { TokenFormatId } from "./swap/token-format-contracts.ts";

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
				"usage: pandwind-codemod <globs...> --to=tw|cx|css|keep [--diff] [--write] [--meta=<dir>]\n      [--from=styled-components,stylex]",
		);
	}
	return args;
}

const sourceWorkspace = createSourceWorkspace();

const expandPatterns = (patterns: readonly string[], baseDir: string): string[] => [
	...sourceWorkspace.files(patterns, baseDir),
];

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

async function mainSwap(argv: string[]): Promise<void> {
	const args = swapImport.parseSwapArgs(argv);
	const root = findRepoRoot();
	const filePaths = expandPatterns(args.patterns, root);
	if (isExternalSwap(args)) {
		await runExternalAdapterSwap(args, filePaths, root);
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
			`codemod swap: failed to load generated metadata from ${metaDir}\n` +
				"  run `pnpm tw:codegen && pnpm tw:bridge` first, or pass --meta=<dir>\n" +
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
			write: args.write,
			skipMarker: args.skipMarker,
		});
		return;
	}

	if (filePaths.length === 0) {
		console.error("codemod swap: no matching files");
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
				console.error(`codemod swap: --engine failed to boot (${(error as Error).message})`);
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
			to: args.to,
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
		if (args.write) writeFileSync(file, result.code);
		if (args.reportFormat !== "json")
			console.log(
				`${relative}: ${args.write ? "written" : "would change"} — ${result.converted} call site(s) swapped to ${args.to}, ` +
					`${result.unmappedTokens.length} residual(s), ${result.skippedByMarker} skipped by marker`,
			);
	}

	if (args.reportFormat !== "json")
		console.log(
			`\nsummary: ${filePaths.length} file(s) scanned · ${totalChanged} changed · ` +
				`${totalConverted} swapped · ${totalResiduals} residual(s) · swap ${args.from}->${args.to} · ` +
				(args.write ? "WRITTEN" : "dry-run (use --write to apply)"),
		);

	if (args.report && args.reportFormat === "text") {
		const lines = [
			"swap report:",
			`  call sites through the target API: ${totalConverted}`,
			`  residuals needing attention: ${totalResiduals}`,
		];
		console.log(lines.join("\n"));
	} else if (args.report && args.reportFormat === "json") {
		console.log(
			JSON.stringify({
				from: args.from,
				to: args.to,
				mode: args.capabilityMode ?? "legacy",
				files: reportEntries,
			}),
		);
	}
}

function isExternalAdapterId(value: string): value is import("./swap/index.ts").ExternalAdapterId {
	return swapImport.listCodemodAdapterIds().includes(value);
}

function isExternalSwap(args: swapImport.SwapCliArgs): boolean {
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
	args: swapImport.SwapCliArgs,
	filePaths: Array<string>,
	root: string,
): Promise<void> {
	if (filePaths.length === 0) {
		console.error("codemod swap: no matching files");
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
			`codemod swap: external adapters currently emit to css.class (or an external adapter), not '${args.to}'`,
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
		from: string;
		converted: number;
		skipped: number;
		residuals: number;
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
		const result = await swapImport.runAdapterMigrationAsync(source, {
			from,
			to: target,
			file: relative,
			root,
			mode: args.capabilityMode ?? "safe",
			skipMarker: args.skipMarker,
		});
		reportEntries.push({
			file: relative,
			from,
			converted: result.converted,
			skipped: result.skipped,
			residuals: result.residuals.length,
		});
		totalConverted += result.converted;
		totalSkipped += result.skipped;
		totalResiduals += result.residuals.length;
		if (!result.changed) {
			if (args.reportFormat !== "json") console.log(`${relative}: no changes (${from}->${target})`);
			continue;
		}
		totalChanged++;
		if (args.diff && args.reportFormat !== "json")
			console.log(unifiedDiff(source, result.code, relative));
		if (args.write) writeFileSync(file, result.code);
		if (args.reportFormat !== "json")
			console.log(
				`${relative}: ${args.write ? "written" : "would change"} — ${result.converted} converted, ` +
					`${result.skipped} skipped, ${result.residuals.length} residual(s), ${from}->${target}`,
			);
		if (args.report && args.reportFormat === "text") {
			for (const report of result.reports) {
				if (report.blockers.length > 0)
					console.log(`  blocker: ${report.blockers.map((issue) => issue.detail).join("; ")}`);
			}
		}
	}
	if (args.reportFormat !== "json")
		console.log(
			`\nsummary: ${filePaths.length} file(s) scanned · ${totalChanged} changed · ` +
				`${totalConverted} converted · ${totalSkipped} skipped · ${totalResiduals} residual(s) · ` +
				(args.write ? "WRITTEN" : "dry-run (use --write to apply)"),
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

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
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
async function mainTokens(argv: string[]): Promise<void> {
	let from: string | undefined;
	let to: string | undefined;
	let input: string | undefined;
	let out: string | undefined;
	for (const arg of argv) {
		if (arg.startsWith("--from=")) from = arg.slice("--from=".length);
		else if (arg.startsWith("--to=")) to = arg.slice("--to=".length);
		else if (arg.startsWith("--out=")) out = arg.slice("--out=".length);
		else if (!arg.startsWith("--")) input = arg;
		else throw new Error(`codemod tokens: unknown flag '${arg}' (--from= --to= --out=)`);
	}
	const formats = ["dtcg", "theme", "panda", "preset", "sd", "figma", "rootcss", "stylex"] as const;
	if (from === undefined || !formats.includes(from as TokenFormatId) || input === undefined) {
		throw new Error(
			"usage: pandwind-codemod tokens --from=<dtcg|theme|panda|preset> --to=<dtcg|theme|panda|preset> <file> [--out=<file>]",
		);
	}
	to = to ?? from;

	const set = await tokenSetCodec.fromFile(from as TokenFormatId, resolve(input));

	const groupCount = Object.keys(set.groups).length;
	const tokenCount = Object.values(set.groups).reduce((a, g) => a + Object.keys(g).length, 0);

	const result = tokenSetCodec.to(to as TokenFormatId, set);

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

// Run only when invoked as the CLI entry — importing the module from
// tests must not execute the program.
const invokedDirectly = /cli\.[mc]?[tj]sx?$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
	if (process.argv[2] === "swap") void mainSwap(process.argv.slice(3));
	else if (process.argv[2] === "tokens") void mainTokens(process.argv.slice(3));
	else void main();
}
