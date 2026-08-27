import { makeExtraAdapter } from "./extra-adapter-runtime.ts";

export const VUE_STYLED = makeExtraAdapter({
	id: "vue-styled",
	modules: ["vue-styled-components"],
	packages: { packages: [{ name: "vue-styled-components", kind: "runtime" }] },
	detect: [
		/from\s+["'](?:vue-styled-components|@vue-styled-components\/core)["']/g,
		/\bstyled\.[A-Za-z_$][\w$]*[^`]*`/g,
	],
	call: /\bstyled\.[A-Za-z_$][\w$]*[^`]*`(?:\\.|[^`])*`/g,
	form: "template",
	prefix: "styled.div(",
	functionCall:
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\.props\s*\([^)]*\))?\s*\(/g,
});
