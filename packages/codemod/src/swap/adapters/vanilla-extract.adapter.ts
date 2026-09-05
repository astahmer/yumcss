import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { StyleRuleKindTag } from "../semantic-ir.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import {
	CodemodCallPatternKindTag,
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
		{
			name: "globalStyle",
			kind: CodemodCallPatternKindTag.Global,
			regex: /\bglobalStyle\s*\([^,{]+,\s*\{/g,
		},
		{
			name: "keyframes",
			kind: CodemodCallPatternKindTag.Keyframes,
			regex: /\bkeyframes\s*\(\s*\{/g,
		},
		{
			name: "fontFace",
			kind: CodemodCallPatternKindTag.FontFace,
			regex: /\bfontFace\s*\(\s*\{/g,
		},
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
			form: CodemodCallPatternFormTag.Residual,
			residual: {
				kind: StyleProgramResidualKindTag.Composition,
				hint: "Vanilla Extract recipes require variant-aware target lowering",
			},
		},
		{
			name: "theme-contract",
			regex: /\b(?:createThemeContract|createGlobalThemeContract)\s*\(/g,
			form: CodemodCallPatternFormTag.Residual,
			residual: {
				kind: StyleProgramResidualKindTag.Configuration,
				hint: "Vanilla Extract theme contracts require contract-aware variable lowering",
			},
		},
		{
			name: "theme-creation",
			regex: /\b(?:createTheme|createGlobalTheme)\s*\(/g,
			form: CodemodCallPatternFormTag.Residual,
			residual: {
				kind: StyleProgramResidualKindTag.Configuration,
				hint: "Vanilla Extract themes require static contract/config lowering",
			},
		},
		{
			name: "assign-vars",
			regex: /\bassignVars\s*\(/g,
			form: CodemodCallPatternFormTag.Residual,
			residual: {
				kind: StyleProgramResidualKindTag.Configuration,
				hint: "Vanilla Extract assignVars requires contract-aware variable lowering",
			},
		},
		{
			name: "create-var",
			regex: /\bcreateVar\s*\(/g,
			form: CodemodCallPatternFormTag.Residual,
			residual: {
				kind: StyleProgramResidualKindTag.Configuration,
				hint: "Vanilla Extract createVar requires contract-aware variable lowering",
			},
		},
	],
	packages: {
		packages: [
			{ name: "@vanilla-extract/css", kind: AdapterDependencyKindTag.Runtime },
			{ name: "@vanilla-extract/recipes", kind: AdapterDependencyKindTag.Runtime },
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
		rewrite: ({ code, targetId }) => {
			if (targetId !== CodemodAdapterId.Pandwind) return { code, residuals: [] };
			if (!/\bcss\.(?:class|vars|group)\s*\(/u.test(code)) return { code, residuals: [] };
			if (/\bfallbackVar\s*\(/u.test(code)) return { code, residuals: [] };
			const handledResiduals = [...code.matchAll(/\bcreateVar\s*\(/g)].map((match) => ({
				kind: StyleProgramResidualKindTag.Configuration,
				text: match[0],
				hint: "Vanilla Extract createVar requires contract-aware variable lowering",
			}));
			let rewritten = code.replace(
				/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\/\/[^\n]*\n\s*)?createVar\s*\(\s*\)\s*;/g,
				(_match, declaration, name: string) => `${declaration} ${name} = "--pw-${name}";`,
			);
			if (
				rewritten.includes("fallbackVar(") &&
				!/\b(?:const|let|var)\s+fallbackVar\b/.test(rewritten)
			) {
				rewritten = `${runtimeFallbackVar}\n${rewritten}`;
			}
			return { code: rewritten, residuals: [], handledResiduals };
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
