import { CodemodAdapterId, RealRepositoryProofDimension } from "./identifiers.ts";
import type { RealRepositoryCorpus } from "./real-repository-corpus.ts";

/** Versioned route-level maturity and proof policy used by tooling surfaces. */
export const MIGRATION_ROUTE_PROOF_CATALOG_SCHEMA =
	"pandwind.migration-route-proof-catalog/1" as const;

export const enum MigrationRouteMaturityTag {
	Stable = "stable",
	Experimental = "experimental",
	Research = "research",
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
}

export interface MigrationRouteProofSpec {
	readonly id: MigrationRouteProofRouteId;
	readonly from: CodemodAdapterId;
	readonly to: CodemodAdapterId;
	readonly maturity: MigrationRouteMaturityTag;
	readonly execution: MigrationRouteProofExecutionTag;
	readonly requiredDimensions: readonly RealRepositoryProofDimension[];
	readonly referenceIds: readonly string[];
	readonly evidenceIds?: readonly string[];
	readonly note: string;
}

interface InstalledRouteProofEvidence {
	readonly route?: { readonly from?: string; readonly to?: string };
	readonly dependencies?: {
		readonly installed?: boolean;
		readonly targetNodeModule?: boolean;
	};
	readonly migration?: {
		readonly skipped?: number;
		readonly residuals?: number;
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

export function migrationRouteProofCatalog(): {
	readonly schema: typeof MIGRATION_ROUTE_PROOF_CATALOG_SCHEMA;
	readonly routes: readonly MigrationRouteProofSpec[];
} {
	return {
		schema: MIGRATION_ROUTE_PROOF_CATALOG_SCHEMA,
		routes: MIGRATION_ROUTE_PROOF_CATALOG,
	};
}

function adapterIdForRoute(value: string): string {
	const separator = value.search(/[/:]/u);
	return separator === -1 ? value : value.slice(0, separator);
}

export function findMigrationRouteProof(
	from: string,
	to: string,
): MigrationRouteProofSpec | undefined {
	const source = adapterIdForRoute(from);
	const target = adapterIdForRoute(to);
	return MIGRATION_ROUTE_PROOF_CATALOG.find(
		(route) => route.from === source && route.to === target,
	);
}

export function validateMigrationRouteProofCatalog(
	corpus: RealRepositoryCorpus,
): readonly string[] {
	const errors: string[] = [];
	const routeIds = new Set<string>();
	const referenceIds = new Set(corpus.references.map((reference) => reference.id));
	for (const route of MIGRATION_ROUTE_PROOF_CATALOG) {
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
			if (
				evidence.dependencies?.installed !== true ||
				evidence.dependencies.targetNodeModule !== true
			)
				errors.push(`${route.id}: evidence ${evidenceId} does not prove installed dependencies`);
			if (evidence.migration?.skipped !== 0 || evidence.migration?.residuals !== 0)
				errors.push(`${route.id}: evidence ${evidenceId} retains skipped matches or residuals`);
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
