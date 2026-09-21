import { createUnsafeCss } from "../unsafe/css.ts";
import { isLiteralKeyframeBody } from "../css/keyframes.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import {
	evalLiteral,
	type LiteralCallEvaluator,
	type OxcNode,
	walk,
	walkWithParent,
} from "../tw/literal.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCallRewriter, CssPreset, InlineCssResult } from "./css-extraction-contracts.ts";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import type { StyleObject } from "../types/typings.ts";
import { NodeKind, PropertyKindTag } from "../ast-node-kind.ts";
import { createFirstThatWorksEvaluator } from "./css-first-that-works.ts";
import { findFirstThatWorksBindings } from "./css-source-scanner.ts";
import { findCssFactoryBindings } from "./css-factory-source.ts";

/** Static rewrite port; unsupported or dynamic calls remain untouched. */
interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

export interface StaticCssCallRewriterOptions {
	readonly transformDynamicClassName?: boolean;
	/** Namespace used by generated `css.vars()` carriers. */
	readonly namespace?: string;
}

interface PropertyNode extends OxcNode {
	start?: number;
	end?: number;
	key?: OxcNode | null;
	value?: OxcNode | null;
	kind?: string;
	computed?: boolean;
	method?: boolean;
	shorthand?: boolean;
}

interface SplitStyleArgument {
	readonly staticProperties: readonly PropertyNode[];
	readonly dynamicProperties: readonly PropertyNode[];
}

interface RangedNode extends OxcNode {
	readonly start: number;
	readonly end: number;
}

interface ClassNameHost {
	readonly attribute: RangedNode;
}

export class StaticCssCallRewriter implements CssCallRewriter {
	private readonly preset: CssPreset;
	private readonly className: ClassNameStrategy | undefined;
	private readonly transformDynamicClassName: boolean;
	private readonly namespace: string | undefined;
	/** Var toggle keys introduced by carriers this rewriter emitted. */
	private readonly varKeys = new Set<string>();

	constructor(
		preset: CssPreset,
		className?: ClassNameStrategy,
		options: StaticCssCallRewriterOptions = {},
	) {
		this.preset = preset;
		this.className = className;
		this.transformDynamicClassName =
			options.transformDynamicClassName === true &&
			(className === undefined || className.sheetBacked === true);
		this.namespace = options.namespace;
	}

