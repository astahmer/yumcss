/**
 * Real unified diff: trims the common prefix/suffix, then LCS-aligns the
 * remainder so insertions/deletions produce proper hunks with correct line
 * numbers (the previous line-by-line walk misaligned every hunk after an
 * insertion).
 */
export function unifiedDiff(before: string, after: string, file: string): string {
	if (before === after) return "";
	const a = before.split("\n");
	const b = after.split("\n");
	// common prefix / suffix trimming keeps the LCS table small
	let pre = 0;
	while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
	let suf = 0;
	while (
		suf < a.length - pre &&
		suf < b.length - pre &&
		a[a.length - 1 - suf] === b[b.length - 1 - suf]
	)
		suf++;
	const ca = a.slice(pre, a.length - suf);
	const cb = b.slice(pre, b.length - suf);

	// LCS table over the trimmed remainder
	const dp: Array<Array<number>> = Array.from({ length: ca.length + 1 }, () =>
		Array.from({ length: cb.length + 1 }, () => 0 as number),
	);
	for (let i = ca.length - 1; i >= 0; i--) {
		for (let j = cb.length - 1; j >= 0; j--) {
			dp[i]![j] =
				ca[i] === cb[j]
					? (dp[i + 1]?.[j + 1] ?? 0) + 1
					: Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
		}
	}
	type Op = { kind: "-" | "+" | " "; text: string; aLine?: number; bLine?: number };
	const ops: Op[] = [];
	for (const [k, text] of a.slice(0, pre).entries())
		ops.push({ kind: " ", text, aLine: k + 1, bLine: k + 1 });
	let i = 0;
	let j = 0;
	while (i < ca.length && j < cb.length) {
		if (ca[i] === cb[j]) {
			ops.push({ kind: " ", text: ca[i]!, aLine: pre + i + 1, bLine: pre + j + 1 });
			i++;
			j++;
		} else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
			ops.push({ kind: "-", text: ca[i]!, aLine: pre + i + 1 });
			i++;
		} else {
			ops.push({ kind: "+", text: cb[j]!, bLine: pre + j + 1 });
			j++;
		}
	}
	while (i < ca.length) {
		ops.push({ kind: "-", text: ca[i]!, aLine: pre + i + 1 });
		i++;
	}
	while (j < cb.length) {
		ops.push({ kind: "+", text: cb[j]!, bLine: pre + j + 1 });
		j++;
	}
	for (const [k, text] of a.slice(a.length - suf).entries()) {
		ops.push({ kind: " ", text, aLine: a.length - suf + k + 1, bLine: b.length - suf + k + 1 });
	}

	// group into hunks with up to 3 context lines around changes
	const lines: string[] = [`--- a/${file}`, `+++ b/${file}`];
	let idx = 0;
	while (idx < ops.length) {
		if (ops[idx]!.kind === " ") {
			idx++;
			continue;
		}
		let start = Math.max(0, idx - 3);
		let end = idx;
		while (end < ops.length) {
			if (ops[end]!.kind !== " ") {
				end++;
				continue;
			}
			// lookahead: stop after 3 consecutive context lines
			let run = 0;
			let probe = end;
			while (probe < ops.length && ops[probe]!.kind === " ") {
				run++;
				probe++;
				if (run >= 3) break;
			}
			end =
				run >= 3
					? end
					: probe < ops.length && ops[probe]!.kind !== " "
						? probe
						: end + Math.min(run, 3);
			break;
		}
		end = Math.min(ops.length, Math.max(end, idx + 1));
		const slice = ops.slice(start, end);
		const aStart = slice.find((o) => o.aLine !== undefined)?.aLine ?? 0;
		const bStart = slice.find((o) => o.bLine !== undefined)?.bLine ?? 0;
		lines.push(
			`@@ -${aStart},${slice.filter((o) => o.kind !== "+").length} +${bStart},${slice.filter((o) => o.kind !== "-").length} @@`,
		);
		for (const op of slice) lines.push(`${op.kind}${op.text}`);
		idx = end;
	}
	return lines.join("\n");
}
