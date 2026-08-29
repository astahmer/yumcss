import { describe, expect, test } from "vitest";
import {
	DifferentialProofKind,
	RealMigrationProofDimension,
	RealMigrationProofSuite,
} from "../src/swap/index.ts";

const proof = {
	id: "stylex-docs",
	adapter: "stylex",
	sourceCommit: "0123456789abcdef0123456789abcdef01234567",
	lane: "atomic-css",
	dimensions: {
		[DifferentialProofKind.CanonicalCss]: { checked: true, equivalent: true },
		[DifferentialProofKind.BrowserStates]: {
			checked: true,
			equivalent: true,
			routes: 4,
			errors: 0,
		},
		[DifferentialProofKind.SsrHydration]: {
			checked: true,
			equivalent: true,
			routes: 4,
			failures: 0,
		},
		[DifferentialProofKind.RscStreaming]: { checked: true, equivalent: true },
		[DifferentialProofKind.Dependencies]: { checked: true, equivalent: true },
		[DifferentialProofKind.Residuals]: { checked: true, equivalent: true },
	},
	css: { checked: true, baselineBytes: 100, migratedBytes: 99 },
} as const;

describe("RealMigrationProofSuite", () => {
	test("accepts a complete pinned proof", () => {
		expect(RealMigrationProofSuite.inspect([proof]).valid).toBe(true);
	});

	test("rejects an unexecuted SSR proof and a larger stylesheet", () => {
		const report = RealMigrationProofSuite.inspect([
			{
				...proof,
				dimensions: {
					...proof.dimensions,
					[DifferentialProofKind.SsrHydration]: {
						checked: false,
						equivalent: true,
						routes: 0,
						failures: 0,
					},
				},
				css: { checked: true, baselineBytes: 100, migratedBytes: 101 },
			},
		]);
		expect(report.valid).toBe(false);
		expect(
			report.failures.some((failure) => failure.dimension === DifferentialProofKind.SsrHydration),
		).toBe(true);
		expect(
			report.failures.some((failure) => failure.dimension === RealMigrationProofDimension.CssSize),
		).toBe(true);
	});
});
