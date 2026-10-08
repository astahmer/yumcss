import type { ClassNameStrategy } from "yumcss/css";
import {
	PREVIEW_ENGINE_SCHEMA,
	type PreviewEngine,
	type PreviewEngineIdentifier,
} from "../preview-engine.ts";

export function yumcssPreviewEngine(
	id: PreviewEngineIdentifier,
	strategy: ClassNameStrategy | null,
): PreviewEngine {
	return {
		schema: PREVIEW_ENGINE_SCHEMA,
		id,
		async createSession() {
			return {
				strategy,
				async compile(result) {
					return {
						css: result.sheets.map((sheet) => sheet.css).join("\n"),
						engine: "YumCSS runtime",
						version: "workspace",
					};
				},
			};
		},
	};
}
