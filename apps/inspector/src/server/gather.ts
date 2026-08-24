/**
 * Node-side data gatherer for the studio. Reuses the analyze package's own
 * entry points (runCli / cssBudget / loadTwConfig) — no duplicated analysis
 * logic — plus pure parsers over the generated artifacts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectFiles, loadTwConfig } from "../../../../packages/analyze/src/analyze.ts";
import { runCli } from "../../../../packages/analyze/src/cli.ts";
import {
	classRules,
	cssBudget,
	sheetShape,
} from "../../../../packages/analyze/src/css-budget.ts";
import { examplePreset } from "../../../../packages/pandwind/src/preset/example-preset.ts";
import type { StudioPayload, TokenSection } from "../types.ts";
import {
	flattenTokenGroups,
	parseBridgeStats,
	parseThemeVars,
	parseUtilityUnions,
} from "./parsers.ts";

const APP = "apps/example";

/** Build the full studio payload for the given repo root (default: this repo). */
export async function gather(repoRoot?: string): Promise<StudioPayload> {
	const root = repoRoot ?? resolve(import.meta.dirname, "../../../..");
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
	const themeVars = parseThemeVars(themeCss);
	const utilities = parseUtilityUnions(readFileSync(appSrc("types.d.ts"), "utf8"));
	const config = loadTwConfig(appSrc("tw.ts"));
	const bridgeSource = readFileSync(appSrc("bridge.ts"), "utf8");
	const bridgeStats = parseBridgeStats(bridgeSource);

	const presetTokens =
		(
			examplePreset as unknown as {
				tokens?: Record<string, Record<string, unknown>>;
			}
		).tokens ?? {};
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

	return {
		meta: { root },
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
		designSystem: {
			themeVars,
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
