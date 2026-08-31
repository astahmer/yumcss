import type { AdapterCapabilityIssue } from "./capabilities.ts";
import { MigrationSkipReason } from "./identifiers.ts";
import type { StyleRepresentationKind } from "./identifiers.ts";

export interface MigrationResidualLike {
	readonly kind: string;
	readonly text: string;
	readonly hint?: string;
}

export interface MigrationSkipDiagnosticInput {
	readonly marker: string;
	/** Optional route context for a developer-facing source marker. */
	readonly sourceAdapter?: string;
	readonly targetAdapter?: string;
	readonly blockers?: readonly AdapterCapabilityIssue[];
	readonly configurationResiduals?: readonly MigrationResidualLike[];
	readonly parseResiduals?: readonly MigrationResidualLike[];
	readonly loweringResiduals?: readonly MigrationResidualLike[];
	readonly availableRepresentations?: readonly StyleRepresentationKind[];
}

/**
 * Formats a stable, source-preserving marker without pretending every failed
 * route failed for the same reason. The residual report remains authoritative;
 * the marker is only a compact hint for a developer reading the source.
 */
export class MigrationDiagnostics {
	static skipMarker(input: MigrationSkipDiagnosticInput): string {
		const clauses: string[] = [];
		if (input.sourceAdapter !== undefined || input.targetAdapter !== undefined) {
			const source = input.sourceAdapter ?? "unknown-source";
			const target = input.targetAdapter ?? "unknown-target";
			clauses.push(`route: ${source} -> ${target}`);
		}
		if ((input.configurationResiduals?.length ?? 0) > 0)
			clauses.push(
				`${MigrationSkipReason.ConfigurationResidual}: ${kinds(input.configurationResiduals!)}`,
			);
		if ((input.parseResiduals?.length ?? 0) > 0)
			clauses.push(`${MigrationSkipReason.ParseResidual}: ${kinds(input.parseResiduals!)}`);
		if ((input.loweringResiduals?.length ?? 0) > 0)
			clauses.push(`${MigrationSkipReason.LoweringResidual}: ${kinds(input.loweringResiduals!)}`);
		if ((input.blockers?.length ?? 0) > 0) {
			const details = input
				.blockers!.map((issue) => `${issue.capability}: ${issue.detail}`)
				.join("; ");
			clauses.push(`${MigrationSkipReason.CapabilityBlocked}: ${details}`);
		}
		if ((input.availableRepresentations?.length ?? 0) > 0)
			clauses.push(`available: ${input.availableRepresentations!.join(", ")}`);
		return clauses.length === 0
			? `// ${input.marker}`
			: `// ${input.marker} (${clauses.join(" | ")})`;
	}
}

function kinds(residuals: readonly MigrationResidualLike[]): string {
	return [...new Set(residuals.map((residual) => residual.kind))].join(", ");
}
