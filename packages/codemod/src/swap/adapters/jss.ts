import { adapter, allRuleCapabilities, dependency, programObject } from "../external-adapters.ts";

export const JSS = adapter(
	"jss",
	[
		{ name: "jss-useStyles", regex: /\bcreateUseStyles\s*\(\s*\{/g },
		{ name: "jss-styleSheet", regex: /\b(?:jss\.)?createStyleSheet\s*\(\s*\{/g },
	],
	{
		packages: [
			dependency("jss", "runtime").packages[0]!,
			dependency("react-jss", "peer").packages[0]!,
		],
	},
	allRuleCapabilities("jss", "unsupported", {
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
	(program) => {
		const subject = program.source?.subject ?? "createUseStyles";
		return {
			text: `${subject}(${programObject(program)})`,
			imports:
				subject === "createStyleSheet"
					? ['import { createStyleSheet } from "jss";']
					: ['import { createUseStyles } from "react-jss";'],
		};
	},
	[/from\s+["'](?:jss|react-jss)["']/, /\bcreate(?:UseStyles|StyleSheet)\s*\(/],
	["jss", "react-jss"],
);
