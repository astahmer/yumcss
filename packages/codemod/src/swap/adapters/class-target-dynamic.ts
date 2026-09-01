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
	private static sourceHost(program: StyleProgram):
		| {
				readonly openingTag: string;
				readonly styleAttributes: readonly string[];
		  }
		| undefined {
		const source = program.source;
		const openingTag = source?.hostOpenTag;
		if (
			source === undefined ||
			openingTag === undefined ||
			(source.hostStyleAttributes?.length ?? 0) === 0
		)
			return undefined;
		return {
			openingTag,
			styleAttributes: source.hostStyleAttributes ?? [],
		};
	}

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

	/** Build a style object expression for a generated component wrapper. */
	static styleExpression(
		residuals: readonly StyleProgramResidual[] | undefined,
		parameter?: string,
	): string | undefined {
		const entries = DynamicClassHost.entries(residuals);
		if (entries.length === 0) return undefined;
		const values = entries.map(([variable, expression]) => {
			const callable = /=>|^function\b/.test(expression.trim());
			if (callable && parameter === undefined) return undefined;
			const evaluated = callable ? `(${expression})(${parameter})` : expression;
			return `${JSON.stringify(variable)}: String(${evaluated})`;
		});
		return values.some((value) => value === undefined) ? undefined : `{ ${values.join(", ")} }`;
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
		const styleExpression = DynamicClassHost.styleExpression(context.residuals);
		if (styleExpression === undefined)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: context.binding,
						hint: `${target} dynamic function values require a generated component wrapper`,
					},
				],
			};
		const style = ` style={${styleExpression}}`;
		return { code: code.replace(match[0], `${match[0]}${style}`), residuals: [] };
	}

	/**
	 * Project a source framework's style props onto a target class carrier. The
	 * source match is often the whole opening tag (Chakra/Mantine/MUI style
	 * props), so this operation deliberately owns the tag edit rather than
	 * asking the route runner to replace the style call first.
	 */
	static rewriteSourceHost(
		target: string,
		code: string,
		context: DynamicClassHostContext & {
			readonly emittedExpression: string;
			readonly program: StyleProgram;
		},
	): { code: string; residuals: readonly StyleProgramResidual[] } {
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
						text: context.program.source?.hostOpenTag ?? "style host",
						hint: `${target} class projection currently requires a JSX host`,
					},
				],
			};
		const host = DynamicClassHost.sourceHost(context.program);
		if (host === undefined) return DynamicClassHost.rewrite(target, code, context);
		const start = code.indexOf(host.openingTag);
		if (start === -1)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: host.openingTag,
						hint: `${target} class projection could not locate the source host`,
					},
				],
			};
		let projected = host.openingTag;
		for (const attribute of host.styleAttributes) {
			const index = projected.indexOf(attribute);
			if (index < 0) continue;
			const whitespace = index > 0 && /[ \t]/u.test(projected[index - 1]!) ? 1 : 0;
			projected = `${projected.slice(0, index - whitespace)}${projected.slice(index + attribute.length)}`;
		}
		if (/\bstyle\s*=\s*/u.test(projected))
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: host.openingTag,
						hint: `${target} class projection will not overwrite an existing style prop`,
					},
				],
			};
		const classAttribute = /\b(?:className|class)\s*=\s*(?:\{[^{}]*\}|"[^"]*"|'[^']*')/u.exec(
			projected,
		);
		if (classAttribute !== null)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: host.openingTag,
						hint: `${target} class projection requires a host without an existing class attribute`,
					},
				],
			};
		const insertion = /\/\s*>$/u.test(projected) ? projected.length - 2 : projected.length - 1;
		const styleExpression = DynamicClassHost.styleExpression(context.residuals);
		const style = styleExpression === undefined ? "" : ` style={${styleExpression}}`;
		projected = `${projected.slice(0, insertion)} className={${context.emittedExpression}}${style}${projected.slice(insertion)}`;
		return {
			code: `${code.slice(0, start)}${projected}${code.slice(start + host.openingTag.length)}`,
			residuals: [],
		};
	}
}
