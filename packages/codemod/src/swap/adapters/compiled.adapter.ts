import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId, StyleNamedRuleStrategy } from "../identifiers.ts";

const compiled = makeExtraAdapter({
	id: CodemodAdapterId.Compiled,
	modules: ["@compiled/react", "@compiled/css-in-js"],
	packages: { packages: [{ name: "@compiled/react", kind: "peer" }] },
	detect: [
		/from\s+["']@compiled\/(?:react|css-in-js)["']/g,
		/\b(?:css|styled\.[A-Za-z_$][\w$]*)\s*\(/g,
	],
	call: /\b(?:css|styled\.[A-Za-z_$][\w$]*)\s*\(\s*\{/g,
	prefix: "css(",
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	targetPolicy: { handlesHostRewrites: true, handlesFrameworkSemantics: true },
});

export default compiled;
