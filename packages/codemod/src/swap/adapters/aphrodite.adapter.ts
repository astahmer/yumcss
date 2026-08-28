import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId } from "../identifiers.ts";

const aphrodite = makeExtraAdapter({
	id: CodemodAdapterId.Aphrodite,
	modules: ["aphrodite"],
	packages: { packages: [{ name: "aphrodite", kind: "runtime" }] },
	detect: [/from\s+["']aphrodite["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	namedObjects: true,
	sourceObjectOptions: { arrayRuleKinds: { fontFamily: "font-face" } },
});

export default aphrodite;
