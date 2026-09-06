import {
	SemanticConditionKindTag,
	inferSemanticConditionKind,
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
} from "../semantic-ir.ts";
import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type AdapterRenderers,
} from "../external-adapters.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import type {
	AdapterConfigContext,
	AdapterEmitContext,
	AdapterGeneratedFile,
	AdapterParseContext,
	AdapterParseResult,
	AdapterProjectConfig,
	AdapterTargetMigrationPolicy,
	AdapterTokenPolicy,
} from "../adapter-contract.ts";
import {
	styleProgramFromSourceObject,
	styleProgramFromRules,
	type StyleProgram,
	type StyleRule,
	type StyleValue,
} from "../semantic-ir.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import {
	CodemodAdapterId,
	CodemodPatternId,
	CodemodStyleIdentity,
	StyleProgramCompositionKind,
	StyleProgramEmissionHint,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { SourceBindingKind } from "pandwind/source";
import { JsxStyleHost } from "../jsx-style-host.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	componentAttrsExpressionForSubject,
	componentExpressionForSubject,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";
import { TokenCatalog } from "../tokens.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import {
	dirnameDocumentPath,
	isAbsoluteDocumentPath,
	joinDocumentPath,
	relativeDocumentPath,
} from "../../path-utils.ts";
import {
	captureSlotRecipeSlots,
	preserveUnsupportedRecipeFields,
	preserveUnsupportedSlotRecipeFields,
	pandwindSlotRecipeSourceObjectOptions,
	recipeDefinitionObject,
	recipeSourceObjectOptions,
} from "./recipe-source.ts";

