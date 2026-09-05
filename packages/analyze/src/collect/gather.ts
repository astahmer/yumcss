/**
 * Node-side data gatherer for the studio. Reuses the analyze package's own
 * entry points (runCli / createCssBudgetService / loadTwConfig) — no duplicated analysis
 * logic — plus pure parsers over the generated artifacts.
 */
import { resolve } from "node:path";
import { loadTwConfig } from "../analyze.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { runCli } from "../cli.ts";
import { createCssBudgetService } from "../analysis-service.ts";
import { examplePreset } from "pandwind/preset/example-preset";
import { createStylesheet } from "pandwind/css/create-stylesheet";
import { createCssExtractionService } from "pandwind/vite/css-extract";
import { buildTokenGraph } from "pandwind/tw/token-graph";
import { analyzeStyleUsage, computeContrastWarnings } from "./analytics.ts";
import {
	flattenTokenGroups,
	parseBridgeStats,
	parseThemeScopes,
	parseThemeVars,
	parseUtilityUnions,
} from "./parsers.ts";
import { crawlCssImports } from "./theme-crawl.ts";
import { collectCssReport } from "../css-diagnostics.ts";
import {
	analyzeTokenGovernance,
	buildGovernancePruneChangeset,
	loadOfficialPresetModule,
	projectGovernanceInputs,
} from "../governance/index.ts";
import type { CollectPayload, ThemeVar, TokenSection } from "./types.ts";

const DEFAULT_APP = "apps/example";

/**
 * Build the full studio payload for the given repo root (default: this repo).
 *
 * Override target via env vars to point the studio at an external project:
 *   INSPECTOR_ROOT=/path/to/other-repo INSPECTOR_APP=packages/geos nub run dev
 * `INSPECTOR_APP` is resolved as `<root>/<app>/src`. Artifacts specific to the
 * pandwind dogfood app (examplePreset tokens, bridge.ts, pandwind-theme.css)
 * are optional and degrade to empty when the target app doesn't have them.
 */
