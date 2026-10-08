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
	"yumcss.migration-route-proof-catalog/1" as const;

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
	TailwindToYumCSS = "tailwind-to-yumcss",
	PandaToYumCSS = "panda-to-yumcss",
	StyledComponentsToYumCSS = "styled-components-to-yumcss",
	UnoCssToYumCSS = "unocss-to-yumcss",
	VanillaExtractToYumCSS = "vanilla-extract-to-yumcss",
	StitchesToYumCSS = "stitches-to-yumcss",
	MuiToYumCSS = "mui-to-yumcss",
	MantineToYumCSS = "mantine-to-yumcss",
	TokenamiToYumCSS = "tokenami-to-yumcss",
	JssToYumCSS = "jss-to-yumcss",
	FelaToYumCSS = "fela-to-yumcss",
	AphroditeToYumCSS = "aphrodite-to-yumcss",
	CompiledToYumCSS = "compiled-to-yumcss",
	Style9ToYumCSS = "style9-to-yumcss",
	NextYakToYumCSS = "next-yak-to-yumcss",
	LinariaToYumCSS = "linaria-to-yumcss",
	TreatToYumCSS = "treat-to-yumcss",
	SolidStyledToYumCSS = "solid-styled-to-yumcss",
	VueStyledToYumCSS = "vue-styled-to-yumcss",
	UnoCssToTailwind = "unocss-to-tailwind",
	TailwindToUnoCss = "tailwind-to-unocss",
	YumCSSToUnoCss = "yumcss-to-unocss",
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
		readonly comparison?: "comparable" | "diagnostic";
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
			const targetBytes = evidence.css?.targetBytes;
			return typeof evidence.css?.sourceBytes === "number" &&
				evidence.css.sourceBytes > 0 &&
				typeof targetBytes === "number" &&
				(targetBytes > 0 || (targetBytes === 0 && evidence.css.comparison === "diagnostic")) &&
				(evidence.css.targetNotLarger === undefined ||
					evidence.css.targetNotLarger === true ||
					evidence.css.comparison === "diagnostic")
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
		id: MigrationRouteProofRouteId.TailwindToYumCSS,
		from: CodemodAdapterId.Tailwind,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["tailwindcss-docs-home"],
		evidenceIds: ["tailwind-installed-proof"],
		note: "A bounded installed React/Vite fixture covers the project lifecycle; broader route coverage is still required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.PandaToYumCSS,
		from: CodemodAdapterId.Panda,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["panda-website"],
		evidenceIds: ["panda-installed-proof"],
		note: "A bounded installed React/Vite fixture covers official generated-system loading, shorthand lowering, token preservation, SSR, hydration, and browser parity; broader recipe and framework coverage is still required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.StyledComponentsToYumCSS,
		from: CodemodAdapterId.StyledComponents,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["styled-components-benchmark"],
		evidenceIds: ["styled-components-installed-proof"],
		note: "A bounded installed React/Vite fixture covers a styled object and pseudo-condition; broader component and theme coverage is still required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.UnoCssToYumCSS,
		from: CodemodAdapterId.UnoCSS,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["unocss-nextjs-page"],
		evidenceIds: ["unocss-installed-proof"],
		note: "An installed React/Vite fixture covers the official UnoCSS generator, custom token lowering, virtual stylesheet removal, generated Vite integration, SSR, hydration, browser parity, and CSS size; a pinned upstream Next example also passes the migration, Next typecheck/build, HTTP/RSC/browser checks, and UnoCSS removal. Broader preset and framework coverage is still required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.VanillaExtractToYumCSS,
		from: CodemodAdapterId.VanillaExtract,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["vanilla-extract-example"],
		evidenceIds: ["vanilla-extract-installed-proof"],
		note: "A pinned Vanilla Extract HelloWorld fixture covers typed custom properties, fallback variables, keyframes, the official Vite plugin, SSR, hydration, and browser parity. Its tiny fused-versus-atomic CSS comparison is recorded but is not a meaningful non-growth budget; broader recipes, themes, and framework coverage remain required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.StitchesToYumCSS,
		from: CodemodAdapterId.Stitches,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["stitches-react-test"],
		evidenceIds: ["stitches-installed-proof"],
		note: "A pinned upstream Stitches React test API is exercised through an installed React/Vite host with theme tokens, a variant recipe, hover parity, SSR, hydration, and browser checks. The small fused-versus-atomic CSS comparison is diagnostic rather than a non-growth budget; broader theme, compound-variant, and framework coverage remain required for promotion.",
	},
	{
		id: MigrationRouteProofRouteId.MuiToYumCSS,
		from: CodemodAdapterId.Mui,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["mui-box-sx"],
		evidenceIds: ["mui-installed-proof"],
		note: "A pinned MUI Box sx example is exercised through an installed React/Vite host with static system values and a hover pseudo-condition. The proof covers typecheck, build, SSR, hydration, generated atomic CSS, and browser parity; ThemeProvider-owned callbacks, responsive arrays, and component theme overrides remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.MantineToYumCSS,
		from: CodemodAdapterId.Mantine,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["mantine-style-props"],
		evidenceIds: ["mantine-installed-proof"],
		note: "A pinned Mantine help-center style-prop example is exercised through an installed React/Vite host with a real MantineProvider, static Box style props, SSR, hydration, atomic CSS, and browser parity; provider-owned theme callbacks, styles/classNames/vars maps, and responsive style-prop objects remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.TokenamiToYumCSS,
		from: CodemodAdapterId.Tokenami,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["tokenami-nextjs-button"],
		evidenceIds: ["tokenami-installed-proof"],
		note: "A pinned Tokenami button example is exercised through the installed Tokenami CLI and React/Vite host with css.compose aliases, grid math, verified theme-value lowering, hover conditions, SSR, hydration, atomic CSS, and browser parity; runtime composition, theme-mode switching, and unsupported global rules remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.JssToYumCSS,
		from: CodemodAdapterId.Jss,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["jss-nested-benchmark"],
		evidenceIds: ["jss-installed-proof"],
		note: "A pinned JSS inline example is exercised through installed JSS camel-case and nested plugins with static sheet creation, attachment, hover output, SSR, hydration, and browser parity. Dynamic rule values, plugin-specific runtime behavior, and non-static renderer inputs remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.FelaToYumCSS,
		from: CodemodAdapterId.Fela,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["fela-render-test"],
		evidenceIds: ["fela-installed-proof"],
		note: "A pinned Fela renderRule example is exercised through installed Fela and fela-dom with a static rule, empty props, hover output, SSR, hydration, and browser parity. Dynamic props, enhancers, plugins, and renderer-owned component options remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.AphroditeToYumCSS,
		from: CodemodAdapterId.Aphrodite,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["aphrodite-api-test"],
		evidenceIds: ["aphrodite-installed-proof"],
		note: "A pinned Aphrodite API example is exercised through installed StyleSheet.create and css with a static rule, hover output, server CSS collection, SSR, hydration, and browser parity. Dynamic style arrays, keyframes, font-face, and runtime-specific injection options remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.CompiledToYumCSS,
		from: CodemodAdapterId.Compiled,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["compiled-vite-example"],
		evidenceIds: ["compiled-installed-proof"],
		note: "A pinned Atlassian Compiled Vite fixture is exercised through the official Compiled Vite plugin, styled components, cssMapScoped selectors, SSR, hydration, browser parity, and inline-style-aware CSS accounting. Plugin-specific transforms, dynamic style expressions, and CSS-map runtime semantics beyond this static fixture remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.Style9ToYumCSS,
		from: CodemodAdapterId.Style9,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["style9-next-styles"],
		evidenceIds: ["style9-installed-proof"],
		note: "A pinned Style9 Next.js example is exercised through the installed Style9 Vite compiler with named maps, composition, hover output, SSR, hydration, and browser parity. The proof covers the static compiler lane; dynamic style-map expressions and framework-specific compiler options remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.NextYakToYumCSS,
		from: CodemodAdapterId.NextYak,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["next-yak-dynamic-benchmark"],
		evidenceIds: ["next-yak-installed-proof"],
		note: "A pinned css-in-js-bench dynamic-interpolation example is exercised through installed next-yak Vite and YumCSS runtime carriers with typecheck, build, SSR, hydration, browser parity, and inline-style-aware CSS accounting. Nested dynamic template composition and non-React compiler hosts remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.LinariaToYumCSS,
		from: CodemodAdapterId.Linaria,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["linaria-solid-example"],
		evidenceIds: ["linaria-installed-proof"],
		note: "A pinned Linaria Astro/Solid example is exercised through the installed Linaria compiler and a YumCSS Vite target with static styled components, pseudo-conditions, typecheck, build, SSR, hydration, and browser parity. Dynamic expressions, theme functions, and compiler options outside this static lane remain explicit residual territory; the measured CSS comparison is diagnostic when the runtime carrier is larger.",
	},
	{
		id: MigrationRouteProofRouteId.TreatToYumCSS,
		from: CodemodAdapterId.Treat,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["treat-button"],
		evidenceIds: ["treat-installed-proof"],
		note: "A pinned Treat Gatsby button style is compiled with Treat's official Webpack plugin and compared with an installed YumCSS Vite target across static declarations, pseudo-conditions, typecheck, build, SSR, hydration, and browser parity. createTheme, styleMap/theme runtime APIs, and dynamic style functions remain explicit residual territory; runtime CSS is currently a measured diagnostic trade-off against Treat's extracted stylesheet.",
	},
	{
		id: MigrationRouteProofRouteId.SolidStyledToYumCSS,
		from: CodemodAdapterId.SolidStyled,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["solid-styled-runtime"],
		evidenceIds: ["solid-styled-installed-proof"],
		note: "A pinned solid-styled-components test host is exercised through installed Solid and YumCSS runtimes with static styles, function styles, composition, custom hosts, typecheck, build, SSR, hydration, and browser parity. ThemeProvider semantics, nested dynamic templates, and unsupported Solid control-flow/compiler behavior remain explicit residual territory.",
	},
	{
		id: MigrationRouteProofRouteId.VueStyledToYumCSS,
		from: CodemodAdapterId.VueStyled,
		to: CodemodAdapterId.YumCSS,
		maturity: MigrationRouteMaturityTag.Experimental,
		execution: MigrationRouteProofExecutionTag.InstalledProject,
		requiredDimensions: PROJECT_PROOF_DIMENSIONS,
		referenceIds: ["vue-styled-css-test"],
		evidenceIds: ["vue-styled-installed-proof"],
		note: "A pinned vue-styled-components playground SFC is exercised through installed Vue and YumCSS runtimes with script-block scanning, static and dynamic props, styled subjects, typecheck, build, SSR, hydration, and browser parity. Vue macro semantics, unsupported component expressions, and theme-provider behavior beyond the proven prop lane remain explicit residual territory.",
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
		id: MigrationRouteProofRouteId.YumCSSToUnoCss,
		from: CodemodAdapterId.YumCSS,
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
				(evidence.css.targetBytes <= 0 &&
					!(evidence.css.targetBytes === 0 && evidence.css.comparison === "diagnostic")) ||
				(evidence.css.targetNotLarger !== undefined &&
					evidence.css.targetNotLarger !== true &&
					evidence.css.comparison !== "diagnostic")
			)
				errors.push(`${route.id}: evidence ${evidenceId} did not prove CSS size output`);
		}
	}
	return errors;
}
