import { makeExtraAdapter } from "./extra-adapter-runtime.ts";

export const SOLID_STYLED = makeExtraAdapter({
	id: "solid-styled",
	modules: ["solid-styled-components"],
	packages: { packages: [{ name: "solid-styled-components", kind: "runtime" }] },
	detect: [
		/from\s+["']solid-styled-components["']/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))[^`]*`/g,
	],
	call: /\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))[^`]*`(?:\\.|[^`])*`/g,
	form: "template",
	prefix: "styled.div(",
	functionCall:
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\.props\s*\([^)]*\))?\s*\(/g,
});
