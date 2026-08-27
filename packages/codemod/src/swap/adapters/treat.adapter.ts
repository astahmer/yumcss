import { makeExtraAdapter } from "./extra-adapter-runtime.ts";

const treat = makeExtraAdapter({
	id: "treat",
	modules: ["@/styles.treat", "treat"],
	packages: { packages: [{ name: "treat", kind: "development" }] },
	detect: [/from\s+["'](?:treat|[^"']+\.treat)["']/g, /\b(?:style|createTheme)\s*\(\s*\{/g],
	call: /\bstyle\s*\(\s*\{/g,
	prefix: "style(",
	migration: {
		prepareDynamic: ({ targetId, program }) => ({
			handled:
				targetId === "pandwind" &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === "style"),
			standalone:
				targetId === "pandwind" &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === "style"),
		}),
	},
});

export default treat;
