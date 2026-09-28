import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	BuiltinHostFramework,
	CodemodAdapterId,
	StyleMigrationOutcome,
	runAdapterMigration,
} from "pandwind-codemod/swap";
import { StyleProgramResidualKindTag } from "pandwind-codemod/swap/semantic-ir";
import { z } from "zod";

const routePath = resolve(
	import.meta.dirname,
	"../../../plans/evidence/codemod-canonicality-route-ledger.json",
);

const canonicalitySchema = z
	.object({ verdict: z.string(), reason: z.string() })
	.passthrough();

const routeSchema = z
	.object({
		from: z.enum(BUILTIN_CODEMOD_ADAPTER_IDS),
		to: z.enum(BUILTIN_CODEMOD_ADAPTER_IDS),
		routeKey: z.string(),
		inputFile: z.string(),
		input: z.string(),
		canonicality: canonicalitySchema,
	})
	.passthrough();

const ledgerSchema = z
	.object({
		schema: z.string(),
		created: z.string(),
		method: z.string(),
		registry: z.record(z.string(), z.unknown()),
		routes: z.array(routeSchema),
	})
	.passthrough();

const sourceFrameworks = new Map<CodemodAdapterId, BuiltinHostFramework>();
sourceFrameworks.set(CodemodAdapterId.StyledComponents, BuiltinHostFramework.React);
sourceFrameworks.set(CodemodAdapterId.SolidStyled, BuiltinHostFramework.Solid);
sourceFrameworks.set(CodemodAdapterId.VueStyled, BuiltinHostFramework.Vue);
sourceFrameworks.set(CodemodAdapterId.ChakraUi, BuiltinHostFramework.React);
sourceFrameworks.set(CodemodAdapterId.Mui, BuiltinHostFramework.React);
sourceFrameworks.set(CodemodAdapterId.Mantine, BuiltinHostFramework.React);

const sourceSemantic = (adapter: CodemodAdapterId) => {
	const framework = sourceFrameworks.get(adapter);
	return framework === undefined ? undefined : { source: { framework } };
};

const sourcePosition = (source: string, offset: number) => {
	const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
	return {
		offset,
		line: source.slice(0, offset).split("\n").length,
		column: offset - lineStart + 1,
	};
};

const occurrencesOf = (source: string, text: string) => {
	if (text === "") return [];
	const offsets: number[] = [];
	let offset = source.indexOf(text);
	while (offset !== -1) {
		offsets.push(offset);
		offset = source.indexOf(text, offset + text.length);
	}
	return offsets;
};

const sourceLocation = (
	source: string,
	text: string,
	outcomes: ReturnType<typeof runAdapterMigration>["outcomes"],
	hint: string | undefined,
) => {
	const offsets = occurrencesOf(source, text);
	if (offsets.length > 0)
		return {
			status: offsets.length === 1 ? ("unique" as const) : ("ambiguous" as const),
			...sourcePosition(source, offsets[0]!),
			length: text.length,
			sourceText: text,
			occurrences: offsets.length,
		};
	const residualOutcomes = outcomes.filter((outcome) => {
		return (
			outcome.outcome === StyleMigrationOutcome.Residual &&
			outcome.sourceStart >= 0 &&
			outcome.sourceText !== "" &&
			source.slice(outcome.sourceStart, outcome.sourceStart + outcome.sourceText.length) ===
				outcome.sourceText
		);
	});
	const matchingOutcomes = residualOutcomes.filter(
		(outcome) => outcome.sourceText === text || (hint !== undefined && outcome.detail === hint),
	);
	const candidates = matchingOutcomes.length > 0 ? matchingOutcomes : residualOutcomes;
	const uniqueCandidates = new Map(
		candidates.map((outcome) => [`${outcome.sourceStart}\0${outcome.sourceText}`, outcome]),
	);
	if (uniqueCandidates.size === 1) {
		const outcome = uniqueCandidates.values().next().value;
		if (outcome === undefined) return { status: "not-found" as const };
		return {
			status: "outcome" as const,
			...sourcePosition(source, outcome.sourceStart),
			length: outcome.sourceText.length,
			sourceText: outcome.sourceText,
			outcomeDetail: outcome.detail,
			representation: outcome.representation,
		};
	}
	if (uniqueCandidates.size > 1)
		return {
			status: "ambiguous" as const,
			outcomeSourceStarts: [...uniqueCandidates.values()].map((outcome) => outcome.sourceStart),
		};
	return { status: "not-found" as const };
};

