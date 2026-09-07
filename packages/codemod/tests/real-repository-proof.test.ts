import { describe, expect, test } from "vitest";
import {
	classifyRealRepositoryProof,
	RealRepositoryProofDimension,
	RealRepositoryProofDimensionStatus,
	RealRepositoryProofStatus,
} from "../src/swap/index.ts";

describe("real repository proof classification", () => {
	test("only marks a static entry eligible when every applicable dimension passes", () => {
		const result = classifyRealRepositoryProof({
			pipelineUnpaired: false,
			runtimeDependent: false,
			canonicalChecked: true,
			canonicalEqual: true,
			typecheckProven: true,
			buildProven: true,
			residuals: 0,
			skipped: 0,
			streamingApplicable: false,
			browserProven: true,
			ssrHydrationProven: true,
			dependenciesMeasured: true,
			cssSizeMeasured: true,
		});

		expect(result.status).toBe(RealRepositoryProofStatus.SourceStatic);
		expect(result.eligible).toBe(true);
		expect(result.dimensions[RealRepositoryProofDimension.CanonicalCss].status).toBe(
			RealRepositoryProofDimensionStatus.Passed,
		);
		expect(result.dimensions[RealRepositoryProofDimension.RscStreaming].status).toBe(
			RealRepositoryProofDimensionStatus.NotApplicable,
		);
	});

	test("keeps runtime and unpaired evidence out of promotion", () => {
		const runtime = classifyRealRepositoryProof({
			pipelineUnpaired: false,
			runtimeDependent: true,
			canonicalChecked: false,
			residuals: 0,
			skipped: 0,
			streamingApplicable: true,
		});
		const pipeline = classifyRealRepositoryProof({
			pipelineUnpaired: true,
			runtimeDependent: false,
			canonicalChecked: false,
			residuals: 0,
			skipped: 0,
			streamingApplicable: true,
		});

		expect(runtime.status).toBe(RealRepositoryProofStatus.RuntimePending);
		expect(runtime.eligible).toBe(false);
		expect(pipeline.status).toBe(RealRepositoryProofStatus.PipelineUnpaired);
		expect(pipeline.eligible).toBe(false);
		const mismatch = classifyRealRepositoryProof({
			pipelineUnpaired: false,
			runtimeDependent: false,
			canonicalChecked: true,
			canonicalEqual: false,
			residuals: 0,
			skipped: 0,
			streamingApplicable: false,
		});
		expect(mismatch.status).toBe(RealRepositoryProofStatus.SourceMismatch);
		expect(mismatch.eligible).toBe(false);
	});
});
