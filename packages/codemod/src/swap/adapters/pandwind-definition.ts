import { allRuleCapabilities, dependency, type AdapterDefinition } from "./definition.ts";

export const PANDWIND_DEFINITION: AdapterDefinition = {
	id: "pandwind",
	patterns: [
		{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g },
		{ name: "css-group", regex: /\bcss\.group\s*\(\s*\{/g },
	],
	packages: dependency("pandwind", "runtime"),
	capabilities: allRuleCapabilities("pandwind", "partial", {
		"dynamic-values": "partial",
		"named-conditions": "exact",
		"framework-semantics": "exact",
	}),
	detectPatterns: [/\bcss\.class\s*\(/, /\bcreateCss\s*\(/],
	sourceModules: ["pandwind/css", "pandwind/css/runtime"],
	emit(program, { programObject }) {
		return {
			text: program.declarations.some((declaration) =>
				declaration.conditions.some((condition) => condition.kind === "named"),
			)
				? `css.group(${programObject(program)})`
				: `css.class(${programObject(program)})`,
			imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
};
