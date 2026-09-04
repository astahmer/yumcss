import { resolveDesignStyle } from "../design/resolve.ts";
import {
	evalLiteral,
	evalLiteralValues,
	literalValueSetSize,
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
		// Finite-candidate discovery needs same-module constants; built lazily
		// so all-literal files never pay for the constant walk.
		let moduleConsts: LiteralConstantScope | undefined;
		walk(parsed, (node) => {
			if (node.type !== "CallExpression") return;
			const call = node as CallNode;
			const kind = this.callKind(call.callee, names);
			if (kind === undefined) return;
			for (const argument of call.arguments) {
				const literal = evalLiteral(argument as never);
				if (typeof literal !== "object" || literal === null) {
					this.pushPartialLiteral(sources, code, id, call, kind, argument);
					this.pushFiniteCandidates(sources, code, id, call, kind, argument, () => {
						moduleConsts ??= new Map(
							[...collectModuleConstants(parsed as unknown as OxcNode)].map(
								([name, known]) => [name, known.value] as const,
							),
						);
						return moduleConsts;
					});
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
	): void {
		if (kind === "css.raw") return;
		if ((argument as { type?: string } | null)?.type === "SpreadElement") return;
		const valueSet = evalLiteralValues(argument as never, moduleConsts());
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
