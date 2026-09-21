import { ImportKindTag, NodeKind } from "../ast-node-kind.ts";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { type OxcNode, walk } from "../tw/literal.ts";
import {
	CssFactoryKind,
	type CssFactoryKind as CssFactoryKindType,
} from "../css/factory-metadata.ts";

interface ImportNode extends OxcNode {
	source?: { value?: string };
	specifiers?: OxcSpecifier[];
	importKind?: string;
}

interface OxcSpecifier {
	type: string;
	imported?: { name?: string };
	local?: { name?: string };
	importKind?: string;
}

const importedFactoryKind = (source: string, name: string): CssFactoryKindType | undefined => {
	const normalizedSource = source.replace(/\.[cm]?[jt]sx?$/u, "");
	if (
		(name === "createCss" &&
			(normalizedSource.endsWith("/css") ||
				normalizedSource.endsWith("/css/index") ||
				normalizedSource.endsWith("/css/create-css"))))
		return CssFactoryKind.Css;
	if (name === "createGeneratedCss" && normalizedSource.endsWith("/css/generated"))
		return CssFactoryKind.Css;
	if (name === "createUnsafeCss" && normalizedSource.endsWith("/unsafe/css"))
		return CssFactoryKind.Css;
	if (name === "createDesignCss" && normalizedSource.endsWith("/design"))
		return CssFactoryKind.Design;
	return undefined;
};

export interface CssFactoryBinding {
	readonly local: string;
	readonly source: string;
	readonly kind: CssFactoryKindType;
}

export const findCssFactoryBindingsInProgram = (
	program: OxcNode,
): readonly CssFactoryBinding[] => {
	const bindings: CssFactoryBinding[] = [];
	walk(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const declaration = node as ImportNode;
		if (declaration.importKind === ImportKindTag.Type) return;
		const source = declaration.source?.value;
		if (typeof source !== "string") return;
		for (const specifier of declaration.specifiers ?? []) {
			if (
				specifier.type !== NodeKind.ImportSpecifier ||
				specifier.importKind === ImportKindTag.Type
			)
				continue;
			const imported = specifier.imported?.name;
			const local = specifier.local?.name;
			if (typeof imported !== "string" || typeof local !== "string") continue;
			const kind = importedFactoryKind(source, imported);
			if (kind !== undefined) bindings.push({ local, source, kind });
		}
	});
	return bindings;
};

export const findCssFactoryBindings = (code: string, id: string): readonly CssFactoryBinding[] => {
	if (!SOURCE_SCANNER_SERVICE.isScriptFile(id)) return [];
	const program = SOURCE_SCANNER_SERVICE.parse({
		file: id,
		source: code,
		language: SOURCE_SCANNER_SERVICE.languageForFile(id),
	}).program as unknown as OxcNode;
	return findCssFactoryBindingsInProgram(program);
};

export const findCssFactoryKinds = (code: string, id: string): ReadonlySet<CssFactoryKindType> => {
	return new Set(findCssFactoryBindings(code, id).map((binding) => binding.kind));
};
