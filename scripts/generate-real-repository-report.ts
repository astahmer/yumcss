import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createEmptyYumCSSMeta } from "@yumcss/codemod/migration/meta";
import {
	classifyRealRepositoryProof,
	createRealRepositoryCorpus,
	getCodemodAdapter,
	MIGRATION_ROUTE_PROOF_CATALOG,
	MigrationRouteProofExecutionTag,
	runAdapterMigrationAsync,
	runPandaMigration,
} from "@yumcss/codemod/swap";
import { CodemodAdapterId } from "@yumcss/codemod/swap/identifiers";
import { createReferenceWorkspace } from "./reference-workspace.ts";

const referenceRoot = createReferenceWorkspace().root;
const corpus = createRealRepositoryCorpus();

function readPinnedReference(reference: (typeof corpus.references)[number]): string {
	const actualCommit = execFileSync(
		"git",
		["-C", join(referenceRoot, reference.clone), "rev-parse", "HEAD"],
		{
			encoding: "utf8",
		},
	).trim();
	if (actualCommit !== reference.commit)
		throw new Error(`${reference.clone} moved: expected ${reference.commit}, got ${actualCommit}`);
	return execFileSync(
		"git",
		["-C", join(referenceRoot, reference.clone), "show", `${reference.commit}:${reference.path}`],
		{ encoding: "utf8" },
	);
}

const emptyMeta = createEmptyYumCSSMeta();

const sourcePackages: Readonly<Record<string, readonly string[]>> = {
	panda: ["@pandacss/dev"],
	emotion: ["@emotion/css", "@emotion/react"],
	"styled-components": ["styled-components"],
	"vanilla-extract": ["@vanilla-extract/css"],
	stitches: ["@stitches/react"],
	linaria: ["@linaria/core", "@linaria/react"],
	jss: ["jss", "react-jss"],
	fela: ["fela", "react-fela"],
	goober: ["goober"],
	aphrodite: ["aphrodite"],
	style9: ["style9"],
	treat: ["treat"],
	compiled: ["@compiled/react", "@compiled/css-in-js"],
	"solid-styled": ["solid-styled-components"],
	"vue-styled": ["vue-styled-components"],
	stylex: ["@stylexjs/stylex"],
	"react-strict-dom": ["react-strict-dom"],
	bamboo: ["@bamboocss/dev", "@bamboocss/vite"],
	"next-yak": ["next-yak"],
	"chakra-ui": ["@chakra-ui/react"],
	mui: ["@mui/system", "@mui/material"],
	mantine: ["@mantine/core"],
	tokenami: ["@tokenami/css", "@tokenami/config"],
	unocss: ["unocss", "@unocss/core"],
	tailwind: ["tailwindcss", "@tailwindcss/node"],
};

function dependencyNames(value: readonly { packages: readonly { name: string }[] }[]): string[] {
	return [
		...new Set(value.flatMap((item) => item.packages.map((dependency) => dependency.name))),
	].toSorted();
}

interface GeneratedReport {
	readonly id: string;
	readonly adapterRoute: string;
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly promotion: {
		readonly eligible: boolean;
		readonly reasons: readonly string[];
		readonly dimensions: Readonly<
			Record<string, { readonly status: string; readonly reason?: string }>
		>;
	};
	readonly [key: string]: unknown;
}

