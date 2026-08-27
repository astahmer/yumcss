import {
	adapter,
	allRuleCapabilities,
	dependency,
	firstKind,
	programObject,
} from "../external-adapters.ts";

export const STITCHES = adapter(
	"stitches",
	[
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{ name: "globalCss", regex: /\bglobalCss\s*\(\s*\{/g },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	dependency("@stitches/react", "peer"),
	allRuleCapabilities("stitches", "exact", {
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	(program) => {
		const kind = firstKind(program);
		if (kind === "keyframes")
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@stitches/react";'],
			};
		if (kind === "global")
			return {
				text: `globalCss(${programObject(program)})`,
				imports: ['import { globalCss } from "@stitches/react";'],
			};
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@stitches/react";'],
		};
	},
	[/@stitches\/(?:react|core)/, /\bcreateStitches\s*\(/],
	["@stitches/react", "@stitches/core"],
);
