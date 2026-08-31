import { describe, expect, test } from "vitest";
import {
	MigrationDiagnostics,
	MigrationSkipReason,
	StyleRepresentationKind,
} from "../src/swap/index.ts";

const residual = (kind: string) => ({ kind, text: kind });

describe("migration diagnostics", () => {
	test("identifies a target capability blocker", () => {
		const marker = MigrationDiagnostics.skipMarker({
			marker: "pandwind:migrate-skip",
			blockers: [
				{
					capability: "dynamic-values",
					detail: "dynamic expression",
					level: "unsupported",
					blocking: true,
				},
			],
		});

		expect(marker).toBe(
			"// pandwind:migrate-skip (capability-blocked: dynamic-values: dynamic expression)",
		);
		expect(marker).toContain(MigrationSkipReason.CapabilityBlocked);
	});

	test("does not mislabel source and lowering residuals as capability failures", () => {
		const marker = MigrationDiagnostics.skipMarker({
			marker: "pandwind:migrate-skip",
			parseResiduals: [residual("unrepresentable")],
			loweringResiduals: [residual("runtime-context")],
		});

		expect(marker).toBe(
			"// pandwind:migrate-skip (parse-residual: unrepresentable | lowering-residual: runtime-context)",
		);
		expect(marker).not.toContain(MigrationSkipReason.CapabilityBlocked);
	});

	test("always includes an actionable clause when a reason is supplied", () => {
		const marker = MigrationDiagnostics.skipMarker({
			marker: "pandwind:migrate-skip",
			loweringResiduals: [residual("dynamic")],
		});

		expect(marker).toContain(MigrationSkipReason.LoweringResidual);
		expect(marker).toContain("dynamic");
	});

	test("identifies configuration loading failures", () => {
		const marker = MigrationDiagnostics.skipMarker({
			marker: "pandwind:migrate-skip",
			configurationResiduals: [residual("configuration")],
		});

		expect(marker).toContain(MigrationSkipReason.ConfigurationResidual);
	});

	test("reports the representations the target can negotiate", () => {
		const marker = MigrationDiagnostics.skipMarker({
			marker: "pandwind:migrate-skip",
			availableRepresentations: [
				StyleRepresentationKind.Static,
				StyleRepresentationKind.CustomProperty,
				StyleRepresentationKind.Residual,
			],
		});

		expect(marker).toContain("available: static, custom-property, residual");
	});

	test("includes the ordered route when a capability blocks a migration", () => {
		const marker = MigrationDiagnostics.skipMarker({
			marker: "pandwind:migrate-skip",
			sourceAdapter: "styled-components",
			targetAdapter: "unocss",
			blockers: [
				{
					capability: "components",
					detail: "component subject",
					level: "unsupported",
					blocking: true,
				},
			],
		});

		expect(marker).toContain("route: styled-components -> unocss");
		expect(marker).toContain("components: component subject");
	});
});
