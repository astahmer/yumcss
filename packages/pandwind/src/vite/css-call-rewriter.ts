import { createCss } from "../css/create-css.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { evalLiteral, type OxcNode, walk } from "../tw/literal.ts";
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import type { CssCallRewriter, CssPreset, InlineCssResult } from "./css-extraction-contracts.ts";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";

/** Tailwind-mode rewrite port; unsupported or dynamic calls remain untouched. */
interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

export class TailwindCssCallRewriter implements CssCallRewriter {
	private readonly preset: CssPreset;
	private readonly className: AnyClassNameStrategy;

	constructor(preset: CssPreset, className: AnyClassNameStrategy) {
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
				let kind: "map" | "class" | undefined;
				if (callee?.type === "Identifier" && names.has((callee as { name?: string }).name ?? ""))
					kind = "map";
				else if (callee?.type === "MemberExpression") {
					const object = (callee as { object?: OxcNode | null }).object;
					const member = (callee as { property?: { name?: string } | null }).property?.name;
					if (
						object?.type === "Identifier" &&
						names.has((object as { name?: string }).name ?? "") &&
						member === "class"
					)
						kind = "class";
				}
				if (kind === undefined || call.arguments.length === 0) return;
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
		return { code: output, inlined: edits.length };
	}
}
