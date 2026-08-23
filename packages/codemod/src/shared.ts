/** Small helpers shared between the mode passes and the source passes. */

export const SKIP_MARKER_DEFAULT = "pandwind:migrate-skip";

export function ensureImport(code: string, statement: string): string {
	if (code.includes(statement)) return code;
	// Multi-line-aware import-header scan: a naive per-line regex inserts
	// INSIDE `import {\n A,\n B } from "…"` because its first line has no
	// specifier. Track the open-import state instead: an import starts at a
	// line beginning with `import` and ends at the first line terminating in
	// the module-specifier quote.
	const lines = code.split("\n");
	let lastImportEnd = -1;
	let inImport = false;
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]!.trim();
		if (/^import([\s{"'*]|$)/.test(trimmed)) inImport = true;
		if (inImport) {
			if (/['"]\s*;?\s*$/.test(trimmed)) {
				lastImportEnd = i;
				inImport = false;
			}
			continue;
		}
		if (lastImportEnd !== -1 && trimmed !== "") break;
	}
	if (lastImportEnd === -1) return `${statement}\n${code}`;
	lines.splice(lastImportEnd + 1, 0, statement);
	return lines.join("\n");
}

export function hasCssBinding(code: string): boolean {
	return /\b(?:const|let|var)\s+css\b|createDesignCss\(|createCss\(/.test(code);
}
