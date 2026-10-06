import { describe, expect, test } from "vitest";
import {
	AdapterCapabilityEvidenceStatusTag,
	AdapterCapabilityLevelTag,
	AdapterCapabilityTag,
	AdapterCoverageEvidenceKindTag,
	CodemodAdapterId,
	RealRepositoryProofDimension,
	RealRepositoryProofDimensionStatus,
	StyleRepresentationKind,
	createAdapterCapabilityLedger,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
} from "../src/swap/index.ts";

describe("adapter capability ledger", () => {
	test("derives source/target claims and representations from the registry", () => {
		const registry = createBuiltinCodemodCatalog().registry;
		const ledger = createAdapterCapabilityLedger(registry);
		const emotion = ledger.get(CodemodAdapterId.Emotion, AdapterCapabilityTag.Declarations);
		const dynamic = ledger.get(CodemodAdapterId.Emotion, AdapterCapabilityTag.DynamicValues);

		expect(ledger.schema).toBe("yumcss.adapter-capability-ledger/1");
		expect(ledger.entries.length).toBeGreaterThan(registry.adapters.length);
		expect(emotion).toMatchObject({
			adapter: CodemodAdapterId.Emotion,
			level: AdapterCapabilityLevelTag.Exact,
			source: true,
			target: true,
			evidence: { status: AdapterCapabilityEvidenceStatusTag.Missing },
		});
		expect(emotion?.representations).toEqual([
			StyleRepresentationKind.Static,
			StyleRepresentationKind.TargetNative,
		]);
		expect(dynamic?.representations).toEqual([
			StyleRepresentationKind.Static,
			StyleRepresentationKind.CustomProperty,
			StyleRepresentationKind.RuntimeCarrier,
			StyleRepresentationKind.Residual,
		]);
	});

	test("promotes a capability only when its required real proof dimensions pass", () => {
		const emotion = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Emotion)!;
		const registry = createStyleAdapterRegistry([emotion]);
		const evidence = [
			{
				adapter: CodemodAdapterId.Emotion,
				fixture: "emotion-real",
				kind: AdapterCoverageEvidenceKindTag.RealRepository,
				capabilities: [AdapterCapabilityTag.Declarations],
				proof: {
					[RealRepositoryProofDimension.CanonicalCss]: RealRepositoryProofDimensionStatus.Passed,
					[RealRepositoryProofDimension.Typecheck]: RealRepositoryProofDimensionStatus.Passed,
					[RealRepositoryProofDimension.Build]: RealRepositoryProofDimensionStatus.Passed,
					[RealRepositoryProofDimension.Dependencies]: RealRepositoryProofDimensionStatus.Passed,
					[RealRepositoryProofDimension.CssSize]: RealRepositoryProofDimensionStatus.Passed,
				},
			},
		];
		const ledger = createAdapterCapabilityLedger(registry, { evidence });
		const declaration = ledger.get(CodemodAdapterId.Emotion, AdapterCapabilityTag.Declarations);

		expect(declaration?.evidence.status).toBe(AdapterCapabilityEvidenceStatusTag.Promoted);
		expect(declaration?.evidence.proof.required).toEqual([
			RealRepositoryProofDimension.CanonicalCss,
			RealRepositoryProofDimension.Typecheck,
			RealRepositoryProofDimension.Build,
			RealRepositoryProofDimension.Dependencies,
			RealRepositoryProofDimension.CssSize,
		]);
		expect(declaration?.evidence.proof.passed).toEqual(declaration?.evidence.proof.required);

		expect(declaration?.evidence).toMatchInlineSnapshot(`
			{
			  "contractFixtures": 0,
			  "fixtures": 1,
			  "proof": {
			    "passed": [
			      "canonical-css",
			      "typecheck",
			      "build",
			      "dependencies",
			      "css-size",
			    ],
			    "required": [
			      "canonical-css",
			      "typecheck",
			      "build",
			      "dependencies",
			      "css-size",
			    ],
			  },
			  "repositoryFixtures": 1,
			  "status": "promoted",
			}
		`);
	});

	test("does not require a route-specific branch for a substitute adapter", () => {
		const emotion = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Emotion)!;
		const registry = createStyleAdapterRegistry([emotion]);
		const ledger = createAdapterCapabilityLedger(registry);
		expect(ledger.get(CodemodAdapterId.Emotion, AdapterCapabilityTag.Declarations)?.target).toBe(
			true,
		);
		expect(ledger.get("missing", AdapterCapabilityTag.Declarations)).toBeUndefined();
	});
});
