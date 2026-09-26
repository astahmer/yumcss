/**
 * Token-governance CLI lane (plans/054 step 8) — one official-preset load,
 * the shared workspace file read, and the governance service compose into
 * the versioned report document. Read-only: the changeset is a proposal,
 * never a write.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePandwindInteropArtifact } from "pandwind-codemod/tw";
import { tokenDocumentCodec } from "pandwind-codemod/swap/token-document";
import { createAnalysisWorkspace } from "./analysis-service.ts";
import { parseThemeVars } from "./collect/parsers.ts";
import {
	analyzeTokenGovernance,
	buildGovernancePruneChangeset,
	compareTokenRelease,
	loadOfficialPresetModule,
	projectGovernanceInputs,
} from "./governance/index.ts";
import { GOVERNANCE_JSON_SCHEMA, type CliArgs } from "./cli.ts";

/** Governance JSON document shape (schema: pandwind.analyze.governance/1). */
interface GovernanceCliDocument {
	readonly schema: typeof GOVERNANCE_JSON_SCHEMA;
	readonly governance: ReturnType<typeof analyzeTokenGovernance>;
	readonly changeset: ReturnType<typeof buildGovernancePruneChangeset>;
}

/** Short human summary (~10 lines) of the report. */
function formatGovernanceSummary(
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
	return (
		[
			"pandwind analyze — token governance",
			"root: " + report.root,
			policyLine,
			"tokens: " +
				s.defined +
				" defined · " +
				s.used +
				" used · " +
				s.unusedCandidates +
				" unused candidates (" +
				s.safeToRemove +
				" safe, " +
				s.reviewRequired +
				" review)",
			"strictness: " +
				s.strictViolations +
				" strict violations · " +
				s.rawAllowed +
				" raw-allowed · " +
				s.unknownStrictness +
				" unknown",
			"suggestions: " + s.suggestions + " exact raw→token matches",
			"boundaries: " + (boundaries === "" ? "none" : boundaries),
			changeset.content === null
				? "changeset: nothing is safely removable"
				: "changeset: " + changeset.count + " safe-to-remove token(s) proposed (read-only preview)",
		].join("\n") + "\n"
	);
}

const isMissingFile = (error: unknown): boolean =>
	typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

const governanceForRoot = async (args: CliArgs, root: string) => {
	const workspace = createAnalysisWorkspace();
	const presetLoad = await loadOfficialPresetModule(args.preset, root);
	const { tokenContext, policy } = projectGovernanceInputs(presetLoad);
	const patternList = args.patterns.length > 0 ? args.patterns : ["src/**/*"];
	const paths = workspace.collectFiles(patternList, root);
	const readFiles = workspace.readFiles(paths);
	const files = readFiles.map(({ file, content }) => ({
		file: file.startsWith(root + "/") ? file.slice(root.length + 1) : file,
		content,
	}));

	let themeVars: Array<{ name: string; value: string }> = [];
	try {
		themeVars = parseThemeVars(readFileSync(resolve(root, "src/pandwind-theme.css"), "utf8"));
	} catch {
		themeVars = [];
	}
	let interopVariables: Record<string, string> = {};
	let interopFailure: string | undefined;
	try {
		const interop = parsePandwindInteropArtifact(
			JSON.parse(readFileSync(resolve(root, "src/pandwind.interop.json"), "utf8")),
		);
		interopVariables = { ...interop.theme.variables };
	} catch (error) {
		if (!isMissingFile(error))
			interopFailure = error instanceof Error ? error.message : String(error);
	}
	let safelistHit = false;
	try {
		safelistHit = readFileSync(resolve(root, "src/pandwind.safelist.css"), "utf8").includes(
			'@source inline("',
		);
	} catch {
		safelistHit = false;
	}

	const governance = analyzeTokenGovernance({
		root,
		files,
		policy,
		tokenContext: {
			...tokenContext,
			themeVars,
			interopVariables,
			...(interopFailure === undefined
				? {}
				: { loaderFailures: [...(tokenContext.loaderFailures ?? []), interopFailure] }),
		},
		...(safelistHit ? { boundaryHits: { safelist: ["*"] } } : {}),
		generatedAt: new Date().toISOString(),
	});
	const changeset = buildGovernancePruneChangeset(governance, "app");
	return { governance, changeset };
};

/** Run the governance lane and return its exact output (JSON or human). */
export async function runGovernanceLane(args: CliArgs): Promise<string> {
	const { governance, changeset } = await governanceForRoot(args, args.root);
	if (args.json) {
		return JSON.stringify(
			{ schema: GOVERNANCE_JSON_SCHEMA, governance, changeset } satisfies GovernanceCliDocument,
			null,
			2,
		);
	}
	return formatGovernanceSummary(governance, changeset);
}

/** Compare a declared baseline against a validated generated snapshot and explicit consumers. */
export async function runTokenReleaseLane(args: CliArgs): Promise<string> {
	if (args.releaseBaselinePath === undefined) {
		throw new Error("analyze release: --release-baseline is required");
	}
	const consumers = [...new Set([args.root, ...args.consumerRoots])];
	if (consumers.length > 1 && args.releaseCurrentPath === undefined) {
		throw new Error(
			"analyze release: --release-current is required when comparing multiple consumer roots",
		);
	}
	const currentPath =
		args.releaseCurrentPath ?? resolve(consumers[0]!, "src/pandwind.interop.json");
	const baseline = await tokenDocumentCodec.fromFile(args.releaseFormat, args.releaseBaselinePath);
	let interop: ReturnType<typeof parsePandwindInteropArtifact>;
	try {
		interop = parsePandwindInteropArtifact(JSON.parse(readFileSync(currentPath, "utf8")));
	} catch (error) {
		throw new Error(
			`analyze release: could not load current pandwind.interop/3 artifact '${currentPath}': ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
	if (interop.tokens.state !== "available") {
		throw new Error(
			`analyze release: current artifact has no token snapshot: ${interop.tokens.diagnostics.join("; ")}`,
		);
	}
	const reports = [];
	for (const root of consumers) {
		reports.push((await governanceForRoot(args, root)).governance);
	}
	const report = compareTokenRelease({
		baseline,
		current: interop.tokens.document,
		consumers: reports,
		generatedAt: new Date().toISOString(),
	});
	if (args.json) return `${JSON.stringify(report, null, 2)}\n`;
	const summary = Object.entries(report.summary)
		.filter(([, count]) => count > 0)
		.map(([kind, count]) => `${kind} ${count}`)
		.join(" · ");
	const changes = report.changes.map((change) => {
		const usageCount = change.consumers.reduce(
			(total, consumer) => total + consumer.usages.length,
			0,
		);
		const suggestionCount = change.consumers.reduce(
			(total, consumer) => total + consumer.exactSuggestions.length,
			0,
		);
		const boundaryCount = change.consumers.reduce(
			(total, consumer) =>
				total + Object.values(consumer.coverageBoundaries).reduce((sum, count) => sum + count, 0),
			0,
		);
		return `${change.kind} ${change.path} · ${usageCount} exact usage(s) · ${suggestionCount} exact suggestion(s) · ${boundaryCount} boundary hit(s)`;
	});
	return (
		[
			"pandwind analyze — token release impact",
			`baseline: ${report.baseline.format}@${report.baseline.formatVersion}`,
			`current: ${report.current.format}@${report.current.formatVersion}`,
			`consumers: ${report.consumerRoots.join(", ") || "none"}`,
			`changes: ${summary || "none"}`,
			...(changes.length === 0 ? [] : ["", ...changes]),
		].join("\n") + "\n"
	);
}