	inline(code: string, id: string, names: ReadonlySet<string>): InlineCssResult {
		this.varKeys.clear();
		if (names.size === 0) return { code, inlined: 0, varKeys: [] };
		const engine = createUnsafeCss({
			conditions: this.preset.conditions,
			className: this.className,
			namespace: this.namespace,
		});
		const parsed = SOURCE_SCANNER_SERVICE.parse({
			file: id,
			source: code,
			language: SOURCE_SCANNER_SERVICE.languageForFile(id),
		}).program;
		const evaluateCall = createFirstThatWorksEvaluator(
			findFirstThatWorksBindings(parsed as unknown as OxcNode),
		);
		const evaluateCssLiteral = (node: Parameters<LiteralCallEvaluator>[0] | undefined) =>
			evalLiteral(node, undefined, evaluateCall);
		const compileStaticArguments = (
			propertySets: readonly (readonly PropertyNode[])[],
		): string | null => {
			const styles: StyleObject[] = [];
			for (const properties of propertySets) {
				const literal: Record<string, unknown> = {};
				for (const property of properties) {
					const name = stylePropertyName(property);
					const value = evaluateCssLiteral(property.value as never);
					if (name === undefined || value === undefined) return null;
					literal[name] = value;
				}
				try {
					styles.push(resolveDesignStyle(literal, this.preset.tokens));
				} catch {
					return null;
				}
			}
			try {
				return engine.class(...styles);
			} catch {
				return null;
			}
		};
		const edits: Array<{ start: number; end: number; text: string }> = [];
		walkWithParent(
			SOURCE_SCANNER_SERVICE.parse({
				file: id,
				source: code,
				language: SOURCE_SCANNER_SERVICE.languageForFile(id),
			}).program,
			(node, parent, ancestors) => {
				if (node.type !== NodeKind.CallExpression) return;
				const call = node as CallNode;
				const callee = call.callee;
				const memberCallee =
					callee?.type === NodeKind.MemberExpression
						? (callee as {
								object?: { type?: string; name?: string } | null;
								property?: { name?: string } | null;
							})
						: undefined;
				if (
					memberCallee?.property?.name === "keyframes" &&
					memberCallee.object?.type === NodeKind.Identifier &&
					names.has(memberCallee.object.name ?? "")
				) {
					// The body does not ship: the whole call folds to the name the
					// sheet emits, so a keyframes-only module drops the factory too.
					const body = evaluateCssLiteral(call.arguments[0] as never);
					if (!isLiteralKeyframeBody(body)) return;
					edits.push({
						start: call.start,
						end: call.end,
						text: JSON.stringify(engine.keyframes(body)),
					});
					return;
				}
				let kind: "map" | "class" | "group" | undefined;
				let carrierName: string | undefined;
				if (
					callee?.type === NodeKind.Identifier &&
					names.has((callee as { name?: string }).name ?? "")
				) {
					kind = "map";
					carrierName = (callee as { name?: string }).name;
				} else if (callee?.type === NodeKind.MemberExpression) {
					const object = (callee as { object?: OxcNode | null }).object;
					const member = (callee as { property?: { name?: string } | null }).property?.name;
					if (
						object?.type === NodeKind.Identifier &&
						names.has((object as { name?: string }).name ?? "") &&
						(member === "class" || member === "group")
					) {
						kind = member as "class" | "group";
						carrierName = (object as { name?: string }).name;
					}
				}
				if (kind === undefined || call.arguments.length === 0) return;
				const classNameHost =
					kind === "class" && this.transformDynamicClassName
						? directClassNameHost(parent, ancestors)
						: undefined;
				if (classNameHost !== undefined) {
					const carrier = dynamicHostCarrier(
						code,
						call,
						carrierName!,
						compileStaticArguments,
						evaluateCall,
					);
					if (carrier !== undefined) {
						edits.push({
							start: classNameHost.attribute.start!,
							end: classNameHost.attribute.end!,
							text: `{...${carrier.text}}`,
						});
						for (const key of carrier.varKeys) this.varKeys.add(key);
						return;
					}
				}
				const objectArguments = call.arguments.filter(
					(argument) => (argument as { type?: string } | null)?.type === NodeKind.ObjectExpression,
				);
				if (
					kind !== "group" &&
					objectArguments.length > 0 &&
					objectArguments.length === call.arguments.length &&
					call.arguments.every((argument) => hasLiteralProperty(argument as OxcNode)) &&
					call.arguments.some((argument) => evaluateCssLiteral(argument as never) === undefined)
				) {
					// The carrier's host-prop result shape ({style, className}) is
					// only equivalent to the css() call result when spread onto a
					// JSX host. Plain code positions keep the runtime fallback.
					// The carrier keeps static declarations on the class lane, so
					// vars atoms never collide with stylesheet rules for the same keys.
					const isJsxPosition = parent?.type === NodeKind.JSXSpreadAttribute;
					if (isJsxPosition && carrierName !== undefined) {
						const carrier = dynamicHostCarrier(
							code,
							call,
							carrierName,
							compileStaticArguments,
							evaluateCall,
						);
						if (carrier !== undefined) {
							edits.push({ start: call.start, end: call.end, text: carrier.text });
							for (const key of carrier.varKeys) this.varKeys.add(key);
							return;
						}
						// Preserve the existing conservative rewrite when the static/dynamic
						// partition is ambiguous or cannot be compiled independently.
						const ranges = call.arguments.map(
							(argument) => argument as { start?: number; end?: number },
						);
						const fallback = `${carrierName}.props(${carrierName}.vars(${ranges
							.map((range) => code.slice(range.start!, range.end!))
							.join(", ")}))`;
						edits.push({ start: call.start, end: call.end, text: fallback });
						for (const argument of call.arguments)
							collectFlatVarKeys(argument as OxcNode, "", this.varKeys);
					}
				}
				if (kind === "group") {
					const group = literalGroup(call.arguments[0], evaluateCall);
					if (group === undefined) return;
					try {
						edits.push({
							start: call.start,
							end: call.end,
							text: JSON.stringify(engine.group(group)),
						});
					} catch {
						/* dynamic/unrepresentable groups stay on the runtime path */
					}
					return;
				}
				const styles = call.arguments.flatMap((argument) => {
					const literal = evaluateCssLiteral(argument as never);
					return typeof literal === "object" && literal !== null
						? [resolveDesignStyle(literal as Record<string, unknown>, this.preset.tokens)]
						: [];
				});
				// Only fold when every argument is provably literal; a partially
				// literal multi-arg call must not silently drop dynamic arguments
				// (those take the vars-carrier path above or stay on the runtime).
				if (styles.length === 0 || styles.length !== call.arguments.length) return;
				try {
					const compiled = kind === "class" ? engine.class(...styles) : engine(...styles);
					edits.push({ start: call.start, end: call.end, text: JSON.stringify(compiled) });
				} catch {
					/* dynamic/unrepresentable calls stay on the runtime path */
				}
			},
		);
		let output = code;
		for (const edit of edits.toReversed())
			output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);

