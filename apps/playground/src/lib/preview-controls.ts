import { parseSync } from "oxc-parser";
import type { ExamplePreviewControl } from "./examples.ts";

interface PreviewAstNode {
	type?: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
}

const PREVIEW_NODE_KIND = Object.freeze({
	exportDefaultDeclaration: "ExportDefaultDeclaration",
	jsxAttribute: "JSXAttribute",
	jsxElement: "JSXElement",
	jsxExpressionContainer: "JSXExpressionContainer",
} as const);

const asNode = (value: unknown): PreviewAstNode | undefined =>
	value !== null && typeof value === "object" ? (value as PreviewAstNode) : undefined;

const nodes = (value: unknown): PreviewAstNode[] =>
	Array.isArray(value)
		? value.map(asNode).filter((node): node is PreviewAstNode => node !== undefined)
		: [];

export const initialPreviewControlValues = (
	controls: readonly ExamplePreviewControl[] | undefined,
): Record<string, string> =>
	Object.fromEntries((controls ?? []).map((control) => [control.id, control.initialValue]));

export const applyPreviewControls = (
	source: string,
	controls: readonly ExamplePreviewControl[] | undefined,
	values: Readonly<Record<string, string>>,
): string => {
	if (controls === undefined || controls.length === 0) return source;

	try {
		const parsed = parseSync("playground-preview.tsx", source, {
			sourceType: "module",
			lang: "tsx",
		});
		const program = asNode(parsed.program);
		const defaultExport = nodes(program?.body).find(
			(statement) => statement.type === PREVIEW_NODE_KIND.exportDefaultDeclaration,
		);
		const declaration = asNode(defaultExport?.declaration);
		if (declaration?.type !== PREVIEW_NODE_KIND.jsxElement) return source;

		const attributes = nodes(asNode(declaration.openingElement)?.attributes);
		const replacements: Array<[number, number, string]> = [];
		for (const control of controls) {
			const selectedValue = values[control.id] ?? control.initialValue;
			const option = control.options.find((candidate) => candidate.value === selectedValue);
			if (option === undefined) continue;
			const attribute = attributes.find(
				(candidate) =>
					candidate.type === PREVIEW_NODE_KIND.jsxAttribute &&
					asNode(candidate.name)?.name === control.prop,
			);
			const value = asNode(attribute?.value);
			if (value?.start === undefined || value.end === undefined) continue;
			const literal = option.sourceValue ?? JSON.stringify(option.value);
			replacements.push([
				value.start,
				value.end,
				value.type === PREVIEW_NODE_KIND.jsxExpressionContainer ? `{${literal}}` : literal,
			]);
		}

		let result = source;
		for (const [start, end, replacement] of replacements.toSorted(
			(left, right) => right[0] - left[0],
		)) {
			result = result.slice(0, start) + replacement + result.slice(end);
		}
		return result;
	} catch {
		return source;
	}
};
