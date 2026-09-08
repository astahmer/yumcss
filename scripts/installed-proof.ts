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
	const files = report.files ?? [];
	if (
		files.length === 0 ||
		files.some(
			(file) =>
				typeof file.converted !== "number" ||
				typeof file.skipped !== "number" ||
				typeof file.residuals !== "number" ||
				file.canonical === undefined,
		)
	) {
		throw new Error(`installed ${label} proof received an incomplete codemod report`);
	}
	const canonicalFiles = files
		.map((file) => file.canonical!)
		.filter((canonical) => canonical.checked);
	if (canonicalFiles.length === 0)
		throw new Error(`installed ${label} proof received no canonical migration evidence`);
	return {
		converted: files.reduce((total, file) => total + file.converted!, 0),
		skipped: files.reduce((total, file) => total + file.skipped!, 0),
		residuals: files.reduce((total, file) => total + file.residuals!, 0),
		canonical: {
			checked: canonicalFiles.every((canonical) => canonical.checked),
			equal: canonicalFiles.every((canonical) => canonical.equal),
			sourceBytes: canonicalFiles.reduce((total, canonical) => total + canonical.sourceBytes, 0),
			targetBytes: canonicalFiles.reduce((total, canonical) => total + canonical.targetBytes, 0),
			differences: canonicalFiles.flatMap((canonical) => canonical.differences),
		},
	};
}
