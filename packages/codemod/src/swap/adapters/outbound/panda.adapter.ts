import type { SwapEntry } from "../../ir.ts";
import type { Emitter } from "../../emit.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../../capabilities.ts";
import { authoredTokenRef, qualifyRef, resolvedTokenRef } from "../../tokens.ts";

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
): string | true | number | Array<string | number> {
	if (mode === "off") return entry.value;
	if (typeof entry.value !== "string") return entry.value;
	const authored = authoredTokenRef(entry.value);
	if (authored !== null) {
		const group = propertyGroups[entry.prop] ?? "colors";
		return mode === "group" ? qualifyRef(authored, group) : authored;
	}
	const group = propertyGroups[entry.prop];
	if (group === undefined) return entry.value;
	const ref = resolvedTokenRef([group], entry.value, tokens);
	return ref === null ? entry.value : mode === "group" ? qualifyRef(ref, group) : ref;
}
const formatValue = (value: string | true | number | Array<string | number>): string =>
	typeof value === "string"
		? JSON.stringify(value)
		: Array.isArray(value)
			? `[${value.map(formatValue).join(", ")}]`
			: String(value);
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
					`${entry.prop}: ${formatValue(tokenValue(entry, context.tokenRefs ?? "bare", meta.tokens))}`,
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
	return {
		text: parts.length > 0 ? `css({ ${parts.join(", ")} })` : "",
		residuals: [],
		imports: parts.length > 0 ? ['import { css } from "styled-system/css";'] : [],
	};
};

export default {
	id: "panda",
	emit: emitPanda,
	capabilities: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: "panda",
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
