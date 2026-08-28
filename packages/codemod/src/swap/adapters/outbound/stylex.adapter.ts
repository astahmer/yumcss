import type { SwapEntry } from "../../ir.ts";
import type { Emitter } from "../../emit.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../../capabilities.ts";
import { CodemodAdapterId } from "../../identifiers.ts";

const stylexImport = 'import * as stylex from "@stylexjs/stylex";';
const conditionMap: Record<string, string> = {
	hover: ":hover",
	focus: ":focus",
	active: ":active",
	visited: ":visited",
	dark: "@media (prefers-color-scheme: dark)",
	light: "@media (prefers-color-scheme: light)",
};
function condition(name: string): string | undefined {
	if (conditionMap[name] !== undefined) return conditionMap[name];
	return /^data[-a-z]*$/.test(name) ? `[\\${name}]` : undefined;
}
const emitStylex: Emitter = (ir, _meta, context) => {
	const groups = new Map<string, SwapEntry[]>();
	for (const entry of ir.entries) {
		const key = entry.conditions.join("__");
		const list = groups.get(key);
		if (list === undefined) groups.set(key, [entry]);
		else list.push(entry);
	}
	const bodyLines: string[] = [];
	for (const [key, entries] of groups) {
		const mapped = (key === "" ? [] : key.split("__")).map(condition);
		if (mapped.some((item) => item === undefined)) {
			bodyLines.push(
				`\t\t// pandwind:migrate-skip (condition "${key}" is not expressible in stylex)`,
			);
			continue;
		}
		let body = entries.map((entry) => `\t\t${entry.prop}: ${JSON.stringify(String(entry.value))},`);
		for (let index = mapped.length - 1; index >= 0; index--)
			body = [`\t\t\t${JSON.stringify(mapped[index])}: {`, ...body, "\t\t\t},"];
		bodyLines.push(...body);
	}
	const name = `s${context.index}`;
	return {
		text: `stylex.props(swapStyles.${name})`,
		residuals: [],
		headers: [
			`const swapStyles = stylex.create({\n\t${name}: {\n${bodyLines.join("\n")}\n\t},\n});`,
		],
		imports: [stylexImport],
	};
};

export default {
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
