/** Small helpers shared between the mode passes and the source passes. */
import { dirnameDocumentPath, joinDocumentPath, relativeDocumentPath } from "./path-utils.ts";

export const SKIP_MARKER_DEFAULT = "pandwind:migrate-skip";

/**
 * Relative import specifier from `file`'s directory to `<metaDir>/<moduleName>`.
 * Both `file` and `metaDir` are repo-root-relative — `path.relative` resolves
 * relative inputs against the same cwd on both sides, so the offset between
 * them is correct regardless of what that cwd actually is.
 *
 * `pandwind/tw` and `pandwind/cx` only export generic, unconfigured
 * fallbacks (no design-system conflicts/variants wired in — `pandwind/cx`
 * doesn't even export a `cx`), so migrated call sites must import the app's
 * own generated module instead of the package subpath.
 */
export function relativeModuleImport(file: string, metaDir: string, moduleName: string): string {
	const target = joinDocumentPath(metaDir, moduleName);
	let path = relativeDocumentPath(dirnameDocumentPath(file), target);
	if (!path.startsWith(".")) path = `./${path}`;
	return path;
}

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

export function hasCssBinding(code: string, binding = "css"): boolean {
	const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return (
		new RegExp(`\\b(?:const|let|var)\\s+${escapedBinding}\\b`).test(code) ||
		(binding === "css" && /createDesignCss\(|createCss\(/.test(code)) ||
		// A bare named import of `css` also binds the engine in scope
		// (e.g. apps re-exporting their design instance).
		new RegExp(
			`import\\s*\\{[^}]*\\b(?:${escapedBinding})(?:\\s+as\\s+${escapedBinding})?\\b[^}]*}\\s*from`,
		).test(code)
	);
}
