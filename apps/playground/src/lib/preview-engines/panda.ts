import { Generator } from "@pandacss/generator";
import { pandaConfig } from "../../generated/panda/config.mjs";
import { css as pandaCss } from "../../generated/panda/css/css.mjs";
import { PREVIEW_ENGINE_SCHEMA, PreviewEngineId, type PreviewEngine } from "../preview-engine.ts";
import { nestedPreviewStyle } from "./design-values.ts";

export const pandaPreviewEngine: PreviewEngine = {
	schema: PREVIEW_ENGINE_SCHEMA,
	id: PreviewEngineId.Panda,
	async createSession() {
		const context = new Generator({
			config: pandaConfig,
			dependencies: [],
			path: "/playground/panda.config.ts",
			serialized: "",
			deserialize: () => pandaConfig,
			hooks: {},
		});
		const sheet = context.createSheet();
		return {
			strategy: {
				name: PreviewEngineId.Panda,
				toClassName(key, value) {
					if (value.startsWith("input>"))
						throw new Error("Panda cannot compile a YumCSS dynamic input binding");
					const style = nestedPreviewStyle(key, value);
					// The same style reaches Panda's generated runtime and CSS compiler.
					const className = pandaCss(style);
					context.encoder.processAtomic(style);
					return className;
				},
			},
			async compile() {
				context.appendLayerParams(sheet);
				context.appendBaselineCss(sheet);
				context.appendParserCss(sheet);
				return {
					css: context.getCss(sheet),
					engine: "@pandacss/core + generated css()",
					version: "1.12.1",
				};
			},
		};
	},
};
