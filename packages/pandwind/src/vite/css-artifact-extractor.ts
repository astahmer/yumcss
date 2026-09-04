import { resolveDesignStyle } from "../design/resolve.ts";
import { evalLiteral, type OxcNode, walk } from "../tw/literal.ts";
import type {
	CssArtifactExtractor,
	CssFileExtraction,
	CssPatternAdapter,
	CssPreset,
	CssSourceProvenance,
	ExtractedCssStyle,
} from "./css-extraction-contracts.ts";
import type { CssSourceScanner } from "./css-extraction-contracts.ts";

/** Resolves literal style calls into artifacts while preserving source provenance. */
interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

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
		walk(parsed, (node) => {
			if (node.type !== "CallExpression") return;
			const call = node as CallNode;
			const kind = this.callKind(call.callee, names);
			if (kind === undefined) return;
			for (const argument of call.arguments) {
				const literal = evalLiteral(argument as never);
				if (typeof literal !== "object" || literal === null) {
					this.pushPartialLiteral(sources, code, id, call, kind, argument);
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
					const before = code.slice(0, call.start);
					const provenance: CssSourceProvenance = {
						file: id,
						start: call.start,
						end: call.end,
						line: before.split("\n").length,
						column: call.start - (before.lastIndexOf("\n") + 1) + 1,
						callKind: kind,
					};
					sources.push({
						style: resolveDesignStyle(style, this.preset.tokens),
						provenance,
					});
				}
			}
		});
		for (const pattern of this.patterns) sources.push(...pattern.extract(code, id, this.preset));
		return sources;
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
	): void {
		if (kind === "css.group" || kind === "css.raw") return;
		const node = argument as { type?: string; properties?: unknown[] } | null;
		if (node?.type !== "ObjectExpression") return;
		const partial: Record<string, unknown> = {};
		for (const property of node.properties ?? []) {
			const entry = property as {
				type?: string;
				key?: { name?: string; value?: { value?: string } };
				value?: { type?: string; value?: unknown };
			};
			if (entry?.type !== "Property" || entry.value?.type !== "Literal") continue;
			const key = entry.key?.name ?? entry.key?.value?.value;
			if (typeof key !== "string") continue;
			partial[key] = entry.value.value;
		}
		if (Object.keys(partial).length === 0) return;
		const before = code.slice(0, call.start);
		sources.push({
			style: resolveDesignStyle(partial, this.preset.tokens),
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
	): ExtractedCssStyle["provenance"]["callKind"] | undefined {
		if (callee?.type === "Identifier" && names.has((callee as { name?: string }).name ?? ""))
			return "css";
		if (callee?.type !== "MemberExpression") return undefined;
		const object = (callee as { object?: OxcNode | null }).object;
		const member = (callee as { property?: { name?: string } | null }).property?.name;
		return object?.type === "Identifier" &&
			names.has((object as { name?: string }).name ?? "") &&
			(member === "class" || member === "raw" || member === "group")
			? `css.${member}`
			: undefined;
	}
}
