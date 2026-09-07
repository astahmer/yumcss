import {
	RealRepositoryProofDimension,
	RealRepositoryProofDimensionStatus,
	RealRepositoryProofStatus,
} from "./identifiers.ts";

export const REAL_REPOSITORY_PROOF_SCHEMA = "pandwind.real-repository-proof/1" as const;

export interface RealRepositoryProofInput {
	readonly pipelineUnpaired: boolean;
	readonly runtimeDependent: boolean;
	readonly canonicalChecked: boolean;
	readonly canonicalEqual?: boolean;
	readonly typecheckProven?: boolean;
	readonly buildProven?: boolean;
	readonly residuals: number;
	readonly skipped: number;
	readonly streamingApplicable: boolean;
	readonly browserProven?: boolean;
	readonly ssrHydrationProven?: boolean;
	readonly streamingProven?: boolean;
	readonly dependenciesMeasured?: boolean;
	readonly cssSizeMeasured?: boolean;
}

export interface RealRepositoryProofDimensionEvidence {
	readonly status: RealRepositoryProofDimensionStatus;
	readonly reason?: string;
}

export interface RealRepositoryPromotionEvidence {
	readonly schema: typeof REAL_REPOSITORY_PROOF_SCHEMA;
	readonly status: RealRepositoryProofStatus;
	readonly eligible: boolean;
	readonly dimensions: Readonly<
		Record<RealRepositoryProofDimension, RealRepositoryProofDimensionEvidence>
	>;
	readonly reasons: readonly string[];
}

const passed = (): RealRepositoryProofDimensionEvidence => ({
	status: RealRepositoryProofDimensionStatus.Passed,
});

const pending = (reason: string): RealRepositoryProofDimensionEvidence => ({
	status: RealRepositoryProofDimensionStatus.Pending,
	reason,
});

const failed = (reason: string): RealRepositoryProofDimensionEvidence => ({
	status: RealRepositoryProofDimensionStatus.Failed,
	reason,
});

const notApplicable = (): RealRepositoryProofDimensionEvidence => ({
	status: RealRepositoryProofDimensionStatus.NotApplicable,
});

/**
 * Classify evidence without promoting a source file on the basis of a
 * source-only migration. Every non-source dimension is explicit in the
 * report, so a future browser/SSR runner can upgrade dimensions independently.
 */
export function classifyRealRepositoryProof(
	input: RealRepositoryProofInput,
): RealRepositoryPromotionEvidence {
	const canonical = !input.canonicalChecked
		? pending("adapter-level canonical CSS pair was not exposed")
		: input.canonicalEqual === true
			? passed()
			: failed("canonical CSS differs");
	const typecheck =
		input.typecheckProven === true
			? passed()
			: pending("the converted reference was not typechecked with its installed dependencies");
	const build =
		input.buildProven === true
			? passed()
			: pending("the converted reference was not built with its installed project tooling");
	const browser =
		input.browserProven === true
			? passed()
			: pending("real browser states have not been executed for this reference");
	const ssr =
		input.ssrHydrationProven === true
			? passed()
			: pending("real SSR and hydration have not been executed for this reference");
	const streaming = !input.streamingApplicable
		? notApplicable()
		: input.streamingProven === true
			? passed()
			: pending("RSC/streaming proof is not available in the source-only runner");
	const dependencies =
		input.dependenciesMeasured === true
			? passed()
			: pending("dependency graphs are not installed by the reference runner");
	const cssSize =
		input.cssSizeMeasured === true
			? passed()
			: pending("built CSS size is not measured by the source-only runner");
	const dimensions = {
		[RealRepositoryProofDimension.CanonicalCss]: canonical,
		[RealRepositoryProofDimension.Typecheck]: typecheck,
		[RealRepositoryProofDimension.Build]: build,
		[RealRepositoryProofDimension.BrowserStates]: browser,
		[RealRepositoryProofDimension.SsrHydration]: ssr,
		[RealRepositoryProofDimension.RscStreaming]: streaming,
		[RealRepositoryProofDimension.Dependencies]: dependencies,
		[RealRepositoryProofDimension.CssSize]: cssSize,
	} satisfies Readonly<Record<RealRepositoryProofDimension, RealRepositoryProofDimensionEvidence>>;
	const reasons = [
		...(input.pipelineUnpaired ? ["pipeline migration has no adapter-level canonical pair"] : []),
		...(input.runtimeDependent
			? ["runtime-dependent semantics require browser and SSR proof"]
			: []),
		...(input.residuals > 0 ? [`${input.residuals} residual conversion(s) remain`] : []),
		...(input.skipped > 0 ? [`${input.skipped} source match(es) were skipped`] : []),
		...Object.values(dimensions)
			.map((dimension) => dimension.reason)
			.filter((reason): reason is string => reason !== undefined),
	];
	const dimensionValues = Object.values(dimensions);
	const eligible =
		!input.pipelineUnpaired &&
		!input.runtimeDependent &&
		input.residuals === 0 &&
		input.skipped === 0 &&
		canonical.status === RealRepositoryProofDimensionStatus.Passed &&
		dimensionValues.every(
			(dimension) =>
				dimension.status === RealRepositoryProofDimensionStatus.Passed ||
				dimension.status === RealRepositoryProofDimensionStatus.NotApplicable,
		);
	const status = input.pipelineUnpaired
		? RealRepositoryProofStatus.PipelineUnpaired
		: input.runtimeDependent
			? RealRepositoryProofStatus.RuntimePending
			: input.canonicalChecked && input.canonicalEqual !== true
				? RealRepositoryProofStatus.SourceMismatch
				: RealRepositoryProofStatus.SourceStatic;
	return {
		schema: REAL_REPOSITORY_PROOF_SCHEMA,
		status,
		eligible,
		dimensions,
		reasons: [...new Set(reasons)],
	};
}
