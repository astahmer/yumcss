import {
	ADAPTER_CONTRACT_SCHEMA,
	type AdapterConfigContext,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterProjectConfig,
	type AdapterValidationResult,
	type StyleAdapter,
} from "../adapter-contract.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../capabilities.ts";
import {
	styleProgramFromRules,
	styleProgramToCanonicalCss,
	type StyleCondition,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
import { CodemodAdapterId, StyleHostRepresentationKind } from "../identifiers.ts";
import { NODE_PROJECT_MODULE_LOADER, type ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";

export interface TailwindDeclaration {
	readonly prop: string;
	readonly value: string;
}

export interface TailwindUtilityResolver {
	resolve(token: string): readonly StyleDeclaration[] | undefined;
}

export interface TailwindAdapterOptions {
	readonly resolver?: TailwindUtilityResolver;
	readonly moduleLoader?: ProjectModuleLoader | null;
}

const literal = (property: string, value: string | number): StyleDeclaration => ({
	conditions: [],
	property,
	value: { kind: "literal", value },
});

const cssProperty = (value: string): string =>
	value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

const condition = (prefix: string): StyleCondition => {
	if (["hover", "focus", "active", "visited", "disabled", "checked"].includes(prefix))
		return { kind: "pseudo", name: prefix };
	return { kind: "named", name: prefix };
};

const BASIC_UTILITIES: Readonly<Record<string, readonly StyleDeclaration[]>> = {
	block: [literal("display", "block")],
	flex: [literal("display", "flex")],
	"inline-flex": [literal("display", "inline-flex")],
	"flex-col": [literal("flexDirection", "column")],
	"items-center": [literal("alignItems", "center")],
	"items-start": [literal("alignItems", "flex-start")],
	"justify-center": [literal("justifyContent", "center")],
	"justify-between": [literal("justifyContent", "space-between")],
	"text-center": [literal("textAlign", "center")],
	"font-semibold": [literal("fontWeight", 600)],
	"min-h-screen": [literal("minHeight", "100vh")],
	"w-full": [literal("width", "100%")],
	"max-w-3xl": [literal("maxWidth", "48rem")],
	"gap-4": [literal("gap", "1rem")],
	"gap-6": [literal("gap", "1.5rem")],
	"p-4": [literal("padding", "1rem")],
	"px-4": [literal("paddingInline", "1rem")],
	"py-4": [literal("paddingBlock", "1rem")],
	"rounded-full": [literal("borderRadius", "9999px")],
	"bg-white": [literal("backgroundColor", "#fff")],
	"bg-black": [literal("backgroundColor", "#000")],
	"text-black": [literal("color", "#000")],
	"text-white": [literal("color", "#fff")],
	"text-zinc-600": [literal("color", "#52525b")],
};

function arbitraryUtility(
	value: string,
	prefixes: readonly string[],
): readonly StyleDeclaration[] | undefined {
	const match = /^\[([^:]+):(.+)\]$/u.exec(value);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return [
		{
			...literal(cssProperty(match[1]), match[2].replaceAll("_", " ")),
			conditions: prefixes.map(condition),
		},
	];
}

function defaultResolve(token: string): readonly StyleDeclaration[] | undefined {
	const prefixes = token.split(":");
	const utility = prefixes.pop();
	if (utility === undefined) return undefined;
	const known = BASIC_UTILITIES[utility];
	if (known !== undefined)
		return known.map((declaration) => ({
			...declaration,
			conditions: [...prefixes.map(condition), ...declaration.conditions],
		}));
	return arbitraryUtility(utility, prefixes);
}

function openingTagForAttribute(
	source: string,
	attributeStart: number,
): { readonly start: number; readonly end: number; readonly text: string } | undefined {
	const start = source.lastIndexOf("<", attributeStart);
	if (start < 0) return undefined;
	let quote: string | undefined;
	let braces = 0;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{") {
			braces++;
			continue;
		}
		if (character === "}" && braces > 0) {
			braces--;
			continue;
		}
		if (character === ">" && braces === 0)
			return { start, end: index + 1, text: source.slice(start, index + 1) };
	}
	return undefined;
}

function staticClassAttributes(source: string): readonly RegExpExecArray[] {
	return [...source.matchAll(/\b(className|class)\s*=\s*(["'])([^"']*)\2/g)];
}

function parseTailwind(
	source: string,
	context: AdapterParseContext,
	resolver: TailwindUtilityResolver,
): AdapterParseResult {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [...(context.config.residuals ?? [])];
	const excluded = context.document?.isExcluded ?? (() => false);
	for (const attribute of staticClassAttributes(source)) {
		const attributeStart = attribute.index ?? 0;
		if (excluded(attributeStart)) continue;
		const name = attribute[1];
		const value = attribute[3] ?? "";
		const openingTag = openingTagForAttribute(source, attributeStart);
		if (name === undefined || openingTag === undefined || value.trim() === "") continue;
		const declarations: StyleDeclaration[] = [];
		const unknown: string[] = [];
		for (const token of value.split(/\s+/u).filter(Boolean)) {
			const resolved = resolver.resolve(token);
			if (resolved === undefined) unknown.push(token);
			else declarations.push(...resolved);
		}
		const program = styleProgramFromRules(
			[
				{
					kind: "style",
					conditions: [],
					declarations,
					children: [],
					order: 0,
				},
			],
			{
				source: {
					file: context.file,
					start: openingTag.start,
					end: openingTag.end,
					adapter: CodemodAdapterId.Tailwind,
					framework: context.document?.framework,
					hostAttribute: name,
					hostOpenTag: openingTag.text,
					hostStyleAttributes: [attribute[0]!],
				},
				residuals: unknown.map((token) => ({
					kind: "unknown-utility",
					text: token,
					hint: "Tailwind utility requires the project engine or a custom preset",
				})),
			},
		);
		matches.push({
			start: openingTag.start,
			end: openingTag.end,
			program,
			sourceText: openingTag.text,
		});
	}
	return { matches, residuals };
}

function utilityValue(value: string | number | boolean): string {
	return String(value).replaceAll(" ", "_").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function utilityCondition(conditionValue: StyleCondition): string {
	if (conditionValue.kind === "pseudo") return `${conditionValue.name}:`;
	if (conditionValue.kind === "selector") {
		const selector = conditionValue.value ?? conditionValue.name;
		return `[&${selector.startsWith("&") ? selector.slice(1) : selector}]:`;
	}
	return `${conditionValue.name}:`;
}

function emitTailwind(program: StyleProgram): {
	text: string;
	residuals: readonly StyleProgramResidual[];
} {
	const residuals: StyleProgramResidual[] = [];
	const declarations = program.rules.flatMap(function collect(rule): StyleDeclaration[] {
		if (rule.kind !== "style") {
			residuals.push({
				kind: "rule-level",
				text: rule.kind,
				hint: "Tailwind class output supports style declarations and nested conditions only",
			});
		}
		return [...rule.declarations, ...rule.children.flatMap(collect)];
	});
	const tokens: string[] = [];
	for (const declaration of declarations) {
		if (declaration.value.kind !== "literal") {
			residuals.push({
				kind: "dynamic",
				text: declaration.property,
				hint: "Tailwind output requires a literal declaration or a host runtime carrier",
			});
			continue;
		}
		const prefix = declaration.conditions.map(utilityCondition).join("");
		tokens.push(
			`${prefix}[${declaration.property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${utilityValue(declaration.value.value)}]`,
		);
	}
	return { text: JSON.stringify([...new Set(tokens)].join(" ")), residuals };
}

function config(context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.Tailwind,
		root: context.root,
		files: [],
		values: {},
	};
}

type TailwindEnginePackage = {
	__unstable__loadDesignSystem?: (
		css: string,
		options: { readonly base: string },
	) => Promise<{
		candidatesToCss(candidates: readonly string[]): readonly (string | null)[];
	}>;
};

function parseEngineCss(css: string): readonly StyleDeclaration[] | undefined {
	const body = css.slice(css.indexOf("{") + 1, css.lastIndexOf("}"));
	if (body === css || body.trim() === "") return undefined;
	const declarations: StyleDeclaration[] = [];
	for (const statement of body.split(";")) {
		const separator = statement.indexOf(":");
		if (separator <= 0) continue;
		const property = statement.slice(0, separator).trim();
		const value = statement.slice(separator + 1).trim();
		if (property !== "" && value !== "") declarations.push(literal(cssProperty(property), value));
	}
	return declarations.length === 0 ? undefined : declarations;
}

async function officialConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = config(context);
	if (context.root === undefined || context.readFile === undefined) return fallback;
	const module = await loader.importPackage<TailwindEnginePackage>(
		"@tailwindcss/node",
		context.root,
	);
	if (module?.__unstable__loadDesignSystem === undefined) return fallback;
	const cssFile = ["tailwind.css", "src/app/globals.css", "app/globals.css", "styles/globals.css"]
		.map((file) => ({ file, text: context.readFile?.(joinDocumentPath(context.root!, file)) }))
		.find((candidate) => candidate.text !== undefined);
	if (cssFile?.text === undefined) return fallback;
	try {
		const system = await module.__unstable__loadDesignSystem(cssFile.text, { base: context.root });
		const resolver: TailwindUtilityResolver = {
			resolve(token) {
				const result = parseEngineCss(system.candidatesToCss([token])[0] ?? "");
				return result?.map((declaration) => ({
					...declaration,
					conditions: token.split(":").slice(0, -1).map(condition),
				}));
			},
		};
		return {
			...fallback,
			files: [joinDocumentPath(context.root, cssFile.file)],
			values: {
				...fallback.values,
				tailwindResolver: resolver,
				officialConfigPackages: ["@tailwindcss/node"],
			},
		};
	} catch (error) {
		return {
			...fallback,
			residuals: [
				{
					kind: "configuration",
					text: "Tailwind project configuration",
					hint: `official Tailwind config loading failed: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
		};
	}
}

export function createTailwindAdapter(options: TailwindAdapterOptions = {}): StyleAdapter {
	const fallbackResolver = options.resolver ?? { resolve: defaultResolve };
	const moduleLoader =
		options.moduleLoader === null
			? undefined
			: (options.moduleLoader ?? NODE_PROJECT_MODULE_LOADER);
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: CodemodAdapterId.Tailwind,
		version: "2",
		sourceModules: ["tailwindcss", "@tailwindcss/node"],
		dependencies: { packages: [{ name: "tailwindcss", kind: "development" }] },
		capabilities: {
			schema: ADAPTER_CAPABILITIES_SCHEMA,
			adapter: CodemodAdapterId.Tailwind,
			version: "1",
			capabilities: {
				declarations: "exact",
				"token-values": "partial",
				"rule-level": "partial",
				selectors: "exact",
				nesting: "exact",
				ordering: "partial",
				"pseudo-conditions": "exact",
				"media-conditions": "exact",
				"container-conditions": "exact",
				"supports-conditions": "exact",
				"dynamic-values": "unsupported",
				"function-values": "unsupported",
				"framework-semantics": "exact",
				components: "unsupported",
				"global-rules": "unsupported",
				keyframes: "unsupported",
				"font-face": "unsupported",
				layers: "unsupported",
				"supports-rules": "unsupported",
				"property-rules": "unsupported",
			},
		},
		detect: (context) => {
			const matched = staticClassAttributes(context.source).length > 0;
			const configured = /(?:tailwindcss|@tailwindcss\/)/u.test(context.source);
			return {
				matched,
				confidence: matched ? (configured ? 1 : 0.6) : 0,
				evidence: matched ? [configured ? "tailwind-package" : "literal-class-attribute"] : [],
			};
		},
		loadConfig: (context) => config(context),
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) => officialConfig(context, moduleLoader),
				}),
		parse: (source, context) =>
			parseTailwind(
				source,
				context,
				(context.config.values.tailwindResolver as TailwindUtilityResolver | undefined) ??
					fallbackResolver,
			),
		emit: (program) => {
			const emitted = emitTailwind(program);
			return { ...emitted, semantic: program };
		},
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				hostRepresentation: StyleHostRepresentationKind.Class,
				standaloneHostRepresentation: StyleHostRepresentationKind.Class,
			},
		},
		validate: (source, target, residuals = []): AdapterValidationResult => {
			const canonicalSource = styleProgramToCanonicalCss(source);
			const canonicalTarget = styleProgramToCanonicalCss(target);
			const differences =
				canonicalSource === canonicalTarget && residuals.length === 0
					? []
					: ["canonical CSS differs or has residuals"];
			return {
				valid: differences.length === 0,
				lossiness:
					canonicalSource !== canonicalTarget
						? "unsupported"
						: residuals.length > 0
							? "lossy"
							: "lossless",
				canonicalSource,
				canonicalTarget,
				differences,
				residuals,
			};
		},
	};
}

export default createTailwindAdapter({ moduleLoader: null });
