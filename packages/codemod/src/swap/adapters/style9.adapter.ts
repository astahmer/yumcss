import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { CodemodAdapterId } from "../identifiers.ts";

const style9 = makeExtraAdapter({
	id: CodemodAdapterId.Style9,
	modules: ["style9"],
	packages: { packages: [{ name: "style9", kind: "runtime" }] },
	detect: [/from\s+["']style9["']/g, /\bstyle9\.create\s*\(\s*\{/g],
	call: /\bstyle9\.create\s*\(\s*\{/g,
	prefix: "style9.create(",
	namedObjects: true,
});

export default style9;
