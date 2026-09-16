import { resolveDesignStyle } from "../design/resolve.ts";
import {
	evalLiteral,
	evalLiteralValues,
	literalValueSetSize,
	type LiteralCallEvaluator,
	type LiteralConstantScope,
	type OxcNode,
	walk,
} from "../tw/literal.ts";
import { collectModuleConstants } from "./cx-inline.ts";
import type {
	CssArtifactExtractor,
	CssFileExtraction,
	CssPatternAdapter,
	CssPreset,
	ExtractedCssStyle,
} from "./css-extraction-contracts.ts";
import type { CssSourceScanner } from "./css-extraction-contracts.ts";
import { NodeKind, PropertyKindTag, VariableDeclarationKindTag } from "../ast-node-kind.ts";
import { cssVar } from "../lib/utils.ts";
import { findReactStrictDomBindings, isReactStrictDomCreateCall } from "./css-react-strict-dom.ts";
import { createFirstThatWorksEvaluator } from "./css-first-that-works.ts";
import { findFirstThatWorksBindings } from "./css-source-scanner.ts";

/** Resolves literal style calls into artifacts while preserving source provenance. */
interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

interface PropertyNode extends OxcNode {
	key?: OxcNode;
	value?: OxcNode;
	kind?: string;
	computed?: boolean;
	method?: boolean;
	shorthand?: boolean;
}

type EvaluatedValue = {
	readonly ok: true;
	readonly value: unknown;
	readonly hasInput: boolean;
};

const propertyName = (property: PropertyNode): string | undefined => {
	const key = property.key;
	if (key?.type === NodeKind.Identifier) return (key as { name?: string }).name;
	if (key?.type === NodeKind.Literal) {
		const value = (key as { value?: unknown }).value;
		return typeof value === "string" ? value : undefined;
	}
	return undefined;
};

const inputName = (node: OxcNode | undefined, names: ReadonlySet<string>): string | undefined => {
	if (node?.type !== NodeKind.CallExpression) return undefined;
	const call = node as CallNode;
	const callee = call.callee;
	if (callee?.type !== NodeKind.MemberExpression) return undefined;
	const object = (callee as { object?: OxcNode | null }).object;
	const property = (callee as { property?: { name?: string } | null }).property;
	if (
		object?.type !== NodeKind.Identifier ||
		!names.has((object as { name?: string }).name ?? "") ||
		property?.name !== "input" ||
		call.arguments.length !== 1
	)
		return undefined;
	const value = evalLiteral(call.arguments[0] as never);
	return typeof value === "string" ? value : undefined;
};

/**
 * Evaluate a dynamic group style while replacing its `css.input()` markers
 * with the value-independent CSS variable references used by the runtime
 * group compiler. `$input` is a TypeScript-only input contract and never
 * belongs in the generated stylesheet.
 */
const evaluateInputStyle = (
	node: OxcNode | undefined,
	names: ReadonlySet<string>,
	evaluateCall: LiteralCallEvaluator,
): EvaluatedValue | undefined => {
	const name = inputName(node, names);
	if (name !== undefined) {
		return { ok: true, value: `var(${cssVar(name)})`, hasInput: true };
	}
	if (node?.type === NodeKind.ObjectExpression) {
		const value: Record<string, unknown> = {};
		let hasInput = false;
		for (const child of (node as { properties?: PropertyNode[] }).properties ?? []) {
			if (
				child.type !== NodeKind.Property ||
				child.kind !== PropertyKindTag.Init ||
				child.computed === true ||
				child.method === true ||
				child.shorthand === true
			)
				return undefined;
			const key = propertyName(child);
			if (key === undefined) return undefined;
			if (key === "$input") continue;
			const evaluated = evaluateInputStyle(child.value, names, evaluateCall);
			if (evaluated === undefined) return undefined;
			hasInput ||= evaluated.hasInput;
			value[key] = evaluated.value;
		}
		return { ok: true, value, hasInput };
	}
	const value = evalLiteral(node as never, undefined, evaluateCall);
	return value === undefined ? undefined : { ok: true, value, hasInput: false };
};

export class DesignCssArtifactExtractor implements CssArtifactExtractor {
	private readonly scanner: CssSourceScanner;
	private readonly preset: CssPreset;
	private readonly patterns: readonly CssPatternAdapter[];

	constructor(
		scanner: CssSourceScanner,
		preset: CssPreset,
		patterns: readonly CssPatternAdapter[] = [],
	) {
		this.scanner = scanner;
		this.preset = preset;
		this.patterns = patterns;
	}

