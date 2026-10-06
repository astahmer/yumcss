import type { FileFoldStats, FoldSummary } from "./analyze.ts";

/** Aggregate per-file analysis into a stable machine-readable summary. */
export function summarize(files: Array<FileFoldStats>): FoldSummary {
	const totalCxCalls = files.reduce((acc, f) => acc + f.cxCalls, 0);
	const fullFolded = files.reduce((acc, f) => acc + f.cxFoldedFull, 0);
	const partialFolded = files.reduce((acc, f) => acc + f.cxFoldedPartial, 0);
	const runtimeCalls = files.reduce((acc, f) => acc + f.cxRuntime, 0);
	const totalTwCalls = files.reduce((acc, f) => acc + f.twCalls, 0);
	const twFolded = files.reduce((acc, f) => acc + f.twFolded, 0);
	const eliminated =
		totalCxCalls === 0 ? 100 : Math.round(((fullFolded + partialFolded) / totalCxCalls) * 100);
	const filesWithCalls = files.filter((f) => f.cxCalls > 0);
	const filesEliminated = filesWithCalls.filter((f) => f.cxRuntime === 0).length;
	const entryEliminatedPct =
		filesWithCalls.length === 0 ? 100 : Math.round((filesEliminated / filesWithCalls.length) * 100);
	const totalMissingCss = files.reduce((acc, f) => acc + f.missingCss.length, 0);
	const totalArbitraryValues = files.reduce((acc, f) => acc + f.arbitraryValues.length, 0);
	return {
		files,
		totalCxCalls,
		fullFolded,
		partialFolded,
		runtimeCalls,
		eliminatedPct: eliminated,
		totalTwCalls,
		twFolded,
		filesEliminated,
		filesWithCalls: filesWithCalls.length,
		entryEliminatedPct,
		totalMissingCss,
		totalArbitraryValues,
	};
}

/** Human-readable report renderer, independent from analysis execution. */
export function formatReport(summary: FoldSummary): string {
	const lines: Array<string> = ["yumcss analyze — fold coverage", ""];
	lines.push(
		`${"file".padEnd(40)} ${"cx full/part/runtime".padStart(20)} ${"tw folded".padStart(12)}`,
	);
	for (const f of summary.files) {
		const cxCell = `${f.cxFoldedFull}/${f.cxFoldedPartial}/${f.cxRuntime}`;
		lines.push(
			`${f.file.slice(0, 40).padEnd(40)} ${cxCell.padStart(20)} ${(f.twFolded + "/" + f.twCalls).padStart(12)}`,
		);
		for (const site of f.runtimeSites) lines.push(`    ^ ${f.file}:${site.line} — ${site.reason}`);
		for (const site of f.missingCss) {
			lines.push(
				`    ^ ${f.file}:${site.line} — missing-css: no Tailwind candidate for "${site.token}"`,
			);
		}
		for (const site of f.arbitraryValues) {
			lines.push(
				`    ^ ${f.file}:${site.line} — off-design-system: "${site.token}" uses an arbitrary value outside the design system`,
			);
		}
	}
	lines.push("");
	lines.push(
		`cx(): ${summary.eliminatedPct}% of ${summary.totalCxCalls} calls eliminated at build time` +
			` (${summary.fullFolded} fully, ${summary.partialFolded} partially; ${summary.runtimeCalls} at runtime)`,
	);
	if (summary.totalTwCalls > 0)
		lines.push(`tw(): ${summary.twFolded}/${summary.totalTwCalls} calls inlined`);
	if (summary.totalMissingCss > 0)
		lines.push(
			`missing-css: ${summary.totalMissingCss} static class token(s) with no Tailwind candidate`,
		);
	if (summary.totalArbitraryValues > 0)
		lines.push(
			`off-design-system: ${summary.totalArbitraryValues} arbitrary-value token(s) outside the design system`,
		);
	return lines.join("\n");
}
