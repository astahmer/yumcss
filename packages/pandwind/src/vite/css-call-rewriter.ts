import { createCss } from "../css/create-css.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { evalLiteral, type OxcNode, walk } from "../tw/literal.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCallRewriter, CssPreset, InlineCssResult } from "./css-extraction-contracts.ts";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";

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

	constructor(preset: CssPreset, className?: ClassNameStrategy) {
		this.preset = preset;
		this.className = className;
	}

	inline(code: string, id: string, names: ReadonlySet<string>): InlineCssResult {
		if (names.size === 0) return { code, inlined: 0 };
		const engine = createCss({ className: this.className });
		const edits: Array<{ start: number; end: number; text: string }> = [];
		walk(
			SOURCE_SCANNER_SERVICE.parse({
				file: id,
				source: code,
				language: SOURCE_SCANNER_SERVICE.languageForFile(id),
			}).program,
			(node) => {
				if (node.type !== "CallExpression") return;
				const call = node as CallNode;
				const callee = call.callee;
				let kind: "map" | "class" | "group" | undefined;
				if (callee?.type === "Identifier" && names.has((callee as { name?: string }).name ?? ""))
					kind = "map";
				else if (callee?.type === "MemberExpression") {
					const object = (callee as { object?: OxcNode | null }).object;
					const member = (callee as { property?: { name?: string } | null }).property?.name;
					if (
						object?.type === "Identifier" &&
						names.has((object as { name?: string }).name ?? "") &&
						(member === "class" || member === "group")
					)
						kind = member as "class" | "group";
				}
				if (kind === undefined || call.arguments.length === 0) return;
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
				if (styles.length === 0) return;
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
		return { code: output, inlined: edits.length };
	}
}

const literalGroup = (argument: unknown): Record<string, Record<string, unknown>> | undefined => {
	const value = evalLiteral(argument as never);
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const entries = Object.entries(value).filter(
		(entry): entry is [string, Record<string, unknown>] =>
			typeof entry[1] === "object" && entry[1] !== null,
	);
	return entries.length === Object.keys(value).length ? Object.fromEntries(entries) : undefined;
};

const CSS_FACTORY_NAMES = new Set(["createCss"]);

function findUnusedCssFactoryCalls(code: string, id: string, names: ReadonlySet<string>): number[] {
	const result: number[] = [];
	const program = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code }).program;
	const factoryNames = new Set<string>();
	walk(program, (node) => {
		if (node.type !== "ImportDeclaration") return;
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
				specifier.type === "ImportSpecifier" &&
				local !== undefined &&
				imported !== undefined &&
				CSS_FACTORY_NAMES.has(imported)
			)
				factoryNames.add(local);
		}
	});

	walk(program, (node) => {
		if (node.type !== "VariableDeclarator") return;
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
			binding?.type !== "Identifier" ||
			binding.name === undefined ||
			!names.has(binding.name) ||
			init?.type !== "CallExpression" ||
			init.callee?.type !== "Identifier" ||
			init.callee.name === undefined ||
			!factoryNames.has(init.callee.name) ||
			(init.arguments?.length ?? 0) !== 0 ||
			init.start === undefined
		)
			return;

		let references = 0;
		walk(program, (candidate) => {
			if (candidate.type !== "Identifier") return;
			const identifier = candidate as unknown as { name?: string; start?: number };
			if (identifier.name === binding.name && identifier.start !== binding.start) references++;
		});
		if (references === 0) result.push(init.start);
	});

	return result;
}
