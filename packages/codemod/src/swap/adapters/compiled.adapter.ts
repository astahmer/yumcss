import { makeExtraAdapter } from "./extra-adapter-runtime.ts";

const compiled = makeExtraAdapter({
	id: "compiled",
	modules: ["@compiled/react", "@compiled/css-in-js"],
	packages: { packages: [{ name: "@compiled/react", kind: "peer" }] },
	detect: [
		/from\s+["']@compiled\/(?:react|css-in-js)["']/g,
		/\b(?:css|styled\.[A-Za-z_$][\w$]*)\s*\(/g,
	],
	call: /\b(?:css|styled\.[A-Za-z_$][\w$]*)\s*\(\s*\{/g,
	prefix: "css(",
});

export default compiled;
