import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const limitationsPath = resolve(
	repositoryRoot,
	"docs/src/content/docs/contributing/limitations.md",
);
const realRepositoryReportPath = resolve(
	repositoryRoot,
	"plans/evidence/real-repository-migrations-v2.json",
);
const adapterReferenceReportPath = resolve(
	repositoryRoot,
	"plans/evidence/adapter-reference-proof.json",
);
const packageSurfacePath = resolve(repositoryRoot, "plans/evidence/package-surface.json");

interface RealRepositoryReport {
	readonly reports: readonly {
		readonly promotion: {
			readonly status: string;
			readonly dimensions: Readonly<Record<string, { readonly status: string }>>;
		};
	}[];
}

interface AdapterReferenceReport {
	readonly references: readonly {
		readonly migration: {
			readonly converted: number;
			readonly residuals: number;
			readonly valid: boolean;
		};
	}[];
}

interface PackageSurfaceReport {
	readonly records: readonly { readonly exportPaths: readonly string[] }[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const realRepository = readJson<RealRepositoryReport>(realRepositoryReportPath);
const adapterReference = readJson<AdapterReferenceReport>(adapterReferenceReportPath);
const packageSurface = readJson<PackageSurfaceReport>(packageSurfacePath);
const limitations = readFileSync(limitationsPath, "utf8");

const dimensions = realRepository.reports.flatMap((report) =>
	Object.values(report.promotion.dimensions),
);
const expectedRealRepository = {
	reports: realRepository.reports.length,
	passed: dimensions.filter((dimension) => dimension.status === "passed").length,
	pending: dimensions.filter((dimension) => dimension.status === "pending").length,
	pipelineUnpaired: realRepository.reports.filter(
		(report) => report.promotion.status === "pipeline-unpaired",
	).length,
};
const expectedAdapterReference = {
	probes: adapterReference.references.length,
	converted: adapterReference.references.reduce(
		(total, reference) => total + reference.migration.converted,
		0,
	),
	residuals: adapterReference.references.reduce(
		(total, reference) => total + reference.migration.residuals,
		0,
	),
	valid: adapterReference.references.filter((reference) => reference.migration.valid).length,
};
const expectedSurfaceExports = packageSurface.records.reduce(
	(total, record) => total + record.exportPaths.length,
	0,
);

const realRepositoryMatch = limitations.match(
	/real-repository report contains (\d+) reports, with (\d+) passed proof dimensions,\s*(\d+) pending dimensions, and (\d+) pipeline-unpaired references/,
);
const adapterReferenceMatch = limitations.match(
	/adapter\s+reference proof has (\d+) small probes, (\d+) converted sites, (\d+) residuals, and\s*(\d+) fully valid migrations/,
);
const surfaceMatch = limitations.match(/exposes (\d+) exported paths across five packages/);

const failures: string[] = [];
if (realRepositoryMatch === null) {
	failures.push("current-limitations.md has no real-repository evidence summary");
} else {
	const documented = {
		reports: Number(realRepositoryMatch[1]),
		passed: Number(realRepositoryMatch[2]),
		pending: Number(realRepositoryMatch[3]),
		pipelineUnpaired: Number(realRepositoryMatch[4]),
	};
	if (JSON.stringify(documented) !== JSON.stringify(expectedRealRepository)) {
		failures.push(
			`real-repository summary is stale: documented ${JSON.stringify(documented)}, expected ${JSON.stringify(expectedRealRepository)}`,
		);
	}
}
if (adapterReferenceMatch === null) {
	failures.push("current-limitations.md has no adapter-reference evidence summary");
} else {
	const documented = {
		probes: Number(adapterReferenceMatch[1]),
		converted: Number(adapterReferenceMatch[2]),
		residuals: Number(adapterReferenceMatch[3]),
		valid: Number(adapterReferenceMatch[4]),
	};
	if (JSON.stringify(documented) !== JSON.stringify(expectedAdapterReference)) {
		failures.push(
			`adapter-reference summary is stale: documented ${JSON.stringify(documented)}, expected ${JSON.stringify(expectedAdapterReference)}`,
		);
	}
}
if (surfaceMatch === null) {
	failures.push("current-limitations.md has no package-surface evidence summary");
} else if (Number(surfaceMatch[1]) !== expectedSurfaceExports) {
	failures.push(
		`package-surface summary is stale: documented ${surfaceMatch[1]}, expected ${expectedSurfaceExports}`,
	);
}

if (failures.length > 0) {
	throw new Error(
		["Proof documentation is stale:", ...failures.map((failure) => `- ${failure}`)].join("\n"),
	);
}

console.log(
	JSON.stringify(
		{
			schema: "yumcss.proof-documentation-check/1",
			realRepository: expectedRealRepository,
			adapterReference: expectedAdapterReference,
			surfaceExports: expectedSurfaceExports,
		},
		null,
		2,
	),
);
