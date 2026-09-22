/**
 * Token governance service (plans/054) — compose the effective universe,
 * usage collection, suggestions, and reachability into one versioned
 * report. This is the single entry point the analyzer CLI, Inspector,
 * Migration Preview, the lint plugin, and the codemod planners consume.
 */
import type {
	GovernanceCoverageBoundary,
	TokenGovernanceReport,
	TokenPolicySnapshot,
} from "./contracts.ts";
import {
	buildEffectiveTokenContext,
	type EffectiveTokenContextInputs,
} from "./effective-token-context.ts";
import { scanPublicExports } from "./public-export.ts";
import { classifyReachability } from "./reachability.ts";
import { suggestRawTokenReplacements } from "./suggestions.ts";
import {
	collectTokenUsage,
	resolveUsageAgainstDefinitions,
	type UsageCollectorFile,
} from "./usage-collector.ts";
import { buildTokenGovernanceReport } from "./report.ts";

export interface TokenGovernanceOptions {
	readonly root: string;
	/** Project source files to scan (relative paths + contents). */
	readonly files: ReadonlyArray<UsageCollectorFile>;
	/** Effective strict-token policy; null/undefined keeps report-only mode. */
	readonly policy?: TokenPolicySnapshot | null;
	/** Token universe inputs (authored groups, css vars, interop artifact). */
	readonly tokenContext?: EffectiveTokenContextInputs;
	/** Extra boundary hits collected by the caller (export scan, etc.). */
	readonly boundaryHits?: Readonly<Partial<Record<GovernanceCoverageBoundary, readonly string[]>>>;
	readonly generatedAt?: string;
}

export function analyzeTokenGovernance(options: TokenGovernanceOptions): TokenGovernanceReport {
	const policy = options.policy ?? null;
	const context = buildEffectiveTokenContext(options.tokenContext ?? {});
	const collected = collectTokenUsage(options.files, policy);
	const resolved = resolveUsageAgainstDefinitions(collected.usage, context.definitions);
	const { suggestions, diagnostics: suggestionDiagnostics } = suggestRawTokenReplacements(
		resolved,
		context.definitions,
	);

	// Merge caller boundary hits with the collector's dynamic-expression hits.
	const boundaryHits: Record<GovernanceCoverageBoundary, string[]> = {
		"dynamic-expression": [...(options.boundaryHits?.["dynamic-expression"] ?? [])],
		"runtime-theme-access": [...(options.boundaryHits?.["runtime-theme-access"] ?? [])],
		"generated-css": [...(options.boundaryHits?.["generated-css"] ?? [])],
		"public-export": [...(options.boundaryHits?.["public-export"] ?? [])],
		safelist: [...(options.boundaryHits?.safelist ?? [])],
		"plugin-output": [...(options.boundaryHits?.["plugin-output"] ?? [])],
		"unscanned-file": [...(options.boundaryHits?.["unscanned-file"] ?? [])],
		"configuration-failure": [...(options.boundaryHits?.["configuration-failure"] ?? [])],
		"unresolved-import": [...(options.boundaryHits?.["unresolved-import"] ?? [])],
	};
	boundaryHits["dynamic-expression"].push(...collected.boundaryHits["dynamic-expression"]);

	// Public-export boundary: statically string-literal exports of the
	// scanned files may escape the graph (re-exported design tokens, shared
	// theme objects), so their references are review-required, never
	// safe-to-remove. Exact authored-spelling exports hit the token id;
	// object-literal hits attribute each quoted $-reference by authored
	// name (ambiguously named or unknown spellings are skipped, not
	// guessed onto every definition).
	const exported = scanPublicExports(options.files);
	const definitionIds = new Set(context.definitions.map((d) => d.id));
	const idsByAuthoredName = new Map<string, string[]>();
	for (const def of context.definitions) {
		const list = idsByAuthoredName.get(def.name) ?? [];
		list.push(def.id);
		idsByAuthoredName.set(def.name, list);
	}
	for (const hit of exported) {
		for (const authored of hit.references) {
			if (hit.tokenId !== null) {
				// Exact-spelling exports name the id itself; count the hit when
				// the id exists in the universe.
				if (definitionIds.has(hit.tokenId)) boundaryHits["public-export"].push(hit.tokenId);
				continue;
			}
			const ids = idsByAuthoredName.get(authored) ?? [];
			if (ids.length === 1) boundaryHits["public-export"].push(ids[0]!);
		}
	}

	const configurationIncomplete =
		(options.tokenContext?.loaderFailures?.length ?? 0) > 0 ||
		(policy !== null && !policy.resolved);

	const reachability = classifyReachability({
		definitions: context.definitions,
		usage: resolved,
		boundaryHits,
		configurationIncomplete,
	});

	const report = buildTokenGovernanceReport({
		root: options.root,
		generatedAt: options.generatedAt,
		definitions: context.definitions,
		usage: resolved,
		suggestions,
		unusedCandidates: reachability.candidates,
		diagnostics: [...context.diagnostics, ...suggestionDiagnostics, ...reachability.diagnostics],
		boundaryHits,
	});
	return { ...report, policy };
}
