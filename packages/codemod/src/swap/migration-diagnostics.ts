import type { AdapterCapabilityIssue } from "./capabilities.ts";
import type { StyleProgramResidual } from "./semantic-ir.ts";
import { MigrationSkipReason } from "./identifiers.ts";

export interface MigrationSkipDiagnosticInput {
	readonly marker: string;
	readonly blockers?: readonly AdapterCapabilityIssue[];
	readonly configurationResiduals?: readonly StyleProgramResidual[];
	readonly parseResiduals?: readonly StyleProgramResidual[];
	readonly loweringResiduals?: readonly StyleProgramResidual[];
}

/**
 * Formats a stable, source-preserving marker without pretending every failed
 * route failed for the same reason. The residual report remains authoritative;
 * the marker is only a compact hint for a developer reading the source.
 */
export class MigrationDiagnostics {
	static skipMarker(input: MigrationSkipDiagnosticInput): string {
		const clauses: string[] = [];
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
		return clauses.length === 0
			? `// ${input.marker}`
			: `// ${input.marker} (${clauses.join(" | ")})`;
	}
}

function kinds(residuals: readonly StyleProgramResidual[]): string {
	return [...new Set(residuals.map((residual) => residual.kind))].join(", ");
}
