import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PandwindMeta } from "../packages/codemod/src/meta.ts";
import {
	createRealRepositoryCorpus,
	getCodemodAdapter,
	runAdapterMigration,
	runPandaMigration,
} from "../packages/codemod/src/swap/index.ts";
import { CodemodAdapterId } from "../packages/codemod/src/swap/identifiers.ts";

const referenceRoot = "/Users/astahmer/.references";
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

const emptyMeta = {
	keys: [],
	keysByBase: new Map(),
	valueLiterals: new Map(),
	variants: new Map(),
	conflicts: new Map(),
	bridgeInverse: new Map(),
	tokens: undefined,
} as unknown as PandwindMeta;

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
	bamboo: ["@bamboocss/dev", "@bamboocss/vite"],
	"next-yak": ["next-yak"],
	"chakra-ui": ["@chakra-ui/react"],
	mui: ["@mui/system", "@mui/material"],
	mantine: ["@mantine/core"],
};

function dependencyNames(value: readonly { packages: readonly { name: string }[] }[]): string[] {
	return [
		...new Set(value.flatMap((item) => item.packages.map((dependency) => dependency.name))),
	].toSorted();
}

const reports = [] as Array<Record<string, unknown>>;
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
		const root = mkdtempSync(join(tmpdir(), "pandwind-real-corpus-"));
		try {
			const file = join(root, "Page.tsx");
			writeFileSync(file, fixture.source);
			// The temporary project must be isolated before its migration runs.
			// oxlint-disable-next-line no-await-in-loop
			const report = await runPandaMigration({
				projectRoot: root,
				patterns: ["Page.tsx"],
				meta: emptyMeta,
				write: true,
				diff: false,
				skipMarker: "pandwind:migrate-skip",
			});
			output = readFileSync(file, "utf8");
			converted = report.cssCallsConverted + report.factoryElementsConverted;
			skipped = report.cssCallsFlagged + report.factoryElementsFlagged;
			residuals = Object.values(report.residualsByKind).reduce((total, count) => total + count, 0);
			residualKinds = report.residualsByKind;
			emittedModules = report.emittedModules;
			targetPackages = ["pandwind"];
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	} else {
		const sourceAdapter = getCodemodAdapter(fixture.from);
		if (sourceAdapter === undefined) throw new Error(`missing adapter ${fixture.from}`);
		const detected = sourceAdapter.detect({ file: fixture.path, source: fixture.source });
		detection = detected;
		const result = runAdapterMigration(fixture.source, {
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
		canonicalCss:
			adapterValidations.length === 0
				? {
						checked: false,
						reason: "pipeline migration did not expose an adapter-level canonical CSS pair",
					}
				: {
						checked: true,
						equal: adapterValidations.every((validation) => validation.valid),
						sourceBytes: canonicalSourceBytes,
						targetBytes: canonicalTargetBytes,
						byteDelta: canonicalTargetBytes - canonicalSourceBytes,
					},
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

console.log(
	JSON.stringify(
		{
			schema: "pandwind.real-repository-report/2",
			generatedFrom: "scripts/generate-real-repository-report.ts",
			cloneRoot: referenceRoot,
			sourceFiles: corpus.references.length,
			reports,
			bundleImpact: {
				measured: false,
				reason:
					"reference repositories are cloned without installing their dependency graphs; the runner records source/output bytes and dependency deltas without fabricating bundle numbers",
			},
		},
		null,
		2,
	),
);
