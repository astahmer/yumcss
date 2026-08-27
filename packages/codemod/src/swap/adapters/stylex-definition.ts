import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";

export default defineCodemodAdapter({
	id: "stylex",
	patterns: [{ name: "stylex-create", regex: /\bstylex\.create\s*\(\s*\{/g, objectKind: "named" }],
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
	configFiles: ["package.json"],
	sourceObjectOptions: { nestedObjectKind: "named" },
	emit(program, { programObject }) {
		return {
			text: `css.group(${programObject(program)})`,
			imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		};
	},
});
