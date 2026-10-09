import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { NodeKind, walk, type OxcNode } from "yumcss/tw/literal";

/**
 * Public-export coverage boundary (plans/054 step 6) - any statically
 * string-literal export of the project (export const X = "..." and object
 * literals whose string values contain authored $token references) may
 * escape the scanned graph (downstream packages, runtime string building),
 * so every token it references is downgraded to review-required instead of
 * safe-to-remove. Exact-literal full-string hits are attributed to the
 * specific token id; substring references are attributed file-wide.
 */
export interface PublicExportHit {
	/** Canonical token id when the export is exactly the authored spelling
	 * ($colors.brand); null for object-literal hits. */
	readonly tokenId: string | null;
	/** Authored $-spellings referenced inside the export (for object
	 * literals: every quoted $token string found). */
	readonly references: readonly string[];
	/** Project-relative file containing the export. */
	readonly file: string;
	/** The exported binding name, when statically detectable. */
	readonly name?: string;
}

const isOxcNode = (value: unknown): value is OxcNode =>
	typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const oxcNodeAt = (node: OxcNode, key: string): OxcNode | undefined => {
	const value = node[key];
	return isOxcNode(value) ? value : undefined;
};

const oxcNodesAt = (node: OxcNode, key: string): OxcNode[] => {
	const value = node[key];
	return Array.isArray(value) ? value.filter(isOxcNode) : [];
};

const stringAt = (node: OxcNode, key: string): string | undefined => {
	const value = node[key];
	return typeof value === "string" ? value : undefined;
};

const tokenReferenceIn = (value: string): string | undefined => /^\$([\w.-]+)$/u.exec(value)?.[1];

const tokenIdFor = (authored: string): string | null => {
	const dot = authored.indexOf(".");
	return dot === -1 ? null : `${authored.slice(0, dot)}::${authored.slice(dot + 1)}`;
};

const stringLiteralValue = (node: OxcNode): string | undefined =>
	node.type === NodeKind.Literal ? stringAt(node, "value") : undefined;

const exportedVariableName = (declarator: OxcNode): string | undefined => {
	const id = oxcNodeAt(declarator, "id");
	return id?.type === NodeKind.Identifier ? stringAt(id, "name") : undefined;
};

const exportedDeclarators = (statement: OxcNode): OxcNode[] => {
	if (statement.type !== NodeKind.ExportNamedDeclaration) return [];
	const declaration = oxcNodeAt(statement, "declaration");
	return declaration?.type === NodeKind.VariableDeclaration
		? oxcNodesAt(declaration, "declarations")
		: [];
};

const tokenReferencesIn = (initializer: OxcNode): string[] => {
	const references: string[] = [];
	walk(initializer, (node) => {
		const value = stringLiteralValue(node);
		if (value === undefined) return;
		const reference = tokenReferenceIn(value);
		if (reference !== undefined) references.push(reference);
	});
	return references;
};

export function scanPublicExports(
	files: ReadonlyArray<{ readonly file: string; readonly content: string }>,
): readonly PublicExportHit[] {
	const hits: Array<PublicExportHit> = [];
	for (const { file, content } of files) {
		const scanned = SOURCE_SCANNER_SERVICE.scan({ file, source: content });
		if (scanned.program === undefined || scanned.diagnostics.length > 0) continue;
		for (const statement of oxcNodesAt(scanned.program, "body")) {
			for (const declarator of exportedDeclarators(statement)) {
				const initializer = oxcNodeAt(declarator, "init");
				const name = exportedVariableName(declarator);
				if (initializer === undefined || name === undefined) continue;
				const exact = stringLiteralValue(initializer);
				if (exact !== undefined) {
					const authored = tokenReferenceIn(exact);
					if (authored !== undefined) {
						hits.push({ tokenId: tokenIdFor(authored), references: [authored], file, name });
						continue;
					}
				}
				const references = tokenReferencesIn(initializer);
				if (references.length > 0) hits.push({ tokenId: null, references, file, name });
			}
		}
	}
	return hits;
}
