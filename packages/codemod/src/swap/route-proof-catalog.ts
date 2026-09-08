import {
	CodemodAdapterId,
	InstalledProjectProofCheckTag,
	RealRepositoryProofDimension,
	RealRepositoryProofDimensionStatus,
} from "./identifiers.ts";
import type { RealRepositoryCorpus } from "./real-repository-corpus.ts";
import { StyleDialectRoleTag, type StyleDialectResolver } from "./style-systems.ts";

/** Versioned route-level maturity and proof policy used by tooling surfaces. */
export const MIGRATION_ROUTE_PROOF_CATALOG_SCHEMA =
	"pandwind.migration-route-proof-catalog/1" as const;

export const enum MigrationRouteMaturityTag {
	Stable = "stable",
	Experimental = "experimental",
	Research = "research",
	Deferred = "deferred",
}

export const enum MigrationRouteProofExecutionTag {
	InstalledProject = "installed-project",
	AdapterProgram = "adapter-program",
	SourceOnly = "source-only",
	Unavailable = "unavailable",
}

export const enum MigrationRouteProofRouteId {
	TailwindToPandwind = "tailwind-to-pandwind",
	PandaToPandwind = "panda-to-pandwind",
	StyledComponentsToPandwind = "styled-components-to-pandwind",
	UnoCssToPandwind = "unocss-to-pandwind",
	UnoCssToTailwind = "unocss-to-tailwind",
	TailwindToUnoCss = "tailwind-to-unocss",
	PandwindToUnoCss = "pandwind-to-unocss",
	Unclassified = "unclassified",
}

export interface MigrationRouteProofSpec {
	/** Built-in routes use the const-enum ids; plugin routes use a derived id. */
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly maturity: MigrationRouteMaturityTag;
	readonly execution: MigrationRouteProofExecutionTag;
	readonly requiredDimensions: readonly RealRepositoryProofDimension[];
	readonly referenceIds: readonly string[];
	readonly evidenceIds?: readonly string[];
	readonly note: string;
}

export interface MigrationRouteProofDimensionResult {
	readonly status: RealRepositoryProofDimensionStatus;
	readonly reason?: string;
}

export interface MigrationRouteProofEvaluation {
	readonly route: MigrationRouteProofSpec;
	readonly eligible: boolean;
	readonly dimensions: Readonly<
		Record<RealRepositoryProofDimension, MigrationRouteProofDimensionResult>
	>;
	readonly reasons: readonly string[];
}

interface InstalledRouteProofEvidence {
	readonly route?: { readonly from?: string; readonly to?: string };
	readonly fixture?: {
		readonly isolated?: boolean;
		readonly files?: readonly string[];
	};
	readonly dependencies?: {
		readonly installed?: boolean;
		readonly targetNodeModule?: boolean;
	};
	readonly migration?: {
		readonly skipped?: number;
		readonly residuals?: number;
		readonly canonical?: { readonly checked?: boolean; readonly equal?: boolean };
	};
	readonly checks?: Readonly<Record<string, unknown>>;
	readonly ssr?: { readonly markupEquivalent?: boolean };
	readonly browser?: {
		readonly equivalent?: boolean;
		readonly changedPixels?: number;
		readonly hydrationErrors?: readonly unknown[];
	};
	readonly css?: {
		readonly sourceBytes?: number;
		readonly targetBytes?: number;
		readonly targetNotLarger?: boolean;
	};
}

const passed = (): MigrationRouteProofDimensionResult => ({
	status: RealRepositoryProofDimensionStatus.Passed,
});

const unavailable = (reason: string): MigrationRouteProofDimensionResult => ({
	status: RealRepositoryProofDimensionStatus.Unavailable,
	reason,
});

const checkPassed = (
	evidence: InstalledRouteProofEvidence,
	check: InstalledProjectProofCheckTag,
): MigrationRouteProofDimensionResult =>
	evidence.checks?.[check] === true
		? passed()
		: unavailable(`installed proof did not pass ${check}`);