const reports = [] as GeneratedReport[];
const fixtures = [
	...corpus.inline,
	...corpus.references.map((reference) => ({
		...reference,
		source: readPinnedReference(reference),
	})),
];
for (const fixture of fixtures) {
	let output = fixture.source;
	let converted = 0;
	let skipped = 0;
	let residuals = 0;
	let emittedModules: readonly string[] = [];
	let targetPackages: string[] = [];
	let detection = { matched: true, confidence: 1, evidence: ["panda project pipeline"] };
	let validations = 0;
	let adapterValidations: readonly {
		canonicalSource: string;
		canonicalTarget: string;
		valid: boolean;
	}[] = [];
	let residualKinds: Record<string, number> = {};
	let manualFixes: string[] = [];
	if (fixture.from === CodemodAdapterId.Panda) {
		const root = mkdtempSync(join(tmpdir(), "yumcss-real-corpus-"));
		try {
			const file = join(root, "Page.tsx");
			writeFileSync(file, fixture.source);
			// The temporary project must be isolated before its migration runs.
			const report = await runPandaMigration({
				projectRoot: root,
				patterns: ["Page.tsx"],
				meta: emptyMeta,
				write: true,
				diff: false,
				skipMarker: "yumcss:migrate-skip",
			});
			output = readFileSync(file, "utf8");
			converted = report.cssCallsConverted + report.factoryElementsConverted;
			skipped = report.cssCallsFlagged + report.factoryElementsFlagged;
			residuals = Object.values(report.residualsByKind).reduce((total, count) => total + count, 0);
			residualKinds = report.residualsByKind;
			emittedModules = report.emittedModules;
			targetPackages = ["yumcss"];
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	} else {
		const sourceAdapter = getCodemodAdapter(fixture.from);
		if (sourceAdapter === undefined) throw new Error(`missing adapter ${fixture.from}`);
		const detected = sourceAdapter.detect({ file: fixture.path, source: fixture.source });
		detection = detected;
		// Preserve corpus order so the JSON report remains reproducible.
		const result = await runAdapterMigrationAsync(fixture.source, {
			from: fixture.from,
			to: fixture.to,
			file: fixture.path,
			semantic: { source: { file: fixture.path, framework: fixture.framework } },
		});
		output = result.code;
		converted = result.converted;
		skipped = result.skipped;
		residuals = result.residuals.length;
		validations = result.validations.length;
		adapterValidations = result.validations;
		residualKinds = Object.fromEntries(
			result.residuals.reduce(
				(counts, residual) => counts.set(residual.kind, (counts.get(residual.kind) ?? 0) + 1),
				new Map<string, number>(),
			),
		);
		manualFixes = [
			...new Set(
				result.residuals
					.map((residual) => residual.hint)
					.filter((hint): hint is string => hint !== undefined),
			),
		];
		targetPackages = dependencyNames(result.dependencies);
	}
	const sourceRuntimePackages = [...(sourcePackages[fixture.from] ?? [])];
	const added = targetPackages.filter((name) => !sourceRuntimePackages.includes(name));
	const sourceOwnedModules =
		fixture.from === CodemodAdapterId.Panda
			? sourceRuntimePackages
			: (getCodemodAdapter(fixture.from)?.sourceModules ?? []);
	const removed = sourceRuntimePackages.filter(
		(name) => sourceOwnedModules.includes(name) && !targetPackages.includes(name),
	);
	const canonicalSourceBytes = adapterValidations.reduce(
		(total, validation) => total + Buffer.byteLength(validation.canonicalSource),
		0,
	);
	const canonicalTargetBytes = adapterValidations.reduce(
		(total, validation) => total + Buffer.byteLength(validation.canonicalTarget),
		0,
	);
	const hasUnresolvedRuntimeSemantics = adapterValidations.some(
		(validation) =>
			!validation.valid &&
			/=>|\bfunction\b|\$\{|\bprops\b|\btheme\b/.test(
				`${validation.canonicalSource}\n${validation.canonicalTarget}`,
			),
	);
	const canonicalComparable = adapterValidations.length > 0 && !hasUnresolvedRuntimeSemantics;
	const promotion = classifyRealRepositoryProof({
		pipelineUnpaired: fixture.from === CodemodAdapterId.Panda || adapterValidations.length === 0,
		runtimeDependent: hasUnresolvedRuntimeSemantics,
		canonicalChecked: canonicalComparable,
		...(canonicalComparable
			? { canonicalEqual: adapterValidations.every((validation) => validation.valid) }
			: {}),
		residuals,
		skipped,
		streamingApplicable: fixture.framework === "react",
	});
	reports.push({
		id: fixture.id,
		repository: fixture.repository,
		commit: fixture.commit,
		path: fixture.path,
		adapterRoute: `${fixture.from} -> ${fixture.to}`,
		detection,
		sourceBytes: Buffer.byteLength(fixture.source),
		outputBytes: Buffer.byteLength(output),
		outputByteDelta: Buffer.byteLength(output) - Buffer.byteLength(fixture.source),
		converted,
		skipped,
		residuals,
		residualKinds,
		validations,
		canonicalCss: !canonicalComparable
			? {
					checked: false,
					reason:
						adapterValidations.length === 0
							? "pipeline migration did not expose an adapter-level canonical CSS pair"
							: "runtime-dependent semantics require browser/SSR proof before canonical comparison",
				}
			: {
					checked: true,
					equal: adapterValidations.every((validation) => validation.valid),
					sourceBytes: canonicalSourceBytes,
					targetBytes: canonicalTargetBytes,
					byteDelta: canonicalTargetBytes - canonicalSourceBytes,
				},
		promotion,
		manualFixes,
		emittedModules,
		runtimeBundleImpact: {
			measured: false,
			measurement: "source-artifact",
			notMeasuredReason: "reference repositories are intentionally not installed or bundled in CI",
			sourceRuntimePackages,
			targetRuntimePackages: targetPackages,
			added,
			removed,
			byteDelta: Buffer.byteLength(output) - Buffer.byteLength(fixture.source),
		},
	});
}

const report = {
	schema: "yumcss.real-repository-report/1",
	generatedFrom: "scripts/generate-real-repository-report.ts",
	cloneRoot: "${YUMCSS_REFERENCE_ROOT:-~/.references}",
	sourceFiles: corpus.references.length,
	reports,
	routeProof: MIGRATION_ROUTE_PROOF_CATALOG.map((route) => {
		const routeReports = reports.filter(
			(item) => item.adapterRoute === `${route.from} -> ${route.to}`,
		);
		const dimensions = Object.fromEntries(
			route.requiredDimensions.map((dimension) => {
				const statuses = routeReports.map(
					(item) => item.promotion.dimensions[dimension]?.status ?? "unavailable",
				);
				const status =
					routeReports.length === 0
						? "unavailable"
						: statuses.every((value) => value === "passed")
							? "passed"
							: statuses.some((value) => value === "failed")
								? "failed"
								: "pending";
				return [dimension, { status }];
			}),
		);
		const eligible =
			route.execution === MigrationRouteProofExecutionTag.InstalledProject &&
			routeReports.length > 0 &&
			routeReports.every((item) => item.promotion.eligible) &&
			route.requiredDimensions.every((dimension) => dimensions[dimension]?.status === "passed");
		return {
			id: route.id,
			from: route.from,
			to: route.to,
			maturity: route.maturity,
			execution: route.execution,
			referenceIds: route.referenceIds,
			requiredDimensions: route.requiredDimensions,
			dimensions,
			status: eligible ? "passed" : routeReports.length === 0 ? "unavailable" : "pending",
			eligible,
			reportIds: routeReports.map((item) => item.id),
			reasons: routeReports.flatMap((item) => item.promotion.reasons),
			note: route.note,
		};
	}),
	bundleImpact: {
		measured: false,
		reason:
			"reference repositories are cloned without installing their dependency graphs; the runner records source/output bytes and dependency deltas without fabricating bundle numbers",
	},
};
const serialized = JSON.stringify(report, null, 2);
if (process.argv.includes("--write")) {
	const output =
		process.env.YUMCSS_PROOF_OUTPUT ??
		join(tmpdir(), "yumcss-pivot-proof", "real-repository-migrations-v2.json");
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, `${serialized}\n`);
	console.error(`wrote source-only proof report: ${output}`);
}
console.log(serialized);
