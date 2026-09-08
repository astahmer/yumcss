import { computeExcludedRanges as scanExcludedRanges } from "pandwind/source";
import MagicString from "magic-string";

export type SourceEdit = { readonly start: number; readonly end: number; readonly text: string };

/** Shared, syntax-agnostic primitives used by source transformation passes. */
export class SourcePass {
	static applyEdits(source: string, edits: readonly SourceEdit[]): string {
		if (edits.length === 0) return source;
		const output = new MagicString(source);
		// MagicString keeps every range anchored to the original source. Applying
		// replacements right-to-left preserves the historical ordering for edits
		// that share an insertion point while letting MagicString reject overlaps
		// instead of silently corrupting the generated file.
		for (const edit of [...edits].toSorted((left, right) => right.start - left.start)) {
			if (edit.start === edit.end) output.appendLeft(edit.start, edit.text);
			else output.update(edit.start, edit.end, edit.text);
		}
		return output.toString();
	}

	static computeExcludedRanges(
		source: string,
		file: string,
	): { excluded: Array<[number, number]>; isExcluded(start: number): boolean } {
		return scanExcludedRanges(source, file);
	}

	static matchBlock(source: string, open: number): { body: string; end: number } | null {
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

	static insertSkipMarker(source: string, index: number, reason: string, marker: string): string {
		const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
		const indentMatch = /^\s*/.exec(source.slice(lineStart));
		const indent = indentMatch ? indentMatch[0] : "";
		return (
			source.slice(0, lineStart) + `${indent}// ${marker} (${reason})\n` + source.slice(lineStart)
		);
	}
}
