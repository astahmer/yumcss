import { proofSourceFingerprint } from "../../../scripts/proof-source-fingerprint.ts";
import { execFileSync } from "node:child_process";
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
const auditPath = resolve(
	import.meta.dirname,
	"../../../plans/evidence/codemod-canonicality-audit.md",
);

const canonicalitySchema = z.object({ verdict: z.string(), reason: z.string() }).passthrough();

const sourceLocationSchema = z.object({ status: z.string() }).passthrough();

const residualSchema = z
	.object({
		disposition: z.string(),
		sourceLocation: sourceLocationSchema,
	})
	.passthrough();

const routeSchema = z
	.object({
		from: z.enum(BUILTIN_CODEMOD_ADAPTER_IDS),
		to: z.enum(BUILTIN_CODEMOD_ADAPTER_IDS),
		routeKey: z.string(),
		inputFile: z.string(),
		input: z.string(),
		routeFixture: z.string().nullable().optional(),
		routeProof: z.object({ maturity: z.string() }).passthrough(),
		residuals: z.array(residualSchema).optional(),
		targetPackage: z
			.object({ package: z.string(), version: z.string().nullable(), source: z.string() })
			.passthrough(),
		targetDocumentation: z.string(),
		canonicality: canonicalitySchema,
	})
	.passthrough();

