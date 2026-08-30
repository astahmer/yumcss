import { resolveDesignStyle } from "../design/resolve.ts";
import { type OxcNode, walk } from "../tw/literal.ts";
import type {
	CssArtifactExtractor,
	CssFileExtraction,
	CssPatternAdapter,
	CssPreset,
	CssSourceProvenance,
	ExtractedCssStyle,
} from "./css-extraction-contracts.ts";
import type { CssSourceScanner } from "./css-extraction-contracts.ts";
import { evaluateStyleLiteral } from "./style-constants.ts";

/** Resolves literal style calls into artifacts while preserving source provenance. */
interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

const groupStyles = (
	argument: OxcNode,
	constants: ReadonlyMap<string, unknown>,
): Record<string, unknown>[] => {
	if (argument.type !== "ObjectExpression") return [];
	const styles: Record<string, unknown>[] = [];
	for (const property of (argument as { properties?: OxcNode[] }).properties ?? []) {
		if (property.type !== "Property") continue;
		const value = evaluateStyleLiteral((property as { value?: OxcNode }).value, constants);
		if (typeof value === "object" && value !== null && !Array.isArray(value))
			styles.push(value as Record<string, unknown>);
	}
	return styles;
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
		const constants = this.scanner.findStyleConstants?.(code, id) ?? new Map();
		const sources: ExtractedCssStyle[] = [];
		walk(parsed, (node) => {
			if (node.type !== "CallExpression") return;
			const call = node as CallNode;
			const kind = this.callKind(call.callee, names);
			if (kind === undefined) return;
			for (const argument of call.arguments) {
				const literal = evaluateStyleLiteral(argument as OxcNode, constants);
				const styles =
					kind === "css.group"
						? groupStyles(argument as OxcNode, constants)
						: typeof literal === "object" && literal !== null && !Array.isArray(literal)
							? [literal as Record<string, unknown>]
							: [];
				if (styles.length === 0) continue;
				const before = code.slice(0, call.start);
				const provenance: CssSourceProvenance = {
					file: id,
					start: call.start,
					end: call.end,
					line: before.split("\n").length,
					column: call.start - (before.lastIndexOf("\n") + 1) + 1,
					callKind: kind,
				};
				for (const style of styles)
					sources.push({
						style: resolveDesignStyle(style, this.preset.tokens),
						provenance,
					});
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
