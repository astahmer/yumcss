import { createGenerator } from "@unocss/core";
import { presetWind3 } from "@unocss/preset-wind3";
import { createUnoCssAdapter } from "yumcss/css/unocss";
import { examplePreset } from "@yumcss/example-preset";
import {
	PREVIEW_ENGINE_SCHEMA,
	PreviewEngineId,
	collectPreviewClasses,
	type PreviewEngine,
} from "../preview-engine.ts";
import { resolvePreviewValue } from "./design-values.ts";

export const unocssPreviewEngine: PreviewEngine = {
	schema: PREVIEW_ENGINE_SCHEMA,
	id: PreviewEngineId.UnoCSS,
	async createSession(signal) {
		const generator = await createGenerator({ presets: [presetWind3()] });
		signal.throwIfAborted();
		const candidates = createUnoCssAdapter({ preset: examplePreset });
		const emittedCandidates = new Set<string>();
		return {
			strategy: {
				name: PreviewEngineId.UnoCSS,
				toClassName(key, value) {
					const candidate = candidates.toClassName(key, resolvePreviewValue(key, value));
					if (candidate !== null) emittedCandidates.add(candidate);
					return candidate;
				},
			},
			async compile(result) {
				const classes = collectPreviewClasses(result);
				const generated = await generator.generate(classes, { preflights: true });
				for (const candidate of emittedCandidates) {
					if (classes.includes(candidate) && !generated.matched.has(candidate))
						throw new Error(`UnoCSS did not compile candidate '${candidate}'`);
				}
				return { css: generated.css, engine: "@unocss/core + preset-wind3", version: "66.10.0" };
			},
		};
	},
};