function dimensionEvidence(
	evidence: InstalledRouteProofEvidence | undefined,
	dimension: RealRepositoryProofDimension,
): MigrationRouteProofDimensionResult {
	if (evidence === undefined) return unavailable("no installed-project evidence is available");
	switch (dimension) {
		case RealRepositoryProofDimension.CanonicalCss:
			return evidence.migration?.canonical?.checked === true &&
				evidence.migration.canonical.equal === true
				? passed()
				: unavailable("adapter-level canonical CSS comparison was not recorded");
		case RealRepositoryProofDimension.Typecheck: {
			const source = checkPassed(evidence, InstalledProjectProofCheckTag.SourceTypecheck);
			const target = checkPassed(evidence, InstalledProjectProofCheckTag.TargetTypecheck);
			return source.status === RealRepositoryProofDimensionStatus.Passed &&
				target.status === RealRepositoryProofDimensionStatus.Passed
				? passed()
				: unavailable("source and target typechecks must both pass");
		}
		case RealRepositoryProofDimension.Build: {
			const source = checkPassed(evidence, InstalledProjectProofCheckTag.SourceBuild);
			const target = checkPassed(evidence, InstalledProjectProofCheckTag.TargetBuild);
			return source.status === RealRepositoryProofDimensionStatus.Passed &&
				target.status === RealRepositoryProofDimensionStatus.Passed
				? passed()
				: unavailable("source and target builds must both pass");
		}
		case RealRepositoryProofDimension.BrowserStates:
			return evidence.browser?.equivalent === true &&
				evidence.browser.changedPixels === 0 &&
				(evidence.browser.hydrationErrors?.length ?? 0) === 0
				? passed()
				: unavailable("browser equivalence, pixel, or hydration evidence is incomplete");
		case RealRepositoryProofDimension.SsrHydration:
			return evidence.ssr?.markupEquivalent === true &&
				evidence.checks?.[InstalledProjectProofCheckTag.Hydration] === true
				? passed()
				: unavailable("SSR markup and hydration checks must both pass");
		case RealRepositoryProofDimension.RscStreaming:
			return unavailable("RSC/streaming is not required by this route policy");
		case RealRepositoryProofDimension.Dependencies:
			return evidence.dependencies?.installed === true &&
				evidence.dependencies.targetNodeModule === true
				? passed()
				: unavailable("installed target dependencies were not proven");
		case RealRepositoryProofDimension.CssSize:
			return typeof evidence.css?.sourceBytes === "number" &&
				evidence.css.sourceBytes > 0 &&
				typeof evidence.css.targetBytes === "number" &&
				evidence.css.targetBytes > 0 &&
				(evidence.css.targetNotLarger === undefined || evidence.css.targetNotLarger === true)
				? passed()
				: unavailable("source and target CSS size evidence is incomplete");
	}
}

const PROJECT_PROOF_DIMENSIONS = [
	RealRepositoryProofDimension.CanonicalCss,
	RealRepositoryProofDimension.Typecheck,
	RealRepositoryProofDimension.Build,
	RealRepositoryProofDimension.BrowserStates,
	RealRepositoryProofDimension.SsrHydration,
	RealRepositoryProofDimension.Dependencies,
	RealRepositoryProofDimension.CssSize,
] as const;

/**
 * The first supported tier stays experimental until installed-project proof
 * exists. Keeping that fact in one catalog prevents a small adapter fixture
 * from silently becoming a product-level promise in another UI.
 */
