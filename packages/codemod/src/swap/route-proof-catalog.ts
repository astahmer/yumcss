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