const PANDWIND_TARGET_POLICY: AdapterTargetMigrationPolicy = {
	handlesHostRewrites: true,
	handlesFrameworkSemantics: true,
	// Pandwind is a compose target: any source factory host keeps styling the
	// element it was authored on, so the shared carrier projection must not
	// collapse it to a bare intrinsic.
	demotesFactoryHosts: false,
	hostRepresentation: StyleHostRepresentationKind.Class,
	standaloneHostRepresentation: StyleHostRepresentationKind.Class,
	resolveHostRepresentation: ({ program, hasHostContext, framework }) => {
		if (hasHostContext || program.source?.subject === undefined)
			return StyleHostRepresentationKind.Class;
		if (
			framework === BuiltinHostFramework.React ||
			framework === BuiltinHostFramework.Preact ||
			framework === BuiltinHostFramework.Solid ||
			framework === BuiltinHostFramework.Vue
		)
			return StyleHostRepresentationKind.Component;
		return StyleHostRepresentationKind.Class;
	},
	rewriteComponent: ({ code, binding, framework, representation }) => {
		if (representation !== StyleHostRepresentationKind.Component)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: binding,
						hint: "Pandwind class projection should use the shared host rewriter",
					},
				],
			};
		if (
			framework !== BuiltinHostFramework.React &&
			framework !== BuiltinHostFramework.Preact &&
			framework !== BuiltinHostFramework.Solid &&
			framework !== BuiltinHostFramework.Vue
		)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: binding,
						hint: `Pandwind static component projection requires a supported host, got ${framework}`,
					},
				],
			};
		// The Pandwind emitter owns the component wrapper for this representation.
		// The emitter owns the component wrapper; this hook only validates that the
		// selected representation is the component contract.
		return { code, residuals: [] };
	},
	requiresHostWrapper: ({ source, binding }) => {
		const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return (
			/\b(?:from\s+|import\s*\()?['"]styled-components['"]/.test(source) &&
			(new RegExp(`styled\\s*\\(\\s*${escaped}\\s*\\)`).test(source) ||
				new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*styled(?:\\.|\\s*\\()`).test(source) ||
				new RegExp(`<${escaped}(?:\\s|/?>)`).test(source))
		);
	},
	handlesRawTemplate: () => true,
	handlesTemplateFragment: (program) => program.source?.pattern === CodemodPatternId.CssTemplate,
};

function runtimeValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === StyleValueKindTag.Dynamic) return value.expression;
	if (value.kind === StyleValueKindTag.Token) return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function delimitedRuntimeExpression(
	source: string,
	start: number,
	open: string,
	close: string,
): number | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === open) depth++;
		if (character === close && --depth === 0) return index + 1;
	}
	return undefined;
}

function splitRuntimeList(source: string): readonly string[] {
	const parts: string[] = [];
	let start = 0;
	let braces = 0;
	let brackets = 0;
	let parens = 0;
	let quote: string | undefined;
	for (let index = 0; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{") braces++;
		else if (character === "}") braces--;
		else if (character === "[") brackets++;
		else if (character === "]") brackets--;
		else if (character === "(") parens++;
		else if (character === ")") parens--;
		else if (character === "," && braces === 0 && brackets === 0 && parens === 0) {
			parts.push(source.slice(start, index).trim());
			start = index + 1;
		}
	}
	const last = source.slice(start).trim();
	if (last !== "") parts.push(last);
	return parts;
}

function runtimeObjectBody(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
	return trimmed.slice(1, -1);
}

function runtimeObjectField(body: string, name: string): string | undefined {
	for (const part of splitRuntimeList(body)) {
		const colon = part.indexOf(":");
		if (colon < 0) continue;
		const key = part
			.slice(0, colon)
			.trim()
			.replace(/^['"]|['"]$/g, "");
		if (key === name) return part.slice(colon + 1).trim();
	}
	return undefined;
}

function runtimeString(
	value: string | undefined,
	bindings: ReadonlyMap<string, string>,
): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	const bound = bindings.get(trimmed);
	if (bound !== undefined) return bound;
	if (!/^['"]/.test(trimmed)) return undefined;
	try {
		return JSON.parse(trimmed) as string;
	} catch {
		return trimmed.slice(1, -1);
	}
}

function runtimeStyleValue(
	value: string | undefined,
	bindings: ReadonlyMap<string, string>,
): StyleValue {
	const trimmed = value?.trim() ?? "undefined";
	const bound = bindings.get(trimmed);
	if (bound !== undefined) return { kind: StyleValueKindTag.Literal, value: bound };
	if (trimmed === "true" || trimmed === "false")
		return { kind: StyleValueKindTag.Literal, value: trimmed === "true" };
	if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed))
		return { kind: StyleValueKindTag.Literal, value: Number(trimmed) };
	const stringValue = runtimeString(trimmed, bindings);
	if (stringValue !== undefined) return { kind: StyleValueKindTag.Literal, value: stringValue };
	return { kind: StyleValueKindTag.Dynamic, expression: trimmed };
}

function runtimeArrayItems(value: string | undefined): readonly string[] {
	if (value === undefined) return [];
	const trimmed = value.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
	return splitRuntimeList(trimmed.slice(1, -1));
}

function runtimeRuleKind(
	value: string | undefined,
	bindings: ReadonlyMap<string, string>,
): StyleRule["kind"] | undefined {
	const kind = runtimeString(value, bindings);
	switch (kind) {
		case StyleRuleKindTag.Style:
		case StyleRuleKindTag.Global:
		case StyleRuleKindTag.Keyframes:
		case StyleRuleKindTag.FontFace:
		case StyleRuleKindTag.Layer:
		case StyleRuleKindTag.Supports:
		case StyleRuleKindTag.Property:
			return kind;
		default:
			return undefined;
	}
}

function runtimeRule(
	value: string,
	bindings: ReadonlyMap<string, string>,
	order: number,
): StyleRule | undefined {
	const body = runtimeObjectBody(value);
	if (body === undefined) return undefined;
	const kind = runtimeRuleKind(runtimeObjectField(body, "kind"), bindings);
	if (kind === undefined) return undefined;
	const declarations = runtimeArrayItems(runtimeObjectField(body, "declarations")).flatMap(
		(item) => {
			const declaration = runtimeObjectBody(item);
			if (declaration === undefined) return [];
			const property = runtimeString(runtimeObjectField(declaration, "property"), bindings);
			if (property === undefined) return [];
			return [
				{
					conditions: [],
					property,
					value: runtimeStyleValue(runtimeObjectField(declaration, "value"), bindings),
				},
			];
		},
	);
	const conditions = runtimeArrayItems(runtimeObjectField(body, "conditions")).flatMap((item) => {
		const value = runtimeString(item, bindings);
		if (value === undefined) return [];
		return [
			{
				kind: inferSemanticConditionKind(value),
				name: value,
				value,
				raw: value,
			},
		];
	});
	const children = runtimeArrayItems(runtimeObjectField(body, "children")).flatMap(
		(item, index) => {
			const child = runtimeRule(item, bindings, index);
			return child === undefined ? [] : [child];
		},
	);
	const selector = runtimeString(runtimeObjectField(body, "selector"), bindings);
	const name = runtimeString(runtimeObjectField(body, "name"), bindings);
	const layer = runtimeString(runtimeObjectField(body, "layer"), bindings);
	return {
		kind,
		...(selector === undefined ? {} : { selector }),
		...(name === undefined ? {} : { name }),
		...(layer === undefined ? {} : { layer }),
		conditions,
		declarations,
		children,
		order,
	};
}

function runtimeBindingValues(source: string): ReadonlyMap<string, string> {
	const values = new Map<string, string>();
	for (const match of source.matchAll(
		/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'][^"']*["'])/gu,
	)) {
		const name = match[1];
		const value = match[2];
		if (name !== undefined && value !== undefined) {
			const parsed = runtimeString(value, new Map());
			if (parsed !== undefined) values.set(name, parsed);
		}
	}
	return values;
}

function runtimeSemanticRuleMatches(
	source: string,
	context: AdapterParseContext,
): AdapterParseResult {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: Array<AdapterParseResult["residuals"][number]> = [];
	const bindings = runtimeBindingValues(source);
	for (const call of source.matchAll(/\bcss\.sheet\.registerSemanticRules\s*\(/gu)) {
		const callStart = call.index ?? 0;
		const openParen = source.indexOf("(", callStart);
		const arrayStart = source.indexOf("[", openParen);
		if (openParen < 0 || arrayStart < 0) continue;
		const arrayEnd = delimitedRuntimeExpression(source, arrayStart, "[", "]");
		const callEnd = delimitedRuntimeExpression(source, openParen, "(", ")");
		if (arrayEnd === undefined || callEnd === undefined) continue;
		const rules = splitRuntimeList(source.slice(arrayStart + 1, arrayEnd - 1)).flatMap(
			(item, index) => {
				const parsed = runtimeRule(item, bindings, index);
				return parsed === undefined ? [] : [parsed];
			},
		);
		if (rules.length === 0) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(callStart, callEnd),
				hint: "Pandwind runtime semantic rules could not be read back",
			});
			continue;
		}
		let start = callStart;
		let end = callEnd;
		const prefix = "() => (";
		if (
			callStart >= prefix.length &&
			source.slice(callStart - prefix.length, callStart) === prefix
		) {
			start = callStart - prefix.length;
			const outerEnd = delimitedRuntimeExpression(source, callStart - 1, "(", ")");
			if (outerEnd !== undefined) end = outerEnd;
		} else if (callStart > 0 && source[callStart - 1] === "(") {
			start = callStart - 1;
			const outerEnd = delimitedRuntimeExpression(source, start, "(", ")");
			if (outerEnd !== undefined) end = outerEnd;
		} else {
			const iifeStart = source.lastIndexOf("(() => {", callStart);
			const iifeEnd = source.indexOf("})()", callEnd);
			if (iifeStart >= 0 && iifeEnd >= callEnd) {
				start = iifeStart;
				end = iifeEnd + 4;
			}
		}
		const sourceMap = {
			file: context.file,
			start,
			end,
			adapter: context.config.adapter,
			pattern: CodemodPatternId.RuntimeSemanticRules,
		};
		matches.push({
			start,
			end,
			sourceText: source.slice(start, end),
			program: styleProgramFromRules(rules, { source: sourceMap }),
		});
	}
	return { matches, residuals };
}

const PANDWIND_TOKEN_GROUPS: ReadonlyArray<readonly [RegExp, string]> = [
	[/color$/i, "colors"],
	[/^(?:background|border|outline|text)Color$/i, "colors"],
	[/^(?:fill|stroke)$/i, "colors"],
	[/radius$/i, "radii"],
	[/^(?:font)?size$/i, "fontSizes"],
	[/^fontWeight$/i, "fontWeights"],
	[/^lineHeight$/i, "lineHeights"],
	[/^letterSpacing$/i, "letterSpacings"],
	[/^fontFamily$/i, "fonts"],
	[/shadow$/i, "shadows"],
	[/^(?:zIndex)$/i, "zIndices"],
	[/^(?:padding|margin|gap|inset)/i, "spacing"],
	[/^(?:width|height|minWidth|maxWidth|minHeight|maxHeight)$/i, "sizes"],
];

function pandwindTokenGroup(property: string): string | undefined {
	return PANDWIND_TOKEN_GROUPS.find(([pattern]) => pattern.test(property))?.[1];
}

function pandwindSourceValue(
	value: StyleValue,
	property: string,
	context: AdapterParseContext,
): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "string") return value;
	if (!value.value.startsWith("$")) return value;
	const group = pandwindTokenGroup(property);
	const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	if (group === undefined || catalog === undefined) return value;
	const reference = value.value
		.slice(1)
		.replace(new RegExp(`^${group}\\.`), "")
		.replaceAll("-", ".");
	const match = catalog.findByReference([group], reference);
	return match === undefined
		? value
		: {
				kind: StyleValueKindTag.Token,
				ref: match.ref,
				authored: value.value,
				resolved: match.resolved,
			};
}

/**
 * Prefer a known Pandwind preset token over repeating its resolved literal.
 * The lookup is property-aware: a color may only recover a color token, not a
 * coincidentally equal spacing token. The resolved value stays on the
 * semantic node so validation still compares CSS meaning; the authored token
 * spelling is what the target source receives. Unknown values remain
 * untouched rather than being guessed.
 */
function preserveKnownPresetTokens(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): StyleProgram {
	const catalog =
		TokenCatalog.fromContract(context?.config.tokenCatalog) ??
		TokenCatalog.fromAnyTokens(context?.meta?.tokens);
	if (catalog === undefined) return program;
	return catalog.preserveProgram(
		program,
		pandwindTokenGroup,
		(match) => `$${match.ref.replaceAll(".", "-")}`,
	);
}

const PANDWIND_TOKEN_POLICY: AdapterTokenPolicy = {
	schema: "pandwind.adapter-token-policy/1",
	preserve: (program, context) => preserveKnownPresetTokens(program, context),
};

function pandwindConfig(context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.Pandwind,
		root: context.root,
		files: [context.file],
		values: {},
	};
}

type PresetModule = Record<string, unknown>;

async function importGeneratedPreset(
	bridgePath: string,
	bridgeSource: string,
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<Record<string, Record<string, unknown>> | undefined> {
	const binding = /\bpreset\s*:\s*([A-Za-z_$][\w$]*)/u.exec(bridgeSource)?.[1];
	if (binding === undefined) return undefined;
	for (const match of bridgeSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/gu)) {
		const imported = match[1]
			?.split(",")
			.map((part) => part.trim().split(/\s+as\s+/u))
			.find((parts) => (parts[1] ?? parts[0]) === binding);
		if (imported === undefined || context.root === undefined) continue;
		const specifier = match[2]!;
		let module: PresetModule | undefined;
		if (specifier.startsWith(".")) {
			const path = joinDocumentPath(dirnameDocumentPath(bridgePath), specifier);
			for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}.js`, `${path}.mjs`]) {
				module = await loader.importFile<PresetModule>(candidate);
				if (module !== undefined) break;
			}
		} else {
			module = await loader.importPackage<PresetModule>(specifier, context.root);
		}
		const preset = module?.[imported[0]!] as { tokens?: unknown } | undefined;
		if (preset?.tokens === null || typeof preset?.tokens !== "object") continue;
		return preset.tokens as Record<string, Record<string, unknown>>;
	}
	return undefined;
}

async function officialPandwindConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = pandwindConfig(context);
	if (context.root === undefined || context.readFile === undefined) return fallback;
	const sourceFile = isAbsoluteDocumentPath(context.file)
		? context.file
		: joinDocumentPath(context.root, context.file);
	const directories: string[] = [];
	let directory = dirnameDocumentPath(sourceFile);
	for (;;) {
		if (!directories.includes(directory)) directories.push(directory);
		if (directory === context.root || directory === "." || directory === "/") break;
		directory = dirnameDocumentPath(directory);
	}
	for (const candidateDirectory of directories) {
		const interopPath = joinDocumentPath(candidateDirectory, "pandwind.interop.json");
		const interopSource = context.readFile(interopPath);
		if (interopSource === undefined) continue;
		try {
			const interop = JSON.parse(interopSource) as {
				generatedFrom?: { bridge?: string };
			};
			const bridgePath = joinDocumentPath(
				candidateDirectory,
				interop.generatedFrom?.bridge ?? "bridge.ts",
			);
			const bridgeSource = context.readFile(bridgePath);
			if (bridgeSource === undefined)
				throw new Error(`generated bridge not found at ${bridgePath}`);
			const tokens = await importGeneratedPreset(bridgePath, bridgeSource, context, loader);
			if (tokens === undefined)
				throw new Error("generated bridge does not expose a loadable preset");
			const tokenCatalog = TokenCatalog.fromNested(tokens)?.contract;
			if (tokenCatalog === undefined)
				throw new Error("generated preset does not contain statically resolvable tokens");
			return {
				...fallback,
				files: [...fallback.files, interopPath, bridgePath],
				tokenCatalog,
				values: {
					pandwindInteropPath: interopPath,
					pandwindBridgePath: bridgePath,
					officialConfigPackage: "pandwind interop artifact",
				},
			};
		} catch (error) {
			return {
				...fallback,
				residuals: [
					{
						kind: StyleProgramResidualKindTag.Configuration,
						text: "Pandwind generated design-system metadata",
						hint: `Pandwind interop loading failed: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
			};
		}
	}
	return fallback;
}

function generatedCssBinding(
	source: string | undefined,
	sourceModules: readonly string[] = [],
	sourceModuleMatchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
): string {
	const input = source ?? "";
	const ownedModules = new Set(sourceModules);
	const cssImports = /\bimport\s+([^;]+?)\s+from\s+["']([^"']+)["']/gu;
	const ownsModule = (moduleSpecifier: string | undefined): boolean =>
		moduleSpecifier !== undefined &&
		(ownedModules.has(moduleSpecifier) ||
			sourceModuleMatchers.some((matcher) => matcher(moduleSpecifier)));
	for (const match of input.matchAll(cssImports)) {
		const clause = match[1]?.trim() ?? "";
		const moduleSpecifier = match[2];
		if (ownsModule(moduleSpecifier)) continue;
		if (/^css\b/u.test(clause) || /\{[^}]*\bcss\b[^}]*\}/u.test(clause)) return "pandwindCss";
	}
	const bindingInput = input.replace(
		cssImports,
		(statement, _clause: string, moduleSpecifier: string) =>
			ownsModule(moduleSpecifier) ? "" : statement,
	);
	for (const candidate of ["css", "pandwindCss", "pwCss"]) {
		const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (
			!new RegExp(`\\b(?:const|let|var|import)\\s+(?:default\\s+)?${escaped}\\b`).test(bindingInput)
		)
			return candidate;
	}
	return "pandwindCss";
}

function renameGeneratedCssBinding(
	emission: { text: string; imports: readonly string[] },
	binding: string,
): { text: string; imports: readonly string[] } {
	if (binding === "css") return emission;
	const rename = (value: string) =>
		value.replace(/\bcss(?=\s*[.({,;}])/g, binding).replace(/\bcss(?=\s*=)/g, binding);
	return { text: rename(emission.text), imports: emission.imports.map(rename) };
}

function hasThemeContextValues(program: StyleProgram, source: string | undefined): boolean {
	if (source === undefined || !source.includes("ThemeProvider")) return false;
	return program.rules.some(
		(rule) =>
			rule.declarations.some((declaration) => {
				if (declaration.value.kind !== StyleValueKindTag.Dynamic) return false;
				const binding = declaration.value.expression.trim();
				if (!/^[A-Za-z_$][\w$]*$/.test(binding)) return false;
				const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				return new RegExp(
					`(?:const|let|var)\\s+${escaped}\\s*=\\s*theme(?:\\.variants)?\\s*\\(`,
				).test(source);
			}) || hasThemeContextValues({ ...program, rules: rule.children }, source),
	);
}

function sourceBindingIsStatic(expression: string, source: string | undefined): boolean {
	if (!/^[A-Za-z_$][\w$]*$/.test(expression) || source === undefined) return false;
	const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const declaration = new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*([^;]+)`).exec(
		source,
	)?.[1];
	if (declaration === undefined || /[`]|=>|\bfunction\b/.test(declaration)) return false;
	const value = declaration.trim();
	return (
		/^(?:["'`]|[-+]?\d|true\b|false\b|null\b|[([{])/.test(value) ||
		/\bregisterSemanticRules\s*\(/.test(value)
	);
}

function isStaticTemplateExpression(expression: string, source?: string): boolean {
	return (
		/^(?:theme|font)\b/.test(expression) ||
		/^rem\s*\(/.test(expression) ||
		/^(?:[-+]?\d|["'`])/.test(expression) ||
		sourceBindingIsStatic(expression, source)
	);
}

function isStaticSubjectExpression(expression: string): boolean {
	return (
		/^[A-Z_$][\w$]*$/.test(expression) ||
		/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[A-Z_$][\w$]*$/.test(expression)
	);
}

function composedBaseClassName(
	subject: string,
	context: AdapterEmitContext | undefined,
): string | undefined {
	const base = componentExpressionForSubject(subject);
	const source = context?.document?.document.source;
	const file = context?.file;
	if (
		base === undefined ||
		!/^[A-Za-z_$][\w$]*$/.test(base) ||
		source === undefined ||
		file === undefined
	)
		return undefined;
	const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*=\\s*styled(?:\\.|\\s*\\()`,
	).test(source)
		? CodemodStyleIdentity.className(file, base)
		: undefined;
}

function isComposedBase(binding: string, context: AdapterEmitContext | undefined): boolean {
	const source = context?.document?.document.source;
	if (source === undefined) return false;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`styled\\s*\\(\\s*${escaped}\\s*\\)`).test(source);
}

/**
 * Styled-components lowers a subject component's base rules to zero
 * specificity before a derived styled component adds its own rules. Keep
 * that cascade contract in the semantic object passed to Pandwind, including
 * dynamic declarations whose values are carried by css.vars().
 */
function lowerComposedBaseProgram(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): StyleProgram {
	if (context?.host?.binding === undefined || !isComposedBase(context.host.binding, context))
		return program;
	const rules = program.rules.map((rule) =>
		rule.kind === StyleRuleKindTag.Style ? { ...rule, selector: ":where(&)" } : rule,
	);
	return {
		...program,
		declarations: [],
		rules: [
			{
				kind: StyleRuleKindTag.Style,
				conditions: [],
				declarations: [],
				children: rules,
				order: -1,
			},
		],
	};
}

function hasUnsafeTemplateDynamic(template: string, source?: string): boolean {
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = SourcePass.matchBlock(template, index + 1);
		if (block === null) continue;
		const expression = block.body.trim();
		if (
			/=>|^function\b/.test(expression) ||
			/^(?:p|props|attrs)\b/.test(expression) ||
			(/^[A-Za-z_$][\w$]*$/.test(expression) &&
				!isStaticTemplateExpression(expression, source) &&
				!isStaticSubjectExpression(expression))
		)
			return true;
		index = block.end - 1;
	}
	return false;
}

function hasComponentSelectorInterpolation(template: string): boolean {
	const isSelectorPosition = (end: number): boolean => {
		for (let index = end; index < template.length; index++) {
			const character = template[index];
			if (character === ";" || character === "}") return false;
			if (character === "{") return true;
		}
		return false;
	};
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = SourcePass.matchBlock(template, index + 1);
		if (block === null) continue;
		if (isSelectorPosition(block.end)) return true;
		index = block.end - 1;
	}
	return false;
}

function cssBlockEnd(source: string, open: number): number | undefined {
	let depth = 1;
	for (let index = open + 1; index < source.length; index++) {
		if (source[index] === "$" && source[index + 1] === "{") {
			const interpolation = SourcePass.matchBlock(source, index + 1);
			if (interpolation !== null) {
				index = interpolation.end - 1;
				continue;
			}
		}
		if (source[index] === '"' || source[index] === "'") {
			const quote = source[index];
			index++;
			while (index < source.length && source[index] !== quote) {
				if (source[index] === "\\") index++;
				index++;
			}
			continue;
		}
		if (source[index] === "{") depth++;
		if (source[index] === "}" && --depth === 0) return index;
	}
	return undefined;
}

function augmentAncestorSelectors(template: string, rootSelector: string): string {
	const isInsideAtRule = (position: number): boolean => {
		const atRuleStack: boolean[] = [];
		let pendingAtRule = false;
		let quote: string | undefined;
		for (let index = 0; index < position; index++) {
			const character = template[index];
			if (quote !== undefined) {
				if (character === "\\") index++;
				else if (character === quote) quote = undefined;
				continue;
			}
			if (character === '"' || character === "'") {
				quote = character;
				continue;
			}
			if (character === "@") {
				pendingAtRule = true;
				continue;
			}
			if (character === "{") {
				atRuleStack.push(pendingAtRule);
				pendingAtRule = false;
				continue;
			}
			if (character === "}") {
				atRuleStack.pop();
				pendingAtRule = false;
				continue;
			}
			if (pendingAtRule && (character === ";" || character === "\n")) pendingAtRule = false;
		}
		return atRuleStack.some(Boolean);
	};
	const lifted: string[] = [];
	const selectorPattern = /((?:\$\{[^{}]+\}|[^\n{}])*&(?:\$\{[^{}]+\}|[^\n{}])*)\s*\{/g;
	for (const match of template.matchAll(selectorPattern)) {
		const selector = match[1]?.trim();
		if (selector === undefined || selector.startsWith("@") || selector.includes("@")) continue;
		if (isInsideAtRule(match.index ?? 0)) continue;
		// The selector may contain a JavaScript interpolation (`${Label}`). Use
		// the trailing brace consumed by the full match rather than searching
		// backwards, which can select the interpolation's opening brace when a
		// parser changes the match boundary.
		const open = (match.index ?? 0) + match[0].length - 1;
		const end = cssBlockEnd(template, open);
		if (end === undefined) continue;
		lifted.push(`${selector.replaceAll("&", rootSelector)}{${template.slice(open + 1, end)}}`);
	}
	return `${rootSelector}{${template}}${lifted.join("")}`;
}

function mapRuntimeProps(program: StyleProgram, parameter = "props"): StyleProgram {
	const expressionWithProps = (expression: string): string => {
		if (!expression.includes("=>") && !/\bfunction\b/.test(expression)) return expression;
		if (!expression.startsWith("`") || !expression.endsWith("`"))
			return /=>|\bfunction\b/.test(expression) ? `(${expression})(${parameter})` : expression;
		let output = "";
		let cursor = 0;
		for (let index = 0; index < expression.length; index++) {
			if (expression[index] !== "$" || expression[index + 1] !== "{") continue;
			const block = SourcePass.matchBlock(expression, index + 1);
			if (block === null) continue;
			output += expression.slice(cursor, index) + "${";
			const value = block.body.trim();
			output += /=>|\bfunction\b/.test(value) ? `(${value})(${parameter})` : value;
			output += "}";
			index = block.end - 1;
			cursor = block.end;
		}
		return output + expression.slice(cursor);
	};
	const declaration = (item: StyleProgram["declarations"][number]) => ({
		...item,
		value:
			item.value.kind === StyleValueKindTag.Dynamic && /=>|\bfunction\b/.test(item.value.expression)
				? { ...item.value, expression: expressionWithProps(item.value.expression) }
				: item.value,
	});
	const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...item,
		declarations: item.declarations.map(declaration),
		children: item.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map(declaration),
		rules: program.rules.map(rule),
	};
}

function mapThemeRuntimeValues(
	program: StyleProgram,
	source: string | undefined,
	parameter = "props",
): StyleProgram {
	const themeBindings = new Set<string>();
	if (source !== undefined) {
		for (const match of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*theme\s*\(/g))
			themeBindings.add(match[1]!);
	}
	const declaration = (item: StyleProgram["declarations"][number]) => {
		if (
			item.value.kind !== StyleValueKindTag.Dynamic ||
			!themeBindings.has(item.value.expression.trim())
		)
			return item;
		const binding = item.value.expression.trim();
		return {
			...item,
			value: {
				...item.value,
				expression: `(typeof ${binding} === "function" ? ${binding}(${parameter}) : ${binding})`,
			},
		};
	};
	const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...item,
		declarations: item.declarations.map(declaration),
		children: item.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map(declaration),
		rules: program.rules.map(rule),
	};
}

function runtimeComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const tag = subject === undefined ? undefined : intrinsicTagForSubject(subject);
	const framework = host?.framework ?? program.source?.framework;
	const componentExpression =
		subject === undefined ? undefined : componentExpressionForSubject(subject);
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const componentAttrs =
		host?.subjectAttrs ??
		(subject === undefined ? undefined : componentAttrsExpressionForSubject(subject));
	if (
		host?.binding === undefined ||
		(componentExpression === undefined && tag === undefined) ||
		framework === undefined
	)
		return undefined;
	const object = programObject(
		mapRuntimeProps(program, framework === BuiltinHostFramework.Vue ? "attrs" : "props"),
	);
	if (framework === BuiltinHostFramework.Vue) {
		return {
			text: `defineComponent({ setup(_props, { attrs, slots }) { const style = computed(() => css.vars(${object})); return () => h(${JSON.stringify(tag)}, { ...attrs, class: [style.value.class, attrs.class], style: [style.value.style, attrs.style] }, slots.default?.()); } })`,
			imports: [
				'import { computed, defineComponent, h } from "vue";',
				'import { createRuntimeCss } from "pandwind/css/runtime";',
				'import { pandwindPreset } from "pandwind/preset";',
				"const css = createRuntimeCss(pandwindPreset);",
			],
		};
	}
	if (
		framework !== BuiltinHostFramework.Solid &&
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact
	)
		return undefined;
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const mergedClass =
		inheritedClass === undefined
			? `cx(style.class, props.${classAttribute})`
			: `composedCx.vars(style, ${JSON.stringify(inheritedClass)}, props.${classAttribute}).class`;
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css }); ";
	if (tag === undefined) {
		const forwardedProps =
			componentAttrs === undefined
				? "{...props}"
				: /=>|\bfunction\b/.test(componentAttrs)
					? `{...(${componentAttrs})(props), ...props}`
					: `{...(${componentAttrs}), ...props}`;
		return {
			text: `(props) => { ${composedCxBinding}const style = css.vars(${object}); const Base = props.as ?? (${componentExpression}); return <Base ${forwardedProps} ${classAttribute}={cx(style.class, props.${classAttribute})} style={{ ...props.style, ...style.style }} />; }`,
			imports: [
				'import { createCx } from "pandwind/cx";',
				"const cx = createCx();",
				'import { createRuntimeCss } from "pandwind/css/runtime";',
				'import { pandwindPreset } from "pandwind/preset";',
				"const css = createRuntimeCss(pandwindPreset);",
			],
		};
	}
	return {
		text: `(props) => { ${composedCxBinding}const style = css.vars(${object}); const Component = props.as ?? ${JSON.stringify(tag)}; const { as: _as, ...rest } = props; const attrs = ${componentAttrs === undefined ? "{}" : /=>|\bfunction\b/.test(componentAttrs) ? `(${componentAttrs})(props)` : `(${componentAttrs})`}; return <Component {...attrs} {...rest} ${classAttribute}={${mergedClass}} style={{ ...props.style, ...style.style }} />; }`,
		imports: [
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { pandwindPreset } from "pandwind/preset";',
			"const css = createRuntimeCss(pandwindPreset);",
		],
	};
}

/**
 * Preserve a styled component's host API without retaining a CSS runtime.
 * Static declarations are emitted through `css.class`; only the component
 * wrapper remains because consumers may import the styled binding from other
 * modules that are outside the current codemod file.
 */
function generatedBinding(source: string | undefined, base: string): string {
	const existing = source ?? "";
	let candidate = base;
	let suffix = 2;
	while (new RegExp(`\\b${candidate}\\b`, "u").test(existing)) {
		candidate = `${base}${suffix}`;
		suffix++;
	}
	return candidate;
}

const PANDWIND_SLOT_MODULE_PATH = "__pandwind/slot.tsx";
const PANDWIND_SLOT_MODULE_CONTENT = `type PandwindSlotProps = Record<string, any> & { as?: any };
type PandwindSlotOptions = {
	readonly defaultComponent: any;
	readonly style: string;
	readonly stableClass: string;
	readonly inheritedClass?: string;
	readonly classAttribute: string;
	readonly attrs: Record<string, any>;
	readonly joinClass: (...values: any[]) => string;
};

export const __pandwindSlot = ({
	defaultComponent,
	style,
	stableClass,
	inheritedClass,
	classAttribute,
	attrs,
	joinClass,
}: PandwindSlotOptions) => {
	const component = (props: PandwindSlotProps) => {
		const Component = props.as ?? defaultComponent;
		const { as: _as, ...rest } = props;
		return <Component {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />;
	};
	component.__pandwindClassName = stableClass;
	return component;
};
`;

function sharedSlotModule(
	context: AdapterEmitContext | undefined,
): { readonly importPath: string; readonly file: AdapterGeneratedFile } | undefined {
	const root = context?.config.root;
	const file = context?.file;
	if (root === undefined || file === undefined) return undefined;
	const projectFile = isAbsoluteDocumentPath(file) ? relativeDocumentPath(root, file) : file;
	let importPath = relativeDocumentPath(
		dirnameDocumentPath(projectFile),
		PANDWIND_SLOT_MODULE_PATH,
	);
	if (!importPath.startsWith(".")) importPath = `./${importPath}`;
	return {
		importPath,
		file: {
			path: PANDWIND_SLOT_MODULE_PATH,
			purpose: "shared static component slot helper",
			content: PANDWIND_SLOT_MODULE_CONTENT,
		},
	};
}

function staticComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
):
	| {
			text: string;
			imports: readonly string[];
			generatedStatements: readonly string[];
			generatedFiles?: readonly AdapterGeneratedFile[];
	  }
	| undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const framework = host?.framework ?? program.source?.framework;
	if (host?.binding === undefined || subject === undefined || framework === undefined)
		return undefined;
	if (
		program.rules.some(function containsDynamic(rule): boolean {
			return (
				rule.declarations.some(
					(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
				) || rule.children.some(containsDynamic)
			);
		})
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid &&
		framework !== BuiltinHostFramework.Vue
	)
		return undefined;
	const tag = intrinsicTagForSubject(subject);
	const base = componentExpressionForSubject(subject);
	if (tag === undefined && base === undefined) return undefined;
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const attrs = host.subjectAttrs ?? componentAttrsExpressionForSubject(subject);
	if (attrs !== undefined && /=>|\bfunction\b/.test(attrs)) return undefined;
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const loweredProgram = lowerComposedBaseProgram(program, context);
	const style =
		inheritedClass === undefined
			? `css.class(${programObject(loweredProgram)})`
			: `css(${programObject(loweredProgram)})`;
	const attrsExpression = attrs === undefined ? "{}" : `(${attrs})`;
	const sourceText = context?.document?.document.source;
	const composedCxBinding =
		inheritedClass === undefined ? undefined : generatedBinding(sourceText, "composedCx");
	const sharedModule = sharedSlotModule(context);
	const slotBinding = generatedBinding(sourceText, "__pandwindSlot");
	const slotHelper =
		sharedModule === undefined
			? `const ${slotBinding} = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, attrs, joinClass }) => { const component = (props) => { const Component = props.as ?? defaultComponent; const { as: _as, ...rest } = props; return <Component {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };`
			: undefined;
	const slotImport =
		sharedModule === undefined
			? []
			: [
					`import { __pandwindSlot${slotBinding === "__pandwindSlot" ? "" : ` as ${slotBinding}`} } from "${sharedModule.importPath}";`,
				];
	if (framework === BuiltinHostFramework.Vue) {
		const tagExpression = tag === undefined ? `(${base})` : JSON.stringify(tag);
		return {
			text: `defineComponent({ setup(_props, { attrs, slots }) { const style = ${style}; return () => h(${tagExpression}, { ...attrs, class: cx(style, attrs.class) }, slots.default?.()); } })`,
			imports: [
				'import { defineComponent, h } from "vue";',
				'import { createCss } from "pandwind/css";',
				'import { createCx } from "pandwind/cx";',
				"const css = createCss();",
				"const cx = createCx();",
			],
			generatedStatements: [],
		};
	}
	const joinClass = composedCxBinding ?? "cx";
	const defaultComponent = tag === undefined ? `(${base})` : JSON.stringify(tag);
	const inheritedClassExpression =
		inheritedClass === undefined ? "undefined" : JSON.stringify(inheritedClass);
	return {
		text: `${slotBinding}({ defaultComponent: ${defaultComponent}, style: ${style}, stableClass: ${JSON.stringify(stableClass)}, inheritedClass: ${inheritedClassExpression}, classAttribute: ${JSON.stringify(classAttribute)}, attrs: ${attrsExpression}, joinClass: ${joinClass} })`,
		imports: [
			'import { createCss } from "pandwind/css";',
			"const css = createCss();",
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			...slotImport,
		],
		generatedStatements: [
			...(slotHelper === undefined ? [] : [slotHelper]),
			...(composedCxBinding === undefined
				? []
				: [`const ${composedCxBinding} = createCx({ css });`]),
		],
		...(sharedModule === undefined ? {} : { generatedFiles: [sharedModule.file] }),
	};
}

function selectProgramDeclarations(
	program: StyleProgram,
	select: (value: StyleProgram["declarations"][number]["value"]) => boolean,
): StyleProgram {
	const selectRule = (
		rule: StyleProgram["rules"][number],
	): StyleProgram["rules"][number] | undefined => {
		const declarations = rule.declarations.filter((declaration) => select(declaration.value));
		const children = rule.children.flatMap((child) => {
			const selected = selectRule(child);
			return selected === undefined ? [] : [selected];
		});
		return declarations.length === 0 && children.length === 0
			? undefined
			: { ...rule, declarations, children };
	};
	return {
		...program,
		declarations: program.declarations.filter((declaration) => select(declaration.value)),
		rules: program.rules.flatMap((rule) => {
			const selected = selectRule(rule);
			return selected === undefined ? [] : [selected];
		}),
		residuals: [],
	};
}

/**
 * Lower a dynamic styled rule to static atoms plus inline custom properties.
 * This is still a runtime value path, but it does not create or inject CSS at
 * runtime; only values that genuinely depend on props/theme stay dynamic.
 */
function hybridComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const framework = host?.framework ?? program.source?.framework;
	const template = program.source?.template;
	if (
		host?.binding === undefined ||
		subject === undefined ||
		framework === undefined ||
		program.residuals.some((residual) => residual.kind === StyleProgramResidualKindTag.Parse) ||
		(template !== undefined && hasComponentSelectorInterpolation(template)) ||
		/\bLiveEditor\b/.test(subject)
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid
	)
		return undefined;
	const tag = intrinsicTagForSubject(subject);
	const base = componentExpressionForSubject(subject);
	if (tag === undefined && base === undefined) return undefined;
	const hasDynamic = program.rules.some(function containsDynamic(rule): boolean {
		return (
			rule.declarations.some(
				(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
			) || rule.children.some(containsDynamic)
		);
	});
	if (!hasDynamic) return undefined;
	const staticProgram = lowerComposedBaseProgram(
		selectProgramDeclarations(program, (value) => value.kind !== StyleValueKindTag.Dynamic),
		context,
	);
	const dynamicProgram = lowerComposedBaseProgram(
		selectProgramDeclarations(program, (value) => value.kind === StyleValueKindTag.Dynamic),
		context,
	);
	const source = context?.document?.document.source;
	const needsThemeContext = hasThemeContextValues(program, source);
	const dynamicObject = programObject(
		mapThemeRuntimeValues(mapRuntimeProps(dynamicProgram, "props"), source, "props"),
	);
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const attrs = host.subjectAttrs ?? componentAttrsExpressionForSubject(subject);
	if (attrs !== undefined && /=>|\bfunction\b/.test(attrs)) return undefined;
	const attrsExpression = attrs === undefined ? "{}" : `(${attrs})`;
	const themeContextAssignment = needsThemeContext
		? "props = { ...props, theme: props.theme ?? usePandwindTheme() };"
		: "";
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const staticClass =
		staticProgram.rules.length === 0
			? '""'
			: inheritedClass === undefined
				? `css.class(${programObject(staticProgram)})`
				: `css(${programObject(staticProgram)})`;
	const mergedClass =
		inheritedClass === undefined
			? `cx(staticClass, dynamic.class, ${JSON.stringify(stableClass)}, props.${classAttribute})`
			: `composedCx.vars(staticClass, dynamic, ${JSON.stringify(inheritedClass)}, ${JSON.stringify(stableClass)}, props.${classAttribute}).class`;
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css }); ";
	return {
		text: `(() => { ${composedCxBinding}const staticClass = ${staticClass}; const component = (props) => { ${themeContextAssignment} const dynamic = css.vars(${dynamicObject}); const Component = props.as ?? ${tag === undefined ? `(${base})` : JSON.stringify(tag)}; const { as: _as, ...rest } = props; const attrs = ${attrsExpression}; return <Component {...attrs} {...rest} ${classAttribute}={${mergedClass}} style={{ ...props.style, ...dynamic.style }} />; }; component.__pandwindClassName = ${JSON.stringify(stableClass)}; return component; })()`,
		imports: [
			'import { createCss } from "pandwind/css";',
			"const css = createCss();",
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			...(needsThemeContext ? ['import { usePandwindTheme } from "pandwind/theme";'] : []),
		],
	};
}

function runtimeKeyframes(program: StyleProgram, context: AdapterEmitContext | undefined): string {
	const rule = program.rules[0]!;
	const name = `pw-kf-${(context?.host?.binding ?? rule.name ?? "animation").replace(
		/[^A-Za-z0-9_-]/g,
		"-",
	)}`;
	const children = rule.children.map(
		(child) =>
			`{ kind: "style", selector: ${JSON.stringify(child.selector ?? "from")}, declarations: [${child.declarations
				.map(
					(declaration) =>
						`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
				)
				.join(", ")}] }`,
	);
	return `(() => { const name = ${JSON.stringify(name)}; css.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [${children.join(", ")}] }]); return name; })()`;
}

function runtimeGlobalRule(rule: StyleProgram["rules"][number], root: boolean): string {
	const kind = root && rule.kind === StyleRuleKindTag.Style ? StyleRuleKindTag.Global : rule.kind;
	const conditions = rule.conditions.map(
		(condition) => condition.raw ?? condition.value ?? condition.name,
	);
	return `{ kind: ${JSON.stringify(kind)}, selector: ${JSON.stringify(rule.selector)}, conditions: ${JSON.stringify(conditions)}, declarations: [${rule.declarations
		.map(
			(declaration) =>
				`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
		)
		.join(", ")}], children: [${rule.children
		.map((child) => runtimeGlobalRule(child, false))
		.join(", ")}] }`;
}

function runtimeGlobalRules(program: StyleProgram): string {
	const rules: StyleProgram["rules"][number][] = [];
	for (const rule of program.rules) {
		if (rule.declarations.length === 0) rules.push(...rule.children);
		else rules.push(rule);
	}
	return rules.map((rule) => runtimeGlobalRule(rule, true)).join(", ");
}

function runtimeGlobalTemplate(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): string | undefined {
	const template = program.source?.template;
	if (template === undefined) return undefined;
	const binding = context?.host?.binding ?? String(program.source?.start ?? "template");
	const file = context?.file ?? "template";
	const id = `pw-global-${CodemodStyleIdentity.className(file, binding)}`;
	return `(css.sheet.register([{ id: ${JSON.stringify(id)}, css: ${runtimeTemplateExpression(template, file)}, priority: 0 }]), null)`;
}

function runtimeTemplateExpression(template: string, file?: string, parameter = "props"): string {
	const pieces: string[] = [];
	let cursor = 0;
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = SourcePass.matchBlock(template, index + 1);
		if (block === null) continue;
		const staticPart = template.slice(cursor, index);
		if (staticPart !== "") pieces.push(JSON.stringify(staticPart));
		const expression = block.body.trim().replace(/\bcss(?:\s*<[^`]*>)?\s*`/g, "`");
		const subject =
			/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([A-Z_$][\w$]*)$/.exec(expression)?.[1] ??
			(/^[A-Z_$][\w$]*$/.test(expression) ? expression : undefined);
		if (subject !== undefined) {
			const fallback =
				file === undefined
					? `.pw-sc-${subject}`
					: `.${CodemodStyleIdentity.className(file, subject)}`;
			pieces.push(
				`(typeof ${subject} !== "undefined" && typeof ${subject}.__pandwindClassName === "string" ? "." + ${subject}.__pandwindClassName : ${JSON.stringify(fallback)})`,
			);
		} else if (/=>|^function\b/.test(expression)) {
			// styled-components omits nullish interpolations. Keeping that
			// invariant matters for SSR parity: String(undefined) would emit an
			// invalid declaration and is observably different from the source.
			const argument = parameter === "undefined" ? "" : parameter;
			pieces.push(`String(((${expression})(${argument})) ?? "")`);
		} else {
			const value = `((${expression}) as unknown)`;
			const argument = parameter === "undefined" ? "" : parameter;
			pieces.push(
				`String((typeof ${value} === "function" ? (${value} as (...args: readonly unknown[]) => unknown)(${argument}) : ${value}) ?? "")`,
			);
		}
		index = block.end - 1;
		cursor = block.end;
	}
	if (cursor < template.length) pieces.push(JSON.stringify(template.slice(cursor)));
	if (pieces.length === 0) return JSON.stringify(template);
	return pieces.join(" + ");
}

function runtimeHostTemplateExpression(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = program.source;
	const template = host?.template;
	if (
		host?.hostOpenTag === undefined ||
		host.hostStyleAttributes === undefined ||
		template === undefined
	)
		return undefined;
	const framework =
		host.framework ??
		context?.document?.framework ??
		(/\.(?:jsx|tsx|mdx)$/.test(context?.file ?? "") ? "react" : undefined);
	const stableClass = CodemodStyleIdentity.className(
		context?.file ?? "host",
		`template-${host.start ?? "0"}`,
	);
	const cssText = `".${stableClass}{" + ${runtimeTemplateExpression(template, context?.file, "undefined")} + "}"`;
	const classExpression = `(() => { const __pandwindCss = ${cssText}; css.sheet.register([{ id: ${JSON.stringify(stableClass)} + ":" + __pandwindCss, css: __pandwindCss, priority: 0 }]); return ${JSON.stringify(stableClass)}; })()`;
	const rendered = JsxStyleHost.render(
		host.hostOpenTag,
		host.hostStyleAttributes,
		classExpression,
		framework,
		undefined,
		host.hostTag,
	);
	return {
		text: rendered.text,
		imports: [
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { pandwindPreset } from "pandwind/preset";',
			"const css = createRuntimeCss(pandwindPreset);",
			...(rendered.needsCx
				? ['import { createCx } from "pandwind/cx";', "const cx = createCx();"]
				: []),
		],
	};
}

function runtimeStaticTemplateExpression(template: string, file?: string, source?: string): string {
	const pieces: string[] = [];
	let cursor = 0;
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = SourcePass.matchBlock(template, index + 1);
		if (block === null) continue;
		const staticPart = template.slice(cursor, index);
		if (staticPart !== "") pieces.push(JSON.stringify(staticPart));
		const expression = block.body.trim();
		const subject =
			/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([A-Z_$][\w$]*)$/.exec(expression)?.[1] ??
			(/^[A-Z_$][\w$]*$/.test(expression) ? expression : undefined);
		const fallback =
			subject === undefined
				? undefined
				: `.${CodemodStyleIdentity.className(file ?? "component", subject)}`;
		pieces.push(
			subject !== undefined
				? JSON.stringify(fallback)
				: isStaticTemplateExpression(expression, source)
					? `String(((${expression})) ?? "")`
					: JSON.stringify(""),
		);
		index = block.end - 1;
		cursor = block.end;
	}
	if (cursor < template.length) pieces.push(JSON.stringify(template.slice(cursor)));
	return pieces.length === 0 ? JSON.stringify(template) : pieces.join(" + ");
}

function runtimeRawComponent(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const tag = subject === undefined ? undefined : intrinsicTagForSubject(subject);
	const base = subject === undefined ? undefined : componentExpressionForSubject(subject);
	const framework = host?.framework ?? program.source?.framework;
	const template = program.source?.template;
	if (
		host?.binding === undefined ||
		(tag === undefined && base === undefined) ||
		framework === undefined ||
		template === undefined
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid
	)
		return undefined;
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const liveEditorHost = /\bLiveEditor\b/.test(host.subject ?? subject ?? "");
	const hostTemplate = liveEditorHost
		? template.replace(/\$\{\s*editorMixin\s*\}/g, "${__pandwindSanitizeHostStyles(editorMixin)}")
		: template;
	const source = context?.document?.document.source;
	// styled-components intentionally gives rules added by a composed base
	// component zero specificity. This lets host element policies (for example
	// `thead th`) remain authoritative while the composed rule still contributes
	// its declarations. The derived component keeps normal specificity.
	const componentBinding = host.binding;
	const baseBinding = componentBinding;
	const composedBase =
		componentBinding !== undefined &&
		source !== undefined &&
		new RegExp(
			`(?:export\\s+)?(?:const|let|var)\\s+${componentBinding}\\s*=\\s*styled\\s*[.(]`,
		).test(source) &&
		new RegExp(
			`styled\\s*\\(\\s*${baseBinding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\)`,
		).test(source);
	const rootSelector = composedBase ? `:where(.${stableClass})` : `.${stableClass}`;
	const normalizedTemplate = augmentAncestorSelectors(hostTemplate, rootSelector);
	const cssText = runtimeTemplateExpression(normalizedTemplate, context?.file);
	const staticCssText = runtimeStaticTemplateExpression(normalizedTemplate, context?.file, source);
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const componentAttrs =
		host?.subjectAttrs ??
		(subject === undefined ? undefined : componentAttrsExpressionForSubject(subject));
	const attrsExpression =
		componentAttrs === undefined
			? "{}"
			: /=>|\bfunction\b/.test(componentAttrs)
				? `(${componentAttrs})(props)`
				: `(${componentAttrs})`;
	if (tag === undefined && base === undefined) return undefined;
	const defaultComponent = tag === undefined ? `(${base})` : JSON.stringify(tag);
	const priority = tag === undefined && base !== undefined ? 2 : 0;
	const dynamic =
		StyleProgramAnalysis.hasFunctionDynamic(program) ||
		hasUnsafeTemplateDynamic(template, source) ||
		hasComponentSelectorInterpolation(template) ||
		liveEditorHost;
	const needsThemeContext = hasThemeContextValues(program, source);
	const dynamicRegistration = `const style = ${cssText}; const className = __pandwindVariantClass(${JSON.stringify(stableClass)}, style); css.sheet.register([{ id: className, css: style.replaceAll(${JSON.stringify(`.${stableClass}`)}, "." + className), priority: ${priority} }]);`;
	const registration = dynamic
		? dynamicRegistration
		: `css.sheet.register([{ id: ${JSON.stringify(stableClass)}, css: ${cssText}, priority: ${priority} }]);`;
	const staticRegistration = dynamic
		? `css.sheet.register([{ id: ${JSON.stringify(stableClass)}, css: ${staticCssText}, priority: ${priority} }]);`
		: "";
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const classExpression = dynamic
		? `cx(className, ${JSON.stringify(stableClass)}${inheritedClass === undefined ? "" : `, ${JSON.stringify(inheritedClass)}`}, props.${classAttribute})`
		: `cx(${JSON.stringify(stableClass)}${inheritedClass === undefined ? "" : `, ${JSON.stringify(inheritedClass)}`}, props.${classAttribute})`;
	const resolvedClassExpression =
		inheritedClass === undefined
			? classExpression
			: classExpression.replace(/^cx\(/, "composedCx(");
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css }); ";
	const render = `const Component = props.as ?? ${defaultComponent}; const { as: _as, ...rest } = props; const attrs = ${attrsExpression}; const element = <Component {...attrs} {...rest} ${classAttribute}={${resolvedClassExpression}} />; return element;`;
	const themeContextAssignment = needsThemeContext
		? "props = { ...props, theme: props.theme ?? usePandwindTheme() };"
		: "";
	const componentFactory = `const component = (props) => { ${themeContextAssignment} ${dynamic ? registration : ""} ${render} }; component.__pandwindClassName = ${JSON.stringify(stableClass)}; return component;`;
	const hostStyleSanitizer = liveEditorHost
		? `const __pandwindSanitizeHostStyles = (value) => { let css = String(value); for (let pass = 0; pass < 8; pass++) css = css.replace(/(?:^|\\n)\\s*[^{}\\n]+\\{[^{}]*\\}/g, ""); return css.replace(/(?:border|border-radius|box-shadow|cursor|min-height|overflow-x|overflow-y|position|white-space):[^;]+;/g, "").replace(/(?:&\\s*)?pre\\s*,\\s*(?:&\\s*)?textarea\\s*\\{[\\s\\S]*?\\}/g, "").replace(/textarea::selection\\s*\\{[\\s\\S]*?\\}/g, "").replace(/(?:^|[\\n}])\\s*\\.token-line\\s*\\{[\\s\\S]*?\\}/g, ""); };`
		: "";
	const variantHelper = dynamic
		? `const __pandwindVariantClass = (base, value) => { let hash = 2166136261; for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return base + "-" + (hash >>> 0).toString(36); };`
		: "";
	return {
		// Static component rules must exist before a framework's SSR insertion
		// hook flushes. Dynamic rules stay in the render closure because their
		// values are a function of the current props.
		text: dynamic
			? `(() => { ${composedCxBinding}${hostStyleSanitizer} ${variantHelper} ${staticRegistration} ${componentFactory} })()`
			: `(() => { ${composedCxBinding}${hostStyleSanitizer} ${registration} ${componentFactory} })()`,
		imports: [
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { pandwindPreset } from "pandwind/preset";',
			"const css = createRuntimeCss(pandwindPreset);",
			...(needsThemeContext ? ['import { usePandwindTheme } from "pandwind/theme";'] : []),
		],
	};
}

function runtimeFontFaces(program: StyleProgram): string {
	const rules = StyleProgramAnalysis.rules(program);
	return rules
		.filter((rule) => rule.kind === StyleRuleKindTag.FontFace)
		.map(
			(rule) =>
				`{ kind: "font-face", declarations: [${rule.declarations
					.map(
						(declaration) =>
							`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
					)
					.join(", ")} ] }`,
		)
		.join(", ");
}

function runtimeGlobalVars(program: StyleProgram): string {
	const declarations = program.rules
		.flatMap((rule) => rule.declarations)
		.map(
			(declaration) =>
				`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
		)
		.join(", ");
	const variableDeclarations =
		program.declarations.length > 0
			? program.declarations.map((declaration) => ({
					name: declaration.property,
					property: declaration.property.startsWith("--")
						? declaration.property
						: `--${declaration.property}`,
				}))
			: program.rules.flatMap((rule) =>
					rule.kind === StyleRuleKindTag.Global
						? rule.declarations
								.filter((declaration) => declaration.property.startsWith("--"))
								.map((declaration) => ({
									name: declaration.property.slice(2),
									property: declaration.property,
								}))
						: [],
				);
	const references = variableDeclarations
		.map(({ name, property }) => `${JSON.stringify(name)}: ${JSON.stringify(`var(${property})`)}`)
		.join(", ");
	return `(css.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [${declarations}] }]), { ${references} })`;
}

function slotRecipeDefinitionObject(
	program: StyleProgram,
	declarationsObject: AdapterRenderers["declarationsObject"],
): string {
	const slots = new Map<string, StyleProgram["declarations"]>();
	const variants = new Map<string, Map<string, Map<string, StyleProgram["declarations"]>>>();
	for (const rule of program.rules) {
		if (rule.kind !== StyleRuleKindTag.Style || rule.name === undefined) continue;
		const base = slots.get(rule.name) ?? [];
		const unconditional = rule.declarations.filter(
			(declaration) => declaration.conditions.length === 0,
		);
		if (unconditional.length > 0) slots.set(rule.name, [...base, ...unconditional]);
		for (const declaration of rule.declarations) {
			const [variant, value] = declaration.conditions;
			if (
				variant?.kind !== SemanticConditionKindTag.Named ||
				value?.kind !== SemanticConditionKindTag.Named
			)
				continue;
			const values = variants.get(variant.name) ?? new Map();
			const slotValues = values.get(value.name) ?? new Map();
			const declarations = slotValues.get(rule.name) ?? [];
			slotValues.set(rule.name, [...declarations, { ...declaration, conditions: [] }]);
			values.set(value.name, slotValues);
			variants.set(variant.name, values);
		}
	}
	const slotNames = program.compositions?.find(
		(composition) => composition.kind === StyleProgramCompositionKind.Slot,
	)?.slots ?? [...slots.keys()];
	const slotsText = slotNames
		.map((name) => `${JSON.stringify(name)}: ${declarationsObject(slots.get(name) ?? [])}`)
		.join(", ");
	const variantsText = [...variants]
		.map(
			([name, values]) =>
				`${JSON.stringify(name)}: { ${[...values]
					.map(
						([value, slotValues]) =>
							`${JSON.stringify(value)}: { ${[...slotValues]
								.map(
									([slot, declarations]) =>
										`${JSON.stringify(slot)}: ${declarationsObject(declarations)}`,
								)
								.join(", ")} }`,
					)
					.join(", ")} }`,
		)
		.join(", ");
	return `{ slots: { ${slotsText} }, slotVariants: { ${variantsText} } }`;
}

function pandwindRecipeReferences(
	context: AdapterParseContext,
	imported: "createRecipe" | "createSlotRecipe",
): readonly string[] {
	const bindings = context.bindings?.fromModule("pandwind/recipe");
	if (bindings !== undefined) {
		return bindings
			.filter((binding) => binding.importedName === imported)
			.map((binding) =>
				binding.kind === SourceBindingKind.Namespace
					? `${binding.localName}.${imported}`
					: binding.localName,
			)
			.filter((reference, index, all) => all.indexOf(reference) === index);
	}
	const references = new Set<string>();
	const moduleSource = "pandwind/recipe".replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const namedImport = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${moduleSource}["']`, "g");
	for (const match of context.source.matchAll(namedImport)) {
		for (const specifier of (match[1] ?? "").split(",")) {
			const parts = specifier.trim().split(/\s+as\s+/u);
			if (parts[0] === imported) references.add(parts[1] ?? parts[0]);
		}
	}
	const namespaceImport = new RegExp(
		`import\\s*\\*\\s*as\\s+([A-Za-z_$][\\w$]*)\\s*from\\s*["']${moduleSource}["']`,
		"g",
	);
	for (const match of context.source.matchAll(namespaceImport)) {
		if (match[1] !== undefined) references.add(`${match[1]}.${imported}`);
	}
	return [...references];
}

function pandwindRecipeMatches(
	source: string,
	context: AdapterParseContext,
	imported: "createRecipe" | "createSlotRecipe",
	pattern: CodemodPatternId,
): AdapterParseResult {
	const references = pandwindRecipeReferences(context, imported);
	if (references.length === 0) return { matches: [], residuals: [] };
	const escaped = references.map((reference) => reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const callPattern = new RegExp(
		`\\b(?:${escaped.join("|")})\\s*\\(\\s*[A-Za-z_$][\\w$]*\\s*,\\s*\\{`,
		"gu",
	);
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: Array<AdapterParseResult["residuals"][number]> = [];
	const isExcluded = context.document?.isExcluded ?? (() => false);
	for (const match of source.matchAll(callPattern)) {
		const start = match.index ?? 0;
		if (isExcluded(start)) continue;
		const reference = match[0].match(
			/(?:^|\s)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/u,
		)?.[1];
		const localName = reference?.split(".")[0];
		if (localName !== undefined && context.bindings?.isShadowedAt(localName, start) === true)
			continue;
		const objectOpen = start + match[0].lastIndexOf("{");
		const object = SourcePass.matchBlock(source, objectOpen);
		if (object === null) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(start),
				hint: `${imported} recipe object is unbalanced`,
			});
			continue;
		}
		const closing = /^\s*\)/u.exec(source.slice(object.end));
		if (closing === null) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(start, object.end),
				hint: `${imported} recipe call is unbalanced`,
			});
			continue;
		}
		const end = object.end + closing[0].length;
		const sourceOptions = {
			source: {
				file: context.file,
				start,
				end,
				adapter: CodemodAdapterId.Pandwind,
				pattern,
				...(context.document?.framework ? { framework: context.document.framework } : {}),
				...context.semantic?.source,
			},
			sourceOffset: objectOpen + 1,
			...(context.semantic?.themes ? { themes: context.semantic.themes } : {}),
			...(context.semantic?.compositions ? { compositions: context.semantic.compositions } : {}),
			...(context.semantic?.runtime ? { runtime: context.semantic.runtime } : {}),
			...(context.semantic?.plugins ? { plugins: context.semantic.plugins } : {}),
			...(imported === "createRecipe"
				? recipeSourceObjectOptions()
				: pandwindSlotRecipeSourceObjectOptions()),
		};
		let program = styleProgramFromSourceObject(object.body, sourceOptions);
		program =
			imported === "createRecipe"
				? preserveUnsupportedRecipeFields(program)
				: captureSlotRecipeSlots(preserveUnsupportedSlotRecipeFields(program), source);
		matches.push({ start, end, program, sourceText: source.slice(start, end) });
	}
	return { matches, residuals };
}

