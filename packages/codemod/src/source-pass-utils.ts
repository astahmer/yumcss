import { computeExcludedRanges as scanExcludedRanges } from "pandwind/source";

export type SourceEdit = { readonly start: number; readonly end: number; readonly text: string };

export function applyEdits(source: string, edits: readonly SourceEdit[]): string {
	let output = source;
	for (const edit of [...edits].toSorted((left, right) => right.start - left.start)) {
		output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
	}
	return output;
}

export function computeExcludedRanges(
	source: string,
	file: string,
): { excluded: Array<[number, number]>; isExcluded(start: number): boolean } {
	return scanExcludedRanges(source, file);
}

export function insertSkipMarker(
	source: string,
	index: number,
	reason: string,
	marker: string,
): string {
	const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
	const indentMatch = /^\s*/.exec(source.slice(lineStart));
	const indent = indentMatch?.[0] ?? "";
	return (
		source.slice(0, lineStart) + `${indent}// ${marker} (${reason})\n` + source.slice(lineStart)
	);
}

export function matchBlock(source: string, open: number): { body: string; end: number } | null {
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		if (source[index] === "{") depth += 1;
		else if (source[index] === "}") {
			depth -= 1;
			if (depth === 0) return { body: source.slice(open + 1, index), end: index + 1 };
		}
	}
	return null;
}
