/** Replaceable, independently testable stages used by Panda migration. */
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import type { PandwindMeta } from "../../../meta.ts";
import { SourcePass } from "../../../source-pass-utils.ts";
import { emitCssClass } from "../../emit.ts";
import { parseObjectLiteral } from "../../parse.ts";
import type { PandaTheme } from "./theme.ts";
import { pandaRecipeToIr, pandaStyleToIr } from "./parse.ts";
import type { TokenReferenceFormat } from "../../tokens.ts";

export const PANDA_MIGRATION_STAGES_SCHEMA = "pandwind.panda-migration-stages/1" as const;

export function convertPandaStyle(
	style: Record<string, unknown>,
	theme: PandaTheme,
	tokenReferenceFormat?: TokenReferenceFormat,
) {
	return pandaStyleToIr(style, theme, { tokenReferenceFormat });
}

export function convertPandaRecipe(
	body: string,
	kind: "cva" | "sva",
	theme: PandaTheme,
	tokenReferenceFormat?: TokenReferenceFormat,
) {
	const parsed = parseObjectLiteral(body);
	return parsed === null ? null : pandaRecipeToIr(parsed, kind, theme, { tokenReferenceFormat });
}

export function emitPandaStyle(
	ir: Parameters<typeof emitCssClass>[0],
	meta: PandwindMeta,
	tokenReferenceFormat?: TokenReferenceFormat,
): string {
	return emitCssClass(ir, meta, {
		index: 1,
		tokenRefs: "bare",
		sort: true,
		tokenReferenceFormat,
	}).text;
}

export function rewritePandaSource(
	source: string,
	edits: Array<{ start: number; end: number; text: string }>,
): string {
	return SourcePass.applyEdits(source, edits);
}

export function validatePandaSource(
	file: string,
	source: string,
): { valid: true } | { valid: false; message: string } {
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
		if (parsed.errors.length > 0) {
			return {
				valid: false,
				message: parsed.errors[0]?.message ?? "source parser rejected migrated output",
			};
		}
		return { valid: true };
	} catch (error) {
		return { valid: false, message: error instanceof Error ? error.message : String(error) };
	}
}