export const MIGRATION_ROUTE_PROOF_CATALOG: readonly MigrationRouteProofSpec[] = [
	{
		id: MigrationRouteProofRouteId.TailwindToPandwind,
		from: CodemodAdapterId.Tailwind,
		to: CodemodAdapterId.Pandwind,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["tailwindcss-docs-home"],
		evidenceIds: ["tailwind-installed-proof"],
		note: "A bounded installed React/Vite fixture covers the project lifecycle; broader route coverage is still required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.PandaToPandwind,
		from: CodemodAdapterId.Panda,
		to: CodemodAdapterId.Pandwind,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["panda-website"],
		evidenceIds: ["panda-installed-proof"],
		note: "A bounded installed React/Vite fixture covers official generated-system loading, shorthand lowering, token preservation, SSR, hydration, and browser parity; broader recipe and framework coverage is still required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.StyledComponentsToPandwind,
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.Pandwind,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["styled-components-benchmark"],
		evidenceIds: ["styled-components-installed-proof"],
		note: "A bounded installed React/Vite fixture covers a styled object and pseudo-condition; broader component and theme coverage is still required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.UnoCssToPandwind,
		from: CodemodAdapterId.UnoCSS,
		to: CodemodAdapterId.Pandwind,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["unocss-nextjs-page"],
		evidenceIds: ["unocss-installed-proof"],
		note: "A bounded installed React/Vite fixture covers the official UnoCSS generator, custom token lowering, virtual stylesheet removal, generated Vite integration, SSR, hydration, browser parity, and CSS size; broader preset and framework coverage is still required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.UnoCssToTailwind,
		from: CodemodAdapterId.UnoCSS,
		to: CodemodAdapterId.Tailwind,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.Unavailable,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: [],
		note: "The route is registered, but no pinned installed-project proof fixture exists yet.",
	},
	{
		id: MigrationRouteProofRouteId.TailwindToUnoCss,
		from: CodemodAdapterId.Tailwind,
		to: CodemodAdapterId.UnoCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.Unavailable,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: [],
		note: "The route is registered, but no pinned installed-project proof fixture exists yet.",
	},
	{
		id: MigrationRouteProofRouteId.PandwindToUnoCss,
		from: CodemodAdapterId.Pandwind,
		to: CodemodAdapterId.UnoCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.Unavailable,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: [],
		note: "The reverse route is available for experiments; it has no pinned project proof yet.",
	},
] as const;

function registeredDialect(
	registry: StyleDialectResolver,
	address: string,
): ReturnType<StyleDialectResolver["getDialect"]> {
	return registry.getDialect(address) ?? registry.getDialect(adapterIdForRoute(address));
}

function unclassifiedRoute(from: string, to: string): MigrationRouteProofSpec {
	const source = adapterIdForRoute(from);
	const target = adapterIdForRoute(to);
	return {
		id: `${MigrationRouteProofRouteId.Unclassified}:${source}->${target}`,
		from: source,
		to: target,
		maturity: MigrationRouteMaturityTag.Research,
		execution: MigrationRouteProofExecutionTag.Unavailable,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: [],
		note: "The route is registered, but no route-specific installed-project proof is available; inspect the adapter result as research evidence and treat host validation as required.",
	};
}

function registeredRoutePairs(
	registry: StyleDialectResolver,
): readonly { readonly from: string; readonly to: string }[] {
	const dialects = registry.systems.flatMap((system) => system.dialects);
	const sources = dialects.filter((dialect) => dialect.role !== StyleDialectRoleTag.Target);
	const targets = dialects.filter((dialect) => dialect.role !== StyleDialectRoleTag.Source);
	const pairs = new Map<string, { readonly from: string; readonly to: string }>();
	for (const source of sources) {
		for (const target of targets) {
			const from = adapterIdForRoute(source.id);
			const to = adapterIdForRoute(target.id);
			const key = `${from}->${to}`;
			if (!pairs.has(key)) pairs.set(key, { from, to });
		}
	}
	return [...pairs.values()].toSorted((left, right) =>
		`${left.from}->${left.to}`.localeCompare(`${right.from}->${right.to}`),
	);
}

/**
 * Expand the static proof policies with an explicit research policy for every
 * route the supplied adapter registry can actually resolve. This keeps the
 * route catalog honest for built-ins and plugins alike: an unproven route is
 * visible and unavailable instead of looking unregistered.
 */
export function migrationRouteProofCatalog(registry?: StyleDialectResolver): {
	readonly schema: typeof MIGRATION_ROUTE_PROOF_CATALOG_SCHEMA;
	readonly routes: readonly MigrationRouteProofSpec[];
} {
	if (registry === undefined) {
		return {
			schema: MIGRATION_ROUTE_PROOF_CATALOG_SCHEMA,
			routes: MIGRATION_ROUTE_PROOF_CATALOG,
		};
	}
	const known = new Set(MIGRATION_ROUTE_PROOF_CATALOG.map((route) => `${route.from}->${route.to}`));
	const fallback = registeredRoutePairs(registry)
		.filter(({ from, to }) => !known.has(`${from}->${to}`))
		.map(({ from, to }) => unclassifiedRoute(from, to));
	return {
		schema: MIGRATION_ROUTE_PROOF_CATALOG_SCHEMA,
		routes: [...MIGRATION_ROUTE_PROOF_CATALOG, ...fallback],
	};
}