const ledgerSchema = z
	.object({
		schema: z.string(),
		created: z.string(),
		method: z.string(),
		registry: z.record(z.string(), z.unknown()),
		refreshedOn: z.string(),
		summary: z.object({ canonicalityCounts: z.record(z.string(), z.number()) }).passthrough(),
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
	if (offsets.length === 1)
		return {
			status: "unique" as const,
			...sourcePosition(source, offsets[0]!),
			length: text.length,
			sourceText: text,
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
	if (offsets.length > 0)
		return {
			status: "ambiguous" as const,
			...sourcePosition(source, offsets[0]!),
			length: text.length,
			sourceText: text,
			occurrences: offsets.length,
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
		/complete project file index|project import|consumer.{0,20}inventor|module.{0,20}renam/iu.test(
			hint,
		)
	)
		return {
			disposition: "unverified" as const,
			nextAction:
				"Resolve the source module and every importer from the project index before renaming or rewriting it.",
		};
	if (
		kind === StyleProgramResidualKindTag.HostFramework &&
		/target lacks framework semantics|no standalone .* api exists|cannot preserve .* host/iu.test(
			hint,
		)
	)
		return {
			disposition: "target/framework-incompatible" as const,
			nextAction:
				"Keep the source construct until a documented target host contract supports this framework.",
		};
	if (
		kind === StyleProgramResidualKindTag.Capability &&
		/global stylesheet selectors cannot become an unreferenced class map|CSS Modules local class scoping cannot be preserved by stylesheet-family output|cannot represent .* without .* support|no standalone .* api exists/iu.test(
			hint,
		)
	)
		return {
			disposition: "target/framework-incompatible" as const,
			nextAction:
				"Keep the source form unless the target adapter can preserve the same selector and module contract.",
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
			nextAction:
				"Verify the source and target contracts and project context before removing this residual.",
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
			reason:
				"Identity pair returns the authored source unchanged; no migration work is performed.",
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

const displayCount = (count: number): string => new Intl.NumberFormat("en-US").format(count);

const renderMarkdownTable = (
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): string[] => {
	const columnWidths = headers.map((header, index) =>
		Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
	);
	const renderRow = (cells: readonly string[]) =>
		`| ${cells.map((cell, index) => cell.padEnd(columnWidths[index] ?? 0)).join(" | ")} |`;
	return [
		renderRow(headers),
		`| ${columnWidths.map((width) => "-".repeat(width)).join(" | ")} |`,
		...rows.map(renderRow),
	];
};

const renderAuditReport = (source: string, ledger: z.infer<typeof ledgerSchema>): string => {
	const routes = ledger.routes;
	const adapters = [...new Set(routes.map((route) => route.from))].toSorted();
	const residuals = routes.flatMap((route) => route.residuals ?? []);
	const countBy = (values: readonly string[]): Map<string, number> => {
		const counts = new Map<string, number>();
		for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
		return counts;
	};
	const dispositions = countBy(residuals.map((residual) => residual.disposition));
	const locations = countBy(residuals.map((residual) => residual.sourceLocation.status));
	const maturities = countBy(routes.map((route) => route.routeProof.maturity));
	const maturitySummary = [...maturities.entries()]
		.toSorted(([left], [right]) => left.localeCompare(right))
		.map(([maturity, count]) => `${displayCount(count)} ${maturity}`)
		.join(", ");
	const dispositionSummary = [
		"configuration-dependent",
		"target/framework-incompatible",
		"unverified",
	]
		.flatMap((disposition) => {
			const count = dispositions.get(disposition) ?? 0;
			return count === 0 ? [] : [`${displayCount(count)} ${disposition}`];
		})
		.join(", ");
	const exactMatches = locations.get("unique") ?? 0;
	const recoveredOutcomes = locations.get("outcome") ?? 0;
	const unlocated = residuals.length - exactMatches - recoveredOutcomes;
	const crossAdapterRoutes = routes.filter((route) => route.from !== route.to).length;
	const crossAdapterFixtures = routes.filter(
		(route) =>
			route.from !== route.to && route.routeFixture !== null && route.routeFixture !== undefined,
	).length;
	const canonicalityCounts = ledger.summary.canonicalityCounts;
	const canonicalityTable = [
		{ verdict: "Canonical", code: "C" },
		{ verdict: "Valid but noncanonical", code: "V" },
		{ verdict: "Incorrect or lossy", code: "I" },
		{ verdict: "Safe residual", code: "S" },
		{ verdict: "Unverified", code: "U" },
	];
	const resultSection = [
		"## Result",
		"",
		`- ${adapters.length} built-in adapters expose ${displayCount(routes.length)} registry pairs (${adapters.length} × ${adapters.length}); ${displayCount(crossAdapterFixtures)} of ${displayCount(crossAdapterRoutes)} cross-adapter pairs have generated route fixtures, and the remaining ${displayCount(routes.length - crossAdapterRoutes)} are identity no-ops.`,
		`- The refreshed primary capture has ${displayCount(canonicalityCounts.Canonical ?? 0)} Canonical, ${displayCount(canonicalityCounts["Safe residual"] ?? 0)} Safe residual, and ${displayCount(canonicalityCounts.Unverified ?? 0)} Unverified pairs. It has ${displayCount(canonicalityCounts["Valid but noncanonical"] ?? 0)} Valid but noncanonical and ${displayCount(canonicalityCounts["Incorrect or lossy"] ?? 0)} Incorrect or lossy verdicts.`,
		`- The primary capture reports ${displayCount(residuals.length)} typed residuals across ${displayCount(routes.filter((route) => (route.residuals?.length ?? 0) > 0).length)} pairs. ${displayCount(exactMatches)} residuals have unique exact-text spans and ${displayCount(recoveredOutcomes)} have spans recovered from unique migration outcomes; ${displayCount(unlocated)} are unlocated or ambiguous.`,
		`- Residual dispositions are ${dispositionSummary}. These are classifications, not maturity promotions.`,
		`- Current route maturity is ${maturitySummary}. This audit promotes no route.`,
		"",
		"| Canonicality verdict   | Pairs |",
		"| ---------------------- | ----: |",
		...canonicalityTable.map(
			({ verdict }) =>
				`| ${verdict.padEnd(22)} | ${displayCount(canonicalityCounts[verdict] ?? 0).padStart(5)} |`,
		),
		"",
		"The full per-route record is in [codemod-canonicality-route-ledger.json](./codemod-canonicality-route-ledger.json). Each entry has the exact primary input and output, artifacts, residuals and source locations, validation result, exact target package/version, authoritative API link, generated fixture path, route-proof maturity, verdict, and reason.",
	].join("\n");
	const targetRows = [...new Map(routes.map((route) => [route.to, route])).values()]
		.toSorted((left, right) => left.to.localeCompare(right.to))
		.map((route) => {
			const packageVersion =
				route.targetPackage.version === null
					? `not installed (${route.targetPackage.source})`
					: `${route.targetPackage.version} (${route.targetPackage.source})`;
			const guidance = route.targetDocumentation.startsWith("http")
				? `[official API guidance](${route.targetDocumentation})`
				: `[Pandwind documentation](${route.targetDocumentation})`;
			return [
				"`" + route.to + "`",
				"`" + route.targetPackage.package + "` — " + packageVersion,
				guidance,
			];
		});
	const inventorySection = [
		"## Target package and guidance inventory",
		"",
		"Package/version and official target guidance for each target. The same values appear on every route ledger entry.",
		"",
		...renderMarkdownTable(
			["Target", "Package and exact installed version", "Guidance"],
			targetRows,
		),
	].join("\n");
	const verdictCodes: Readonly<Record<string, string>> = Object.fromEntries(
		canonicalityTable.map(({ verdict, code }) => [verdict, code]),
	);
	const routeMap = new Map(routes.map((route) => [route.routeKey, route]));
	const matrixRows = adapters.map((from) => {
		const destinations = adapters
			.map((to) => {
				const route = routeMap.get(`${from}->${to}`);
				const code = verdictCodes[route?.canonicality.verdict ?? ""] ?? "U";
				return `\`${to}=${code}\``;
			})
			.join(", ");
		return ["`" + from + "`", destinations];
	});
	const routeTableSection = [
		`## All ${displayCount(routes.length)} route verdicts`,
		"",
		"Each cell is a `target=verdict` pair; `routeKey` in the machine-readable ledger retrieves the exact input, output, residuals, docs and fixture. Verdict codes: C canonical identity, V valid but noncanonical, I incorrect/lossy, S safe residual, U unverified.",
		"",
		...renderMarkdownTable(["Source", "All registered destinations and verdicts"], matrixRows),
	].join("\n");
	const replaceSection = (text: string, pattern: RegExp, replacement: string): string => {
		if (!pattern.test(text)) throw new Error(`canonicality report section not found: ${pattern}`);
		return text.replace(pattern, `${replacement}\n`);
	};
	let report = source.replace(/^Date: .* UTC\s*$/mu, `Date: ${ledger.refreshedOn} UTC`);
	report = report.replace(
		/(?:## Captured implementation\n[\s\S]*?\n)?## Method and evidence limits\n/u,
		[
			"## Captured implementation",
			"",
			`Captured JJ revision: \`${ledger.sourceRevision}\`.`,
			`Codemod and Pandwind source SHA-256: \`${ledger.sourceFingerprint}\`.`,
			"",
			"All 32 Canonical primary captures are identity no-ops. The 992 cross-adapter primary captures have zero Canonical verdicts; configured and installed evidence are separate dimensions, not promotions of this empty-project capture.",
			"",
			"[Configured scenarios](./codemod-configured-audit.json) cover 48 injected configuration-port cases. [Installed targets](./codemod-installed-targets.json) cover nine exact React routes with typechecks, builds, SSR/hydration and base/hover browser comparisons.",
			"",
			"## Method and evidence limits",
			"",
		].join("\n"),
	);
	report = replaceSection(
		report,
		/## Result\n[\s\S]*?(?=\n## Method and evidence limits\n)/u,
		resultSection,
	);
	report = replaceSection(
		report,
		/## Target package and guidance inventory\n[\s\S]*?(?=\n## All [\d,]+ route verdicts\n)/u,
		inventorySection,
	);
	return replaceSection(
		report,
		/## All [\d,]+ route verdicts\n[\s\S]*?(?=\n## Reviewed findings\n)/u,
		routeTableSection,
	);
};

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
		[
			"Canonical",
			"Valid but noncanonical",
			"Incorrect or lossy",
			"Safe residual",
			"Unverified",
		].map((verdict) => [
			verdict,
			refreshedRoutes.filter((route) => route.canonicality.verdict === verdict).length,
		]),
	);
	const residualCauseSummary = [...residualCauseGroups.entries()]
		.map(([causeId, group]) => ({
			causeId,
			cause: group.cause,
			kind: group.kind,
			disposition: group.disposition,
			nextAction: group.nextAction,
			count: group.count,
			routeKeys: [...group.routeKeys].toSorted(),
		}))
		.toSorted((left, right) => right.count - left.count || left.cause.localeCompare(right.cause));
	const result = {
		...ledger,
		schema: "pandwind.codemod-canonicality-route-ledger/2",
		sourceRevision: execFileSync("jj", ["log", "-r", "@", "--no-graph", "-T", "commit_id"], {
			encoding: "utf8",
		}).trim(),
		configuredEvidence: {
			path: "plans/evidence/codemod-configured-audit.json",
			sha256: createHash("sha256")
				.update(
					await readFile(
						resolve(import.meta.dirname, "../../../plans/evidence/codemod-configured-audit.json"),
					),
				)
				.digest("hex"),
			scope:
				"48 injected configuration-port scenarios; separate from primary ledger and installed evidence",
		},
		sourceFingerprint: proofSourceFingerprint(resolve(import.meta.dirname, "../../..")),
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
			identityRouteCount: refreshedRoutes.filter((route) => route.from === route.to).length,
			crossAdapterCanonicalityCounts: Object.fromEntries(
				Object.keys(canonicalityCounts).map((verdict) => [
					verdict,
					refreshedRoutes.filter(
						(route) => route.from !== route.to && route.canonicality.verdict === verdict,
					).length,
				]),
			),
			canonicalityCounts,
			residualCount: refreshedRoutes.reduce((count, route) => count + route.residuals.length, 0),
			routesWithResiduals: refreshedRoutes.filter((route) => route.residuals.length > 0).length,
			residualCauseSummary,
		},
		routes: refreshedRoutes,
	};
	const report = renderAuditReport(await readFile(auditPath, "utf8"), result);
	const temporaryPath = `${routePath}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`);
	await rename(temporaryPath, routePath);
	const temporaryAuditPath = `${auditPath}.tmp`;
	await writeFile(temporaryAuditPath, report);
	await rename(temporaryAuditPath, auditPath);
};

await refresh();
