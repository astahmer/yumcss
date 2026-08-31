import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId, StyleProgramEmissionHint } from "../identifiers.ts";

const treat = makeExtraAdapter({
	id: CodemodAdapterId.Treat,
	modules: ["@/styles.treat", "treat"],
	packages: { packages: [{ name: "treat", kind: "development" }] },
	detect: [/from\s+["'](?:treat|[^"']+\.treat)["']/g, /\b(?:style|createTheme)\s*\(\s*\{/g],
	call: /\bstyle\s*\(\s*\{/g,
	prefix: "style(",
	migration: {
		prepareDynamic: ({ targetId, program }) => ({
			handled:
				targetId === CodemodAdapterId.Pandwind &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === "style"),
			standalone:
				targetId === CodemodAdapterId.Pandwind &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === "style"),
		}),
	},
	sourceObjectOptions: { emissionHints: [StyleProgramEmissionHint.RuntimeClass] },
	targetPolicy: { handlesHostRewrites: true, handlesFrameworkSemantics: true },
});

export default treat;
