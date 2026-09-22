/** Split a selector list on commas outside quotes and (…) / […] nesting. */
export const splitSelectorList = (selector: string): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let escaped = false;
	let start = 0;
	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index]!;
		if (escaped) {
			escaped = false;
		} else if (character === "\\") {
			escaped = true;
		} else if (quote) {
			if (character === quote) quote = null;
		} else if (character === '"' || character === "'") {
			quote = character;
		} else if (character === "(" || character === "[") {
			depth += 1;
		} else if (character === ")" || character === "]") {
			depth = Math.max(0, depth - 1);
		} else if (character === "," && depth === 0) {
			parts.push(selector.slice(start, index).trim());
			start = index + 1;
		}
	}
	const tail = selector.slice(start).trim();
	if (tail) parts.push(tail);
	return parts;
};
