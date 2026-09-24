import { resolveDesignStyle } from "../design/resolve.ts";
import { isLiteralKeyframeBody } from "../css/keyframes.ts";
import {
	evalLiteral,
	evalLiteralValues,
	literalValueSetSize,
	type LiteralCallEvaluator,
	type LiteralConstantScope,
	type OxcNode,
	walkWithParent,
} from "../tw/literal.ts";
import type {
	CssArtifactExtractor,
	CssFileExtraction,
	CssPatternAdapter,
	CssPreset,
	CssSourceProvenance,
	ExtractedCssStyle,
	ExtractedKeyframe,
} from "./css-extraction-contracts.ts";
import type { CssSourceScanner } from "./css-extraction-contracts.ts";
import { NodeKind, PropertyKindTag } from "../ast-node-kind.ts";
import { cssVar } from "../lib/utils.ts";
import { findReactStrictDomBindings, isReactStrictDomCreateCall } from "./css-react-strict-dom.ts";
import { createFirstThatWorksEvaluator } from "./css-first-that-works.ts";
import { createCssLiteralScopeResolver } from "./css-literal-scope.ts";
import { findFirstThatWorksBindings } from "./css-source-scanner.ts";
import {
	analyzeCssInlineArguments,
	canonicalStyleKey,
	CSS_INLINE_UNKNOWN,
	type CssInlineEntry,
} from "./css-inline-analysis.ts";
import { hasDuplicateCssObjectKeys } from "./css-inline-shape.ts";

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

const isStyleRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const styleFromInlineEntries = (
	entries: readonly CssInlineEntry[],
): Record<string, unknown> | undefined => {
	const style: Record<string, unknown> = {};
	for (const entry of entries) {
		const path = entry.key.split("__");
		if (path.length === 0) return undefined;
		let current = style;
		for (const part of path.slice(0, -1)) {
			if (!Object.hasOwn(current, part)) current[part] = {};
			const child = current[part];
			if (!isStyleRecord(child)) return undefined;
			current = child;
		}
		const finalPart = path.at(-1);
		if (finalPart === undefined) return undefined;
		current[finalPart] = entry.value;
	}
	return style;
};

