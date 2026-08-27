import { makeExtraAdapter } from "./extra-adapter-runtime.ts";

const fela = makeExtraAdapter({
	id: "fela",
	modules: ["fela", "react-fela"],
	packages: {
		packages: [
			{ name: "fela", kind: "runtime" },
			{ name: "react-fela", kind: "peer" },
		],
	},
	detect: [/from\s+["'](?:fela|react-fela)["']/g, /\brenderer\.renderRule\s*\(\s*\{/g],
	call: /\brenderer\.renderRule\s*\(\s*(?:\(\)\s*=>\s*)?\(?\{/g,
	prefix: "renderer.renderRule(",
});

export default fela;
