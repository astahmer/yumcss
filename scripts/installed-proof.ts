export interface InstalledProofCanonicalEvidence {
	readonly checked: boolean;
	readonly equal: boolean;
	readonly sourceBytes: number;
	readonly targetBytes: number;
	readonly differences: readonly string[];
}

export interface InstalledProofMigrationSummary {
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly canonical: InstalledProofCanonicalEvidence;
}

interface InstalledCliReport {
	readonly files?: readonly {
		readonly converted?: number;
		readonly skipped?: number;
		readonly residuals?: number;
		readonly canonical?: InstalledProofCanonicalEvidence;
	}[];
}

/** Parse the machine-readable CLI report used by installed migration proofs. */
export function parseInstalledProofMigration(
	output: string,
	label: string,
): InstalledProofMigrationSummary {
	let report: InstalledCliReport;
	try {
		report = JSON.parse(output.trim()) as InstalledCliReport;
	} catch (error) {
		throw new Error(`installed ${label} proof received invalid codemod JSON`, { cause: error });
	}
	const file = report.files?.[0];
	if (
		file === undefined ||
		typeof file.converted !== "number" ||
		typeof file.skipped !== "number" ||
		typeof file.residuals !== "number" ||
		file.canonical === undefined
	) {
		throw new Error(`installed ${label} proof received an incomplete codemod report`);
	}
	return {
		converted: file.converted,
		skipped: file.skipped,
		residuals: file.residuals,
		canonical: file.canonical,
	};
}
