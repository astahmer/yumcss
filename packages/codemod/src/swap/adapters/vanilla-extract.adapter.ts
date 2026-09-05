import { StyleRuleKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleProgramEmissionHint,
} from "../identifiers.ts";

const runtimeFallbackVar =
	"const fallbackVar = (variable: string, fallback: string) => `var(${variable}, ${fallback})`;";

export default defineCodemodAdapter({
	id: CodemodAdapterId.VanillaExtract,
	officialApi: {
		pluginSystems: ["Sprinkles", "Recipes", "themes", "contracts"],
		compilerIntegrations: ["@vanilla-extract/vite-plugin", "@vanilla-extract/webpack-plugin"],
	},
	patterns: [
		{ name: "style", regex: /\bstyle\s*\(\s*\{/g },
		{ name: "globalStyle", kind: "global", regex: /\bglobalStyle\s*\([^,{]+,\s*\{/g },
		{ name: "keyframes", kind: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
		{ name: "fontFace", kind: "font-face", regex: /\bfontFace\s*\(\s*\{/g },
		{
			name: "styleVariants",
			regex: /\bstyleVariants\s*\(/g,
			functionCall: {
				functionCall: /\bstyleVariants\s*\(/g,
				namedObjects: true,
				sourceObjectOptions: { namedRuleObjects: true },
			},
		},
		{
			name: "recipe",
			regex: /\b(?:recipe|createRecipe)\s*\(/g,
			form: "residual",
			residual: {
				kind: "composition",
				hint: "Vanilla Extract recipes require variant-aware target lowering",
			},
		},
		{
			name: "theme-contract",
			regex: /\b(?:createThemeContract|createGlobalThemeContract)\s*\(/g,
			form: "residual",
			residual: {
				kind: "configuration",
				hint: "Vanilla Extract theme contracts require contract-aware variable lowering",
			},
		},
		{
			name: "theme-creation",
			regex: /\b(?:createTheme|createGlobalTheme)\s*\(/g,
			form: "residual",
			residual: {
				kind: "configuration",
				hint: "Vanilla Extract themes require static contract/config lowering",
			},
		},
		{
			name: "assign-vars",
			regex: /\bassignVars\s*\(/g,
			form: "residual",
			residual: {
				kind: "configuration",
				hint: "Vanilla Extract assignVars requires contract-aware variable lowering",
			},
		},
		{
			name: "create-var",
			regex: /\bcreateVar\s*\(/g,
			form: "residual",
			residual: {
				kind: "configuration",
				hint: "Vanilla Extract createVar requires contract-aware variable lowering",
			},
		},
	],
	packages: {
		packages: [
			{ name: "@vanilla-extract/css", kind: "runtime" },
			{ name: "@vanilla-extract/recipes", kind: "runtime" },
		],
	},
	capabilities: CodemodAdapterKit.allRuleCapabilities(
		CodemodAdapterId.VanillaExtract,
		"unsupported",
		{
			layers: "unsupported",
			"supports-rules": "unsupported",
			"property-rules": "unsupported",
		},
	),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	detectPatterns: [
		/@vanilla-extract\/(?:css|recipes)/,
		/\b(?:style|globalStyle|keyframes|styleVariants|recipe|createRecipe)\s*\(/,
	],
	sourceModules: ["@vanilla-extract/css", "@vanilla-extract/recipes"],
	configFiles: ["package.json"],
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			dynamicClassCarrier: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
		},
		prepareDynamic: ({ targetId, program }) => ({
			handled:
				targetId === CodemodAdapterId.Pandwind &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style),
			standalone:
				targetId === CodemodAdapterId.Pandwind &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style),
		}),
		rewrite: ({ code, targetId, complete }) => {
			if (targetId !== CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
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
			emissionHints: [StyleProgramEmissionHint.RuntimeClass],
			computedKeys,
			dynamicReferences,
		};
	},
	emit(program, { firstKind, programObject, declarationsObject }) {
		const kind = firstKind(program);
		if (kind === StyleRuleKindTag.Keyframes)
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@vanilla-extract/css";'],
			};
		if (kind === StyleRuleKindTag.Global)
			return {
				text: program.rules
					.filter((rule) => rule.kind === StyleRuleKindTag.Global)
					.map(
						(rule) =>
							`globalStyle(${JSON.stringify(rule.selector ?? "*")}, ${declarationsObject(rule.declarations)})`,
					)
					.join("; "),
				imports: ['import { globalStyle } from "@vanilla-extract/css";'],
			};
		if (kind === StyleRuleKindTag.FontFace)
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
