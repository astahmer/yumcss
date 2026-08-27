import { makeExtraAdapter } from "./extra-adapter-runtime.ts";

export const GOOBER = makeExtraAdapter({
	id: "goober",
	modules: ["goober"],
	packages: { packages: [{ name: "goober", kind: "runtime" }] },
	detect: [/from\s+["']goober["']/g, /\bcss\s*\(\s*\{/g],
	call: /\bcss\s*\(\s*\{/g,
	prefix: "css(",
});
