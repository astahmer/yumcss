import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId } from "../identifiers.ts";

const reactNative = makeExtraAdapter({
	id: CodemodAdapterId.ReactNative,
	modules: ["react-native"],
	packages: { packages: [{ name: "react-native", kind: "peer" }] },
	detect: [/from\s+["']react-native["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	namedObjects: true,
	sourceObjectOptions: { namedRuleObjects: true },
});

export default reactNative;
