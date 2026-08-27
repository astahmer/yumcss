import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";

export default defineCodemodAdapter({
	id: "jss",
	patterns: [
		{ name: "jss-useStyles", regex: /\bcreateUseStyles\s*\(\s*\{/g, objectKind: "named" },
		{
			name: "jss-styleSheet",
			regex: /\b(?:jss\.)?createStyleSheet\s*\(\s*\{/g,
			objectKind: "named",
		},
		{
			name: "jss-styleSheet-reference",
			regex: /\b(?:jss\.)?createStyleSheet\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g,
			form: "reference",
			objectKind: "named",
		},
		{ name: "jss-createRule", regex: /\b(?:jss\.)?createRule\s*\(\s*\{/g, objectKind: "named" },
	],
	packages: {
		packages: [
			dependency("jss", "runtime").packages[0]!,
			dependency("react-jss", "peer").packages[0]!,
		],
	},
	capabilities: allRuleCapabilities("jss", "unsupported", {
		"named-conditions": "exact",
		"dynamic-values": "partial",
		"rule-level": "partial",
		"global-rules": "unsupported",
		keyframes: "unsupported",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/from\s+["'](?:jss|react-jss)["']/, /\bcreate(?:UseStyles|StyleSheet)\s*\(/],
	sourceModules: ["jss", "react-jss"],
	configFiles: ["jss.config.js", "package.json"],
	emit(program, { programObject }) {
		const subject = program.source?.subject ?? "createUseStyles";
		return {
			text: `${subject}(${programObject(program)})`,
			imports:
				subject === "createStyleSheet"
					? ['import { createStyleSheet } from "jss";']
					: ['import { createUseStyles } from "react-jss";'],
		};
	},
});