	extract(code: string, id: string, names: ReadonlySet<string>): ExtractedCssStyle[] {
		const parsed = this.parse(id, code);
		const sources: ExtractedCssStyle[] = [];
		const reactStrictDom = findReactStrictDomBindings(parsed);
		const evaluateCall = createFirstThatWorksEvaluator(findFirstThatWorksBindings(parsed));
		// Finite-candidate discovery needs same-module constants; built lazily
		// so all-literal files never pay for the constant walk.
		let moduleConsts: LiteralConstantScope | undefined;
		const getModuleConsts = (): LiteralConstantScope => {
			if (moduleConsts !== undefined) return moduleConsts;
			const values = new Map<string, unknown>(
				[...collectModuleConstants(parsed as unknown as OxcNode)].map(
					([name, known]) => [name, known.value] as const,
				),
			);
			for (const statement of (parsed as { body?: OxcNode[] }).body ?? []) {
				if (
					statement.type !== NodeKind.VariableDeclaration ||
					(statement as { kind?: string }).kind !== VariableDeclarationKindTag.Const
				)
					continue;
				for (const declaration of (statement as { declarations?: OxcNode[] }).declarations ?? []) {
					const binding = declaration as {
						id?: { type?: string; name?: string };
						init?: OxcNode | null;
					};
					if (
						binding.id?.type !== NodeKind.Identifier ||
						binding.id.name === undefined ||
						binding.init === undefined ||
						binding.init === null ||
						values.has(binding.id.name)
					)
						continue;
					const value = evalLiteral(binding.init as never, values, evaluateCall);
					if (value !== undefined) values.set(binding.id.name, value);
				}
			}
			moduleConsts = values;
			return values;
		};
		walk(parsed, (node) => {
			if (node.type !== NodeKind.CallExpression) return;
			const call = node as CallNode;
			const kind = this.callKind(call.callee, names, reactStrictDom.cssNames);
			if (kind === undefined) return;
			if (kind === "css.create") {
				this.extractNamedStyles(sources, code, id, call, evaluateCall);
				return;
			}
			for (const argument of call.arguments) {
				if (kind === "css.group") {
					const groupStyles = this.extractInputGroupStyles(argument, names, evaluateCall);
					if (groupStyles !== undefined) {
						for (const style of groupStyles) this.pushStyle(sources, code, id, call, kind, style);
						continue;
					}
				}
				const literal = evalLiteral(argument as never, undefined, evaluateCall);
				if (typeof literal !== "object" || literal === null) {
					this.pushPartialLiteral(sources, code, id, call, kind, argument, evaluateCall);
					this.pushFiniteCandidates(
						sources,
						code,
						id,
						call,
						kind,
						argument,
						getModuleConsts,
						evaluateCall,
					);
					continue;
				}
				const styles =
					kind === "css.group"
						? Object.values(literal).filter(
								(value): value is Record<string, unknown> =>
									typeof value === "object" && value !== null,
							)
						: [literal as Record<string, unknown>];
				for (const style of styles) {
					this.pushStyle(sources, code, id, call, kind, style);
				}
			}
		});
		for (const pattern of this.patterns) sources.push(...pattern.extract(code, id, this.preset));
		return sources;
	}

	/**
	 * Build stylesheet candidates for `css.group()` definitions that use
	 * `css.input()`. The group remains a runtime function, but its structural
	 * `var(--name)` declarations can be extracted just like `css.vars()`.
	 */
	private extractInputGroupStyles(
		argument: unknown,
		names: ReadonlySet<string>,
		evaluateCall: LiteralCallEvaluator,
	): readonly Record<string, unknown>[] | undefined {
		const node = argument as OxcNode | undefined;
		if (node?.type !== NodeKind.ObjectExpression) return undefined;
		const styles: Array<Record<string, unknown>> = [];
		let hasInput = false;
		for (const property of (node as { properties?: PropertyNode[] }).properties ?? []) {
			if (property.type !== NodeKind.Property) continue;
			const evaluated = evaluateInputStyle(property.value, names, evaluateCall);
			if (
				evaluated === undefined ||
				typeof evaluated.value !== "object" ||
				evaluated.value === null
			)
				continue;
			hasInput ||= evaluated.hasInput;
			styles.push(evaluated.value as Record<string, unknown>);
		}
		return hasInput ? styles : undefined;
	}

	extractFile(code: string, id: string): CssFileExtraction {
		const names = this.scanner.findImports(code, id);
		if (names.size === 0) return { sources: [], varKeys: [] };
		return {
			sources: this.extract(code, id, names),
			varKeys: [...this.scanner.findVarKeys(code, id, names)],
		};
	}

