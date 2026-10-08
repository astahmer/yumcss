import { targetImportBinding } from "../target-import-binding.ts";
import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { StyleRuleKindTag } from "../semantic-ir.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { AdapterComponentRewriteContext } from "../adapter-contract.ts";
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
import { normalizeCssObjectNumericUnits } from "../style-program-units.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	isPlainReactStyleProgram,
	reactStyledComponentArtifact,
	reactStyledComponentUnsupportedReason,
	rewriteReactStyledComponent,
} from "./react-styled-component.ts";
import type { AdapterParseContext } from "../adapter-contract.ts";
import {
	SemanticConditionKindTag,
	type StyleCondition,
	type StyleProgram,
} from "../semantic-ir.ts";

const vanillaExtractConditions = (
	conditions: readonly StyleCondition[],
): readonly StyleCondition[] =>
	conditions.flatMap((condition) =>
		condition.kind === SemanticConditionKindTag.Pseudo ||
		condition.kind === SemanticConditionKindTag.Selector
			? [{ kind: SemanticConditionKindTag.Named, name: "selectors" }, condition]
			: [condition],
	);

const vanillaExtractStyleProgram = (program: StyleProgram): StyleProgram => {
	const rule = (value: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...value,
		conditions: vanillaExtractConditions(value.conditions),
		declarations: value.declarations.map((declaration) => ({
			...declaration,
			conditions: vanillaExtractConditions(declaration.conditions),
		})),
		children: value.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map((declaration) => ({
			...declaration,
			conditions: vanillaExtractConditions(declaration.conditions),
		})),
		rules: program.rules.map(rule),
	};
};

const runtimeFallbackVar =
	"const __yumcssFallbackVar = (variable: string, fallback: string) => `var(${variable}, ${fallback})`;";

const componentResidual = (text: string, hint: string) => ({
	kind: StyleProgramResidualKindTag.Component,
	text,
	hint,
});

const componentModuleReason = (file: string): string | undefined =>
	file.endsWith(".css.ts")
		? "Vanilla Extract style modules cannot contain a migrated component wrapper; preserve the component until a separate .css.ts style artifact and host wrapper can be emitted"
		: undefined;

const rewriteComponent = (context: AdapterComponentRewriteContext) => {
	if (context.phase === "preflight") {
		const reason =
			componentModuleReason(context.file) ??
			reactStyledComponentUnsupportedReason(
				context.file,
				context.source,
				context.program,
				context.sourceFramework,
			);
		return reason === undefined
			? { code: context.code, residuals: [] }
			: { code: context.code, residuals: [componentResidual(context.binding, reason)] };
	}
	const rewrite = rewriteReactStyledComponent(context, context.emittedExpression);
	return {
		code: rewrite.code,
		...(rewrite.imports.length === 0 ? {} : { imports: rewrite.imports }),
		residuals:
			rewrite.reason === undefined ? [] : [componentResidual(context.binding, rewrite.reason)],
	};
};

