import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId } from "../identifiers.ts";

const solidStyled = makeExtraAdapter({
	id: CodemodAdapterId.SolidStyled,
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

export default solidStyled;
