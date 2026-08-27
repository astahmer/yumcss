import { allRuleCapabilities, dependency, type AdapterDefinition } from "./definition.ts";

export const STITCHES_DEFINITION: AdapterDefinition = {
	id: "stitches",
	patterns: [
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{ name: "globalCss", regex: /\bglobalCss\s*\(\s*\{/g },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	packages: dependency("@stitches/react", "peer"),
	capabilities: allRuleCapabilities("stitches", "exact", {
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/@stitches\/(?:react|core)/, /\bcreateStitches\s*\(/],
	sourceModules: ["@stitches/react", "@stitches/core"],
	sourceObjectOptions: { variantContainerKeys: ["variants"] },
	emit(program, { firstKind, programObject }) {
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
};
