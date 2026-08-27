import { makeExtraAdapter } from "./extra-adapter-runtime.ts";

export const REACT_NATIVE = makeExtraAdapter({
	id: "react-native",
	modules: ["react-native"],
	packages: { packages: [{ name: "react-native", kind: "peer" }] },
	detect: [/from\s+["']react-native["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	namedObjects: true,
});
