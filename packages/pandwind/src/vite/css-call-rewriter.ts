import { createCss } from "../css/create-css.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { evalLiteral, type OxcNode, walk, walkWithParent } from "../tw/literal.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCallRewriter, CssPreset, InlineCssResult } from "./css-extraction-contracts.ts";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import type { StyleObject } from "../types/typings.ts";
import { NodeKind } from "../ast-node-kind.ts";

/** Static rewrite port; unsupported or dynamic calls remain untouched. */
interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

export class StaticCssCallRewriter implements CssCallRewriter {
	private readonly preset: CssPreset;
	private readonly className: ClassNameStrategy | undefined;
	/** Var toggle keys introduced by carriers this rewriter emitted. */
	private readonly varKeys = new Set<string>();

	constructor(preset: CssPreset, className?: ClassNameStrategy) {
		this.preset = preset;
		this.className = className;
	}

	inline(code: string, id: string, names: ReadonlySet<string>): InlineCssResult {
		this.varKeys.clear();
		if (names.size === 0) return { code, inlined: 0, varKeys: [] };
		const engine = createCss({ className: this.className });
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
				const objectArguments = call.arguments.filter(
					(argument) => (argument as { type?: string } | null)?.type === NodeKind.ObjectExpression,
				);
				if (
					kind !== "group" &&
					objectArguments.length > 0 &&
					objectArguments.length === call.arguments.length &&
					call.arguments.every((argument) => hasLiteralProperty(argument as OxcNode)) &&
					call.arguments.some((argument) => evalLiteral(argument as never) === undefined)
				) {
					// The carrier's host-prop result shape ({style, className}) is
					// only equivalent to the css() call result when spread onto a
					// JSX host. Plain code positions keep the runtime fallback.
					// The runtime carrier re-derives the static subset itself, so
					// vars atoms never collide with stylesheet rules for the same keys.
					const isJsxPosition =
						parent?.type === NodeKind.JSXExpressionContainer ||
						parent?.type === NodeKind.JSXSpreadAttribute ||
						ancestors.at(-2)?.type === NodeKind.JSXExpressionContainer;
					if (isJsxPosition && carrierName !== undefined) {
						const ranges = call.arguments.map(
							(argument) => argument as { start?: number; end?: number },
						);
						const carrier = `${carrierName}.props(${carrierName}.vars(${ranges
							.map((range) => code.slice(range.start!, range.end!))
							.join(", ")}))`;
						edits.push({ start: call.start, end: call.end, text: carrier });
						for (const argument of call.arguments)
							collectFlatVarKeys(argument as OxcNode, "", this.varKeys);
						return;
					}
				}
				if (kind === "group") {
					const group = literalGroup(call.arguments[0]);
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
					const literal = evalLiteral(argument as never);
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

		// A static module no longer needs its factory instance. Mark only a
		// factory whose local result has no remaining references: the bundler can
		// then remove the call and its implementation, while dynamic/partial
		// modules retain the ordinary runtime fallback.
		const pureCalls = findUnusedCssFactoryCalls(output, id, names);
		for (const start of pureCalls.toReversed()) {
			output = output.slice(0, start) + "/* @__PURE__ */ " + output.slice(start);
		}
		return { code: output, inlined: edits.length, varKeys: [...this.varKeys] };
	}
}

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

const literalGroup = (argument: unknown): Record<string, StyleObject> | undefined => {
	const value = evalLiteral(argument as never);
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const entries = Object.entries(value).filter(
		(entry): entry is [string, object] => typeof entry[1] === "object" && entry[1] !== null,
	);
	return entries.length === Object.keys(value).length
		? (Object.fromEntries(entries) as Record<string, StyleObject>)
		: undefined;
};

const CSS_FACTORY_NAMES = new Set(["createCss"]);

function findUnusedCssFactoryCalls(code: string, id: string, names: ReadonlySet<string>): number[] {
	const result: number[] = [];
	const program = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code }).program;
	const factoryNames = new Set<string>();
	walk(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		for (const specifier of (
			node as {
				specifiers?: Array<{
					type?: string;
					imported?: { name?: string };
					local?: { name?: string };
				}>;
			}
		).specifiers ?? []) {
			const imported = specifier.imported?.name;
			const local = specifier.local?.name;
			if (
				specifier.type === NodeKind.ImportSpecifier &&
				local !== undefined &&
				imported !== undefined &&
				CSS_FACTORY_NAMES.has(imported)
			)
				factoryNames.add(local);
		}
	});

	walk(program, (node) => {
		if (node.type !== NodeKind.VariableDeclarator) return;
		const declarator = node as unknown as {
			id?: { type?: string; name?: string; start?: number };
			init?: {
				type?: string;
				start?: number;
				callee?: { type?: string; name?: string };
				arguments?: unknown[];
			} | null;
		};
		const binding = declarator.id;
		const init = declarator.init;
		if (
			binding?.type !== NodeKind.Identifier ||
			binding.name === undefined ||
			!names.has(binding.name) ||
			init?.type !== NodeKind.CallExpression ||
			init.callee?.type !== NodeKind.Identifier ||
			init.callee.name === undefined ||
			!factoryNames.has(init.callee.name) ||
			(init.arguments?.length ?? 0) !== 0 ||
			init.start === undefined
		)
			return;

		let references = 0;
		walk(program, (candidate) => {
			if (candidate.type !== NodeKind.Identifier) return;
			const identifier = candidate as unknown as { name?: string; start?: number };
			if (identifier.name === binding.name && identifier.start !== binding.start) references++;
		});
		if (references === 0) result.push(init.start);
	});

	return result;
}
