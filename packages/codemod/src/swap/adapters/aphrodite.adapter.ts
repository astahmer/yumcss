import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId, StyleNamedRuleStrategy } from "../identifiers.ts";

const aphrodite = makeExtraAdapter({
	id: CodemodAdapterId.Aphrodite,
	modules: ["aphrodite"],
	packages: { packages: [{ name: "aphrodite", kind: "runtime" }] },
	detect: [/from\s+["']aphrodite["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	targetImports: ['import { StyleSheet } from "aphrodite";'],
	namedObjects: true,
	namedRuleStrategy: StyleNamedRuleStrategy.NativeMap,
	sourceObjectOptions: {
		namedRuleObjects: true,
		arrayRuleKinds: { fontFamily: "font-face" },
	},
});

export default aphrodite;
