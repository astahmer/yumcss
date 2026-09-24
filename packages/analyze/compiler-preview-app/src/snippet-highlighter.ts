export type SnippetTokenKind =
	| "comment"
	| "function"
	| "keyword"
	| "literal"
	| "number"
	| "operator"
	| "property"
	| "selector"
	| "string"
	| "type";

export interface SnippetToken {
	readonly text: string;
	readonly kind: SnippetTokenKind | null;
}

type SnippetMode = "css" | "javascript";

const MAX_HIGHLIGHT_CHARACTERS = 200_000;

const javascriptKeywords = new Set([
	"as",
	"async",
	"await",
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"debugger",
	"declare",
	"default",
	"delete",
	"do",
	"else",
	"export",
	"extends",
	"finally",
	"for",
	"from",
	"function",
	"get",
	"if",
	"implements",
	"import",
	"in",
	"infer",
	"instanceof",
	"interface",
	"keyof",
	"let",
	"module",
	"namespace",
	"new",
	"of",
	"package",
	"private",
	"protected",
	"public",
	"readonly",
	"return",
	"satisfies",
	"set",
	"static",
	"super",
	"switch",
	"throw",
	"try",
	"type",
	"typeof",
	"unique",
	"var",
	"void",
	"while",
	"with",
	"yield",
]);

const javascriptTypes = new Set([
	"any",
	"bigint",
	"boolean",
	"never",
	"number",
	"object",
	"string",
	"symbol",
	"unknown",
]);

const javascriptLiterals = new Set(["false", "NaN", "null", "true", "undefined"]);
const cssAtRules = new Set([
	"charset",
	"container",
	"font-face",
	"import",
	"keyframes",
	"layer",
	"media",
	"namespace",
	"supports",
]);

const javascriptExtensions = new Set([
	"cjs",
	"cts",
	"js",
	"jsx",
	"mjs",
	"mts",
	"ts",
	"tsx",
	"vue",
	"svelte",
	"astro",
]);

const cssExtensions = new Set(["css", "less", "scss"]);

const javascriptTokenPattern =
	/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?n?)|[$_\p{ID_Start}][$_\p{ID_Continue}]*|===|!==|=>|==|!=|<=|>=|\?\?=|\?\?|\?\.|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|\*\*|[=+\-*/%<>!&|^~?:@#]|(?:\x5B|\x5D|[{}().,;])/uy;

const cssTokenPattern =
	/\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?:%|[a-zA-Z]+)?)|#[\da-fA-F]{3,8}(?![$_\p{ID_Continue}-])|--[$_\p{ID_Start}][$_\p{ID_Continue}-]*|\.[-$_\p{ID_Start}][$_\p{ID_Continue}-]*|#[-$_\p{ID_Start}][$_\p{ID_Continue}-]*|[-$_\p{ID_Start}][$_\p{ID_Continue}-]*|\?\.|&&|\|\||[=+\-*/%<>!&|^~?:@#]|(?:\x5B|\x5D|[{}().,;])/uy;

const pushToken = (tokens: SnippetToken[], text: string, kind: SnippetTokenKind | null): void => {
	if (text === "") return;
	const previous = tokens.at(-1);
	if (previous?.kind === kind) {
		tokens[tokens.length - 1] = { text: previous.text + text, kind };
		return;
	}
	tokens.push({ text, kind });
};

const nextVisibleCharacter = (source: string, start: number): string => {
	for (let index = start; index < source.length; index += 1) {
		if (!/\s/u.test(source[index] ?? "")) return source[index] ?? "";
	}
	return "";
};

const classifyToken = (
	text: string,
	source: string,
	end: number,
	previousSignificant: string,
	mode: SnippetMode,
): SnippetTokenKind | null => {
	if (text.startsWith("//") || text.startsWith("/*")) return "comment";
	if (text.startsWith('"') || text.startsWith("'") || text.startsWith("`")) return "string";
	if (/^\d/u.test(text)) return "number";
	if (mode === "css" && text.startsWith("--")) return "property";
	if (mode === "css" && text.startsWith("#"))
		return previousSignificant === ":" ? "literal" : "selector";
	if (mode === "css" && text.startsWith(".")) return "selector";
	if (/^[=+\-*/%<>!&|^~?:@#]/u.test(text)) return "operator";

	const nextCharacter = nextVisibleCharacter(source, end);
	if (mode === "css") {
		if (previousSignificant === "@" && cssAtRules.has(text)) return "keyword";
		if (text === "important" && previousSignificant === "!") return "keyword";
		if (text.startsWith("--") || nextCharacter === ":") return "property";
		if (nextCharacter === "{") return "selector";
		if (nextCharacter === "(") return "function";
		return null;
	}

	if (previousSignificant === "." || previousSignificant === "?.") return "property";
	if (javascriptKeywords.has(text)) return "keyword";
	if (javascriptTypes.has(text)) return "type";
	if (javascriptLiterals.has(text)) return "literal";
	if (nextCharacter === "(") return "function";
	if (/^\p{Lu}/u.test(text)) return "type";
	if (nextCharacter === ":") return "property";
	return null;
};

const tokenize = (source: string, mode: SnippetMode): readonly SnippetToken[] => {
	const tokens: SnippetToken[] = [];
	const pattern = mode === "css" ? cssTokenPattern : javascriptTokenPattern;
	let previousSignificant = "";
	let index = 0;

	while (index < source.length) {
		pattern.lastIndex = index;
		const match = pattern.exec(source);
		if (match === null) {
			pushToken(tokens, source[index] ?? "", null);
			index += 1;
			continue;
		}

		const text = match[0];
		const end = index + text.length;
		pushToken(tokens, text, classifyToken(text, source, end, previousSignificant, mode));
		if (!/^\s+$/u.test(text)) previousSignificant = text;
		index = end;
	}

	return tokens;
};

export const tokenizeSnippet = (source: string, file: string): readonly SnippetToken[] => {
	if (source.length > MAX_HIGHLIGHT_CHARACTERS) return [{ text: source, kind: null }];
	const extension = file.split(".").at(-1)?.toLowerCase() ?? "";
	if (cssExtensions.has(extension)) return tokenize(source, "css");
	if (javascriptExtensions.has(extension) || extension === "json")
		return tokenize(source, "javascript");
	return [{ text: source, kind: null }];
};
