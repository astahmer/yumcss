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

const EXPORT_REGEX =
	/\bexport\s+const\s+([\w$]+)\s*[:=]\s*([\s\S]*?)(?:;|\n(?=\s*(?:export|const|let|var|function|class|import|type))|$)/g;

/** Balanced-brace scan for an object literal body. */
function matchBrace(source: string, open: number): string | null {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return null;
}

export function scanPublicExports(
	files: ReadonlyArray<{ readonly file: string; readonly content: string }>,
): readonly PublicExportHit[] {
	const hits: Array<PublicExportHit> = [];
	for (const { file, content } of files) {
		for (const match of content.matchAll(EXPORT_REGEX)) {
			const name = match[1] ?? "";
			const initializer = match[2] ?? "";
			// Full-string export: attribute the exact token when the literal is
			// the authored spelling itself ($colors.brand / $colors.red-500).
			const exact = /^(["'])\$([\w.-]+)\1$/.exec(initializer.trim());
			if (exact !== null) {
				const authored = exact[2] ?? "";
				const dot = authored.indexOf(".");
				const tokenId =
					dot !== -1 ? authored.slice(0, dot) + "::" + authored.slice(dot + 1) : null;
				hits.push({ tokenId, references: [authored], file, name });
				continue;
			}
			// Object/array literals: collect every quoted $-reference string so
			// the caller can attribute them against the definition universe.
			if (!initializer.includes("$")) continue;
			const trimmed = initializer.trimEnd();
			const bodyStart = initializer.indexOf("{");
			const strings =
				bodyStart !== -1 && trimmed.endsWith("}")
					? (matchBrace(initializer, bodyStart) ?? initializer)
					: initializer;
			const references = [...strings.matchAll(/(["'])\$([\w.-]+)\1/g)].map(
				(m) => m[2] ?? "",
			);
			if (references.length > 0) hits.push({ tokenId: null, references, file, name });
		}
	}
	return hits;
}
