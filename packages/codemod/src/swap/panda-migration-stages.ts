/** Replaceable, independently testable stages used by Panda migration. */
import { parseSourceProgram } from "pandwind/source";
import type { PandwindMeta } from "../meta.ts";
import { applyEdits } from "../migrate.ts";
import { emitCssClass } from "./emit.ts";
import { parseObjectLiteral } from "./parse.ts";
import type { PandaTheme } from "./panda-theme.ts";
import { pandaRecipeToIr, pandaStyleToIr } from "./parse-panda.ts";

export const PANDA_MIGRATION_STAGES_SCHEMA = "pandwind.panda-migration-stages/1" as const;

export function convertPandaStyle(style: Record<string, unknown>, theme: PandaTheme) {
	return pandaStyleToIr(style, theme);
}

export function convertPandaRecipe(body: string, kind: "cva" | "sva", theme: PandaTheme) {
	const parsed = parseObjectLiteral(body);
	return parsed === null ? null : pandaRecipeToIr(parsed, kind, theme);
}

export function emitPandaStyle(ir: Parameters<typeof emitCssClass>[0], meta: PandwindMeta): string {
	return emitCssClass(ir, meta, { index: 1, tokenRefs: "bare", sort: true }).text;
}

export function rewritePandaSource(
	source: string,
	edits: Array<{ start: number; end: number; text: string }>,
): string {
	return applyEdits(source, edits);
}

export function validatePandaSource(
	file: string,
	source: string,
): { valid: true } | { valid: false; message: string } {
	try {
		parseSourceProgram({ file, source });
		return { valid: true };
	} catch (error) {
		return { valid: false, message: error instanceof Error ? error.message : String(error) };
	}
}