export async function gather(repoRoot?: string): Promise<CollectPayload> {
	const root =
		repoRoot ?? process.env.INSPECTOR_ROOT ?? resolve(import.meta.dirname, "../../../..");
	const APP = process.env.INSPECTOR_APP ?? DEFAULT_APP;
	const isDogfoodApp = APP === DEFAULT_APP;
	const sourceWorkspace = createSourceWorkspace();
	const cssBudgetService = createCssBudgetService();
	const cssExtraction = createCssExtractionService({ matchers: [], preset: examplePreset });
	const appSrc = (p: string): string => resolve(root, APP, "src", p);
	const readSourceArtifact = (file: string): string | undefined =>
		sourceWorkspace.read([file])[0]?.source;
	const appSourceFiles = sourceWorkspace
		.collect(["**/*"], root)
		.filter(
			({ path: file }) =>
				file.includes(`${APP}/src`) && SOURCE_SCANNER_SERVICE.isTypeScriptFile(file),
		)
		.map(({ path: file, source: content }) => ({ file, content }));

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
		themeCss = readSourceArtifact(appSrc("pandwind-theme.css")) ?? "";
	} catch {
		themeCss = "";
	}
	const budgetPromise = cssBudgetService.measure({
		files: appSourceFiles.map(({ file }) => file),
		twEntry: appSrc("tw.ts"),
		themeCss: themeCss || undefined,
		base: appSrc("."),
	});
	const budget = await budgetPromise;
	const shape = await cssBudgetService.sheetShape({
		files: appSourceFiles.map(({ file }) => file),
		twEntry: appSrc("tw.ts"),
		themeCss: themeCss || undefined,
		base: appSrc("."),
	});

	// Per-class rule drill-down data (capped: the UI searches, not paginates).
	const drills = await cssBudgetService.classRules({
		files: appSourceFiles.map(({ file }) => file),
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
	const utilities = parseUtilityUnions(readSourceArtifact(appSrc("types.d.ts")) ?? "");
	const config = loadTwConfig(appSrc("tw.ts"));
	let bridgeSource = "";
	try {
		bridgeSource = readSourceArtifact(appSrc("bridge.ts")) ?? "";
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
		entryCss = [
			...sourceWorkspace.files(["**/*.css"], resolve(root, APP, "src"), {
				includeUnsupported: true,
			}),
		];
	} catch {
		entryCss = [];
	}
	const crawled = crawlCssImports(entryCss, root);
	const crawledVars = new Map<string, ThemeVar>();
	const crawledThemes = new Map<string, Record<string, string>>();
	for (const file of crawled.contents) {
		for (const v of parseThemeVars(file.content)) crawledVars.set(v.name, v);
		for (const v of parseThemeScopes(file.content)) {
			crawledVars.set(`${v.scope}\u0000${v.name}`, v);
			const scope = crawledThemes.get(v.scope!) ?? {};
			scope[v.name] = v.value;
			crawledThemes.set(v.scope!, scope);
		}
	}
	for (const v of parseThemeVars(themeCss)) crawledVars.set(v.name, v);
	for (const v of parseThemeScopes(themeCss)) {
		crawledVars.set(`${v.scope}\u0000${v.name}`, v);
		const scope = crawledThemes.get(v.scope!) ?? {};
		scope[v.name] = v.value;
		crawledThemes.set(v.scope!, scope);
	}
	const mergedThemeVars = [...crawledVars.values()];

	// --- usage analytics over the app's styling call sites.
	const cssReport = collectCssReport(appSourceFiles);
	const { authoredCss, cssSources, cssDiagnostics } = cssReport;
	const cssSourcesByStart = new Map(cssSources.map((site) => [`${site.file}:${site.start}`, site]));
	for (const { file, content } of appSourceFiles) {
		const names = cssReport.cssNamesByFile.get(file) ?? new Set<string>();
		for (const extracted of cssExtraction.extract(content, file, names)) {
			const site = cssSourcesByStart.get(`${file}:${extracted.provenance.start}`);
			if (site === undefined) continue;
			const sheet = createStylesheet(examplePreset);
			sheet.process([extracted.style]);
			const rules = sheet.gen.atomicEntries().map(({ id, css }) => ({ id, css }));
			site.rules = [...(site.rules ?? []), ...rules];
		}
	}
	const tokenUniverse = Object.entries(presetTokens).flatMap(([group, values]) =>
		Object.keys(values as Record<string, unknown>).map((k) => `${group}/${k}`),
	);
	const analytics = analyzeStyleUsage(appSourceFiles, tokenUniverse);

	// WCAG contrast: resolve every preset color value once, pair text/bg
	// within the same call-site scope.
	const contrastWarnings = computeContrastWarnings(
		appSourceFiles,
		(presetTokens.colors as Record<string, string> | undefined) ?? {},
	);

	const tokenGraph = buildTokenGraph({
		flatVars: mergedThemeVars,
		themes: {
			...(isDogfoodApp
				? ((examplePreset as unknown as { themes?: Record<string, Record<string, string>> })
						.themes ?? {})
				: {}),
			...Object.fromEntries(crawledThemes),
		},
		components: isDogfoodApp
			? (examplePreset as unknown as { components?: never }).components
			: undefined,
	});

	// --- token governance (plans/054): official-loader policy + effective
	// universe from the preset, theme vars, and interop artifact. A generated
	// safelist file downgrades every unused candidate to review-required (its
	// class strings cannot be attributed to token ids without guessing).
	const presetLoad = await loadOfficialPresetModule(
		isDogfoodApp ? 'pandwind/preset/example-preset' : `./${APP}/src/pandwind.preset.ts`,
		root,
	);
	const { tokenContext, policy } = projectGovernanceInputs(presetLoad);
	let interopVariables: Record<string, string> = {};
	try {
		const interop = JSON.parse(
			readSourceArtifact(appSrc("pandwind.interop.json")) ?? "{}",
		) as { theme?: { variables?: Record<string, string> } };
		if (interop.theme?.variables !== undefined) interopVariables = interop.theme.variables;
	} catch {
		interopVariables = {};
	}
	const safelistSource = readSourceArtifact(appSrc("pandwind.safelist.css")) ?? "";
	const safelistEntries = [...safelistSource.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
	const governance = analyzeTokenGovernance({
		root,
		files: appSourceFiles.map(({ file, content }) => ({
			file: file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file,
			content,
		})),
		policy,
		tokenContext: {
			...tokenContext,
			themeVars: mergedThemeVars,
			interopVariables,
			unresolvedImports: crawled.unresolved,
		},
		...(safelistEntries.length > 0 ? { boundaryHits: { safelist: ["*"] } } : {}),
	});
	const governanceChangeset = buildGovernancePruneChangeset(governance, APP);

	return {
		meta: { root },
		authoredCss,
		cssSources,
		cssDiagnostics,
		tokenGraph,
		governance,
		governanceChangeset,
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
		contrastWarnings,
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
