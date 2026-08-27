import { allRuleCapabilities, dependency, type AdapterDefinition } from "./definition.ts";

export const STYLEX_DEFINITION: AdapterDefinition = {
	id: "stylex",
	patterns: [{ name: "stylex-create", regex: /\bstylex\.create\s*\(\s*\{/g }],
	packages: dependency("@stylexjs/stylex", "peer"),
	capabilities: allRuleCapabilities("stylex", "partial", {
		"dynamic-values": "partial",
		composition: "partial",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/@stylexjs\/stylex/, /\bstylex\.create\s*\(/],
	sourceModules: ["@stylexjs/stylex"],
	sourceObjectOptions: { nestedObjectKind: "named" },
	emit(program, { programObject }) {
		return {
			text: `css.group(${programObject(program)})`,
			imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
};