	/**
	 * Mixed static/dynamic call sites keep their provably literal declarations
	 * in the stylesheet. The rewriter lowers the dynamic remainder through a
	 * vars carrier; extraction only ever sees the static subset, so no dynamic
	 * value reaches generated CSS through this path.
	 */
	private pushPartialLiteral(
		sources: ExtractedCssStyle[],
		code: string,
		id: string,
		call: CallNode,
		kind: ExtractedCssStyle["provenance"]["callKind"],
		argument: unknown,
		evaluateCall: LiteralCallEvaluator,
	): void {
		if (kind === "css.group" || kind === "css.raw") return;
		const node = argument as { type?: string; properties?: unknown[] } | null;
		if (node?.type !== NodeKind.ObjectExpression) return;
		const partial: Record<string, unknown> = {};
		for (const property of node.properties ?? []) {
			const entry = property as {
				type?: string;
				key?: { name?: string; value?: { value?: string } };
				value?: { type?: string; value?: unknown };
			};
			if (entry?.type !== NodeKind.Property) continue;
			const key = entry.key?.name ?? entry.key?.value?.value;
			if (typeof key !== "string") continue;
			const value = evalLiteral(entry.value as never, undefined, evaluateCall);
			if (value === undefined) continue;
			partial[key] = value;
		}
		if (Object.keys(partial).length === 0) return;
		this.pushStyle(sources, code, id, call, kind, partial);
	}

	/**
	 * Finite dynamic values (ternaries, unions of constants, template
	 * literals) cannot resolve to one style, but every value they can produce
	 * is statically known. Register one candidate style per combination so
	 * the stylesheet stays complete; the runtime call still selects the
	 * active value. Atomic rule ids dedupe any overlap with the static
	 * subset. The 256-combination cap lives in the evaluator; exceeding it
	 * keeps the conservative behavior, and css.raw stays verbatim.
	 */
	private pushFiniteCandidates(
		sources: ExtractedCssStyle[],
		code: string,
		id: string,
		call: CallNode,
		kind: ExtractedCssStyle["provenance"]["callKind"],
		argument: unknown,
		moduleConsts: () => LiteralConstantScope,
		evaluateCall: LiteralCallEvaluator,
	): void {
		if (kind === "css.raw") return;
		if ((argument as { type?: string } | null)?.type === NodeKind.SpreadElement) return;
		const valueSet = evalLiteralValues(argument as never, moduleConsts(), evaluateCall);
		if (valueSet === undefined || literalValueSetSize(valueSet) === 0) return;
		for (const value of valueSet.values) {
			if (typeof value !== "object" || value === null) continue;
			const styles =
				kind === "css.group"
					? Object.values(value).filter(
							(entry): entry is Record<string, unknown> =>
								typeof entry === "object" && entry !== null,
						)
					: [value as Record<string, unknown>];
			for (const style of styles) this.pushStyle(sources, code, id, call, kind, style);
		}
	}

	private pushStyle(
		sources: ExtractedCssStyle[],
		code: string,
		id: string,
		call: CallNode,
		kind: ExtractedCssStyle["provenance"]["callKind"],
		style: Record<string, unknown>,
	): void {
		const before = code.slice(0, call.start);
		sources.push({
			style: resolveDesignStyle(style, this.preset.tokens),
			provenance: {
				file: id,
				start: call.start,
				end: call.end,
				line: before.split("\n").length,
				column: call.start - (before.lastIndexOf("\n") + 1) + 1,
				callKind: kind,
			},
		});
	}

	private parse(id: string, code: string): OxcNode {
		return this.scanner.parse(code, id);
	}

	private callKind(
		callee: OxcNode | null,
		names: ReadonlySet<string>,
		reactStrictDomNames: ReadonlySet<string>,
	): ExtractedCssStyle["provenance"]["callKind"] | undefined {
		if (callee?.type === NodeKind.Identifier && names.has((callee as { name?: string }).name ?? ""))
			return "css";
		if (callee?.type !== NodeKind.MemberExpression) return undefined;
		const object = (callee as { object?: OxcNode | null }).object;
		const member = (callee as { property?: { name?: string } | null }).property?.name;
		if (isReactStrictDomCreateCall(callee, reactStrictDomNames)) return "css.create";
		return object?.type === NodeKind.Identifier &&
			names.has((object as { name?: string }).name ?? "") &&
			(member === "class" || member === "raw" || member === "group")
			? `css.${member}`
			: undefined;
	}

	private extractNamedStyles(
		sources: ExtractedCssStyle[],
		code: string,
		id: string,
		call: CallNode,
		evaluateCall: LiteralCallEvaluator,
	): void {
		const argument = call.arguments[0] as { type?: string; properties?: unknown[] } | undefined;
		if (argument?.type !== NodeKind.ObjectExpression) return;
		for (const property of argument.properties ?? []) {
			const entry = property as {
				type?: string;
				value?: OxcNode;
			};
			if (entry.type !== NodeKind.Property || entry.value === undefined) continue;
			const literal = evalLiteral(entry.value as never, undefined, evaluateCall);
			if (typeof literal === "object" && literal !== null && !Array.isArray(literal)) {
				this.pushStyle(sources, code, id, call, "css.create", literal as Record<string, unknown>);
				continue;
			}
			const body =
				entry.value.type === NodeKind.ArrowFunctionExpression ||
				entry.value.type === NodeKind.FunctionExpression
					? (entry.value as { body?: OxcNode }).body
					: undefined;
			if (body?.type === NodeKind.ObjectExpression)
				this.pushPartialLiteral(sources, code, id, call, "css.create", body, evaluateCall);
		}
	}
}
