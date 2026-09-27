import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { StyleRuleKindTag } from "../semantic-ir.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import {
	CodemodCallPatternKindTag,
	CodemodAdapterId,
	CodemodPatternId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleProgramEmissionHint,
} from "../identifiers.ts";
import { preserveUnsupportedRecipeFields, recipeSourceObjectOptions } from "./recipe-source.ts";
import { literalValueToPlain, parseObjectLiteral } from "../parse.ts";

const runtimeFallbackVar =
	"const __pandwindFallbackVar = (variable: string, fallback: string) => `var(${variable}, ${fallback})`;";

export default defineCodemodAdapter({
	id: CodemodAdapterId.VanillaExtract,
	officialApi: {
		pluginSystems: ["Sprinkles", "Recipes", "themes", "contracts"],
		compilerIntegrations: ["@vanilla-extract/vite-plugin", "@vanilla-extract/webpack-plugin"],
	},
	patterns: [
		{ name: "style", regex: /\bstyle\s*\(\s*\{/g },
		{
			name: CodemodPatternId.VanillaExtractGlobalStyle,
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
			sourceObjectOptions: recipeSourceObjectOptions,
			transform: preserveUnsupportedRecipeFields,
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
			regex: /\bcreateVar\s*\(\s*(?:\{[^{}]*\})?\s*\)/g,
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
			moduleFile: {
				acceptedSuffixes: [".css.ts"],
				outputExtension: ".css.ts",
				importSpecifierExtension: ".css.ts",
				unsupportedFileHint: "Vanilla Extract styles must be emitted from a .css.ts module",
			},
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
		rewrite: ({ code, targetId, project }) => {
			if (targetId !== CodemodAdapterId.Pandwind) return { code, residuals: [] };
			if (!/\bcss\.(?:class|vars|group)\s*\(/u.test(code) && !/\bcreateVar\s*\(/u.test(code))
				return { code, residuals: [] };

			type VariableDeclaration = {
				readonly declaration: string;
				readonly name: string;
				readonly call: string;
				readonly descriptor?: {
					readonly syntax: string;
					readonly inherits: boolean;
					readonly initialValue: string;
				};
			};
			const variables: VariableDeclaration[] = [];
			for (const match of code.matchAll(
				/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\/\/[^\n]*\n\s*)?createVar\s*\(/gu,
			)) {
				const start = match.index ?? 0;
				const createVar = start + match[0].lastIndexOf("createVar");
				const open = createVar === -1 ? -1 : code.indexOf("(", createVar);
				const block = open === -1 ? undefined : balancedCall(code, open);
				if (block === undefined) continue;
				const semicolon = code.indexOf(";", block.end);
				if (semicolon === -1) continue;
				const call = code.slice(createVar, block.end);
				const declaration = code.slice(start, semicolon + 1);
				const argumentsText = block.body.trim();
				const descriptorBody =
					argumentsText.startsWith("{") && argumentsText.endsWith("}")
						? argumentsText.slice(1, -1)
						: argumentsText;
				const parsed = parseObjectLiteral(descriptorBody);
				const syntaxValue = parsed?.keys.find((entry) => entry.key === "syntax")?.value;
				const inheritsValue = parsed?.keys.find((entry) => entry.key === "inherits")?.value;
				const initialValue = parsed?.keys.find((entry) => entry.key === "initialValue")?.value;
				const syntax = syntaxValue === undefined ? undefined : literalValueToPlain(syntaxValue);
				const inherits =
					inheritsValue === undefined ? undefined : literalValueToPlain(inheritsValue);
				const initial = initialValue === undefined ? undefined : literalValueToPlain(initialValue);
				variables.push({
					declaration,
					name: match[2]!,
					call,
					...(typeof syntax === "string" &&
					typeof inherits === "boolean" &&
					typeof initial === "string"
						? { descriptor: { syntax, inherits, initialValue: initial } }
						: {}),
				});
			}

			const handledVariables = variables.filter(
				(variable) => variable.descriptor !== undefined || variable.call.endsWith("()"),
			);
			const handledResiduals = handledVariables.map((variable) => ({
				kind: StyleProgramResidualKindTag.Configuration,
				text: variable.call,
				hint: "Vanilla Extract createVar requires contract-aware variable lowering",
			}));
			const unsupportedVariables = variables.filter(
				(variable) => !handledVariables.includes(variable),
			);
			let rewritten = code;
			for (const variable of handledVariables) {
				rewritten = rewritten.replace(
					variable.declaration,
					`const ${variable.name} = "--pw-${variable.name}";`,
				);
			}
			if (/\bfallbackVar\s*\(/u.test(rewritten)) {
				rewritten = rewritten.replace(/\bfallbackVar\s*\(/gu, "__pandwindFallbackVar(");
				if (!/\b(?:const|let|var)\s+__pandwindFallbackVar\b/u.test(rewritten))
					rewritten = `${runtimeFallbackVar}\n${rewritten}`;
			}
			const descriptors = handledVariables.flatMap((variable) =>
				variable.descriptor === undefined
					? []
					: [{ name: `--pw-${variable.name}`, descriptor: variable.descriptor }],
			);
			let runtimeImports: readonly string[] | undefined;
			if (descriptors.length > 0) {
				const binding = /\bruntimeCss\./u.test(rewritten) ? "runtimeCss" : "css";
				const registrations = descriptors
					.map(
						({ name, descriptor }) =>
							`{ kind: "property", name: ${JSON.stringify(name)}, declarations: [{ property: "syntax", value: ${JSON.stringify(descriptor.syntax)} }, { property: "inherits", value: ${descriptor.inherits} }, { property: "initial-value", value: ${JSON.stringify(descriptor.initialValue)} }] }`,
					)
					.join(", ");
				if (project?.runtimeCssModule === undefined)
					runtimeImports = [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { defaultPreset } from "pandwind/preset/default";',
						`const ${binding} = createRuntimeCss(defaultPreset);`,
					];
				rewritten = `${binding}.sheet.registerSemanticRules([${registrations}]);\n${rewritten}`;
			}
			return {
				code: rewritten,
				...(runtimeImports === undefined ? {} : { imports: runtimeImports }),
				residuals: unsupportedVariables.map((variable) => ({
					kind: StyleProgramResidualKindTag.Configuration,
					text: variable.call,
					hint: "Vanilla Extract createVar requires a static descriptor or contract-aware variable lowering",
				})),
				handledResiduals,
			};
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

function balancedCall(
	source: string,
	open: number,
): { readonly body: string; readonly end: number } | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < source.length; index += 1) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index += 1;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") depth += 1;
		if (character !== ")") continue;
		depth -= 1;
		if (depth === 0) return { body: source.slice(open + 1, index), end: index + 1 };
	}
	return undefined;
}
