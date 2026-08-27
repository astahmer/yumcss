import { allRuleCapabilities, dependency, type AdapterDefinition } from "./definition.ts";

export const PANDWIND_DEFINITION: AdapterDefinition = {
	id: "pandwind",
	patterns: [{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g }],
	packages: dependency("pandwind", "runtime"),
	capabilities: allRuleCapabilities("pandwind", "partial", { "dynamic-values": "partial" }),
	detectPatterns: [/\bcss\.class\s*\(/, /\bcreateCss\s*\(/],
	sourceModules: ["pandwind/css", "pandwind/css/runtime"],
	emit(program, { programObject }) {
		return {
			text: `css.class(${programObject(program)})`,
			imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
};