const vanillaExtractAdapter = defineCodemodAdapter({
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
	sourceModulesSideEffectFree: ["@vanilla-extract/recipes"],
	configFiles: ["package.json"],
	migration: {
		targetPolicy: {
			moduleFile: {
				acceptedSuffixes: [".css.ts"],
				outputExtension: ".css.ts",
				importSpecifierExtension: ".css.ts",
				unsupportedFileHint: "Vanilla Extract styles must be emitted from a .css.ts module",
			},
			preflight: ({ file, source, program }) => {
				if (program.source?.subject === undefined) return [];
				const reason =
					componentModuleReason(file) ??
					reactStyledComponentUnsupportedReason(file, source, program);
				return reason === undefined ? [] : [componentResidual(program.source.subject, reason)];
			},
			handlesHostRewrites: true,
			dynamicClassCarrier: true,
			handlesFrameworkSemantics: true,
			hostFrameworks: [BuiltinHostFramework.React],
			hostRepresentation: StyleHostRepresentationKind.Class,
			rewriteComponent,
		},
		prepareDynamic: ({ targetId, program }) => ({
			handled:
				targetId === CodemodAdapterId.YumCSS &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style),
			standalone:
				targetId === CodemodAdapterId.YumCSS &&
				program.rules.length > 0 &&
				program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style),
		}),
		rewrite: ({ code, targetId, project }) => {
			if (targetId !== CodemodAdapterId.YumCSS) return { code, residuals: [] };
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
				rewritten = rewritten.replace(/\bfallbackVar\s*\(/gu, "__yumcssFallbackVar(");
				if (!/\b(?:const|let|var)\s+__yumcssFallbackVar\b/u.test(rewritten))
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
						'import { createRuntimeCss } from "yumcss/css/runtime";',
						'import { defaultPreset } from "yumcss/preset/default";',
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
	emit(program, { firstKind, programObject, declarationsObject }, context) {
		const kind = firstKind(program);
		const binding = context?.host?.binding;
		if (
			context?.host?.representation === StyleHostRepresentationKind.Class &&
			context.host.framework === BuiltinHostFramework.React &&
			context.host.subject !== undefined &&
			binding !== undefined &&
			isPlainReactStyleProgram(program)
		) {
			const artifact = reactStyledComponentArtifact(
				context,
				binding,
				".css.ts",
				".css.ts",
				`import { style } from "@vanilla-extract/css";\nexport const __yumcss${binding}Styles = style(${programObject(vanillaExtractStyleProgram(program))});\n`,
				"Vanilla Extract styles for a migrated React component",
			);
			if (artifact === undefined)
				return {
					text: "",
					semantic: program,
					residuals: [
						componentResidual(
							binding,
							"the generated Vanilla Extract path cannot be resolved relative to the project root",
						),
					],
				};
			return {
				text: artifact.local,
				semantic: program,
				imports: [`import { ${artifact.local} } from ${JSON.stringify(artifact.specifier)};`],
				generatedFiles: [artifact.file],
				residuals: [],
			};
		}
		if (kind === StyleRuleKindTag.Keyframes) {
			const binding = targetImportBinding({
				context,
				importedName: "keyframes",
				moduleSpecifier: "@vanilla-extract/css",
				preserveSourceBindings:
					program.residuals.length > 0 || (context?.loweringResiduals?.length ?? 0) > 0,
				preferred: "keyframes",
			});
			return {
				text: `${binding.localName}(${programObject(program)})`,
				imports: binding.importRequired
					? [
							`import { keyframes${binding.localName === "keyframes" ? "" : ` as ${binding.localName}`} } from "@vanilla-extract/css";`,
						]
					: [],
			};
		}
		if (kind === StyleRuleKindTag.Global) {
			const binding = targetImportBinding({
				context,
				importedName: "globalStyle",
				moduleSpecifier: "@vanilla-extract/css",
				preserveSourceBindings:
					program.residuals.length > 0 || (context?.loweringResiduals?.length ?? 0) > 0,
				preferred: "globalStyle",
			});
			return {
				text: program.rules
					.filter((rule) => rule.kind === StyleRuleKindTag.Global)
					.map(
						(rule) =>
							`${binding.localName}(${JSON.stringify(rule.selector ?? "*")}, ${declarationsObject(rule.declarations)})`,
					)
					.join("; "),
				imports: binding.importRequired
					? [
							`import { globalStyle${binding.localName === "globalStyle" ? "" : ` as ${binding.localName}`} } from "@vanilla-extract/css";`,
						]
					: [],
			};
		}
		if (kind === StyleRuleKindTag.FontFace) {
			const binding = targetImportBinding({
				context,
				importedName: "fontFace",
				moduleSpecifier: "@vanilla-extract/css",
				preserveSourceBindings:
					program.residuals.length > 0 || (context?.loweringResiduals?.length ?? 0) > 0,
				preferred: "fontFace",
			});
			return {
				text: `${binding.localName}(${programObject(program)})`,
				imports: binding.importRequired
					? [
							`import { fontFace${binding.localName === "fontFace" ? "" : ` as ${binding.localName}`} } from "@vanilla-extract/css";`,
						]
					: [],
			};
		}
		const styleBinding = targetImportBinding({
			context,
			importedName: "style",
			moduleSpecifier: "@vanilla-extract/css",
			preserveSourceBindings:
				program.residuals.length > 0 || (context?.loweringResiduals?.length ?? 0) > 0,
			preferred: "style",
		});
		return {
			text: `${styleBinding.localName}(${programObject(vanillaExtractStyleProgram(program))})`,
			imports: styleBinding.importRequired
				? [
						`import { style${styleBinding.localName === "style" ? "" : ` as ${styleBinding.localName}`} } from "@vanilla-extract/css";`,
					]
				: [],
		};
	},
});

export default {
	...vanillaExtractAdapter,
	parse: (source: string, context: AdapterParseContext) => {
		const parsed = vanillaExtractAdapter.parse(source, context);
		return {
			...parsed,
			matches: parsed.matches.map((match) => ({
				...match,
				program: normalizeCssObjectNumericUnits(match.program),
			})),
		};
	},
};

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
