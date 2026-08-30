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
	migration: {
		rewrite: ({ code, targetId, convertedBindings, complete }) => {
			if (targetId !== CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
			let rewritten = code.replace(/\bstyle9\s*\(/g, "cx(");
			for (const binding of convertedBindings) {
				const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				rewritten = rewritten.replace(
					new RegExp(`\\b${escaped}\\s*\\(\\s*(['\"])([A-Za-z_$][\\w$]*)\\1\\s*\\)`, "g"),
					(_match, _quote: string, name: string) => `${binding}.${name}`,
				);
			}
			return {
				code: rewritten,
				imports: ['import { createCx } from "pandwind/cx";', "const cx = createCx();"],
				residuals: [],
			};
		},
	},
});

export default style9;
