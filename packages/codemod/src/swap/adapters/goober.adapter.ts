import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId, StyleNamedRuleStrategy } from "../identifiers.ts";

const goober = makeExtraAdapter({
	id: CodemodAdapterId.Goober,
	modules: ["goober"],
	packages: { packages: [{ name: "goober", kind: "runtime" }] },
	detect: [/from\s+["']goober["']/g, /\bcss\s*\(\s*\{/g],
	call: /\bcss\s*\(\s*\{/g,
	prefix: "css(",
	targetImports: ['import { css } from "goober";'],
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	targetPolicy: { handlesHostRewrites: true, handlesFrameworkSemantics: true },
});

export default goober;
