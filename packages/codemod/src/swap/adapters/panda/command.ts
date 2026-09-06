import { inferCommonRoot, runPandaMigration } from "./panda-migrate.ts";
import type { ProjectMigrationCommand } from "../../project-command.ts";
import { CodemodAdapterId } from "../../identifiers.ts";

const pandaMigrationCommand: ProjectMigrationCommand = {
	id: CodemodAdapterId.Panda,
	async run(context) {
		if (context.filePaths.length === 0) {
			console.error("codemod migrate: no matching files for project migration");
			process.exitCode = 1;
			return;
		}
		const projectRoot = inferCommonRoot(context.filePaths.map((path) => ({ path })));
		const report = await runPandaMigration({
			projectRoot,
			patterns: [...context.patterns],
			meta: context.meta,
			outDirName: context.outDir || "pandwind",
			write: context.write,
			diff: context.diff,
			skipMarker: context.skipMarker,
			force: context.force,
		});
		console.log(
			`\nproject migration: ${report.filesScanned} file(s) scanned · ${report.filesChanged} changed · ` +
				`${report.cssCallsConverted} css() converted · ${report.cssCallsFlagged} flagged · ` +
				`${report.factoryElementsConverted} factory elements converted · ${report.factoryElementsFlagged} flagged`,
		);
		for (const note of report.notes) console.log(`  note: ${note}`);
		console.log(`  tier-1 modules: ${report.tier1Modules.join(", ") || "(none)"}`);
		console.log(`  tier-0 folded: ${report.tier0Folded.join(", ") || "(none)"}`);
		console.log(`  pattern modules: ${report.patternModules.join(", ") || "(none)"}`);
		if (context.report) {
			console.log("  residuals by kind:");
			for (const [kind, count] of Object.entries(report.residualsByKind).toSorted(([a], [b]) =>
				a.localeCompare(b),
			))
				console.log(`    ${kind}: ${count}`);
		}
		if (!context.write) console.log("  dry-run (no files written)");
	},
};

export default pandaMigrationCommand;
