/** Small helpers shared between the mode passes and the source passes. */

export const SKIP_MARKER_DEFAULT = "pandwind:migrate-skip";

export function ensureImport(code: string, statement: string): string {
	if (code.includes(statement)) return code;
	const importBlock = /^(\s*import[^\n]*\n)+/.exec(code);
	if (importBlock !== null) {
		const at = importBlock[0].length;
		return code.slice(0, at) + statement + "\n" + code.slice(at);
	}
	return statement + "\n" + code;
}

export function hasCssBinding(code: string): boolean {
	return /\b(?:const|let|var)\s+css\b|createDesignCss\(|createCss\(/.test(code);
}
