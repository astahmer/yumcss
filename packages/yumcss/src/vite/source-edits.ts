export interface SourceTextEdit {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

export const applySourceEdits = (code: string, edits: readonly SourceTextEdit[]): string => {
	const ordered = edits.toSorted((left, right) => left.start - right.start || left.end - right.end);
	let previousEnd = 0;
	let previousStart = -1;
	for (const edit of ordered) {
		if (
			edit.start < previousEnd ||
			edit.start === previousStart ||
			edit.start < 0 ||
			edit.end < edit.start ||
			edit.end > code.length
		) {
			let output = code;
			for (const overlappingEdit of edits.toSorted((left, right) => right.start - left.start)) {
				output =
					output.slice(0, overlappingEdit.start) +
					overlappingEdit.text +
					output.slice(overlappingEdit.end);
			}
			return output;
		}
		previousStart = edit.start;
		previousEnd = edit.end;
	}

	const output: string[] = [];
	let cursor = 0;
	for (const edit of ordered) {
		output.push(code.slice(cursor, edit.start), edit.text);
		cursor = edit.end;
	}
	output.push(code.slice(cursor));
	return output.join("");
};
