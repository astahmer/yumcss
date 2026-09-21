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
	importKind?: string;
}

const importedFactoryKind = (source: string, name: string): CssFactoryKindType | undefined => {
	if (source === "pandwind/css" && name === "createCss") return CssFactoryKind.Css;
	if (source === "pandwind/css/generated" && name === "createGeneratedCss")
		return CssFactoryKind.Css;
	if (source === "pandwind/unsafe/css" && name === "createUnsafeCss") return CssFactoryKind.Css;
	if (source === "pandwind/design" && name === "createDesignCss") return CssFactoryKind.Design;
	return undefined;
};

export const findCssFactoryKinds = (code: string, id: string): ReadonlySet<CssFactoryKindType> => {
	if (!SOURCE_SCANNER_SERVICE.isScriptFile(id)) return new Set();
	const program = SOURCE_SCANNER_SERVICE.parse({
		file: id,
		source: code,
		language: SOURCE_SCANNER_SERVICE.languageForFile(id),
	}).program as unknown as OxcNode;
	const kinds = new Set<CssFactoryKindType>();
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
			if (typeof imported !== "string") continue;
			const kind = importedFactoryKind(source, imported);
			if (kind !== undefined) kinds.add(kind);
		}
	});
	return kinds;
};