		output = markCssFactoryCallsPure(output, id);
		return { code: output, inlined: edits.length, varKeys: [...this.varKeys] };
	}
}

/**
 * Find the narrow JSX host shape supported by the opt-in dynamic-class pass.
 * `css.props()` returns both `className` and `style`, so an existing style or
 * spread prop could change precedence in ways this source rewrite cannot
 * prove equivalent.
 */
const directClassNameHost = (
	parent: OxcNode | undefined,
	ancestors: readonly OxcNode[],
): ClassNameHost | undefined => {
	if (parent?.type !== NodeKind.JSXExpressionContainer) return undefined;
	const attribute = ancestors.at(-2) as (OxcNode & { value?: OxcNode | null }) | undefined;
	const openingElement = ancestors.at(-3) as
		| (OxcNode & { attributes?: readonly OxcNode[] })
		| undefined;
	if (
		attribute?.type !== NodeKind.JSXAttribute ||
		attribute.value !== parent ||
		(attribute.name as { name?: string } | undefined)?.name !== "className" ||
		openingElement?.type !== NodeKind.JSXOpeningElement
	)
		return undefined;
	if (
		(openingElement.attributes ?? []).some((candidate) => {
			if (candidate === attribute) return false;
			if (candidate.type === NodeKind.JSXSpreadAttribute) return true;
			return (
				candidate.type === NodeKind.JSXAttribute &&
				(candidate as { name?: { name?: string } }).name?.name === "style"
			);
		})
	)
		return undefined;
	return {
		attribute: attribute as RangedNode,
	};
};

const stylePropertyName = (property: PropertyNode): string | undefined => {
	const key = property.key;
	if (key?.type === NodeKind.Identifier) return (key as { name?: string }).name;
	if (key?.type === NodeKind.Literal) {
		const value = (key as { value?: unknown }).value;
		return typeof value === "string" ? value : undefined;
	}
	return undefined;
};

/** Split one flat style object without changing any runtime value expression. */
const splitStyleArgument = (
	code: string,
	argument: unknown,
	evaluateCall: LiteralCallEvaluator,
): SplitStyleArgument | undefined => {
	const node = argument as (OxcNode & { properties?: readonly PropertyNode[] }) | undefined;
	if (node?.type !== NodeKind.ObjectExpression) return undefined;
	const staticProperties: PropertyNode[] = [];
	const dynamicProperties: PropertyNode[] = [];
	for (const property of node.properties ?? []) {
		if (
			property.type !== NodeKind.Property ||
			property.kind !== PropertyKindTag.Init ||
			property.computed === true ||
			property.method === true ||
			property.shorthand === true ||
			property.start === undefined ||
			property.end === undefined
		)
			return undefined;
		const name = stylePropertyName(property);
		const value = property.value;
		// Conditions, design-layer modules, spreads, and nested dynamic objects
		// need their own semantic lowering; the first pass is scalar only.
		if (
			name === undefined ||
			name.startsWith("_") ||
			name.startsWith("$") ||
			value === undefined ||
			value === null
		)
			return undefined;
		if (evalLiteral(value as never, undefined, evaluateCall) !== undefined) {
			staticProperties.push(property);
			continue;
		}
		if (
			value.type === NodeKind.ObjectExpression ||
			value.type === NodeKind.ArrayExpression ||
			value.type === NodeKind.ArrowFunctionExpression ||
			value.type === NodeKind.FunctionExpression
		)
			return undefined;
		dynamicProperties.push(property);
	}
	return { staticProperties, dynamicProperties };
};

const renderStyleObject = (code: string, properties: readonly PropertyNode[]): string =>
	`{ ${properties.map((property) => code.slice(property.start!, property.end!)).join(", ")} }`;

