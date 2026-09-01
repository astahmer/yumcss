import { BuiltinHostFramework } from "../host-adapters.ts";
import { StyleRepresentationKind } from "../identifiers.ts";
import type { StyleProgram, StyleProgramResidual } from "../semantic-ir.ts";

export interface DynamicClassHostContext {
	readonly binding?: string;
	readonly framework?: string;
	readonly representationKind?: StyleRepresentationKind;
	readonly residuals?: readonly StyleProgramResidual[];
}

/** Shared host projection for class compilers that support CSS custom properties. */
export class DynamicClassHost {
	static canRewrite(code: string, binding: string | undefined): boolean {
		if (binding === undefined) return false;
		const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const classAttribute = new RegExp(
			`\\b(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`,
			"u",
		);
		const match = classAttribute.exec(code);
		if (match === null) return false;
		const tagStart = code.lastIndexOf("<", match.index);
		const tagEnd = code.indexOf(">", match.index);
		return (
			tagStart === -1 || tagEnd === -1 || !/\bstyle\s*=\s*/u.test(code.slice(tagStart, tagEnd))
		);
	}

	static hasCarrier(program: StyleProgram): boolean {
		return program.rules.some(function containsCarrier(rule): boolean {
			return (
				rule.declarations.some((declaration) => {
					if (declaration.value.kind === "dynamic") return true;
					return (
						declaration.value.kind === "literal" &&
						typeof declaration.value.value === "string" &&
						declaration.value.value.startsWith("var(--pandwind-dynamic-")
					);
				}) || rule.children.some(containsCarrier)
			);
		});
	}

	private static entries(
		residuals: readonly StyleProgramResidual[] | undefined,
	): readonly [string, string][] {
		const entries = (residuals ?? []).flatMap((residual) => {
			if (residual.kind !== "dynamic-custom-property") return [];
			const variable = residual.hint?.match(/(--pandwind-dynamic-[a-z0-9]+)/u)?.[1];
			return variable === undefined ? [] : [[variable, residual.text] as const];
		});
		return [...new Map(entries.map(([variable, expression]) => [variable, expression] as const))];
	}

	static rewrite(
		target: string,
		code: string,
		context: DynamicClassHostContext,
	): { code: string; residuals: readonly StyleProgramResidual[] } {
		if (context.representationKind !== StyleRepresentationKind.CustomProperty)
			return { code, residuals: [] };
		if (
			context.framework !== undefined &&
			![BuiltinHostFramework.React, BuiltinHostFramework.Preact].includes(
				context.framework as BuiltinHostFramework,
			)
		)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: context.binding ?? "dynamic style",
						hint: `${target} custom-property projection currently requires a JSX host`,
					},
				],
			};
		if (context.binding === undefined)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: "dynamic style",
						hint: `${target} custom-property projection requires a named host binding`,
					},
				],
			};
		const entries = DynamicClassHost.entries(context.residuals);
		if (entries.length === 0) return { code, residuals: [] };
		const escaped = context.binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const classAttribute = new RegExp(
			`(?<attribute>\\b(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\})`,
			"u",
		);
		const match = classAttribute.exec(code);
		if (match?.groups?.attribute === undefined)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: context.binding,
						hint: `${target} custom-property projection requires an exact class binding`,
					},
				],
			};
		const tagStart = code.lastIndexOf("<", match.index);
		const tagEnd = code.indexOf(">", match.index);
		if (tagStart !== -1 && tagEnd !== -1 && /\bstyle\s*=\s*/u.test(code.slice(tagStart, tagEnd)))
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: context.binding,
						hint: `${target} custom-property projection will not overwrite an existing style prop`,
					},
				],
			};
		const style = ` style={{ ${entries
			.map(([variable, expression]) => `${JSON.stringify(variable)}: String(${expression})`)
			.join(", ")} }}`;
		return { code: code.replace(match[0], `${match[0]}${style}`), residuals: [] };
	}
}