export interface PandwindAdapterOptions {
	readonly moduleLoader?: ProjectModuleLoader | null;
}

export function createPandwindAdapter(options: PandwindAdapterOptions = {}) {
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	const adapter = defineCodemodAdapter({
		id: CodemodAdapterId.Pandwind,
		officialApi: {
			pluginSystems: ["presets", "bridge", "splitByRoute"],
			compilerIntegrations: ["pandwind/vite", "pandwind/unplugin"],
			ssrHooks: ["createRuntimeCss", "renderToString"],
		},
		patterns: [
			{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g },
			{ name: "css-vars", regex: /\bcss\.vars\s*\(\s*\{/g },
			{ name: "css-group", regex: /\bcss\.group\s*\(\s*\{/g, objectKind: "named" },
		],
		packages: CodemodAdapterKit.dependency("pandwind", "runtime"),
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Pandwind, "exact", {
			"named-conditions": "exact",
			"named-rules": "exact",
			"function-values": "exact",
			"theme-context": "exact",
			"framework-semantics": "exact",
			composition: "exact",
			recipes: "exact",
			components: "exact",
		}),
		namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
		preserveNamedRules: (context) =>
			context.sourceModules?.includes("style9") === true ||
			context.sourceModules?.includes("styled-system/css") === true,
		detectPatterns: [
			/\bcss\.class\s*\(/,
			/\bcreateCss\s*\(/,
			/\bcreateRuntimeCss\s*\(/,
			/\b(?:createRecipe|createSlotRecipe)\s*\(/,
			/\bcss\.sheet\.registerSemanticRules\s*\(/,
		],
		sourceModules: ["pandwind/css", "pandwind/css/runtime", "pandwind/recipe"],
		configFiles: ["pandwind.config.ts", "pandwind.interop.json", "bridge.ts", "package.json"],
		loadConfig: pandwindConfig,
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialPandwindConfig(context, moduleLoader),
				}),
		tokenPolicy: PANDWIND_TOKEN_POLICY,
		sourceObjectOptions: (_source, context) => ({
			valueTransforms: {
				"*": (value, property) => pandwindSourceValue(value, property ?? "", context),
			},
		}),
		migration: {
			targetPolicy: PANDWIND_TARGET_POLICY,
			rewrite: ({ code, targetId, complete }) => {
				if (targetId === CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
				if (!/\bconst\s+css\s*=\s*createRuntimeCss\(\s*pandwindPreset\s*\)/u.test(code))
					return { code, residuals: [] };
				return {
					code: code
						.replace(
							/import\s*\{\s*pandwindPreset\s*\}\s*from\s*["']pandwind\/preset["'];?\s*/gu,
							"",
						)
						.replace(/\bconst\s+css\s*=\s*createRuntimeCss\(\s*pandwindPreset\s*\);?\s*/gu, ""),
					residuals: [],
				};
			},
		},
		emit(program, { programObject, declarationsObject }, context) {
			const cssBinding = generatedCssBinding(
				context?.document?.document.source,
				context?.sourceModules,
				context?.sourceModuleMatchers,
			);
			const hasFunctionDynamic = program.rules.some(function containsFunction(rule): boolean {
				return (
					rule.declarations.some(
						(declaration) =>
							declaration.value.kind === StyleValueKindTag.Dynamic &&
							/=>|^function\b/.test(declaration.value.expression.trim()),
					) || rule.children.some(containsFunction)
				);
			});
			const outputProgram = preserveKnownPresetTokens(program, context);
			const renderProgramObject = (value: StyleProgram): string =>
				programObject(preserveKnownPresetTokens(value, context));
			const finalize = (emission: {
				text: string;
				imports: readonly string[];
				generatedStatements?: readonly string[];
				generatedFiles?: readonly AdapterGeneratedFile[];
			}) => ({
				...renameGeneratedCssBinding(emission, cssBinding),
				...(emission.generatedStatements === undefined
					? {}
					: { generatedStatements: emission.generatedStatements }),
				...(emission.generatedFiles === undefined
					? {}
					: { generatedFiles: emission.generatedFiles }),
				// The target object syntax is intentionally a projection of the
				// versioned program. Keep the program attached for validation and
				// downstream tools so nested conditions, rule kinds, and provenance are
				// never inferred back from generated JavaScript.
				semantic: outputProgram,
			});
			if (
				program.source?.pattern === CodemodPatternId.CssTemplate &&
				program.source.hostOpenTag === undefined
			) {
				const hasStaticContent = program.rules.some(function hasContent(rule): boolean {
					return rule.declarations.length > 0 || rule.children.some(hasContent);
				});
				if (
					hasStaticContent &&
					program.residuals.length === 0 &&
					!program.rules.some(function containsDynamic(rule): boolean {
						return (
							rule.declarations.some(
								(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
							) || rule.children.some(containsDynamic)
						);
					})
				) {
					return finalize({
						text: `css.class(${renderProgramObject(outputProgram)})`,
						imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
					});
				}
				return finalize({
					text: `cssTemplate\`${program.source.template ?? ""}\``,
					imports: [],
				});
			}
			if (program.emissionHints?.includes(StyleProgramEmissionHint.GlobalVariables)) {
				return finalize({
					text: runtimeGlobalVars(outputProgram),
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { pandwindPreset } from "pandwind/preset";',
						"const css = createRuntimeCss(pandwindPreset);",
					],
				});
			}
			if (program.rules.some((rule) => rule.kind === StyleRuleKindTag.Global)) {
				const register = `css.sheet.registerSemanticRules([${runtimeGlobalRules(outputProgram)}])`;
				const immediate =
					program.source?.adapter === CodemodAdapterId.VanillaExtract &&
					program.source.pattern === CodemodPatternId.VanillaExtractGlobalStyle;
				const template =
					program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true
						? runtimeGlobalTemplate(program, context)
						: undefined;
				return finalize({
					text:
						template === undefined
							? immediate
								? `(${register}, null)`
								: `() => (${register}, null)`
							: `() => ${template}`,
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { pandwindPreset } from "pandwind/preset";',
						"const css = createRuntimeCss(pandwindPreset);",
					],
				});
			}
			if (
				context?.host?.representation === StyleHostRepresentationKind.Component &&
				program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true
			) {
				const component = runtimeRawComponent(program, context);
				if (component !== undefined) return finalize(component);
			}
			if (context?.host?.representation === StyleHostRepresentationKind.Component) {
				const component = staticComponent(outputProgram, renderProgramObject, context);
				if (component !== undefined) return finalize(component);
				const hybrid = hybridComponent(outputProgram, renderProgramObject, context);
				if (hybrid !== undefined) return finalize(hybrid);
			}
			const host = program.source;
			if (host?.hostOpenTag !== undefined && host.hostStyleAttributes !== undefined) {
				const runtimeHost =
					host.template !== undefined && hasComponentSelectorInterpolation(host.template)
						? runtimeHostTemplateExpression(program, context)
						: undefined;
				if (runtimeHost !== undefined) return finalize(runtimeHost);
				const framework =
					host.framework ??
					context?.document?.framework ??
					(/\.(?:jsx|tsx|mdx)$/.test(context?.file ?? "") ? "react" : undefined);
				const dynamicHost = StyleProgramAnalysis.hasDynamic(program);
				const programObjectText = renderProgramObject(
					hasFunctionDynamic ? mapRuntimeProps(outputProgram, "undefined") : outputProgram,
				);
				const rendered = JsxStyleHost.render(
					host.hostOpenTag,
					host.hostStyleAttributes,
					dynamicHost ? `css.vars(${programObjectText}).class` : `css.class(${programObjectText})`,
					framework,
					dynamicHost ? `css.vars(${programObjectText}).style` : undefined,
					host.hostTag,
				);
				return finalize({
					text: rendered.text,
					imports: [
						dynamicHost
							? 'import { createRuntimeCss } from "pandwind/css/runtime";'
							: 'import { createCss } from "pandwind/css";',
						...(dynamicHost ? ['import { pandwindPreset } from "pandwind/preset";'] : []),
						dynamicHost
							? "const css = createRuntimeCss(pandwindPreset);"
							: "const css = createCss();",
						...(rendered.needsCx
							? ['import { createCx } from "pandwind/cx";', "const cx = createCx();"]
							: []),
					],
				});
			}
			const kind = program.rules[0]?.kind;
			const stylexDynamicGroup =
				program.source?.adapter === CodemodAdapterId.StyleX &&
				program.source.pattern === CodemodPatternId.StyleXCreate;
			if (
				(context?.host?.representation === StyleHostRepresentationKind.Component ||
					hasFunctionDynamic) &&
				!stylexDynamicGroup
			) {
				const component = runtimeComponent(outputProgram, renderProgramObject, context);
				if (component !== undefined) return finalize(component);
			}
			const hasFontFaces = program.rules.some(function containsFontFace(
				rule: StyleProgram["rules"][number],
			): boolean {
				return rule.kind === StyleRuleKindTag.FontFace || rule.children.some(containsFontFace);
			});
			if (hasFontFaces) {
				const withoutFontFaces = (
					rule: StyleProgram["rules"][number],
				): StyleProgram["rules"][number] => ({
					...rule,
					children: rule.children
						.filter((child) => child.kind !== StyleRuleKindTag.FontFace)
						.map(withoutFontFaces),
				});
				const styleProgram = {
					...program,
					rules: program.rules
						.filter((rule) => rule.kind !== StyleRuleKindTag.FontFace)
						.map(withoutFontFaces),
				};
				return finalize({
					text: `(css.sheet.registerSemanticRules([${runtimeFontFaces(outputProgram)}]), css.group(${renderProgramObject(styleProgram)}))`,
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { pandwindPreset } from "pandwind/preset";',
						"const css = createRuntimeCss(pandwindPreset);",
					],
				});
			}
			if (kind === StyleRuleKindTag.Keyframes)
				return finalize({
					text: runtimeKeyframes(outputProgram, context),
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { pandwindPreset } from "pandwind/preset";',
						"const css = createRuntimeCss(pandwindPreset);",
					],
				});
			const named =
				program.rules.some((rule) => rule.name !== undefined) ||
				program.declarations.some((declaration) =>
					declaration.conditions.some(
						(condition) => condition.kind === SemanticConditionKindTag.Named,
					),
				);
			const dynamic = program.rules.some(function containsDynamic(rule): boolean {
				return (
					rule.declarations.some(
						(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
					) || rule.children.some(containsDynamic)
				);
			});
			const runtimeStandalone =
				dynamic &&
				(kind === StyleRuleKindTag.Style || kind === undefined) &&
				program.emissionHints?.includes(StyleProgramEmissionHint.RuntimeClass) === true;
			const functionDynamic = program.rules.some(function containsFunction(rule): boolean {
				return (
					rule.declarations.some(
						(declaration) =>
							declaration.value.kind === StyleValueKindTag.Dynamic &&
							/=>|^function\b/.test(declaration.value.expression.trim()),
					) || rule.children.some(containsFunction)
				);
			});
			const recipeVariants =
				program.compositions?.some(
					(composition) => composition.kind === StyleProgramCompositionKind.Recipe,
				) === true;
			const slotRecipe =
				program.compositions?.some(
					(composition) => composition.kind === StyleProgramCompositionKind.Slot,
				) === true;
			const needsRuntimeCss =
				!stylexDynamicGroup &&
				(program.emissionHints?.includes(StyleProgramEmissionHint.RuntimeFunction) === true ||
					runtimeStandalone ||
					functionDynamic);
			const hostUsesClassCarrier =
				dynamic &&
				program.source?.hostStyleAttributes?.some((attribute) =>
					/\b(?:className|class)\s*=\s*/u.test(attribute),
				);
			const dynamicEmission = hostUsesClassCarrier
				? `css.vars(${renderProgramObject(outputProgram)}).class`
				: `css.vars(${renderProgramObject(outputProgram)})`;
			if (program.source?.pattern === CodemodPatternId.TokenamiCompose)
				return finalize({
					text: `() => { const className = ${cssBinding}.class(${renderProgramObject(outputProgram)}); return [(value: string | undefined) => pandwindCx(className, value), (style: Record<string, unknown> | undefined) => style ?? {}] as const; }`,
					imports: [
						'import { createCss } from "pandwind/css";',
						`const ${cssBinding} = createCss();`,
						'import { createCx } from "pandwind/cx";',
						"const pandwindCx = createCx();",
					],
				});
			return finalize({
				text: slotRecipe
					? `createSlotRecipe(css, ${slotRecipeDefinitionObject(outputProgram, declarationsObject)})`
					: recipeVariants
						? `createRecipe(css, ${recipeDefinitionObject(outputProgram, declarationsObject)})`
						: named
							? `css.group(${renderProgramObject(outputProgram)})`
							: functionDynamic
								? `css.group(${renderProgramObject(outputProgram)})`
								: runtimeStandalone
									? `css.class(${renderProgramObject(outputProgram)})`
									: dynamic
										? dynamicEmission
										: `css.class(${renderProgramObject(outputProgram)})`,
				imports: slotRecipe
					? [
							'import { createCss } from "pandwind/css";',
							'import { createSlotRecipe } from "pandwind/recipe";',
							"const css = createCss();",
						]
					: recipeVariants
						? [
								'import { createCss } from "pandwind/css";',
								'import { createRecipe } from "pandwind/recipe";',
								"const css = createCss();",
							]
						: needsRuntimeCss
							? [
									'import { createRuntimeCss } from "pandwind/css/runtime";',
									'import { pandwindPreset } from "pandwind/preset";',
									"const css = createRuntimeCss(pandwindPreset);",
								]
							: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
			});
		},
	});
	return {
		...adapter,
		parse(source: string, context: AdapterParseContext) {
			const parsed = adapter.parse(source, context);
			const recipe = pandwindRecipeMatches(
				source,
				context,
				"createRecipe",
				CodemodPatternId.PandwindRecipe,
			);
			const slotRecipe = pandwindRecipeMatches(
				source,
				context,
				"createSlotRecipe",
				CodemodPatternId.PandwindSlotRecipe,
			);
			const runtime = runtimeSemanticRuleMatches(source, context);
			return {
				matches: [
					...parsed.matches,
					...recipe.matches,
					...slotRecipe.matches,
					...runtime.matches,
				].toSorted((a, b) => a.start - b.start),
				residuals: [
					...parsed.residuals,
					...recipe.residuals,
					...slotRecipe.residuals,
					...runtime.residuals,
				],
			};
		},
	};
}
