/**
 * Node-side data gatherer for the studio. Reuses the analyze package's own
 * entry points (runCli / cssBudget / loadTwConfig) — no duplicated analysis
 * logic — plus pure parsers over the generated artifacts.
 */
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectFiles, loadTwConfig } from "../../../../packages/analyze/src/analyze.ts";
import { runCli } from "../../../../packages/analyze/src/cli.ts";
import { classRules, cssBudget, sheetShape } from "../../../../packages/analyze/src/css-budget.ts";
import { examplePreset } from "../../../../packages/pandwind/src/preset/example-preset.ts";
import { buildTokenGraph } from "../../../../packages/pandwind/src/tw/token-graph.ts";
import type { StudioPayload, ThemeVar, TokenSection } from "../types.ts";
import { analyzeStyleUsage } from "./analytics.ts";
import {
	flattenTokenGroups,
	parseBridgeStats,
	parseThemeVars,
	parseUtilityUnions,
} from "./parsers.ts";
import { crawlCssImports } from "./theme-crawl.ts";

const DEFAULT_APP = "apps/example";

/**
 * Build the full studio payload for the given repo root (default: this repo).
 *
 * Override target via env vars to point the studio at an external project:
 *   INSPECTOR_ROOT=/path/to/other-repo INSPECTOR_APP=packages/geos pnpm dev
 * `INSPECTOR_APP` is resolved as `<root>/<app>/src`. Artifacts specific to the
 * pandwind dogfood app (examplePreset tokens, bridge.ts, pandwind-theme.css)
 * are optional and degrade to empty when the target app doesn't have them.
 */
