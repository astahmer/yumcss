/**
 * GitHub workflow-command annotations (plans/019 feature 5).
 *
 * Emits `::warning file=...,line=...,title=...` lines so GitHub Actions
 * renders findings inline on the PR diff. The emitter only PRINTS lines —
 * wiring into an actual CI workflow is deliberately deferred (see
 * PUBLISHING.md); running locally is a no-op display.
 *
 * GitHub caps at 10 warnings per command per step and 50 total per run;
 * we cap at MAX_ANNOTATIONS and note truncation in the final line.
 */
import type { CssBudget } from "./css-budget.ts";
import type { FoldSummary } from "./analyze.ts";

export const MAX_ANNOTATIONS = 50;

export interface Annotation {
	file: string;
	line: number;
	title: string;
	message: string;
}

/** Property values: delimiters must be percent-encoded. */
const escapeProperty = (value: string): string =>
	value
		.replace(/%/g, "%25")
		.replace(/\r/g, "%0D")
		.replace(/\n/g, "%0A")
		.replace(/:/g, "%3A")
		.replace(/,/g, "%2C");
/** Message data: only %, CR and LF are encoded (GitHub convention). */
const escapeData = (value: string): string =>
	value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/** Missing-css sites first (correctness), then dead candidates (hygiene). */
export function collectAnnotations(
	summary: FoldSummary,
	budget: CssBudget | undefined,
): Array<Annotation> {
	const out: Array<Annotation> = [];
	for (const file of summary.files) {
		for (const site of file.missingCss) {
			out.push({
				file: file.file,
				line: site.line,
				title: "missing-css",
				message: `"${site.token}" matches no Tailwind candidate — it will render unstyled`,
			});
		}
		// Correctness lane first (missing-css), then the off-design-system
		// hygiene lane — same order rationale as the original two-lane split.
		for (const site of file.arbitraryValues) {
			out.push({
				file: file.file,
				line: site.line,
				title: "off-design-system",
				message: `"${site.token}" uses an arbitrary value outside the design system`,
			});
		}
	}
	void budget; // budget dead-candidates lack file/line coords — reported by --css instead
	return out.slice(0, MAX_ANNOTATIONS);
}

export function formatAnnotations(annotations: Array<Annotation>, truncated: boolean): string {
	const lines = annotations.map(
		(a) =>
			`::warning file=${escapeProperty(a.file)},line=${a.line},title=${escapeProperty(a.title)}::${escapeData(a.message)}`,
	);
	if (truncated) {
		lines.push(
			`::warning title=pandwind::annotation cap (${MAX_ANNOTATIONS}) reached — output truncated`,
		);
	}
	return lines.join("\n");
}
