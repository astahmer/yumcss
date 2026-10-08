/** Split a selector list on commas outside quotes and (…) / […] nesting. */
export const splitSelectorList = (selector: string): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let escaped = false;
	let comment = false;
	let start = 0;
	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index]!;
		if (comment) {
			if (character === "*" && selector[index + 1] === "/") {
				comment = false;
				index += 1;
			}
			continue;
		}
		if (escaped) {
			escaped = false;
		} else if (quote !== null && character === "\\") {
			escaped = true;
		} else if (quote !== null) {
			if (character === quote) quote = null;
		} else if (character === "\\") {
			escaped = true;
		} else if (character === '"' || character === "'") {
			quote = character;
		} else if (character === "/" && selector[index + 1] === "*") {
			comment = true;
			index += 1;
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

export const hasRelativeSelectorPrefix = (selector: string): boolean => {
	let index = 0;
	while (index < selector.length) {
		if (/\s/u.test(selector[index]!)) {
			index += 1;
			continue;
		}
		if (selector[index] === "/" && selector[index + 1] === "*") {
			const commentEnd = selector.indexOf("*/", index + 2);
			if (commentEnd === -1) return false;
			index = commentEnd + 2;
			continue;
		}
		return ":.[#>+~*".includes(selector[index]!);
	}
	return false;
};

export const hasParentSelectorReference = (selector: string): boolean => {
	let quote = "";
	let attributeDepth = 0;
	let escaped = false;
	let comment = false;
	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index]!;
		if (comment) {
			if (character === "*" && selector[index + 1] === "/") {
				comment = false;
				index += 1;
			}
			continue;
		}
		if (quote !== "") {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === quote) quote = "";
			continue;
		}
		if (character === "/" && selector[index + 1] === "*") {
			comment = true;
			index += 1;
			continue;
		}
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === "[") attributeDepth += 1;
		else if (character === "]") attributeDepth = Math.max(0, attributeDepth - 1);
		else if (character === "&" && attributeDepth === 0) return true;
	}
	return false;
};

export const replaceParentSelector = (selector: string, parent: string): string => {
	let output = "";
	let quote = "";
	let attributeDepth = 0;
	let escaped = false;
	let replaced = false;
	let comment = false;
	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index]!;
		if (comment) {
			output += character;
			if (character === "*" && selector[index + 1] === "/") {
				output += "/";
				index += 1;
				comment = false;
			}
			continue;
		}
		if (quote !== "") {
			output += character;
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === quote) quote = "";
			continue;
		}
		if (character === "/" && selector[index + 1] === "*") {
			output += "/*";
			index += 1;
			comment = true;
			continue;
		}
		if (escaped) {
			output += character;
			escaped = false;
			continue;
		}
		if (character === "\\") {
			output += character;
			escaped = true;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			output += character;
			continue;
		}
		if (character === "[") attributeDepth += 1;
		if (character === "]") attributeDepth = Math.max(0, attributeDepth - 1);
		const isParentReference = character === "&" && attributeDepth === 0 && quote === "";
		if (isParentReference) replaced = true;
		output += isParentReference ? parent : character;
	}
	return replaced || parent === "" ? output : `${parent} ${output}`;
};
