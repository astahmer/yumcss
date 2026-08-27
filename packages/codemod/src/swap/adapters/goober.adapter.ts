import { makeExtraAdapter } from "./extra-adapter-runtime.ts";

const goober = makeExtraAdapter({
	id: "goober",
	modules: ["goober"],
	packages: { packages: [{ name: "goober", kind: "runtime" }] },
	detect: [/from\s+["']goober["']/g, /\bcss\s*\(\s*\{/g],
	call: /\bcss\s*\(\s*\{/g,
	prefix: "css(",
});

export default goober;
