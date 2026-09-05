/**
 * Token-governance CLI lane (plans/054 step 8) — one official-preset load,
 * the shared workspace file read, and the governance service compose into
 * the versioned report document. Read-only: the changeset is a proposal,
 * never a write.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createAnalysisWorkspace } from "./analysis-service.ts";
import { parseThemeVars } from "./collect/parsers.ts";
import {
	analyzeTokenGovernance,
	buildGovernancePruneChangeset,
	loadOfficialPresetModule,
	projectGovernanceInputs,
} from "./governance/index.ts";
import { GOVERNANCE_JSON_SCHEMA, type CliArgs } from "./cli.ts";

/** Governance JSON document shape (schema: pandwind.analyze.governance/1). */
export interface GovernanceCliDocument {
	readonly schema: typeof GOVERNANCE_JSON_SCHEMA;
	readonly governance: ReturnType<typeof analyzeTokenGovernance>;
	readonly changeset: ReturnType<typeof buildGovernancePruneChangeset>;
}

/** Short human summary (~10 lines) of the report. */
export function formatGovernanceSummary(
	report: ReturnType<typeof analyzeTokenGovernance>,
	changeset: ReturnType<typeof buildGovernancePruneChangeset>,
): string {
	const s = report.summary;
	const policyLine =
		report.policy === null
			? "policy: report-only (no official strict surface loaded)"
			: "policy: strict-token (official-loader, resolved)";
	const boundaries = Object.entries(s.boundaries)
		.filter(([, n]) => n > 0)
		.map(([b, n]) => b + " " + n)
		.join(" · ");
	return [
		"pandwind analyze — token governance",
		"root: " + report.root,
		policyLine,
		"tokens: " + s.defined + " defined · " + s.used + " used · " + s.unusedCandidates + " unused candidates (" + s.safeToRemove + " safe, " + s.reviewRequired + " review)",
		"strictness: " + s.strictViolations + " strict violations · " + s.rawAllowed + " raw-allowed · " + s.unknownStrictness + " unknown",
		"suggestions: " + s.suggestions + " exact raw→token matches",
		"boundaries: " + (boundaries === "" ? "none" : boundaries),
		changeset.content === null
			? "changeset: nothing is safely removable"
			: "changeset: " + changeset.count + " safe-to-remove token(s) proposed (read-only preview)",
	].join("\n") + "\n";
}

/** Run the governance lane and return its exact output (JSON or human). */
export async function runGovernanceLane(args: CliArgs): Promise<string> {
	const workspace = createAnalysisWorkspace();
	const presetLoad = await loadOfficialPresetModule(args.preset, args.root);
	const { tokenContext, policy } = projectGovernanceInputs(presetLoad);
	const patternList = args.patterns.length > 0 ? args.patterns : ["src/**/*.{ts,tsx}"];
	const paths = workspace
		.collectFiles(patternList, args.root)
		.filter((f) => SOURCE_SCANNER_SERVICE.isTypeScriptFile(f));
	const readFiles = workspace.readFiles(paths);
	const files = readFiles.map(({ file, content }) => ({
		file: file.startsWith(args.root + "/") ? file.slice(args.root.length + 1) : file,
		content,
	}));

	let themeVars: Array<{ name: string; value: string }> = [];
	try {
		themeVars = parseThemeVars(readFileSync(resolve(args.root, "src/pandwind-theme.css"), "utf8"));
	} catch {
		themeVars = [];
	}
	let interopVariables: Record<string, string> = {};
	try {
		const interop = JSON.parse(
			readFileSync(resolve(args.root, "src/pandwind.interop.json"), "utf8"),
		) as { theme?: { variables?: Record<string, string> } };
		if (interop.theme?.variables !== undefined) interopVariables = interop.theme.variables;
	} catch {
		interopVariables = {};
	}
	let safelistHit = false;
	try {
		safelistHit =
			readFileSync(resolve(args.root, "src/pandwind.safelist.css"), "utf8").includes('@source inline("');
	} catch {
		safelistHit = false;
	}

	const governance = analyzeTokenGovernance({
		root: args.root,
		files,
		policy,
		tokenContext: {
			...tokenContext,
			themeVars,
			interopVariables,
		},
		...(safelistHit ? { boundaryHits: { safelist: ["*"] } } : {}),
		generatedAt: new Date().toISOString(),
	});
	const changeset = buildGovernancePruneChangeset(governance, "app");
	if (args.json) {
		return JSON.stringify(
			{ schema: GOVERNANCE_JSON_SCHEMA, governance, changeset } satisfies GovernanceCliDocument,
			null,
			2,
		);
	}
	return formatGovernanceSummary(governance, changeset);
}