/** Flattened var-toggle key path (condition segments first), same shape the scanner reports. */
const collectFlatVarKeys = (node: OxcNode | undefined, prefix: string, out: Set<string>): void => {
	if (node?.type !== NodeKind.ObjectExpression) return;
	for (const property of (node as { properties?: unknown[] }).properties ?? []) {
		const entry = property as {
			type?: string;
			key?: { name?: string; value?: string };
			value?: OxcNode;
		};
		if (entry?.type === NodeKind.SpreadElement) continue;
		const key = entry?.key?.name ?? (entry?.key as { value?: string } | undefined)?.value;
		if (typeof key !== "string") continue;
		const full = prefix === "" ? key : `${prefix}__${key}`;
		if (entry.value?.type === NodeKind.ObjectExpression) collectFlatVarKeys(entry.value, full, out);
		else out.add(full);
	}
};

/**
 * Build the props carrier for a JSX host binding. The generated `css.vars()`
 * call contains only dynamic declarations; static declarations are compiled
 * to one class string and keep their extracted atomic rules.
 */
const dynamicHostCarrier = (
	code: string,
	call: CallNode,
	carrierName: string,
	compileStatic: (propertySets: readonly (readonly PropertyNode[])[]) => string | null,
	evaluateCall: LiteralCallEvaluator,
): { readonly text: string; readonly varKeys: readonly string[] } | undefined => {
	const splits = call.arguments.map((argument) => splitStyleArgument(code, argument, evaluateCall));
	if (splits.some((split): split is undefined => split === undefined)) return undefined;
	const resolved = splits as SplitStyleArgument[];
	const staticPropertySets = resolved
		.map(({ staticProperties }) => staticProperties)
		.filter((properties) => properties.length > 0);
	const dynamicArguments = resolved
		.map(({ dynamicProperties }) =>
			dynamicProperties.length === 0 ? undefined : renderStyleObject(code, dynamicProperties),
		)
		.filter((value): value is string => value !== undefined);
	if (dynamicArguments.length === 0) return undefined;

	const staticNames = new Set(
		resolved.flatMap(({ staticProperties }) =>
			staticProperties.map((property) => stylePropertyName(property)!),
		),
	);
	const dynamicNames = new Set(
		resolved.flatMap(({ dynamicProperties }) =>
			dynamicProperties.map((property) => stylePropertyName(property)!),
		),
	);
	if ([...staticNames].some((name) => dynamicNames.has(name))) return undefined;
	const staticClass =
		staticPropertySets.length === 0 ? undefined : compileStatic(staticPropertySets);
	if (staticPropertySets.length > 0 && staticClass === null) return undefined;

	const inputs = [
		`${carrierName}.vars(${dynamicArguments.join(", ")})`,
		...(staticClass === undefined || staticClass === "" ? [] : [JSON.stringify(staticClass)]),
	];
	return {
		text: `${carrierName}.props(${inputs.join(", ")})`,
		varKeys: [...dynamicNames],
	};
};

/** At least one ordinary property with a literal value (see pushPartialLiteral). */
const hasLiteralProperty = (node: OxcNode): boolean =>
	((node as { properties?: unknown[] }).properties ?? []).some((property) => {
		const entry = property as {
			type?: string;
			key?: { name?: string; value?: { value?: string } };
			value?: { type?: string };
		};
		if (entry?.type !== NodeKind.Property || entry.value?.type !== NodeKind.Literal) return false;
		return typeof (entry.key?.name ?? entry.key?.value?.value) === "string";
	});

const literalGroup = (
	argument: unknown,
	evaluateCall: LiteralCallEvaluator,
): Record<string, StyleObject> | undefined => {
	const value = evalLiteral(argument as never, undefined, evaluateCall);
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const entries = Object.entries(value).filter(
		(entry): entry is [string, object] => typeof entry[1] === "object" && entry[1] !== null,
	);
	return entries.length === Object.keys(value).length
		? (Object.fromEntries(entries) as Record<string, StyleObject>)
		: undefined;
};

export const markCssFactoryCallsPure = (code: string, id: string): string => {
	const bindings = findCssFactoryBindings(code, id);
	if (bindings.length === 0) return code;
	const factoryNames = new Set(bindings.map((binding) => binding.local));
	const program = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code }).program;
	const starts: number[] = [];
	walk(program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const call = node as unknown as {
			start?: number;
			callee?: { type?: string; name?: string };
		};
		if (
			call.start === undefined ||
			call.callee?.type !== NodeKind.Identifier ||
			!factoryNames.has(call.callee.name ?? "")
		)
			return;
		const prefix = code.slice(Math.max(0, call.start - 32), call.start);
		if (prefix.includes("@__PURE__")) return;
		starts.push(call.start);
	});
	for (const start of starts.toReversed())
		code = code.slice(0, start) + "/* @__PURE__ */ " + code.slice(start);
	return code;
};
