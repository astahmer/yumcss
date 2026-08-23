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

interface CliArgs {
	patterns: string[];
	mode: MigrateMode;
	diff: boolean;
	write: boolean;
	metaDir: string;
	skipMarker: string;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		patterns: [],
		mode: "keep",
		diff: false,
		write: false,
		metaDir: "",
		skipMarker: "pandwind:migrate-skip",
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
		} else if (arg === "--write") {
			args.write = true;
		} else if (arg.startsWith("--meta=")) {
			args.metaDir = arg.slice("--meta=".length);
		} else if (arg.startsWith("--skip-marker=")) {
			args.skipMarker = arg.slice("--skip-marker=".length);
		} else if (arg.startsWith("--")) {
			throw new Error(`codemod: unknown flag '${arg}'`);
		} else {
			args.patterns.push(arg);
		}
	}
	if (args.patterns.length === 0) {
		throw new Error(
			"codemod: no input patterns given.\n" +
				"usage: pandwind-codemod <globs...> --to=tw|cx|css|keep [--diff] [--write] [--meta=<dir>]",
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

function unifiedDiff(before: string, after: string, file: string): string {
	if (before === after) return "";
	const beforeLines = before.split("\n");
	const afterLines = after.split("\n");
	const lines: string[] = [`--- a/${file}`, `+++ b/${file}`];
	const max = Math.max(beforeLines.length, afterLines.length);
	let i = 0;
	while (i < max) {
		if (beforeLines[i] !== afterLines[i]) {
			lines.push(`@@ -${i + 1} +${i + 1} @@`);
			if (beforeLines[i] !== undefined) lines.push(`-${beforeLines[i]}`);
			if (afterLines[i] !== undefined) lines.push(`+${afterLines[i]}`);
		}
		i++;
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

	const files = expandPatterns(args.patterns, root);
	if (files.length === 0) {
		console.error("codemod: no matching files");
		process.exitCode = 1;
		return;
	}

	let totalConverted = 0;
	let totalChanged = 0;
	let totalUnmapped = 0;

	for (const file of files) {
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
		});
		totalConverted += result.converted;
		totalUnmapped += result.unmappedTokens.length;

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
		`\nsummary: ${files.length} file(s) scanned · ${totalChanged} changed · ` +
			`${totalConverted} converted · ${totalUnmapped} verbatim token(s) · mode=${args.mode} · ` +
			(args.write ? "WRITTEN" : "dry-run (use --write to apply)"),
	);
}

main();