const residualDisposition = (kind: string, hint: string) => {
	if (kind === StyleProgramResidualKindTag.Configuration)
		return {
			disposition: "configuration-dependent" as const,
			nextAction: "Resolve the project's official configuration and retry this route.",
		};
	if (
		kind === StyleProgramResidualKindTag.Capability &&
		/metadata|catalog|configuration|preset|token|theme|utility|variant|plugin/iu.test(hint)
	)
		return {
			disposition: "configuration-dependent" as const,
			nextAction: "Load the exact project metadata that defines this source or target value.",
		};
	if (
		kind === StyleProgramResidualKindTag.Capability &&
		/complete project file index|project import|consumer.{0,20}inventor|module.{0,20}renam/iu.test(hint)
	)
		return {
			disposition: "unverified" as const,
			nextAction: "Resolve the source module and every importer from the project index before renaming or rewriting it.",
		};
	if (
		kind === StyleProgramResidualKindTag.HostFramework &&
		/target lacks framework semantics|no standalone .* api exists|cannot preserve .* host/iu.test(hint)
	)
		return {
			disposition: "target/framework-incompatible" as const,
			nextAction: "Keep the source construct until a documented target host contract supports this framework.",
		};
	if (
		kind === StyleProgramResidualKindTag.Capability &&
		/global stylesheet selectors cannot become an unreferenced class map|CSS Modules local class scoping cannot be preserved by stylesheet-family output|cannot represent .* without .* support|no standalone .* api exists/iu.test(hint)
	)
		return {
			disposition: "target/framework-incompatible" as const,
			nextAction: "Keep the source form unless the target adapter can preserve the same selector and module contract.",
		};
	if (
		kind === StyleProgramResidualKindTag.Parse ||
		kind === StyleProgramResidualKindTag.HostFramework ||
		kind === StyleProgramResidualKindTag.Component ||
		kind === StyleProgramResidualKindTag.Composition ||
		kind === StyleProgramResidualKindTag.Dynamic ||
		kind === StyleProgramResidualKindTag.FunctionDynamic ||
		kind === StyleProgramResidualKindTag.Capability
	)
		return {
			disposition: "unverified" as const,
			nextAction: "Verify the source and target contracts and project context before removing this residual.",
		};
	return {
		disposition: "unverified" as const,
		nextAction: "Review the exact source and target contracts before changing this residual.",
	};
};

const canonicalityFor = (
	route: z.infer<typeof routeSchema>,
	migration: ReturnType<typeof runAdapterMigration>,
) => {
	if (route.from === route.to)
		return {
			verdict: "Canonical",
			reason: "Identity pair returns the authored source unchanged; no migration work is performed.",
		};
	const preservesAllResidualSources = migration.residuals.every((residual) => {
		const location = sourceLocation(route.input, residual.text, migration.outcomes, residual.hint);
		return (
			location.status !== "not-found" &&
			location.status !== "ambiguous" &&
			location.sourceText !== undefined &&
			migration.code.includes(location.sourceText)
		);
	});
	if (
		migration.residuals.length > 0 &&
		migration.skipped > 0 &&
		preservesAllResidualSources &&
		(migration.converted === 0 || migration.validations.every((validation) => validation.valid))
	)
		return {
			verdict: "Safe residual",
			reason:
				"Unsupported or unverified source is retained at its authored location with typed residual evidence; successful fragments remain separately validated.",
		};
	return {
		verdict: "Unverified",
		reason:
			"Adapter capture alone does not prove canonical target syntax or target-project behavior; see the linked route and installed-project evidence.",
	};
};

