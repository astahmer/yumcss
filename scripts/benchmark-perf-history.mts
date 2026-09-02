/**
 * Replay the recent runtime/tooling optimization history in disposable Git
 * worktrees and measure the affected hot paths with the same process shape.
 *
 * This is intentionally a manual evidence tool, not a CI gate: throughput is
 * machine-dependent. It never changes a JJ workspace or the user's source
 * tree. Each checkout receives only temporary dependency links and is removed
 * before the next revision is measured.
 *
 * Usage:
 *   nub scripts/benchmark-perf-history.mts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const ROOT = resolve(import.meta.dirname, "..");

const REVISIONS = [
	{
		label: "baseline",
		change: "test(vite): snapshot extraction artifacts",
		commit: "b33a64cd510f64b0cc56f8813a96c61b24c4e53b",
	},
	{
		label: "perf/runtime",
		change: "perf(runtime): cache immutable style artifacts",
		commit: "a8d5baf151ad2fdf6e9159c35c760183e4cc5c62",
	},
	{
		label: "perf/tw",
		change: "perf(tw): specialize conflict-free compilation",
		commit: "2506a5fdb9a48408d20b74f6c5f1e4a15b158d08",
	},
	{
		label: "perf/codemod-edit",
		change: "perf(codemod): fast-path trivial source edits",
		commit: "1e2eaeb395093c735f18f532faac4bff48e05ff7",
	},
	{
		label: "perf/codemod-engine",
		change: "perf(codemod): cache bounded engine miss resolution",
		commit: "b030d0159f9f7de475af2e258fbad12eb8013611",
	},
	{
		label: "perf/css",
		change: "perf(css): reduce stylesheet path allocations",
		commit: "f03e5864b0bd49532bba3d523bbbcac68d062fc1",
	},
	{
		label: "perf/vite",
		change: "perf(vite): reuse runtime-pruner traversal stack",
		commit: "fa0dea275535e5f90b32c7e646e791b46eae8a72",
	},
	{
		label: "docs/perf",
		change: "docs(perf): record bounded optimization evidence",
		commit: "8034414f1cfa33cbfe72398c90e2a8ca2191b5b8",
	},
] as const;

type BenchmarkName =
	| "css-call"
	| "tw-call"
	| "cx-call"
	| "stylesheet-process"
	| "stylesheet-tokens"
	| "runtime-pruner"
	| "source-edit"
	| "engine-miss";

type BenchmarkResult = Record<BenchmarkName, number>;

const benchmark = (fn: () => void, iterations: number): number => {
	for (let index = 0; index < 1_000; index += 1) fn();
	const samples: number[] = [];
	for (let sample = 0; sample < 5; sample += 1) {
		const start = performance.now();
		for (let index = 0; index < iterations; index += 1) fn();
		const elapsed = performance.now() - start;
		samples.push((iterations / elapsed) * 1_000);
	}
	samples.sort((left, right) => left - right);
	return Math.round(samples[Math.floor(samples.length / 2)]!);
};

const importFrom = async (worktree: string, file: string): Promise<Record<string, unknown>> =>
	(await import(pathToFileURL(join(worktree, file)).href)) as Record<string, unknown>;

const prepareWorktree = (worktree: string, commit: string): void => {
	// A previous interrupted local replay may leave the exact disposable path
	// behind. It is safe to remove only this generated, commit-named directory.
	if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
	execFileSync("git", ["worktree", "add", "--detach", worktree, commit], {
		cwd: ROOT,
		stdio: "ignore",
	});
	const historicalRootNodeModules = join(worktree, "node_modules");
	if (!existsSync(historicalRootNodeModules)) {
		symlinkSync(join(ROOT, "node_modules"), historicalRootNodeModules, "dir");
	}
	// The package manager's linked workspace dependency points at the active
	// checkout. Replace only the temporary codemod link so its source-pass
	// benchmark resolves the historical pandwind package too.
	const codemodNodeModules = join(worktree, "packages", "codemod", "node_modules");
	const pandwindNodeModules = join(worktree, "packages", "pandwind", "node_modules");
	mkdirSync(codemodNodeModules, { recursive: true });
	mkdirSync(pandwindNodeModules, { recursive: true });
	const currentCodemodNodeModules = join(ROOT, "packages", "codemod", "node_modules");
	if (existsSync(currentCodemodNodeModules)) {
		for (const dependency of readdirSync(currentCodemodNodeModules)) {
			if (dependency === "pandwind") continue;
			const target = join(codemodNodeModules, dependency);
			if (!existsSync(target)) {
				symlinkSync(join(currentCodemodNodeModules, dependency), target, "dir");
			}
		}
	}
	const currentPandwindNodeModules = join(ROOT, "packages", "pandwind", "node_modules");
	if (existsSync(currentPandwindNodeModules)) {
		for (const dependency of readdirSync(currentPandwindNodeModules)) {
			const target = join(pandwindNodeModules, dependency);
			if (!existsSync(target)) {
				symlinkSync(join(currentPandwindNodeModules, dependency), target, "dir");
			}
		}
	}
	const historicalPandwind = join(codemodNodeModules, "pandwind");
	if (!existsSync(historicalPandwind)) {
		symlinkSync(join(worktree, "packages", "pandwind"), historicalPandwind, "dir");
	}
	// Older points in this window still import the direct `flattie` dependency
	// that the current branch intentionally removed. Reuse the already pinned
	// pnpm store entry without changing the historical package manifest.
	const pnpmStore = join(ROOT, "node_modules", ".pnpm");
	const flattieStoreEntry = existsSync(pnpmStore)
		? readdirSync(pnpmStore).find((entry) => entry.startsWith("flattie@"))
		: undefined;
	const historicalFlattie = join(pandwindNodeModules, "flattie");
	if (flattieStoreEntry !== undefined && !existsSync(historicalFlattie)) {
		symlinkSync(
			join(pnpmStore, flattieStoreEntry, "node_modules", "flattie"),
			historicalFlattie,
			"dir",
		);
	}
};

const removeWorktree = (worktree: string): void => {
	try {
		execFileSync("git", ["worktree", "remove", "--force", worktree], {
			cwd: ROOT,
			stdio: "ignore",
		});
	} finally {
		if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
	}
};

const runRevision = async (worktree: string): Promise<BenchmarkResult> => {
	// These are deliberately resolved inside the isolated historical worktree;
	// using today's package exports here would benchmark the current tip rather
	// than the revision named by the benchmark record.
	const cssModule = await importFrom(worktree, "packages/pandwind/src/css/create-css.ts");
	const presetModule = await importFrom(worktree, "packages/pandwind/src/preset/example-preset.ts");
	const stylesheetModule = await importFrom(
		worktree,
		"packages/pandwind/src/css/create-stylesheet.ts",
	);
	const twModule = await importFrom(worktree, "packages/pandwind/src/tw/compile.ts");
	const cxModule = await importFrom(worktree, "packages/pandwind/src/cx/index.ts");
	const prunerModule = await importFrom(worktree, "packages/pandwind/src/vite/runtime-pruner.ts");
	const sourcePassModule = await importFrom(worktree, "packages/codemod/src/source-pass-utils.ts");
	const engineModule = await importFrom(worktree, "packages/codemod/src/swap/engine.ts");

	const preset = presetModule.examplePreset;
	const createCss = cssModule.createCss as (preset: unknown) => {
		class: (style: Record<string, unknown>) => string;
	};
	const css = createCss(preset);
	const compileStyles = twModule.compileStyles as (
		style: Record<string, unknown>,
		variants: Record<string, unknown>,
	) => string;
	const createCx = cxModule.createCx as () => (...values: string[]) => string;
	const cx = createCx();
	const createStylesheet = stylesheetModule.createStylesheet as (preset: unknown) => {
		process: (styles: Array<Record<string, unknown>>) => unknown;
		gen: { tokens: () => string };
	};
	const sheet = createStylesheet(preset);
	const createRuntimePruningTransform = prunerModule.createRuntimePruningTransform as () => {
		transform: (source: string, file: string) => unknown;
	};
	const pruner = createRuntimePruningTransform();
	const SourcePass = sourcePassModule.SourcePass as {
		applyEdits: (
			source: string,
			edits: readonly [{ readonly start: number; readonly end: number; readonly text: string }],
		) => string;
	};
	const createEngineMissResolver = engineModule.createEngineMissResolver as (options: {
		css: string;
		base: string;
	}) => Promise<(utilityClass: string) => readonly unknown[] | null>;
	const engineResolver = await createEngineMissResolver({
		css: "@theme { --color-blue-500: #3b82f6; }",
		base: worktree,
	});

	const cssStyle = {
		display: "flex",
		alignItems: "center",
		gap: "8px",
		padding: "12px",
		borderRadius: "6px",
		backgroundColor: "#3182ce",
		color: "#ffffff",
		fontWeight: 600,
		_hover: { backgroundColor: "#2b6cb0" },
	};
	const twStyle = {
		display: "flex",
		alignItems: "center",
		gap: "2",
		padding: "3",
		rounded: "md",
		bg: "blue-600",
		text: "white",
	};
	const source = `import { createCss } from "pandwind/css";\nconst css = createCss();\nexport const card = css.class({ color: "red" });`;
	const file = join(worktree, "packages/pandwind/tests/fixtures/perf-history.ts");

	return {
		"css-call": benchmark(() => css.class(cssStyle), 40_000),
		"tw-call": benchmark(() => compileStyles(twStyle, {}), 80_000),
		"cx-call": benchmark(() => cx("flex items-center gap-2", "grid gap-4"), 80_000),
		"stylesheet-process": benchmark(() => sheet.process([cssStyle]), 40_000),
		"stylesheet-tokens": benchmark(() => sheet.gen.tokens(), 80_000),
		"runtime-pruner": benchmark(() => pruner.transform(source, file), 3_000),
		"source-edit": benchmark(
			() => SourcePass.applyEdits(source, [{ start: 0, end: 0, text: "// generated\n" }]),
			80_000,
		),
		"engine-miss": benchmark(() => engineResolver("bg-blue-500"), 3_000),
	};
};

const main = async (): Promise<void> => {
	console.log(JSON.stringify({ machine: process.platform, node: process.version }));
	for (const revision of REVISIONS) {
		const worktree = join(tmpdir(), `pandwind-perf-history-${revision.commit.slice(0, 12)}`);
		try {
			prepareWorktree(worktree, revision.commit);
			const result = await runRevision(worktree);
			console.log(JSON.stringify({ ...revision, result }));
		} finally {
			removeWorktree(worktree);
		}
	}
};

await main();
