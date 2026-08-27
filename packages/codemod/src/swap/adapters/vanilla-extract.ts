import {
	adapter,
	allRuleCapabilities,
	declarationsObject,
	dependency,
	firstKind,
	programObject,
} from "../external-adapters.ts";

export const VANILLA_EXTRACT = adapter(
	"vanilla-extract",
	[
		{ name: "style", regex: /\bstyle\s*\(\s*\{/g },
		{ name: "globalStyle", regex: /\bglobalStyle\s*\([^,{]+,\s*\{/g },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
		{ name: "fontFace", regex: /\bfontFace\s*\(\s*\{/g },
	],
	dependency("@vanilla-extract/css", "runtime"),
	allRuleCapabilities("vanilla-extract", "unsupported", {
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	(program) => {
		const kind = firstKind(program);
		if (kind === "keyframes")
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@vanilla-extract/css";'],
			};
		if (kind === "global")
			return {
				text: program.rules
					.filter((rule) => rule.kind === "global")
					.map(
						(rule) =>
							`globalStyle(${JSON.stringify(rule.selector ?? "*")}, ${declarationsObject(rule.declarations)})`,
					)
					.join("; "),
				imports: ['import { globalStyle } from "@vanilla-extract/css";'],
			};
		if (kind === "font-face")
			return {
				text: `fontFace(${programObject(program)})`,
				imports: ['import { fontFace } from "@vanilla-extract/css";'],
			};
		return {
			text: `style(${programObject(program)})`,
			imports: ['import { style } from "@vanilla-extract/css";'],
		};
	},
	[/@vanilla-extract\/css/, /\b(?:style|globalStyle|keyframes)\s*\(/],
	["@vanilla-extract/css"],
);
