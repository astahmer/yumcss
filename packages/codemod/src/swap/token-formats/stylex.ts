import {
	createScalarTokenImport,
	putScalarTokenWithLoss,
	scalarFormatOutput,
	scalarImportToDocument,
	type ScalarTokenImport,
} from "../token-format-support.ts";
import { parseObjectLiteral } from "../parse.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import {
	TokenFormatId,
	type TokenFormatAdapter,
	type TokenFormatLoss,
} from "../token-format-contracts.ts";

const STYLEX_MODULE = /["']@stylexjs\/stylex["']/u;
const identifier = "[A-Za-z_$][\\w$]*";

const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const importedBindings = (
	text: string,
): { readonly direct: readonly string[]; readonly namespaces: readonly string[] } => {
	const direct = new Set<string>();
	const namespaces = new Set<string>();
	for (const match of text.matchAll(/\bimport\s+([\s\S]*?)\s+from\s*(["'][^"']+["'])/gu)) {
		if (!STYLEX_MODULE.test(match[2] ?? "")) continue;
		const clause = match[1] ?? "";
		const namespace = new RegExp(`\\*\\s+as\\s+(${identifier})`, "u").exec(clause)?.[1];
		if (namespace !== undefined) namespaces.add(namespace);
		const defaultBinding = new RegExp(`^\\s*(${identifier})(?:\\s*,|\\s*$)`, "u").exec(clause)?.[1];
		if (defaultBinding !== undefined) namespaces.add(defaultBinding);
		const named = /\{([\s\S]*?)\}/u.exec(clause)?.[1] ?? "";
		for (const part of named.split(",")) {
			const binding = new RegExp(`^\\s*defineVars(?:\\s+as\\s+(${identifier}))?\\s*$`, "u").exec(
				part,
			);
			if (binding !== null) direct.add(binding[1] ?? "defineVars");
		}
	}
	return { direct: [...direct], namespaces: [...namespaces] };
};

const skipTrivia = (text: string, start: number): number => {
	let index = start;
	for (;;) {
		while (/\s/u.test(text[index] ?? "")) index += 1;
		if (text.startsWith("//", index)) {
			const end = text.indexOf("\n", index);
			index = end === -1 ? text.length : end + 1;
			continue;
		}
		if (text.startsWith("/*", index)) {
			const end = text.indexOf("*/", index + 2);
			index = end === -1 ? text.length : end + 2;
			continue;
		}
		return index;
	}
};

const readKey = (
	text: string,
	start: number,
): { readonly key: string; readonly end: number } | undefined => {
	const index = skipTrivia(text, start);
	const quote = text[index];
	if (quote === '"' || quote === "'") {
		let end = index + 1;
		while (end < text.length) {
			if (text[end] === "\\") {
				end += 2;
				continue;
			}
			if (text[end] === quote) {
				const parsed = parseObjectLiteral(`value: ${text.slice(index, end + 1)}`)?.keys[0]?.value;
				return typeof parsed === "string" ? { key: parsed, end: end + 1 } : undefined;
			}
			end += 1;
		}
		return undefined;
	}
	const match = new RegExp(`^(${identifier}|[-A-Za-z0-9_$]+)`, "u").exec(text.slice(index));
	return match === null ? undefined : { key: match[1]!, end: index + match[0].length };
};

const splitEntries = (
	body: string,
): readonly { readonly key: string; readonly value: string }[] => {
	const entries: Array<{ readonly key: string; readonly value: string }> = [];
	let index = 0;
	while (skipTrivia(body, index) < body.length) {
		const key = readKey(body, index);
		if (key === undefined) return [];
		index = skipTrivia(body, key.end);
		if (body[index] !== ":") return [];
		index = skipTrivia(body, index + 1);
		const valueStart = index;
		let braceDepth = 0;
		let bracketDepth = 0;
		let parenDepth = 0;
		let quote: string | undefined;
		let valueEnd: number | undefined;
		for (; index < body.length; index += 1) {
			const character = body[index]!;
			if (quote !== undefined) {
				if (character === "\\") index += 1;
				else if (character === quote) quote = undefined;
				continue;
			}
			if (character === '"' || character === "'" || character === "`") {
				quote = character;
				continue;
			}
			if (
				character === "/" &&
				body[index + 1] === "/" &&
				braceDepth === 0 &&
				bracketDepth === 0 &&
				parenDepth === 0
			) {
				valueEnd ??= index;
				const end = body.indexOf("\n", index + 2);
				index = end === -1 ? body.length : end;
				continue;
			}
			if (
				character === "/" &&
				body[index + 1] === "*" &&
				braceDepth === 0 &&
				bracketDepth === 0 &&
				parenDepth === 0
			) {
				valueEnd ??= index;
				const end = body.indexOf("*/", index + 2);
				index = end === -1 ? body.length : end + 1;
				continue;
			}
			if (character === "{") braceDepth += 1;
			else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
			else if (character === "[") bracketDepth += 1;
			else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
			else if (character === "(") parenDepth += 1;
			else if (character === ")") parenDepth = Math.max(0, parenDepth - 1);
			else if (character === "," && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0)
				break;
		}
		entries.push({ key: key.key, value: body.slice(valueStart, valueEnd ?? index).trim() });
		if (body[index] === ",") index += 1;
	}
	return entries;
};

const staticScalar = (source: string): string | undefined => {
	if (source.startsWith("`") && source.includes("${")) return undefined;
	const parsed = parseObjectLiteral(`value: ${source}`)?.keys[0]?.value;
	return typeof parsed === "string" || typeof parsed === "number" ? String(parsed) : undefined;
};

const declarationName = (text: string, start: number): string | undefined =>
	new RegExp(
		`(?:^|[;\\n])\\s*(?:export\\s+)?(?:const|let|var)\\s+(${identifier})\\s*=\\s*$`,
		"u",
	).exec(text.slice(0, start))?.[1];

const stylexCalls = (bindings: ReturnType<typeof importedBindings>): RegExp | undefined => {
	const calls = [
		...bindings.direct.map(escaped),
		...bindings.namespaces.map((binding) => `${escaped(binding)}\\s*\\.\\s*defineVars`),
	];
	return calls.length === 0
		? undefined
		: new RegExp(`\\b(?:${calls.join("|")})\\s*\\(\\s*\\{`, "gu");
};

const importStylexVars = (text: string) => {
	const bindings = importedBindings(text);
	const calls = stylexCalls(bindings);
	if (calls === undefined)
		throw new Error(
			'codemod tokens: StyleX input must import defineVars (or a namespace) from "@stylexjs/stylex"',
		);
	const excluded = SourcePass.computeExcludedRanges(text, "tokens.stylex.ts");
	const tokens = createScalarTokenImport();
	const losses: TokenFormatLoss[] = [];
	let callCount = 0;
	let scalarCount = 0;
	for (const match of text.matchAll(calls)) {
		const start = match.index ?? 0;
		if (excluded.isExcluded(start)) continue;
		const open = start + match[0].length - 1;
		const block = SourcePass.matchBlock(text, open);
		if (block === null) continue;
		callCount += 1;
		const group = declarationName(text, start);
		if (group === undefined)
			throw new Error("codemod tokens: each StyleX defineVars call must be assigned to a variable");
		for (const entry of splitEntries(block.body)) {
			const value = staticScalar(entry.value);
			const path = `/${group}/${entry.key}`;
			if (value === undefined) {
				losses.push({
					path,
					feature: "dynamic value",
					reason: "StyleX importer preserves static values only",
				});
				continue;
			}
			if (/^-?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(value))
				losses.push({
					path,
					feature: "number value",
					reason: "importer stores scalar values as strings",
				});
			const existing = tokens[group]?.[entry.key];
			if (existing !== undefined && existing !== value)
				throw new Error(`codemod tokens: conflicting StyleX values for ${group}.${entry.key}`);
			putScalarTokenWithLoss(tokens, group, entry.key, value, losses, `/${entry.key}`);
			scalarCount += 1;
		}
	}
	if (callCount === 0)
		throw new Error("codemod tokens: no static StyleX defineVars declarations found");
	if (scalarCount === 0)
		throw new Error(
			"codemod tokens: StyleX defineVars declarations contain no static scalar values; conditional/theme values are not flattened",
		);
	return scalarImportToDocument(TokenFormatId.StyleX, tokens, text, losses);
};

export const stylexTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/2",
	id: TokenFormatId.StyleX,
	canImport: true,
	canExport: true,
	fidelity: {
		import: "partial",
		export: "partial",
		preserves: ["static scalar defineVars values"],
		mayLose: [
			"conditional values",
			"metadata",
			"dynamic expressions",
			"references",
			"resolver contexts",
		],
	},
	importText: importStylexVars,
	export(document) {
		return scalarFormatOutput(
			document,
			(groups: ScalarTokenImport) =>
				`import { defineVars } from "@stylexjs/stylex";\n\n${Object.entries(groups)
					.map(
						([group, values]) =>
							`export const ${group} = defineVars({\n${Object.entries(values)
								.map(([key, value]) => `\t${JSON.stringify(key)}: ${JSON.stringify(value)},`)
								.join("\n")}\n});`,
					)
					.join("\n\n")}\n`,
		);
	},
};