function adapterIdForRoute(value: string): string {
	const separator = value.search(/[/:]/u);
	return separator === -1 ? value : value.slice(0, separator);
}

export function findMigrationRouteProof(
	from: string,
	to: string,
	registry?: StyleDialectResolver,
): MigrationRouteProofSpec | undefined {
	const source = adapterIdForRoute(from);
	const target = adapterIdForRoute(to);
	const known = MIGRATION_ROUTE_PROOF_CATALOG.find(
		(route) => route.from === source && route.to === target,
	);
	if (known !== undefined || registry === undefined) return known;
	const sourceDialect = registeredDialect(registry, from);
	const targetDialect = registeredDialect(registry, to);
	if (
		sourceDialect === undefined ||
		targetDialect === undefined ||
		sourceDialect.role === StyleDialectRoleTag.Target ||
		targetDialect.role === StyleDialectRoleTag.Source
	)
		return undefined;
	return unclassifiedRoute(sourceDialect.id, targetDialect.id);
}

/**
 * Evaluate checked-in installed-project evidence against the route policy.
 * Missing canonical CSS evidence stays unavailable even when browser output
 * matches; those are different proof claims and must not be conflated.
 */
export function evaluateMigrationRouteProof(
	route: MigrationRouteProofSpec,
	evidenceById: ReadonlyMap<string, unknown>,
): MigrationRouteProofEvaluation {
	const evidence = route.evidenceIds
		?.map((id) => evidenceById.get(id))
		.find((value): value is InstalledRouteProofEvidence => value !== undefined);
	const dimensions = {
		[RealRepositoryProofDimension.CanonicalCss]: dimensionEvidence(
			evidence,
			RealRepositoryProofDimension.CanonicalCss,
		),
		[RealRepositoryProofDimension.Typecheck]: dimensionEvidence(
			evidence,
			RealRepositoryProofDimension.Typecheck,
		),
		[RealRepositoryProofDimension.Build]: dimensionEvidence(
			evidence,
			RealRepositoryProofDimension.Build,
		),
		[RealRepositoryProofDimension.BrowserStates]: dimensionEvidence(
			evidence,
			RealRepositoryProofDimension.BrowserStates,
		),
		[RealRepositoryProofDimension.SsrHydration]: dimensionEvidence(
			evidence,
			RealRepositoryProofDimension.SsrHydration,
		),
		[RealRepositoryProofDimension.RscStreaming]: dimensionEvidence(
			evidence,
			RealRepositoryProofDimension.RscStreaming,
		),
		[RealRepositoryProofDimension.Dependencies]: dimensionEvidence(
			evidence,
			RealRepositoryProofDimension.Dependencies,
		),
		[RealRepositoryProofDimension.CssSize]: dimensionEvidence(
			evidence,
			RealRepositoryProofDimension.CssSize,
		),
	} satisfies Readonly<Record<RealRepositoryProofDimension, MigrationRouteProofDimensionResult>>;
	const reasons = [
		...(evidence === undefined ? ["no checked-in evidence is available"] : []),
		...(evidence?.migration?.skipped !== undefined && evidence.migration.skipped > 0
			? [`${evidence.migration.skipped} source match(es) were skipped`]
			: []),
		...(evidence?.migration?.residuals !== undefined && evidence.migration.residuals > 0
			? [`${evidence.migration.residuals} conversion residual(s) remain`]
			: []),
		...route.requiredDimensions
			.map((dimension) => dimensions[dimension].reason)
			.filter((reason): reason is string => reason !== undefined),
	];
	const eligible =
		route.execution === MigrationRouteProofExecutionTag.InstalledProject &&
		evidence?.migration?.skipped === 0 &&
		evidence?.migration?.residuals === 0 &&
		reasons.length === 0 &&
		route.requiredDimensions.every(
			(dimension) => dimensions[dimension].status === RealRepositoryProofDimensionStatus.Passed,
		);
	return {
		route,
		eligible,
		dimensions,
		reasons: [...new Set(reasons)],
	};
}

