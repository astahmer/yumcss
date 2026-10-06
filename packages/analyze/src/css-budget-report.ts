import type { CssBudget } from "./css-budget-contracts.ts";

/** Human-readable budget report. */
function renderCssBudget(budget: CssBudget): string {
	const lines: string[] = [];
	lines.push("yumcss analyze — css budget (real-Tailwind compilation)");
	lines.push("");
	lines.push(
		`generated css: ${(budget.cssBytes / 1024).toFixed(2)} KB min / ${(budget.cssGzipBytes / 1024).toFixed(2)} KB gzip`,
	);
	lines.push(
		`rules: ${budget.rules} · candidates live/dead: ${budget.liveCandidates}/${budget.deadCandidates}`,
	);
	if (budget.componentScopeRules > 0) {
		lines.push(`component scopes (.pwc-*): ${budget.componentScopeRules} rule(s)`);
	}
	if (budget.perPrefix.length > 0) {
		lines.push("top prefixes:");
		for (const { prefix, rules } of budget.perPrefix) {
			lines.push(`    ${prefix.padEnd(30)} ${rules}`);
		}
	}
	if (budget.themeScopes.length > 0) {
		const totalBytes = budget.themeScopes.reduce((acc, t) => acc + t.bytes, 0);
		lines.push(
			`theme scopes: ${budget.themeScopes.length} (+${(totalBytes / 1024).toFixed(2)} KB total)`,
		);
		for (const t of budget.themeScopes) {
			lines.push(`    ${t.scope.padEnd(20)} ${t.vars} vars · ${(t.bytes / 1024).toFixed(2)} KB`);
		}
	}
	if (budget.deadCandidates > 0) {
		lines.push(`dead sample: ${budget.deadSample.join(", ")}`);
	}
	return lines.join("\n");
}

export class CssBudgetReportRenderer {
	format(budget: CssBudget): string {
		return renderCssBudget(budget);
	}
}
