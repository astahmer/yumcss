import { transform } from "@babel/standalone";
import stylexPlugin from "@stylexjs/babel-plugin";
import * as stylex from "@stylexjs/stylex";
import type { Rule } from "@stylexjs/babel-plugin";
import { examplePreset } from "@yumcss/example-preset";
import { PREVIEW_ENGINE_SCHEMA, PreviewEngineId, type PreviewEngine } from "../preview-engine.ts";
import { resolvePreviewValue } from "./design-values.ts";

function nativeStyle(key: string, value: string): Record<string, unknown> {
	const parts = key.split("__");
	const property = parts.pop()!;
	let conditional: unknown = value;
	for (const part of parts.toReversed()) {
		const conditions: Record<string, unknown> = examplePreset.conditions;
		const configured = conditions[part] ?? part;
		const selectors = Array.isArray(configured) ? configured : [configured];
		for (const selector of selectors.toReversed()) {
			if (typeof selector !== "string") throw new Error(`Invalid StyleX condition '${part}'`);
			const condition = selector.replaceAll("&", "").trim();
			if (!condition.startsWith(":") && !condition.startsWith("@")) {
				throw new Error(`StyleX does not support selector '${selector}'`);
			}
			conditional = { default: null, [condition]: conditional };
		}
	}
	return { [property]: conditional };
}

export const stylexPreviewEngine: PreviewEngine = {
	schema: PREVIEW_ENGINE_SCHEMA,
	id: PreviewEngineId.StyleX,
	async createSession() {
		const rules: Rule[] = [];
		return {
			strategy: {
				name: PreviewEngineId.StyleX,
				toClassName(key, value) {
					const style = nativeStyle(key, resolvePreviewValue(key, value));
					const compiled = transform(
						`import * as stylex from "@stylexjs/stylex"; export const styles = stylex.create({ atom: ${JSON.stringify(style)} });`,
						{
							plugins: [
								[stylexPlugin, { dev: false, runtimeInjection: false }],
								"transform-modules-commonjs",
							],
						},
					);
					if (compiled.code === undefined || compiled.code === null)
						throw new Error("StyleX emitted no runtime module");
					const exports: { styles?: { atom: Parameters<typeof stylex.props>[0] } } = {};
					// Only our JSON-authored compiler module is executed here. The
					// editor source remains owned by the sandbox evaluator.
					new Function("require", "exports", compiled.code)((id: string) => {
						if (id !== "@stylexjs/stylex") throw new Error(`Unexpected StyleX import '${id}'`);
						return stylex;
					}, exports);
					if (exports.styles === undefined) throw new Error("StyleX emitted no compiled styles");
					const className = stylex.props(exports.styles.atom).className;
					if (className === undefined || /\s/u.test(className))
						throw new Error("StyleX declaration does not lower to one class token");
					const metadata = compiled.metadata as { stylex?: Rule[] };
					if (metadata.stylex === undefined) throw new Error("StyleX emitted no CSS metadata");
					rules.push(...metadata.stylex);
					return className;
				},
			},
			async compile() {
				return {
					css: stylexPlugin.processStylexRules(rules, { useLayers: true }),
					engine: "@stylexjs/babel-plugin + stylex.props",
					version: "0.19.1",
				};
			},
		};
	},
};