export function validateMigrationRouteProofCatalog(
	corpus: RealRepositoryCorpus,
	catalog: readonly MigrationRouteProofSpec[] = MIGRATION_ROUTE_PROOF_CATALOG,
): readonly string[] {
	const errors: string[] = [];
	const routeIds = new Set<string>();
	const referenceIds = new Set(corpus.references.map((reference) => reference.id));
	for (const route of catalog) {
		if (routeIds.has(route.id)) errors.push(`duplicate route id: ${route.id}`);
		routeIds.add(route.id);
		if (route.requiredDimensions.length === 0)
			errors.push(`${route.id}: no required proof dimensions`);
		for (const referenceId of route.referenceIds) {
			if (!referenceIds.has(referenceId))
				errors.push(`${route.id}: unknown corpus reference ${referenceId}`);
		}
		if (
			route.maturity === MigrationRouteMaturityTag.Stable &&
			route.execution !== MigrationRouteProofExecutionTag.InstalledProject
		)
			errors.push(`${route.id}: stable route must use installed-project proof`);
	}
	return errors;
}

/**
 * Verify the stronger installed-project claim without teaching the catalog
 * about a fixture's implementation details. The evidence files intentionally
 * share this small envelope even though each fixture owns its own runner.
 */
export function validateMigrationRouteProofEvidence(
	catalog: readonly MigrationRouteProofSpec[],
	evidenceById: ReadonlyMap<string, unknown>,
): readonly string[] {
	const errors: string[] = [];
	for (const route of catalog) {
		if (route.execution !== MigrationRouteProofExecutionTag.InstalledProject) continue;
		if (route.evidenceIds === undefined || route.evidenceIds.length === 0) {
			errors.push(`${route.id}: installed-project route has no evidence id`);
			continue;
		}
		for (const evidenceId of route.evidenceIds) {
			const value = evidenceById.get(evidenceId);
			if (value === undefined) {
				errors.push(`${route.id}: missing evidence ${evidenceId}`);
				continue;
			}
			const evidence = value as InstalledRouteProofEvidence;
			if (evidence.route?.from !== route.from || evidence.route?.to !== route.to)
				errors.push(`${route.id}: evidence ${evidenceId} records a different route`);
			if (evidence.fixture?.isolated !== true)
				errors.push(`${route.id}: evidence ${evidenceId} does not prove an isolated fixture`);
			if (evidence.fixture?.files === undefined || evidence.fixture.files.length === 0)
				errors.push(`${route.id}: evidence ${evidenceId} does not declare fixture files`);
			if (
				evidence.dependencies?.installed !== true ||
				evidence.dependencies.targetNodeModule !== true
			)
				errors.push(`${route.id}: evidence ${evidenceId} does not prove installed dependencies`);
			if (evidence.migration?.skipped !== 0 || evidence.migration?.residuals !== 0)
				errors.push(`${route.id}: evidence ${evidenceId} retains skipped matches or residuals`);
			if (
				evidence.migration?.canonical?.checked !== true ||
				evidence.migration.canonical.equal !== true
			)
				errors.push(`${route.id}: evidence ${evidenceId} did not prove canonical CSS equality`);
			for (const check of [
				"sourceTypecheck",
				"targetTypecheck",
				"sourceBuild",
				"targetBuild",
				"sourceSsr",
				"targetSsr",
				"hydration",
			] as const) {
				if (evidence.checks?.[check] !== true)
					errors.push(`${route.id}: evidence ${evidenceId} did not pass ${check}`);
			}
			if (evidence.ssr?.markupEquivalent !== true)
				errors.push(`${route.id}: evidence ${evidenceId} did not prove SSR equivalence`);
			if (
				evidence.browser?.equivalent !== true ||
				evidence.browser.changedPixels !== 0 ||
				(evidence.browser.hydrationErrors?.length ?? 0) !== 0
			)
				errors.push(`${route.id}: evidence ${evidenceId} did not prove browser equivalence`);
			if (
				typeof evidence.css?.sourceBytes !== "number" ||
				evidence.css.sourceBytes <= 0 ||
				typeof evidence.css.targetBytes !== "number" ||
				evidence.css.targetBytes <= 0 ||
				(evidence.css.targetNotLarger !== undefined && evidence.css.targetNotLarger !== true)
			)
				errors.push(`${route.id}: evidence ${evidenceId} did not prove CSS size output`);
		}
	}
	return errors;
}
