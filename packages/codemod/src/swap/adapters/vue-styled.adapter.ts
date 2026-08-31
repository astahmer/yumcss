import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId, StyleNamedRuleStrategy } from "../identifiers.ts";

const vueStyled = makeExtraAdapter({
	id: CodemodAdapterId.VueStyled,
	modules: ["vue-styled-components"],
	packages: { packages: [{ name: "vue-styled-components", kind: "runtime" }] },
	detect: [
		/from\s+["'](?:vue-styled-components|@vue-styled-components\/core)["']/g,
		/\bstyled\.[A-Za-z_$][\w$]*[^`]*`/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))\s*\(\s*\{/g,
	],
	call: /\bstyled\.[A-Za-z_$][\w$]*[^`]*`(?:\\.|[^`])*`/g,
	form: "template",
	prefix: "styled.div(",
	targetImports: ['import styled from "vue-styled-components";'],
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	functionCall:
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\.props\s*\([^)]*\))?\s*\(/g,
});

export default vueStyled;
