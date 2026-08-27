import {
	adapter,
	allRuleCapabilities,
	dependency,
	firstKind,
	programObject,
} from "../external-adapters.ts";

export const EMOTION = adapter(
	"emotion",
	[
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{ name: "css-template", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
		{ name: "global", regex: /\b(?:injectGlobal|global)\s*\(\s*\{/g },
	],
	dependency("@emotion/css", "runtime"),
	allRuleCapabilities("emotion", "exact", {
		"theme-context": "exact",
		"runtime-context": "exact",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
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
				imports: ['import { keyframes } from "@emotion/css";'],
			};
		if (kind === "global")
			return {
				text: `injectGlobal(${programObject(program)})`,
				imports: ['import { injectGlobal } from "@emotion/css";'],
			};
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@emotion/css";'],
		};
	},
	[/@emotion\/(?:css|react|styled)/, /\bcss\s*\(\s*\{/, /\bcss\s*`/],
	["@emotion/css", "@emotion/react"],
);
