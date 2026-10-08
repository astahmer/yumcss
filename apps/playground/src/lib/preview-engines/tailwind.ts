import { compile } from "tailwindcss";
import stylesheets from "virtual:yumcss-preview-tailwind-stylesheets";
import { twAdapter } from "../../bridge.ts";
import {
	PREVIEW_ENGINE_SCHEMA,
	PreviewEngineId,
	collectPreviewClasses,
	type PreviewEngine,
} from "../preview-engine.ts";

export const tailwindPreviewEngine: PreviewEngine = {
	schema: PREVIEW_ENGINE_SCHEMA,
	id: PreviewEngineId.Tailwind,
	async createSession(signal) {
		const compiler = await compile('@import "tailwindcss";\n@import "./yumcss-theme.css";', {
			base: "/playground",
			async loadStylesheet(id, base) {
				const path =
					id === "tailwindcss"
						? "/tailwindcss/index.css"
						: new URL(id, `https://preview.invalid${base}/`).pathname;
				const content = stylesheets[path];
				if (content === undefined) throw new Error(`Tailwind stylesheet '${path}' is unavailable`);
				return { content, base: path.slice(0, path.lastIndexOf("/")), path };
			},
		});
		signal.throwIfAborted();
		return {
			strategy: twAdapter,
			async compile(result) {
				return {
					css: compiler.build(collectPreviewClasses(result)),
					engine: "tailwindcss compiler + generated theme",
					version: "4.3.3",
				};
			},
		};
	},
};
