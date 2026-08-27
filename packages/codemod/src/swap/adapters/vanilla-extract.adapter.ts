import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";

const runtimeFallbackVar =
	"const fallbackVar = (variable, fallback) => `var(${variable}, ${fallback})`;";

export default defineCodemodAdapter({
	id: "vanilla-extract",
	patterns: [
		{ name: "style", regex: /\bstyle\s*\(\s*\{/g },
		{ name: "globalStyle", kind: "global", regex: /\bglobalStyle\s*\([^,{]+,\s*\{/g },
		{ name: "keyframes", kind: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
		{ name: "fontFace", kind: "font-face", regex: /\bfontFace\s*\(\s*\{/g },
	],
	packages: dependency("@vanilla-extract/css", "runtime"),
	capabilities: allRuleCapabilities("vanilla-extract", "unsupported", {
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/@vanilla-extract\/css/, /\b(?:style|globalStyle|keyframes)\s*\(/],
	sourceModules: ["@vanilla-extract/css"],
	configFiles: ["package.json"],
	migration: {
		prepareDynamic: ({ targetId, program }) => ({
			handled:
				targetId === "pandwind" &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === "style"),
			standalone:
				targetId === "pandwind" &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === "style"),
		}),
		rewrite: ({ code, targetId, complete }) => {
			if (targetId !== "pandwind" || !complete) return { code, residuals: [] };
			let rewritten = code.replace(
				/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createVar\s*\(\s*\)\s*;/g,
				(_match, declaration, name: string) => `${declaration} ${name} = "--pw-${name}";`,
			);
			if (
				rewritten.includes("fallbackVar(") &&
				!/\b(?:const|let|var)\s+fallbackVar\b/.test(rewritten)
			) {
				rewritten = `${runtimeFallbackVar}\n${rewritten}`;
			}
			return { code: rewritten, residuals: [] };
		},
	},
	sourceObjectOptions: (source) => {
		const variables = [
			...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createVar\b/g),
		].map((match) => match[1]);
		const computedKeys = Object.fromEntries(
			variables
				.filter((name): name is string => name !== undefined)
				.map((name) => [name, `--pw-${name}`]),
		);
		const dynamicReferences = Object.fromEntries(
			variables
				.filter((name): name is string => name !== undefined)
				.map((name) => [name, `var(--pw-${name})`]),
		);
		return {
			unwrapNestedObjectKeys: ["vars", "selectors"],
			computedKeys,
			dynamicReferences,
		};
	},
	emit(program, { firstKind, programObject, declarationsObject }) {
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
});