export async function gather(repoRoot?: string): Promise<StudioPayload> {
	const root =
		repoRoot ?? process.env.INSPECTOR_ROOT ?? resolve(import.meta.dirname, "../../../..");
	const APP = process.env.INSPECTOR_APP ?? DEFAULT_APP;
	const isDogfoodApp = APP === DEFAULT_APP;
	const appSrc = (p: string): string => resolve(root, APP, "src", p);

	// --- coverage: the CLI is the single interface to fold analysis.
	const summaryJson = await runCli([
		"**/*.{ts,tsx}",
		"--tw",
		appSrc("tw.ts"),
		"--root",
		root,
		"--json",
	]);
	const summary = JSON.parse(summaryJson) as {
		eliminatedPct: number;
		entryEliminatedPct: number;
		totalCxCalls: number;
		fullFolded: number;
		partialFolded: number;
		runtimeCalls: number;
		totalTwCalls: number;
		twFolded: number;
		totalMissingCss: number;
		files: Array<{
			file: string;
			eliminatedPct: number;
			cxCalls: number;
			cxFoldedFull: number;
			cxFoldedPartial: number;
			cxRuntime: number;
			missingCss: Array<{ line: number; token: string }>;
			runtimeSites: Array<{ line: number; reason: string }>;
		}>;
	};

	let themeCss = "";
	try {
		themeCss = readFileSync(appSrc("pandwind-theme.css"), "utf8");
	} catch {
		themeCss = "";
	}
	const budgetPromise = cssBudget({
		files: collectFiles(["**/*.{ts,tsx}"], root).filter((f) => f.includes(`${APP}/src`)),
		twEntry: appSrc("tw.ts"),
		themeCss: themeCss || undefined,
		base: appSrc("."),
	});
	const budget = await budgetPromise;
	const shape = await sheetShape({
		files: collectFiles(["**/*.{ts,tsx}"], root).filter((f) => f.includes(`${APP}/src`)),
		twEntry: appSrc("tw.ts"),
		themeCss: themeCss || undefined,
		base: appSrc("."),
	});

	// Per-class rule drill-down data (capped: the UI searches, not paginates).
	const drills = await classRules({
		files: collectFiles(["**/*.{ts,tsx}"], root).filter((f) => f.includes(`${APP}/src`)),
		twEntry: appSrc("tw.ts"),
		themeCss: themeCss || undefined,
		base: appSrc("."),
	});
	const classDrillDown = drills.slice(0, 400).map((d) => ({
		candidate: d.candidate,
		rules: d.rules.slice(0, 8),
	}));

	const files = summary.files.map((f) => ({
		file: f.file,
		eliminatedPct: f.eliminatedPct,
		cxCalls: f.cxCalls,
		cxFoldedFull: f.cxFoldedFull,
		cxFoldedPartial: f.cxFoldedPartial,
		cxRuntime: f.cxRuntime,
		missingCssCount: f.missingCss.length,
	}));
	const runtimeSites = summary.files.flatMap((f) =>
		f.runtimeSites.map((s) => ({ file: f.file, line: s.line, token: s.reason })),
	);
	const missingCssSites = summary.files.flatMap((f) =>
		f.missingCss.map((s) => ({ file: f.file, line: s.line, token: s.token })),
	);

	// --- design system: generated artifacts + preset tokens.
	const utilities = parseUtilityUnions(readFileSync(appSrc("types.d.ts"), "utf8"));
	const config = loadTwConfig(appSrc("tw.ts"));
	let bridgeSource = "";
	try {
		bridgeSource = readFileSync(appSrc("bridge.ts"), "utf8");
	} catch {
		bridgeSource = "";
	}
	const bridgeStats = parseBridgeStats(bridgeSource);

	const presetTokens = isDogfoodApp
		? ((
				examplePreset as unknown as {
					tokens?: Record<string, Record<string, unknown>>;
				}
			).tokens ?? {})
		: {};
	const tokenSections: Array<TokenSection> = flattenTokenGroups(presetTokens, {
		colors: "Colors",
		semantic: "Semantic (condition-bound)",
		spacing: "Spacing",
		radii: "Radii",
		fonts: "Font families",
		fontSizes: "Font sizes",
		fontWeights: "Font weights",
		lineHeights: "Line heights",
		letterSpacings: "Letter spacings",
	});

	// --- transitive css imports: @theme tokens live in imported files too
	// (e.g. styles.css does `@import 'shadcn/tailwind.css'`).
	let entryCss: string[] = [];
	try {
		// collectFiles filters to .ts/.tsx by design — glob css directly.
		entryCss = globSync("**/*.css", { cwd: resolve(root, APP, "src") }).map((f) =>
			resolve(root, APP, "src", f),
		);
	} catch {
		entryCss = [];
	}
	const crawled = crawlCssImports(entryCss, root);
	const crawledVars = new Map<string, ThemeVar>();
	for (const file of crawled.contents) {
		for (const v of parseThemeVars(file.content)) crawledVars.set(v.name, v);
	}
	for (const v of parseThemeVars(themeCss)) crawledVars.set(v.name, v);
	const mergedThemeVars = [...crawledVars.values()];

	// --- usage analytics over the app's styling call sites.
	const appSourceFiles = collectFiles(["**/*.{ts,tsx}"], root)
		.filter((f) => f.includes(`${APP}/src`))
		.map((f) => ({ file: f, content: readFileSync(f, "utf8") }));
	const tokenUniverse = Object.entries(presetTokens).flatMap(([group, values]) =>
		Object.keys(values as Record<string, unknown>).map((k) => `${group}/${k}`),
	);
	const analytics = analyzeStyleUsage(appSourceFiles, tokenUniverse);

	const tokenGraph = buildTokenGraph({
		flatVars: mergedThemeVars,
		themes: isDogfoodApp ? (examplePreset as unknown as { themes?: never }).themes : undefined,
		components: isDogfoodApp
			? (examplePreset as unknown as { components?: never }).components
			: undefined,
	});

	return {
		meta: { root },
		tokenGraph,
		coverage: {
			eliminatedPct: summary.eliminatedPct,
			entryEliminatedPct: summary.entryEliminatedPct,
			totalCxCalls: summary.totalCxCalls,
			fullFolded: summary.fullFolded,
			partialFolded: summary.partialFolded,
			runtimeCalls: summary.runtimeCalls,
			totalTwCalls: summary.totalTwCalls,
			twFolded: summary.twFolded,
			totalMissingCss: summary.totalMissingCss,
			files,
			runtimeSites,
			missingCssSites,
			budget,
			shape,
		},
		classDrillDown,
		analytics,
		cssCrawl: {
			files: crawled.files.length,
			unresolved: crawled.unresolved.slice(0, 20),
		},
		designSystem: {
			themeVars: mergedThemeVars,
			utilities,
			variantCount: Object.keys(config.variants ?? {}).length,
			conflictUtilities: Object.keys(config.conflicts ?? {}).length,
			composeUtilities: config.compose?.length ?? 0,
			bridgeProperties: bridgeStats.properties,
			bridgeMappings: bridgeStats.mappings,
			tokenSections,
		},
	};
}