const causeKeyFor = (kind: string, hint: string) => {
	const normalizedHint = hint
		.toLowerCase()
		.replace(/["'`][^"'`]*["'`]/gu, "<value>")
		.replace(/\b\d+(?:\.\d+)?\b/gu, "<number>")
		.replace(/\s+/gu, " ")
		.trim();
	return `${kind}: ${normalizedHint || "unspecified"}`;
};

const residualCauseId = (cause: string) =>
	createHash("sha256").update(cause).digest("hex").slice(0, 12);

const refresh = async () => {
	const ledger = ledgerSchema.parse(JSON.parse(await readFile(routePath, "utf8")));
	const residualCauseGroups = new Map<
		string,
		{
			cause: string;
			kind: string;
			disposition: string;
			nextAction: string;
			routeKeys: Set<string>;
			count: number;
		}
	>();
	const refreshedRoutes = ledger.routes.map((route) => {
		const framework = sourceSemantic(route.from);
		const migration = runAdapterMigration(route.input, {
			from: route.from,
			to: route.to,
			file: route.inputFile,
			root: "/codemod-audit",
			mode: "safe",
			readFile: () => undefined,
			listFiles: () => [],
			...(framework === undefined ? {} : { semantic: framework }),
		});
		const residuals = migration.residuals.map((residual) => {
			const cause = causeKeyFor(residual.kind, residual.hint ?? "");
			const causeId = residualCauseId(cause);
			const disposition = residualDisposition(residual.kind, residual.hint ?? "");
			const existing = residualCauseGroups.get(causeId);
			if (existing === undefined)
				residualCauseGroups.set(causeId, {
					cause,
					kind: residual.kind,
					disposition: disposition.disposition,
					nextAction: disposition.nextAction,
					routeKeys: new Set([route.routeKey]),
					count: 1,
				});
			else {
				existing.routeKeys.add(route.routeKey);
				existing.count++;
			}
			return {
				...residual,
				causeId,
				disposition: disposition.disposition,
				nextAction: disposition.nextAction,
							sourceLocation: sourceLocation(
								route.input,
								residual.text,
								migration.outcomes,
								residual.hint,
							),
			};
		});
		return {
			...route,
			...(framework === undefined ? {} : { sourceFramework: framework.source.framework }),
			captureContext: "safe-mode; no project overrides; no cross-file project index",
			currentOutput: migration.code,
			generatedFiles: migration.generatedFiles,
			converted: migration.converted,
			skipped: migration.skipped,
			residuals,
			outcomes: migration.outcomes,
			validations: migration.validations,
			canonicality: canonicalityFor(route, migration),
		};
	});
	const canonicalityCounts = Object.fromEntries(
		["Canonical", "Valid but noncanonical", "Incorrect or lossy", "Safe residual", "Unverified"].map(
			(verdict) => [
				verdict,
				refreshedRoutes.filter((route) => route.canonicality.verdict === verdict).length,
			],
		),
	);
	const residualCauseSummary = [...residualCauseGroups.entries()]
		.map(([causeId, group]) => ({
			causeId,
			cause: group.cause,
			kind: group.kind,
			disposition: group.disposition,
			nextAction: group.nextAction,
			count: group.count,
			routeKeys: [...group.routeKeys].sort(),
		}))
		.sort((left, right) => right.count - left.count || left.cause.localeCompare(right.cause));
	const result = {
		...ledger,
		schema: "pandwind.codemod-canonicality-route-ledger/2",
		refreshedOn: new Date().toISOString().slice(0, 10),
		method:
			"Direct in-process runAdapterMigration capture using each registered route's primary input, source framework, safe mode, empty read-only project index, generated artifacts, typed residuals, outcomes, and semantic validations. Route maturity is copied unchanged from the proof catalog. Configured and missing-config secondary cases remain linked to route fixtures.",
		capture: {
			mode: "safe",
			primaryProjectConfig: "none",
			projectFileIndex: "empty read-only index",
			targetValidation: "adapter semantic validation; not a substitute for target compiler proof",
			maturity: "unchanged; governed by the route-proof catalog",
		},
		summary: {
			routeCount: refreshedRoutes.length,
			canonicalityCounts,
			residualCount: refreshedRoutes.reduce((count, route) => count + route.residuals.length, 0),
			routesWithResiduals: refreshedRoutes.filter((route) => route.residuals.length > 0).length,
			residualCauseSummary,
		},
		routes: refreshedRoutes,
	};
	const temporaryPath = `${routePath}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`);
	await rename(temporaryPath, routePath);
};

await refresh();
