import type { SwapEntry } from "../../ir.ts";
import type { Emitter } from "../../emit.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../../capabilities.ts";
import {
	authoredTokenRef,
	formatTokenPath,
	qualifyRef,
	resolvedTokenRef,
	TokenReferenceFormat,
	TokenRefModeTag,
	type TokenReferenceFormat as TokenReferenceFormatValue,
} from "../../tokens.ts";
import { CodemodAdapterId } from "../../identifiers.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { NodeKind, walk } from "pandwind/tw/literal";

const addPatternNames = (pattern: unknown, names: Set<string>): void => {
	walk(pattern, (node) => {
		if (node.type !== NodeKind.Identifier) return;
		const name = node["name"];
		if (typeof name === "string") names.add(name);
	});
};

const localNames = (source: string | undefined): Set<string> => {
	const names = new Set<string>();
	if (source === undefined) return names;
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({ file: "pandwind-panda-emission.tsx", source });
		if (parsed.errors.length > 0) {
			for (const name of source.match(/[A-Za-z_$][\w$]*/gu) ?? []) names.add(name);
			return names;
		}
		walk(parsed.program, (node) => {
			if (node.type === NodeKind.VariableDeclarator) addPatternNames(node["id"], names);
			if (
				node.type === NodeKind.FunctionDeclaration ||
				node.type === NodeKind.FunctionExpression ||
				node.type === NodeKind.ArrowFunctionExpression
			) {
				addPatternNames(node["id"], names);
				addPatternNames(node["params"], names);
			}
			if (node.type === NodeKind.ClassDeclaration) addPatternNames(node["id"], names);
			if (node.type === NodeKind.CatchClause) addPatternNames(node["param"], names);
			if (node.type === NodeKind.ImportDeclaration) {
				const specifiers = node["specifiers"];
				if (Array.isArray(specifiers))
					for (const specifier of specifiers) {
						if (typeof specifier !== "object" || specifier === null || Array.isArray(specifier))
							continue;
						const local = specifier["local"];
						if (typeof local !== "object" || local === null || Array.isArray(local)) continue;
						const name = local["name"];
						if (typeof name === "string") names.add(name);
					}
			}
		});
	} catch {
		for (const name of source.match(/[A-Za-z_$][\w$]*/gu) ?? []) names.add(name);
	}
	return names;
};

const propertyGroups: Record<string, string> = {
	backgroundColor: "colors",
	background: "colors",
	color: "colors",
	borderRadius: "radii",
	padding: "spacing",
	paddingTop: "spacing",
	paddingRight: "spacing",
	paddingBottom: "spacing",
	paddingLeft: "spacing",
	margin: "spacing",
	gap: "spacing",
	columnGap: "spacing",
	rowGap: "spacing",
	width: "spacing",
	height: "spacing",
	fontSize: "fontSizes",
};
function tokenValue(
	entry: SwapEntry,
	mode: "off" | "bare" | "group",
	tokens: import("pandwind/types/typings").AnyTokens | undefined,
	format: TokenReferenceFormatValue,
): string | true | number | Array<string | number> {
	if (mode === TokenRefModeTag.Off) return entry.value;
	if (typeof entry.value !== "string") return entry.value;
	const authored = authoredTokenRef(entry.value);
	if (authored !== null) {
		const group = propertyGroups[entry.prop] ?? "colors";
		const formatted = formatTokenPath(authored, format, entry.value);
		return mode === TokenRefModeTag.Group ? qualifyRef(formatted, group) : formatted;
	}
	const group = propertyGroups[entry.prop];
	if (group === undefined) return entry.value;
	const ref = resolvedTokenRef([group], entry.value, tokens);
	if (ref === null) return entry.value;
	const formatted = formatTokenPath(ref, format);
	return mode === TokenRefModeTag.Group ? qualifyRef(formatted, group) : formatted;
}
const formatValue = (value: string | true | number | Array<string | number>): string =>
	typeof value === "string"
		? JSON.stringify(value)
		: Array.isArray(value)
			? `[${value.map(formatValue).join(", ")}]`
			: String(value);

const pandaCssBinding = (source: string | undefined): string => {
	const usedNames = localNames(source);
	if (!usedNames.has("css")) return "css";
	for (const name of source?.match(/[A-Za-z_$][\w$]*/gu) ?? []) usedNames.add(name);
	let candidate = "pandaCss";
	let suffix = 2;
	while (usedNames.has(candidate)) {
		candidate = `pandaCss${suffix}`;
		suffix += 1;
	}
	return candidate;
};

const emitPanda: Emitter = (ir, meta, context) => {
	const groups = new Map<string, SwapEntry[]>();
	for (const entry of ir.entries) {
		const key = entry.conditions.join("__");
		const list = groups.get(key);
		if (list === undefined) groups.set(key, [entry]);
		else list.push(entry);
	}
	const parts: string[] = [];
	for (const [key, entries] of groups) {
		const conditions = key === "" ? [] : key.split("__");
		const body = entries
			.map(
				(entry) =>
					`${entry.prop}: ${formatValue(
						tokenValue(
							entry,
							context.tokenRefs ?? "bare",
							meta.tokens,
							context.tokenReferenceFormat ?? TokenReferenceFormat.Preserve,
						),
					)}`,
			)
			.join(", ");
		if (conditions.length === 0) parts.unshift(body);
		else {
			let nested = `{ ${body} }`;
			for (let index = conditions.length - 1; index >= 0; index--)
				nested = `_${conditions[index]}: ${nested}`;
			parts.push(nested);
		}
	}
	const binding = pandaCssBinding(context.source);
	return {
		text: parts.length > 0 ? `${binding}({ ${parts.join(", ")} })` : "",
		residuals: [],
		imports:
			parts.length > 0
				? [
						binding === "css"
							? 'import { css } from "styled-system/css";'
							: `import { css as ${binding} } from "styled-system/css";`,
					]
				: [],
	};
};

export default {
	id: CodemodAdapterId.Panda,
	emit: emitPanda,
	capabilities: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: CodemodAdapterId.Panda,
		capabilities: {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "exact",
			"pseudo-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
} as const;
