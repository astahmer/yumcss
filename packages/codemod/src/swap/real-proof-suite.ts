import { DifferentialProofKind } from "./identifiers.ts";

export enum RealMigrationProofDimension {
	Identity = "identity",
	CssSize = "css-size",
}

export interface RealMigrationProof {
	readonly id: string;
	readonly adapter: string;
	readonly sourceCommit: string;
	readonly lane: string;
	readonly dimensions: Readonly<{
		readonly [DifferentialProofKind.CanonicalCss]: {
			readonly checked: boolean;
			readonly equivalent: boolean;
		};
		readonly [DifferentialProofKind.BrowserStates]: {
			readonly checked: boolean;
			readonly equivalent: boolean;
			readonly routes: number;
			readonly errors: number;
		};
		readonly [DifferentialProofKind.SsrHydration]: {
			readonly checked: boolean;
			readonly equivalent: boolean;
			readonly routes: number;
			readonly failures: number;
		};
		readonly [DifferentialProofKind.RscStreaming]: {
			readonly checked: boolean;
			readonly equivalent: boolean;
		};
		readonly [DifferentialProofKind.Dependencies]: {
			readonly checked: boolean;
			readonly equivalent: boolean;
		};
		readonly [DifferentialProofKind.Residuals]: {
			readonly checked: boolean;
			readonly equivalent: boolean;
		};
	}>;
	readonly css: {
		readonly checked: boolean;
		readonly baselineBytes: number;
		readonly migratedBytes: number;
	};
}

export interface RealMigrationProofFailure {
	readonly id: string;
	readonly dimension: DifferentialProofKind | RealMigrationProofDimension;
	readonly message: string;
}

export interface RealMigrationProofReport {
	readonly cases: number;
	readonly failures: readonly RealMigrationProofFailure[];
	readonly valid: boolean;
}

/** Enforces the evidence bar for a claimed real-repository migration. */
// oxlint-disable-next-line typescript/no-extraneous-class -- scoped proof policy
export class RealMigrationProofSuite {
	static inspect(cases: readonly RealMigrationProof[]): RealMigrationProofReport {
		const failures: RealMigrationProofFailure[] = [];
		const ids = new Set<string>();
		for (const proof of cases) {
			if (ids.has(proof.id))
				failures.push({
					id: proof.id,
					dimension: RealMigrationProofDimension.Identity,
					message: "duplicate proof id",
				});
			ids.add(proof.id);
			if (proof.sourceCommit.length !== 40)
				failures.push({
					id: proof.id,
					dimension: RealMigrationProofDimension.Identity,
					message: "source commit is not pinned",
				});
			for (const dimension of Object.values(DifferentialProofKind)) {
				const evidence = proof.dimensions[dimension];
				if (!evidence.checked)
					failures.push({ id: proof.id, dimension, message: "proof dimension was not executed" });
				if ("equivalent" in evidence && !evidence.equivalent)
					failures.push({ id: proof.id, dimension, message: "proof dimension is not equivalent" });
			}
			const browser = proof.dimensions[DifferentialProofKind.BrowserStates];
			if (browser.routes === 0)
				failures.push({
					id: proof.id,
					dimension: DifferentialProofKind.BrowserStates,
					message: "browser proof has no routes",
				});
			if (browser.errors !== 0)
				failures.push({
					id: proof.id,
					dimension: DifferentialProofKind.BrowserStates,
					message: `${browser.errors} browser error(s)`,
				});
			const ssr = proof.dimensions[DifferentialProofKind.SsrHydration];
			if (ssr.routes === 0)
				failures.push({
					id: proof.id,
					dimension: DifferentialProofKind.SsrHydration,
					message: "SSR/hydration proof has no routes",
				});
			if (ssr.failures !== 0)
				failures.push({
					id: proof.id,
					dimension: DifferentialProofKind.SsrHydration,
					message: `${ssr.failures} SSR/hydration failure(s)`,
				});
			if (!proof.css.checked || proof.css.migratedBytes > proof.css.baselineBytes)
				failures.push({
					id: proof.id,
					dimension: RealMigrationProofDimension.CssSize,
					message: "migrated CSS is larger than the baseline or was not measured",
				});
		}
		return { cases: cases.length, failures, valid: failures.length === 0 };
	}

	static assert(report: RealMigrationProofReport): void {
		if (!report.valid)
			throw new Error(
				`real migration proof failed: ${report.failures.map((failure) => `${failure.id} ${failure.dimension}: ${failure.message}`).join("; ")}`,
			);
	}
}
