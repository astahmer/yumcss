import { computeExcludedRanges as scanExcludedRanges, SourceBindingKind, SourceBindings } from "yumcss/source";
import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { NodeKind, type OxcNode, walkWithParent } from "yumcss/tw/literal";
import { MagicString } from "magic-string";

export type SourceEdit = { readonly start: number; readonly end: number; readonly text: string };

/** Shared, syntax-agnostic primitives used by source transformation passes. */
export class SourcePass {
	static applyEdits(source: string, edits: readonly SourceEdit[]): string {
		if (edits.length === 0) return source;
		const output = new MagicString(source);
		// MagicString keeps every range anchored to the original source. Applying
		// replacements right-to-left preserves the historical ordering for edits
		// that share an insertion point while letting MagicString reject overlaps
		// instead of silently corrupting the generated file.
		for (const edit of [...edits].toSorted((left, right) => right.start - left.start)) {
			if (edit.start === edit.end) output.appendLeft(edit.start, edit.text);
			else output.update(edit.start, edit.end, edit.text);
		}
		return output.toString();
	}

	static renameIdentifier(source: string, file: string, from: string, to: string): string {
		if (from === to) return source;
		const document = SOURCE_SCANNER_SERVICE.scan({ file, source });
		if (document.program === undefined) return source;
		const bindings = SourceBindings.fromProgram(document.program);
		const importedBindings = bindings.bindings.filter((binding) => binding.localName === from);
		const edits: SourceEdit[] = importedBindings.map((binding) => ({
			start: binding.range.start,
			end: binding.range.end,
			text:
				binding.kind === SourceBindingKind.Named
					? binding.importedName === to
						? binding.importedName
						: binding.importedName + " as " + to
					: binding.kind === SourceBindingKind.Namespace
						? "* as " + to
						: to,
		}));
		walkWithParent(document.program, (node, parent) => {
			if (
				node.type !== NodeKind.Identifier ||
				node.name !== from ||
				typeof node.start !== "number" ||
				typeof node.end !== "number"
			)
				return;
			const start = node.start;
			if (
				importedBindings.some(
					(binding) =>
						start >= binding.range.start && start < binding.range.end,
				)
			)
				return;
			if (
				parent?.type === NodeKind.ImportSpecifier ||
				parent?.type === NodeKind.ImportDefaultSpecifier ||
				parent?.type === NodeKind.ImportNamespaceSpecifier
			)
				return;
			if (
				parent?.type === NodeKind.MemberExpression &&
				parent.property === node &&
				parent.computed !== true
			)
				return;
			if (parent?.type === NodeKind.Property) {
				if (parent.shorthand === true && parent.value === node) {
					edits.push({ start: node.start, end: node.end, text: from + ": " + to });
					return;
				}
				if (parent.key === node) return;
			}
			if (parent?.type === NodeKind.ExportSpecifier && parent.local === node) {
				const exported = parent.exported;
				const shorthandExport =
					typeof exported === "object" &&
					exported !== null &&
					"start" in exported &&
					"end" in exported &&
					exported.start === node.start &&
					exported.end === node.end;
				edits.push({
					start: node.start,
					end: node.end,
					text: shorthandExport ? to + " as " + from : to,
				});
				return;
			}
			edits.push({ start: node.start, end: node.end, text: to });
		});
		return SourcePass.applyEdits(source, edits);
	}

	static computeExcludedRanges(
		source: string,
		file: string,
	): { excluded: Array<[number, number]>; isExcluded(start: number): boolean } {
		return scanExcludedRanges(source, file);
	}

	static matchBlock(source: string, open: number): { body: string; end: number } | null {
		let depth = 0;
		for (let index = open; index < source.length; index += 1) {
			if (source[index] === "{") depth += 1;
			else if (source[index] === "}") {
				depth -= 1;
				if (depth === 0) return { body: source.slice(open + 1, index), end: index + 1 };
			}
		}
		return null;
	}

	static markerText(source: string, file: string, index: number, marker: string): string {
		const markerBody = marker.replace(/^\/\/\s?/u, "");
		const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
		if (isJsxChildInsertion(source, file, lineStart)) return `{/* ${markerBody} */}`;
		if (/\.(?:css|pcss|scss|sass|less)$/iu.test(file)) return `/* ${markerBody} */`;
		return marker;
	}

	static markerEdit(
		source: string,
		index: number,
		reason: string,
		marker: string,
		file = "migration.ts",
	): SourceEdit {
		const lineStart = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
		const indentMatch = /^\s*/.exec(source.slice(lineStart));
		const indent = indentMatch ? indentMatch[0] : "";
		const text = SourcePass.markerText(source, file, index, `// ${marker} (${reason})`);
		return { start: lineStart, end: lineStart, text: `${indent}${text}\n` };
	}

	static insertSkipMarker(
		source: string,
		index: number,
		reason: string,
		marker: string,
		file = "migration.ts",
	): string {
		return SourcePass.applyEdits(source, [
			SourcePass.markerEdit(source, index, reason, marker, file),
		]);
	}
}

const isJsxChildInsertion = (source: string, file: string, index: number): boolean => {
	const language = SOURCE_SCANNER_SERVICE.languageForFile(file);
	if (language !== "tsx" && language !== "jsx") return false;
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
		if (parsed.errors.length > 0) return false;
		const remainingSource = source.slice(index);
		const leadingWhitespace = /^\s*/u.exec(remainingSource)?.[0].length ?? 0;
		const probeIndex = index + leadingWhitespace;
		let candidate:
			| { readonly ancestors: readonly OxcNode[]; readonly span: number; readonly start: number }
			| undefined;
		const openingSyntaxStarts: number[] = [];
		walkWithParent(parsed.program, (node, _parent, ancestors) => {
			if (
				(node.type === NodeKind.JSXOpeningElement || node.type === NodeKind.JSXAttribute) &&
				typeof node.start === "number" &&
				typeof node.end === "number" &&
				probeIndex > node.start &&
				probeIndex < node.end
			)
				openingSyntaxStarts.push(node.start);
			if (node.type !== NodeKind.JSXElement && node.type !== NodeKind.JSXFragment) return;
			if (typeof node.start !== "number" || typeof node.end !== "number") return;
			if (probeIndex < node.start || probeIndex >= node.end) return;
			const span = node.end - node.start;
			if (candidate !== undefined && candidate.span <= span) return;
			candidate = { ancestors: [...ancestors], span, start: node.start };
		});
		const selectedCandidate = candidate;
		if (selectedCandidate === undefined) return false;
		if (openingSyntaxStarts.some((start) => start >= selectedCandidate.start)) return false;
		const nearestJsxAncestor = selectedCandidate.ancestors.findLastIndex(
			(ancestor) => ancestor.type === NodeKind.JSXElement || ancestor.type === NodeKind.JSXFragment,
		);
		if (nearestJsxAncestor === -1) return false;
		return !selectedCandidate.ancestors
			.slice(nearestJsxAncestor + 1)
			.some(
				(ancestor) =>
					ancestor.type === NodeKind.JSXExpressionContainer ||
					ancestor.type === NodeKind.JSXAttribute ||
					ancestor.type === NodeKind.JSXOpeningElement,
			);
	} catch {
		return false;
	}
};
