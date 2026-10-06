import { SwapResidualKindTag, type SwapEntry, type SwapIR } from "../../ir.ts";
import type { Emitter } from "../../emit.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../../capabilities.ts";
import { CodemodAdapterId } from "../../identifiers.ts";
import { canonicalYumCSSConditionName } from "../../yumcss-conditions.ts";
import type { YumCSSMeta } from "../../../meta.ts";

const stylexImport = 'import * as stylex from "@stylexjs/stylex";';
function condition(name: string, meta: YumCSSMeta): string | undefined {
	const canonicalName = canonicalYumCSSConditionName(name);
	const value = meta.conditions[canonicalName] ?? meta.conditions[`_${name}`];
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	if (/^@(media|supports|container)(?:\s|$)/u.test(normalized)) return normalized;
	if (!normalized.startsWith("&[") && !normalized.startsWith("&:")) return undefined;
	const selector = normalized.replaceAll("&", "");
	if (selector.startsWith("::")) return undefined;
	return selector;
}
const emitStylex: Emitter = (ir, meta, context) => {
	type ConditionNode = {
		value?: SwapEntry["value"];
		readonly children: Map<string, ConditionNode>;
	};
	const properties = new Map<
		string,
		{ base?: SwapEntry["value"]; conditions: Map<string, ConditionNode> }
	>();
	const residuals: SwapIR["residuals"] = [];
	const residualConditions = new Set<string>();
	for (const entry of ir.entries) {
		const key = entry.conditions.join("__");
		let style = properties.get(entry.prop);
		if (style === undefined) {
			style = { conditions: new Map() };
			properties.set(entry.prop, style);
		}
		if (entry.conditions.length === 0) {
			style.base = entry.value;
			continue;
		}
		const mappedConditions = entry.conditions.map((name) => condition(name, meta));
		if (mappedConditions.some((mapped) => mapped === undefined)) {
			if (!residualConditions.has(key)) {
				const hint = `condition "${key}" is not expressible in stylex`;
				residualConditions.add(key);
				residuals.push({ kind: SwapResidualKindTag.Unrepresentable, text: key, hint });
			}
			continue;
		}
		let currentConditions = style.conditions;
		let current: ConditionNode | undefined;
		for (const mapped of mappedConditions) {
			if (mapped === undefined) continue;
			current = currentConditions.get(mapped);
			if (current === undefined) {
				current = { children: new Map() };
				currentConditions.set(mapped, current);
			}
			currentConditions = current.children;
		}
		if (current !== undefined) current.value = entry.value;
	}
	const literal = (value: SwapEntry["value"] | null): string => JSON.stringify(value) ?? "null";
	const renderConditionValue = (
		value: SwapEntry["value"] | undefined,
		conditions: ReadonlyMap<string, ConditionNode>,
		depth: number,
	): string => {
		if (conditions.size === 0) return literal(value ?? null);
		const indent = "\t".repeat(depth);
		const innerIndent = "\t".repeat(depth + 1);
		return `{
${innerIndent}default: ${value === undefined ? "null" : literal(value)},
${[...conditions]
	.map(
		([name, node]) =>
			`${innerIndent}${JSON.stringify(name)}: ${renderConditionValue(node.value, node.children, depth + 1)},`,
	)
	.join("\n")}
${indent}}`;
	};
	const bodyLines = [...properties].flatMap(([property, style]) => {
		const propertyKey = /^[A-Za-z_$][\w$]*$/.test(property) ? property : JSON.stringify(property);
		if (style.conditions.size === 0) return [`\t\t${propertyKey}: ${literal(style.base ?? "")},`];
		return [`\t\t${propertyKey}: ${renderConditionValue(style.base, style.conditions, 2)},`];
	});
	const name = `s${context.index}`;
	return {
		text: `stylex.props(swapStyles.${name}).className`,
		residuals,
		headers: [
			`const swapStyles = stylex.create({\n\t${name}: {\n${bodyLines.join("\n")}\n\t},\n});`,
		],
		imports: [stylexImport],
	};
};

export const stylexOutboundAdapter = {
	id: CodemodAdapterId.StyleX,
	emit: emitStylex,
	capabilities: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: CodemodAdapterId.StyleX,
		capabilities: {
			declarations: "partial",
			"token-values": "partial",
			"pseudo-conditions": "partial",
			"selector-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
} as const;