const inputName = (
	node: OxcNode | undefined,
	names: ReadonlySet<string>,
	literalConstants: LiteralConstantScope,
): string | undefined => {
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
	const value = evalLiteral(call.arguments[0] as never, literalConstants);
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
	literalConstants: LiteralConstantScope,
	evaluateCall: LiteralCallEvaluator,
): EvaluatedValue | undefined => {
	const name = inputName(node, names, literalConstants);
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
			const evaluated = evaluateInputStyle(child.value, names, literalConstants, evaluateCall);
			if (evaluated === undefined) return undefined;
			hasInput ||= evaluated.hasInput;
			value[key] = evaluated.value;
		}
		return { ok: true, value, hasInput };
	}
	const value = evalLiteral(node as never, literalConstants, evaluateCall);
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
		return this.extractAll(code, id, names).sources;
	}

	private extractAll(
		code: string,
		id: string,
		names: ReadonlySet<string>,
	): { sources: ExtractedCssStyle[]; keyframes: ExtractedKeyframe[] } {
		const parsed = this.parse(id, code);
		const sources: ExtractedCssStyle[] = [];
		const keyframes: ExtractedKeyframe[] = [];
		const reactStrictDom = findReactStrictDomBindings(parsed);
		const evaluateCall = createFirstThatWorksEvaluator(findFirstThatWorksBindings(parsed));
		const resolveLiteralScope = createCssLiteralScopeResolver(
			parsed as unknown as OxcNode,
			evaluateCall,
		);
		walkWithParent(parsed, (node, _parent, ancestors) => {
			if (node.type !== NodeKind.CallExpression) return;
			const call = node as CallNode;
			const literalConstants = resolveLiteralScope(call, ancestors);
			const kind = this.callKind(call.callee, names, reactStrictDom.cssNames);
			if (kind === undefined) return;
			if (kind === "css.create") {
				this.extractNamedStyles(sources, code, id, call, literalConstants, evaluateCall);
				return;
			}
			if (kind === "css.keyframes") {
				const body = evalLiteral(call.arguments[0] as never, literalConstants, evaluateCall);
				if (isLiteralKeyframeBody(body))
					keyframes.push({
						body,
						provenance: this.provenance(code, id, call, "css.keyframes"),
					});
				return;
			}
			for (const argument of call.arguments) {
				if (kind === "css.group") {
					const groupStyles = this.extractInputGroupStyles(
						argument,
						names,
						literalConstants,
						evaluateCall,
					);
					if (groupStyles !== undefined) {
						for (const style of groupStyles) this.pushStyle(sources, code, id, call, kind, style);
						continue;
					}
				}
				const literal = evalLiteral(argument as never, literalConstants, evaluateCall);
				if (typeof literal !== "object" || literal === null) {
					this.pushPartialLiteral(
						sources,
						code,
						id,
						call,
						kind,
						argument,
						literalConstants,
						evaluateCall,
					);
					this.pushFiniteCandidates(
						sources,
						code,
						id,
						call,
						kind,
						argument,
						literalConstants,
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
		return { sources, keyframes };
	}

	/**
	 * Build stylesheet candidates for `css.group()` definitions that use
	 * `css.input()`. The group remains a runtime function, but its structural
	 * `var(--name)` declarations can be extracted just like `css.vars()`.
	 */
	private extractInputGroupStyles(
		argument: unknown,
		names: ReadonlySet<string>,
		literalConstants: LiteralConstantScope,
		evaluateCall: LiteralCallEvaluator,
	): readonly Record<string, unknown>[] | undefined {
		const node = argument as OxcNode | undefined;
		if (node?.type !== NodeKind.ObjectExpression) return undefined;
		const styles: Array<Record<string, unknown>> = [];
		let hasInput = false;
		for (const property of (node as { properties?: PropertyNode[] }).properties ?? []) {
			if (property.type !== NodeKind.Property) continue;
			const evaluated = evaluateInputStyle(property.value, names, literalConstants, evaluateCall);
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
		if (names.size === 0) return { sources: [], varKeys: [], keyframes: [] };
		const extracted = this.extractAll(code, id, names);
		return {
			sources: extracted.sources,
			keyframes: extracted.keyframes,
			varKeys: [...this.scanner.findVarKeys(code, id, names)],
		};
	}

	/**
	 * Mixed static/dynamic call sites keep their provably literal declarations
	 * in the stylesheet. The rewriter lowers dynamic class strings separately
	 * and uses vars carriers only at eligible JSX hosts.
	 */
	private pushPartialLiteral(
		sources: ExtractedCssStyle[],
		code: string,
		id: string,
		call: CallNode,
		kind: ExtractedCssStyle["provenance"]["callKind"],
		argument: unknown,
		literalConstants: LiteralConstantScope,
		evaluateCall: LiteralCallEvaluator,
	): void {
		if (kind === "css.group" || kind === "css.raw") return;
		const node = argument as OxcNode | null;
		if (node?.type !== NodeKind.ObjectExpression) return;
		if (hasDuplicateCssObjectKeys(node)) {
			this.pushTopLevelPartialLiteral(
				sources,
				code,
				id,
				call,
				kind,
				node,
				literalConstants,
				evaluateCall,
			);
			return;
		}
		const analysis = analyzeCssInlineArguments([node], {
			evaluateStatic: (value) => {
				const evaluated = evalLiteral(value as never, literalConstants, evaluateCall);
				return evaluated === undefined ? CSS_INLINE_UNKNOWN : evaluated;
			},
			canonicalizeKey: (key) => canonicalStyleKey(key, this.preset.conditions),
		});
		const partial = styleFromInlineEntries(analysis.staticWinners);
		if (partial === undefined || Object.keys(partial).length === 0) return;
		this.pushStyle(sources, code, id, call, kind, partial);
	}

	private pushTopLevelPartialLiteral(
		sources: ExtractedCssStyle[],
		code: string,
		id: string,
		call: CallNode,
		kind: ExtractedCssStyle["provenance"]["callKind"],
		node: OxcNode,
		literalConstants: LiteralConstantScope,
		evaluateCall: LiteralCallEvaluator,
	): void {
		const partial: Record<string, unknown> = {};
		for (const property of (node as { properties?: unknown[] }).properties ?? []) {
			const entry = property as {
				type?: string;
				key?: { name?: string; value?: { value?: string } };
				value?: { type?: string; value?: unknown };
			};
			if (entry?.type !== NodeKind.Property) continue;
			const key = entry.key?.name ?? entry.key?.value?.value;
			if (typeof key !== "string") continue;
			const value = evalLiteral(entry.value as never, literalConstants, evaluateCall);
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
		literalConstants: LiteralConstantScope,
		evaluateCall: LiteralCallEvaluator,
	): void {
		if (kind === "css.raw") return;
		if ((argument as { type?: string } | null)?.type === NodeKind.SpreadElement) return;
		const valueSet = evalLiteralValues(argument as never, literalConstants, evaluateCall);
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
		sources.push({
			style: resolveDesignStyle(style, this.preset.tokens),
			provenance: this.provenance(code, id, call, kind),
		});
	}

	private provenance(
		code: string,
		id: string,
		call: CallNode,
		kind: ExtractedCssStyle["provenance"]["callKind"],
	): CssSourceProvenance {
		const before = code.slice(0, call.start);
		return {
			file: id,
			start: call.start,
			end: call.end,
			line: before.split("\n").length,
			column: call.start - (before.lastIndexOf("\n") + 1) + 1,
			callKind: kind,
		};
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
			(member === "class" || member === "raw" || member === "group" || member === "keyframes")
			? `css.${member}`
			: undefined;
	}

	private extractNamedStyles(
		sources: ExtractedCssStyle[],
		code: string,
		id: string,
		call: CallNode,
		literalConstants: LiteralConstantScope,
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
			const literal = evalLiteral(entry.value as never, literalConstants, evaluateCall);
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
				this.pushPartialLiteral(
					sources,
					code,
					id,
					call,
					"css.create",
					body,
					literalConstants,
					evaluateCall,
				);
		}
	}
}
