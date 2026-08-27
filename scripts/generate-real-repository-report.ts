import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PandwindMeta } from "../packages/codemod/src/meta.ts";
import {
	REAL_REPOSITORY_CORPUS,
	runAdapterMigration,
	runPandaMigration,
} from "../packages/codemod/src/swap/index.ts";

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
	emotion: ["@emotion/css"],
	"styled-components": ["styled-components"],
};

function dependencyNames(value: readonly { packages: readonly { name: string }[] }[]): string[] {
	return [
		...new Set(value.flatMap((item) => item.packages.map((dependency) => dependency.name))),
	].toSorted();
}

const reports = [] as Array<Record<string, unknown>>;
for (const fixture of REAL_REPOSITORY_CORPUS) {
	let output = fixture.source;
	let converted = 0;
	let skipped = 0;
	let residuals = 0;
	let emittedModules: readonly string[] = [];
	let targetPackages: string[] = [];
	if (fixture.from === "panda") {
		const root = mkdtempSync(join(tmpdir(), "pandwind-real-corpus-"));
		try {
			const file = join(root, "Page.tsx");
			writeFileSync(file, fixture.source);
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
			emittedModules = report.emittedModules;
			targetPackages = ["pandwind"];
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	} else {
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
		targetPackages = dependencyNames(result.dependencies);
	}
	const sourceRuntimePackages = [...(sourcePackages[fixture.from] ?? [])];
	const added = targetPackages.filter((name) => !sourceRuntimePackages.includes(name));
	const removed = sourceRuntimePackages.filter((name) => !targetPackages.includes(name));
	reports.push({
		id: fixture.id,
		repository: fixture.repository,
		commit: fixture.commit,
		path: fixture.path,
		adapterRoute: `${fixture.from} -> ${fixture.to}`,
		sourceBytes: Buffer.byteLength(fixture.source),
		outputBytes: Buffer.byteLength(output),
		outputByteDelta: Buffer.byteLength(output) - Buffer.byteLength(fixture.source),
		converted,
		skipped,
		residuals,
		emittedModules,
		runtimeBundleImpact: {
			measured: false,
			sourceRuntimePackages,
			targetRuntimePackages: targetPackages,
			added,
			removed,
			byteDelta: Buffer.byteLength(output) - Buffer.byteLength(fixture.source),
		},
	});
}

console.log(JSON.stringify({ schema: "pandwind.real-repository-report/1", reports }, null, 2));
