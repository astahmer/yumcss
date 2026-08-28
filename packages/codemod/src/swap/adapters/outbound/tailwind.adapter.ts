import type { PandwindMeta } from "../../../meta.ts";
import type { SwapEntry } from "../../ir.ts";
import type { Emitter } from "../../emit.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../../capabilities.ts";
import { CodemodAdapterId } from "../../identifiers.ts";

const camel = (prop: string): string =>
	prop.replace(/-(\w|$)/g, (_m, char: string) => char.toUpperCase());
const forwardCache = new WeakMap<PandwindMeta, Map<string, string>>();
function forwardIndex(meta: PandwindMeta): Map<string, string> {
	let index = forwardCache.get(meta);
	if (index !== undefined) return index;
	index = new Map();
	for (const [utilityClass, { property, value }] of meta.bridgeInverse) {
		const key = `${camel(property).toLowerCase()}|${String(value).toLowerCase()}`;
		if (!index.has(key)) index.set(key, utilityClass);
	}
	forwardCache.set(meta, index);
	return index;
}
const arbitraryClass = (entry: SwapEntry): string => {
	const dash = entry.prop.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
	const value = entry.value === true ? "true" : String(entry.value);
	return `[${dash}:${value}]`;
};
const emitTailwind: Emitter = (ir, meta) => {
	const groups = new Map<string, SwapEntry[]>();
	for (const entry of ir.entries) {
		const key = entry.conditions.join("__");
		const list = groups.get(key);
		if (list === undefined) groups.set(key, [entry]);
		else list.push(entry);
	}
	const classNames: string[] = [];
	for (const [key, entries] of groups) {
		const conditions = key === "" ? [] : key.split("__");
		const prefix = conditions.length > 0 ? `${conditions.join(":")}:` : "";
		for (const entry of entries) {
			const utility = forwardIndex(meta).get(
				`${camel(entry.prop).toLowerCase()}|${String(entry.value).toLowerCase()}`,
			);
			if (utility !== undefined) classNames.push(`${prefix}${utility}`);
			else if (conditions.length === 0) classNames.push(arbitraryClass(entry));
			else
				classNames.push(
					`[${conditions.map((condition) => `&:${condition}`).join("")}]:${arbitraryClass(entry)}`,
				);
		}
	}
	return { text: classNames.length > 0 ? JSON.stringify(classNames.join(" ")) : "", residuals: [] };
};

export default {
	id: CodemodAdapterId.Tailwind,
	emit: emitTailwind,
	capabilities: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: CodemodAdapterId.Tailwind,
		capabilities: {
			declarations: "partial",
			"token-values": "partial",
			"named-conditions": "partial",
			"pseudo-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
} as const;
