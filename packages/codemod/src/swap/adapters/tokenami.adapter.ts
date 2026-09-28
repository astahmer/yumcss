import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type AdapterSourceObjectOptions,
} from "../external-adapters.ts";
import type {
	AdapterComponentRewriteContext,
	AdapterComponentRewriteResult,
	AdapterConfigContext,
	AdapterEmitContext,
	AdapterHostRewriteContext,
	AdapterProjectConfig,
	AdapterParseContext,
} from "../adapter-contract.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type {
	StyleCondition,
	StyleDeclaration,
	StyleProgram,
	StyleProgramResidual,
	StyleValue,
} from "../semantic-ir.ts";
import {
	SemanticConditionKindTag,
	StyleConditionOperatorTag,
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
} from "../semantic-ir.ts";
import {
	CodemodAdapterId,
	CodemodPatternId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import { createTokenPolicy, TokenCatalog } from "../tokens.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { componentAttrsValueExpression } from "../host-component-rewriter.ts";
import { z } from "zod";

function camelCase(property: string): string {
	return property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function tokenamiConfig(context: AdapterConfigContext): AdapterProjectConfig {
	const candidates = [
		".tokenami/tokenami.config.ts",
		".tokenami/tokenami.config.js",
		".tokenami/tokenami.config.cjs",
		".tokenami/tokenami.config.mjs",
		"tokenami.config.ts",
		"tokenami.config.js",
		"tokenami.config.cjs",
		"tokenami.config.mjs",
	];
	const root = context.root;
	const configuredFile =
		root === undefined
			? undefined
			: (candidates
					.map((candidate) => joinDocumentPath(root, candidate))
					.find((path) => context.readFile?.(path) !== undefined) ??
				context
					.listFiles?.(root)
					.find((path) =>
						/(?:^|[\\/])(?:\.tokenami[\\/])?tokenami\.config\.(?:ts|js|cjs|mjs)$/u.test(path),
					));
	return {
		adapter: CodemodAdapterId.Tokenami,
		root,
		files: configuredFile === undefined ? [context.file] : [context.file, configuredFile],
		values: {},
	};
}

const tokenamiConfigSchema = z
	.object({
		aliases: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
		grid: z.string().optional(),
		globalStyles: z.unknown().optional(),
		properties: z.record(z.string(), z.array(z.string())).optional(),
		customProperties: z.record(z.string(), z.array(z.string())).optional(),
		selectors: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
		responsive: z.record(z.string(), z.string()).optional(),
		theme: z.unknown().optional(),
		tokens: z.unknown().optional(),
		keyframes: z.unknown().optional(),
	})
	.passthrough();

type TokenamiConfigShape = z.infer<typeof tokenamiConfigSchema>;
const recordSchema = z.record(z.string(), z.unknown());

function configModuleValue(value: unknown): TokenamiConfigShape | undefined {
	const parsed = tokenamiConfigSchema.safeParse(value);
	if (!parsed.success) return undefined;
	const candidate = parsed.data;
	if (
		candidate.aliases === undefined &&
		candidate.grid === undefined &&
		candidate.globalStyles === undefined &&
		candidate.properties === undefined &&
		candidate.customProperties === undefined &&
		candidate.selectors === undefined &&
		candidate.responsive === undefined &&
		candidate.theme === undefined &&
		candidate.tokens === undefined &&
		candidate.keyframes === undefined
	)
		return undefined;
	return candidate;
}

const recordValue = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
	const parsed = recordSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
};

function tokenamiTokenCatalog(config: TokenamiConfigShape): AdapterProjectConfig["tokenCatalog"] {
	const theme = recordValue(config.theme);
	if (theme === undefined) return TokenCatalog.fromNested(recordValue(config.tokens))?.contract;
	const modes = recordValue(theme.modes);
	const root = recordValue(theme.root);
	const groups =
		modes === undefined
			? {
					...Object.fromEntries(Object.entries(theme).filter(([key]) => key !== "root")),
					...root,
				}
			: root;
	return TokenCatalog.fromNested(groups)?.contract;
}

function tokenamiPropertyName(property: string): string {
	return property.startsWith("--")
		? property.slice(2)
		: property.replace(/[A-Z]/gu, (letter) => "-" + letter.toLowerCase());
}

function tokenamiPropertyTokenGroups(
	property: string,
	config: TokenamiConfigShape | undefined,
): readonly string[] | undefined {
	const propertyName = tokenamiPropertyName(property);
	return property.startsWith("--")
		? config?.customProperties?.[propertyName]
		: config?.properties?.[propertyName];
}

function tokenamiSourceTokenGroups(
	properties: readonly string[],
	config: TokenamiConfigShape | undefined,
): readonly string[] {
	const first = properties[0];
	if (first === undefined) return [];
	const groups = tokenamiPropertyTokenGroups(first, config);
	return (groups ?? []).filter((group) =>
		properties.every(
			(property) => tokenamiPropertyTokenGroups(property, config)?.includes(group) === true,
		),
	);
}

function tokenamiGridValue(
	property: string,
	value: StyleValue,
	config: TokenamiConfigShape | undefined,
): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "number") return value;
	if (value.value === 0) return value;
	if (tokenamiPropertyTokenGroups(property, config)?.includes("grid") !== true) return value;
	const grid = config?.grid ?? "0.25rem";
	return { kind: StyleValueKindTag.Literal, value: `calc(${value.value} * ${grid})` };
}

function tokenamiTokenGroups(
	property: string,
	context?: AdapterEmitContext,
): string | readonly string[] | undefined {
	const config =
		context === undefined ? undefined : configModuleValue(context.config.values.tokenamiConfig);
	return tokenamiPropertyTokenGroups(property, config);
}

const TOKENAMI_TOKEN_POLICY = createTokenPolicy(
	tokenamiTokenGroups,
	(match) => "var(--" + match.group + "_" + match.ref + ")",
);

async function officialTokenamiConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = tokenamiConfig(context);
	if (context.root === undefined) return fallback;
	const configFiles = [
		...new Set(
			[...(context.listFiles?.(context.root) ?? []), ...fallback.files].filter((candidate) =>
				/(?:^|[\\/])(?:\.tokenami[\\/])?tokenami\.config\.(?:ts|js|cjs|mjs)$/u.test(candidate),
			),
		),
	];
	const packageModule = await loader.importPackage<
		Record<string, unknown> & {
			createConfig?: (config: TokenamiConfigShape) => unknown;
		}
	>("@tokenami/css", context.root);
	if (packageModule === undefined)
		return configFiles.length > 0
			? AdapterEvidence.configurationFailure(
					fallback,
					"Tokenami project configuration",
					"the official @tokenami/css config utility is unavailable for a discovered config",
				)
			: fallback;
	const discovered = context
		.listFiles?.(context.root)
		.filter((candidate) =>
			/(?:^|[\\/])(?:\.tokenami[\\/])?tokenami\.config\.(?:ts|js|cjs|mjs)$/u.test(candidate),
		);
	const candidates = [
		".tokenami/tokenami.config.ts",
		".tokenami/tokenami.config.js",
		".tokenami/tokenami.config.cjs",
		"tokenami.config.ts",
		"tokenami.config.js",
		"tokenami.config.cjs",
		"tokenami.config.mjs",
		...(discovered ?? []),
	];
	for (const candidate of new Set(candidates)) {
		const path = candidate.startsWith(context.root)
			? candidate
			: joinDocumentPath(context.root, candidate);
		// Preserve candidate priority: the first project config wins.
		const module = await loader.importFile<Record<string, unknown>>(path);
		if (module === undefined) continue;
		const rawValues = [module.default, ...Object.values(module)]
			.map(configModuleValue)
			.find((value): value is TokenamiConfigShape => value !== undefined);
		if (rawValues === undefined) continue;
		const values = packageModule.createConfig?.(rawValues) ?? rawValues;
		const normalized = configModuleValue(values) ?? rawValues;
		return {
			...fallback,
			files: [...new Set([...fallback.files, path])],
			tokenCatalog: tokenamiTokenCatalog(normalized),
			values: {
				...fallback.values,
				tokenamiConfig: normalized,
				officialConfigPackage: "@tokenami/css",
			},
		};
	}
	if (configFiles.length > 0) {
		return {
			...fallback,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.Configuration,
					text: "Tokenami project configuration",
					hint: "Tokenami configuration was not found or could not be loaded",
				},
			],
		};
	}
	const defaults = configModuleValue(packageModule.createConfig?.({}));
	if (defaults !== undefined)
		return {
			...fallback,
			tokenCatalog: tokenamiTokenCatalog(defaults),
			values: {
				...fallback.values,
				tokenamiConfig: defaults,
				officialConfigPackage: "@tokenami/css",
			},
		};
	return fallback;
}

function conditionValue(name: string, value: string, raw: string): StyleCondition {
	if (/^@media(?:\s|$)/u.test(value))
		return { kind: SemanticConditionKindTag.Media, name, value, raw };
	if (/^@container(?:\s|$)/u.test(value))
		return { kind: SemanticConditionKindTag.Container, name, value, raw };
	if (/^@supports(?:\s|$)/u.test(value))
		return { kind: SemanticConditionKindTag.Supports, name, value, raw };
	const pseudo = /^&(?::|::)([A-Za-z-]+)$/u.exec(value)?.[1];
	if (pseudo !== undefined)
		return { kind: SemanticConditionKindTag.Pseudo, name: pseudo, value, raw };
	return { kind: SemanticConditionKindTag.Selector, name, value, raw };
}

function condition(
	prefix: string,
	config: TokenamiConfigShape | undefined,
): readonly StyleCondition[] {
	const arbitrarySelector = /^\{([\s\S]+)\}$/u.exec(prefix)?.[1];
	if (arbitrarySelector !== undefined)
		return [conditionValue(prefix, arbitrarySelector.replaceAll("_", " "), prefix)];
	const responsive = config?.responsive?.[prefix];
	const selector = config?.selectors?.[prefix];
	if (responsive !== undefined && selector !== undefined)
		return [{ kind: SemanticConditionKindTag.Named, name: prefix, raw: prefix }];
	if (responsive !== undefined) return [conditionValue(prefix, responsive, prefix)];
	if (selector !== undefined) {
		const values = typeof selector === "string" ? [selector] : selector;
		return values.map((value) => conditionValue(prefix, value, prefix));
	}
	if (
		/^(?:hover|active|focus|focus-visible|focus-within|disabled|checked|before|after)$/u.test(
			prefix,
		)
	)
		return [{ kind: SemanticConditionKindTag.Pseudo, name: prefix, raw: prefix }];
	return [{ kind: SemanticConditionKindTag.Named, name: prefix, raw: prefix }];
}

function splitTokenamiProperty(property: string): readonly string[] {
	const parts: string[] = [];
	let start = 0;
	let depth = 0;
	for (let index = 0; index < property.length; index++) {
		const character = property[index];
		if (character === "{") depth++;
		if (character === "}") depth = Math.max(0, depth - 1);
		if (character === "_" && depth === 0) {
			parts.push(property.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(property.slice(start));
	return parts.filter(Boolean);
}

function decodeProperty(
	property: string,
	aliases: Readonly<Record<string, string | readonly string[]>>,
	config: TokenamiConfigShape | undefined,
): { properties: readonly string[]; conditions: readonly StyleCondition[] } {
	const encoded = property.startsWith("--") ? property.slice(2) : property;
	const parts = splitTokenamiProperty(encoded);
	const encodedProperty = parts.at(-1) ?? encoded;
	const isCustomCssVariable = encodedProperty.startsWith("-");
	const alias = isCustomCssVariable ? encodedProperty.slice(1) : encodedProperty;
	const mapped = aliases[alias];
	const propertyNames =
		mapped === undefined
			? [isCustomCssVariable ? `--${alias}` : camelCase(alias)]
			: typeof mapped === "string"
				? [mapped]
				: mapped;
	const properties = propertyNames.map((propertyName) =>
		propertyName.startsWith("--") ? propertyName : camelCase(propertyName),
	);
	return {
		properties,
		conditions: parts.slice(0, -1).flatMap((prefix) => condition(prefix, config)),
	};
}

function tokenamiConfigurationResidual(
	context: AdapterParseContext,
	declaration: StyleDeclaration,
): StyleProgramResidual | undefined {
	const tokenamiConfig = configModuleValue(context.config.values.tokenamiConfig);
	if (
		context.config.residuals?.some(
			(residual) => residual.kind === StyleProgramResidualKindTag.Configuration,
		) === true ||
		context.targetId === undefined ||
		context.targetId === CodemodAdapterId.Tokenami
	)
		return undefined;
	if (declaration.value.kind === StyleValueKindTag.Dynamic) {
		if (tokenamiConfig !== undefined) {
			const properties = decodeProperty(
				declaration.property,
				tokenamiConfig.aliases ?? {},
				tokenamiConfig,
			).properties;
			if (
				properties.some(
					(property) =>
						tokenamiPropertyTokenGroups(property, tokenamiConfig)?.includes("grid") === true,
				) !== true
			)
				return undefined;
			return {
				kind: StyleProgramResidualKindTag.Capability,
				text: declaration.property,
				hint: "Tokenami dynamic grid values need target-runtime arithmetic to preserve the configured grid scale",
			};
		}
		return {
			kind: StyleProgramResidualKindTag.Configuration,
			text: declaration.property,
			hint: "Tokenami dynamic values need official property metadata to detect grid-scaled numeric properties before migration",
		};
	}
	if (tokenamiConfig !== undefined) return undefined;
	if (
		declaration.value.kind !== StyleValueKindTag.Literal ||
		typeof declaration.value.value !== "number"
	)
		return undefined;
	return {
		kind: StyleProgramResidualKindTag.Configuration,
		text: declaration.property,
		hint: "Tokenami numeric values need the official property mapping to distinguish grid units from CSS numbers",
	};
}

function normalizeProgram(program: StyleProgram, context: AdapterParseContext): StyleProgram {
	const config = configModuleValue(context.config.values.tokenamiConfig);
	const aliases = config?.aliases ?? {};
	const residuals: StyleProgramResidual[] = [
		...program.residuals,
		...(context.config.residuals ?? []),
	];
	const normalize = (declaration: StyleDeclaration): readonly StyleDeclaration[] => {
		const decoded = decodeProperty(declaration.property, aliases, config);
		return decoded.properties.map((property) => {
			const normalized = {
				...declaration,
				property,
				value: tokenamiGridValue(property, declaration.value, config),
				conditions: [...decoded.conditions, ...declaration.conditions],
			};
			const unresolvedGrid = tokenamiConfigurationResidual(context, declaration);
			if (unresolvedGrid !== undefined) residuals.push(unresolvedGrid);
			return normalized;
		});
	};
	const normalizeRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...rule,
		declarations: rule.declarations.flatMap(normalize),
		children: rule.children.map(normalizeRule),
	});
	for (const composition of program.compositions ?? [])
		if (composition.program === undefined)
			residuals.push({
				kind: StyleProgramResidualKindTag.Composition,
				text: composition.reference,
				hint: "Tokenami includes need a statically available composed style to flatten",
			});
	return {
		...program,
		rules: program.rules.map(normalizeRule),
		declarations: program.declarations.flatMap(normalize),
		residuals: [
			...new Map(
				residuals.map((residual) => [
					JSON.stringify([residual.kind, residual.text, residual.hint, residual.preserved]),
					residual,
				]),
			).values(),
		],
	};
}

function normalizeTokenamiComposeProgram(
	program: StyleProgram,
	context: AdapterParseContext,
): StyleProgram {
	const normalized = normalizeProgram(program, context);
	if (
		normalized.residuals.some(
			(residual) => residual.kind === StyleProgramResidualKindTag.Composition,
		)
	)
		return normalized;
	return {
		...normalized,
		residuals: [
			...normalized.residuals,
			{
				kind: StyleProgramResidualKindTag.Composition,
				text: "css.compose",
				hint: "Tokenami css.compose returns a reusable class/style helper; flattening it to a style value changes its callable API",
			},
		],
	};
}

const sourceOptions: AdapterSourceObjectOptions = {
	variantContainerKeys: ["variants"],
	compositionArrayKeys: ["includes"],
};

function tokenamiSourceValue(
	value: StyleValue,
	property: string,
	context: AdapterParseContext,
): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "string") return value;
	const tokenVariable = /^var\(--([A-Za-z0-9_-]+)\)$/u.exec(value.value)?.[1];
	if (tokenVariable === undefined) return value;
	const separator = tokenVariable.indexOf("_");
	if (separator <= 0) return value;
	const group = tokenVariable.slice(0, separator);
	const reference = tokenVariable.slice(separator + 1);
	const config = configModuleValue(context.config.values.tokenamiConfig);
	const decoded = decodeProperty(property, config?.aliases ?? {}, config);
	if (!tokenamiSourceTokenGroups(decoded.properties, config).includes(group)) return value;
	const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	const match = catalog?.findByReference([group], reference);
	return match === undefined
		? value
		: {
				kind: StyleValueKindTag.Token,
				ref: match.ref,
				authored: value.value,
				resolved: match.resolved,
			};
}

const tokenamiSourceOptions = (_source: string, context: AdapterParseContext) => ({
	...sourceOptions,
	valueTransforms: {
		"*": (value: StyleValue, property?: string) =>
			tokenamiSourceValue(value, property ?? "", context),
	},
});

const tokenamiCssProperty = (property: string): string =>
	property.startsWith("--")
		? `---${property.slice(2)}`
		: `--${property.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`;

const tokenamiResponsiveQuery = (value: string): string =>
	value.replace(/^@(media|container)\s+/u, "").trim();

function tokenamiConditionPrefix(
	condition: StyleCondition,
	config: TokenamiConfigShape | undefined,
): string | undefined {
	if (condition.operator !== undefined && condition.operator !== StyleConditionOperatorTag.And)
		return undefined;
	const value = condition.value ?? condition.name;
	if (
		condition.kind === SemanticConditionKindTag.Media ||
		condition.kind === SemanticConditionKindTag.Container ||
		/^@(media|container)(?:\s|$)/u.test(value)
	) {
		const query = tokenamiResponsiveQuery(value);
		return Object.entries(config?.responsive ?? {}).find(
			([, configured]) => tokenamiResponsiveQuery(configured) === query,
		)?.[0];
	}
	if (condition.kind === SemanticConditionKindTag.Pseudo) {
		const selector =
			condition.value ??
			`&${condition.name === "before" || condition.name === "after" ? "::" : ":"}${condition.name.replace(/^:+/u, "")}`;
		return tokenamiSelectorPrefix(selector, config);
	}
	if (condition.kind === SemanticConditionKindTag.Selector || condition.value !== undefined)
		return tokenamiSelectorPrefix(value, config);
	return undefined;
}

function tokenamiSelectorPrefix(
	selector: string,
	config: TokenamiConfigShape | undefined,
): string | undefined {
	if (!selector.startsWith("&") || selector.includes("_") || selector.includes(","))
		return undefined;
	const configured = Object.entries(config?.selectors ?? {}).find(([, value]) =>
		typeof value === "string" ? value === selector : value.length === 1 && value[0] === selector,
	)?.[0];
	if (configured !== undefined && !configured.includes("_")) return configured;
	const defaults: Readonly<Record<string, string>> = {
		"&:hover": "hover",
		"&:active": "active",
		"&:focus": "focus",
		"&:focus-visible": "focus-visible",
		"&:focus-within": "focus-within",
		"&:disabled": "disabled",
		"&:checked": "checked",
		"&::before": "before",
		"&::after": "after",
	};
	const defaultName = defaults[selector];
	if (defaultName !== undefined && config?.selectors?.[defaultName] === undefined)
		return defaultName;
	return "{" + selector.replace(/\s+/gu, "_") + "}";
}

function tokenamiTargetProgram(
	program: StyleProgram,
	config: TokenamiConfigShape | undefined,
): { readonly program?: StyleProgram; readonly residuals: readonly StyleProgramResidual[] } {
	const declarations: StyleDeclaration[] = [];
	const residuals: StyleProgramResidual[] = [];
	const residual = (text: string, hint: string): void => {
		residuals.push({ kind: StyleProgramResidualKindTag.Capability, text, hint });
	};
	const visit = (
		rule: StyleProgram["rules"][number],
		inherited: readonly StyleCondition[],
	): void => {
		if (rule.kind !== StyleRuleKindTag.Style) {
			residual(rule.kind, "Tokenami inline styles cannot represent this rule kind");
			return;
		}
		if (rule.name !== undefined) {
			residual(rule.name, "Tokenami css() does not represent named style maps");
			return;
		}
		const conditions = [...inherited, ...rule.conditions];
		if (rule.selector !== undefined) {
			const selector = tokenamiSelectorPrefix(rule.selector, config);
			if (selector === undefined) {
				residual(rule.selector, "Tokenami arbitrary selectors must target the current element");
				return;
			}
			conditions.push({ kind: "selector", name: rule.selector, value: rule.selector });
		}
		for (const declaration of rule.declarations) {
			const prefixes = [...conditions, ...declaration.conditions].map((condition) =>
				tokenamiConditionPrefix(condition, config),
			);
			if (prefixes.some((prefix) => prefix === undefined)) {
				residual(
					declaration.property,
					"Tokenami needs a matching responsive alias or a representable current-element selector",
				);
				return;
			}
			const property = tokenamiCssProperty(declaration.property);
			declarations.push({
				...declaration,
				property: prefixes.length === 0 ? property : `--${prefixes.join("_")}_${property.slice(2)}`,
				conditions: [],
			});
		}
		for (const child of rule.children) visit(child, conditions);
	};
	for (const rule of program.rules) visit(rule, []);
	if (program.rules.length === 0)
		for (const declaration of program.declarations) {
			const prefixes = declaration.conditions.map((condition) =>
				tokenamiConditionPrefix(condition, config),
			);
			if (prefixes.some((prefix) => prefix === undefined)) {
				residual(
					declaration.property,
					"Tokenami needs a matching responsive alias or a representable current-element selector",
				);
				return { residuals };
			}
			const property = tokenamiCssProperty(declaration.property);
			declarations.push({
				...declaration,
				property: prefixes.length === 0 ? property : `--${prefixes.join("_")}_${property.slice(2)}`,
				conditions: [],
			});
		}
	if (residuals.length > 0) return { residuals };
	const rootRule: StyleProgram["rules"][number] = {
		kind: StyleRuleKindTag.Style,
		conditions: [],
		declarations,
		children: [],
		order: 0,
	};
	return {
		program: { ...program, declarations, rules: declarations.length === 0 ? [] : [rootRule] },
		residuals: [],
	};
}

function rewriteTokenamiStyleHost({
	code,
	binding,
	program,
	emittedExpression,
	framework,
	representation,
}: AdapterHostRewriteContext): {
	readonly code: string;
	readonly residuals: readonly StyleProgramResidual[];
} {
	if (representation !== StyleHostRepresentationKind.StyleProp) return { code, residuals: [] };
	if (
		framework !== undefined &&
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid &&
		framework !== BuiltinHostFramework.Qwik &&
		framework !== BuiltinHostFramework.Vue
	)
		return {
			code,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: emittedExpression,
					hint: "Tokenami style-object host projection requires a documented Tokenami host framework",
				},
			],
		};
	const sourceTag = program.source?.hostOpenTag;
	const hostAttributes = program.source?.hostStyleAttributes ?? [];
	if (sourceTag !== undefined && hostAttributes.length > 0) {
		const tagStart = code.indexOf(sourceTag);
		const styleAttribute = hostAttributes.find((attribute) =>
			/^(?:style|:style|v-bind:style)\s*=/u.test(attribute),
		);
		if (
			/(?:^|\s)(?:style|:style|v-bind:style)\s*=/u.test(sourceTag) &&
			styleAttribute === undefined
		)
			return {
				code,
				residuals: [
					{
						kind: StyleProgramResidualKindTag.HostFramework,
						text: emittedExpression,
						hint: "Tokenami host conversion cannot merge an unmodeled existing style prop",
					},
				],
			};
		let existingStyleExpression: string | undefined;
		if (styleAttribute !== undefined) {
			const rawValue = styleAttribute.slice(styleAttribute.indexOf("=") + 1).trim();
			if (
				framework === BuiltinHostFramework.Vue &&
				(rawValue.startsWith('"') || rawValue.startsWith("'")) &&
				rawValue.at(-1) === rawValue[0]
			)
				existingStyleExpression = rawValue
					.slice(1, -1)
					.replaceAll("&quot;", '"')
					.replaceAll("&#39;", "'")
					.replaceAll("&amp;", "&");
			else if (rawValue.startsWith("{") && rawValue.endsWith("}"))
				existingStyleExpression = rawValue.slice(1, -1).trim();
			if (existingStyleExpression === undefined || existingStyleExpression === "")
				return {
					code,
					residuals: [
						{
							kind: StyleProgramResidualKindTag.HostFramework,
							text: styleAttribute,
							hint: "Tokenami host conversion cannot merge a non-object style prop",
						},
					],
				};
		}
		const replacements: { readonly start: number; readonly end: number }[] = [];
		for (const attribute of hostAttributes) {
			const start = sourceTag.indexOf(attribute);
			if (start >= 0) replacements.push({ start, end: start + attribute.length });
		}
		if (replacements.length !== hostAttributes.length || tagStart < 0)
			return {
				code,
				residuals: [
					{
						kind: StyleProgramResidualKindTag.HostFramework,
						text: emittedExpression,
						hint: "Tokenami could not locate every source style attribute on its original host",
					},
				],
			};
		const styleExpression =
			existingStyleExpression === undefined
				? emittedExpression
				: "css(" + emittedExpression + ", " + existingStyleExpression + ")";
		const targetAttribute =
			framework === BuiltinHostFramework.Vue
				? ':style="' +
					styleExpression
						.replaceAll("&", "&amp;")
						.replaceAll('"', "&quot;")
						.replaceAll("<", "&lt;") +
					'"'
				: "style={" + styleExpression + "}";
		const firstReplacement = Math.min(...replacements.map((replacement) => replacement.start));
		let replacedTag = sourceTag;
		for (const replacement of replacements.toSorted((left, right) => right.start - left.start)) {
			let start = replacement.start;
			if (start !== firstReplacement)
				while (start > 0 && /\s/u.test(sourceTag[start - 1] ?? "")) start--;
			replacedTag =
				replacedTag.slice(0, start) +
				(replacement.start === firstReplacement ? targetAttribute : "") +
				replacedTag.slice(replacement.end);
		}
		return {
			code: code.slice(0, tagStart) + replacedTag + code.slice(tagStart + sourceTag.length),
			residuals: [],
		};
	}
	const expressions = [
		...new Set([binding, emittedExpression].filter((value) => value !== undefined)),
	];
	for (const expression of expressions) {
		const escaped = expression.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
		const classAttributes =
			framework === BuiltinHostFramework.Solid ? ["class", "className"] : ["className"];
		for (const classAttribute of classAttributes) {
			const pattern = new RegExp(`\\s${classAttribute}\\s*=\\s*\\{\\s*${escaped}\\s*\\}`, "gu");
			const matches = [...code.matchAll(pattern)];
			if (matches.length === 0) continue;
			let rewritten = code;
			for (const match of matches.toReversed()) {
				if (match.index === undefined) continue;
				const tagStart = rewritten.lastIndexOf("<", match.index);
				const tagEnd = rewritten.indexOf(">", match.index);
				if (tagStart < 0 || tagEnd < 0 || rewritten.lastIndexOf(">", match.index) > tagStart)
					continue;
				const openingTag = rewritten.slice(tagStart, tagEnd + 1);
				if (!/^<[a-z][\w.-]*\b/u.test(openingTag)) continue;
				if (/(?:^|\s)(?:(?::|v-bind:)?)style\s*=/u.test(openingTag))
					return {
						code,
						residuals: [
							{
								kind: StyleProgramResidualKindTag.HostFramework,
								text: expression,
								hint: "Tokenami host conversion cannot merge an existing style prop automatically",
							},
						],
					};
				const start = match.index;
				const attribute = match[0];
				rewritten =
					rewritten.slice(0, start) +
					attribute.replace(classAttribute, "style") +
					rewritten.slice(start + attribute.length);
			}
			if (rewritten !== code) return { code: rewritten, residuals: [] };
		}
	}
	if (framework === BuiltinHostFramework.Vue) {
		for (const expression of expressions) {
			const escaped = expression.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
			for (const [classAttribute, styleAttribute] of [
				[":class", ":style"],
				["v-bind:class", "v-bind:style"],
			] as const) {
				const pattern = new RegExp(`\\s${classAttribute}\\s*=\\s*(["'])${escaped}\\1`, "gu");
				const matches = [...code.matchAll(pattern)];
				if (matches.length === 0) continue;
				let rewritten = code;
				for (const match of matches.toReversed()) {
					if (match.index === undefined) continue;
					const tagStart = rewritten.lastIndexOf("<", match.index);
					const tagEnd = rewritten.indexOf(">", match.index);
					if (tagStart < 0 || tagEnd < 0 || rewritten.lastIndexOf(">", match.index) > tagStart)
						continue;
					const openingTag = rewritten.slice(tagStart, tagEnd + 1);
					if (!/^<[a-z][\w.-]*\b/u.test(openingTag)) continue;
					if (/(?:^|\s)(?:(?::|v-bind:)?)style\s*=/u.test(openingTag))
						return {
							code,
							residuals: [
								{
									kind: StyleProgramResidualKindTag.HostFramework,
									text: expression,
									hint: "Tokenami host conversion cannot merge an existing Vue style binding automatically",
								},
							],
						};
					const start = match.index;
					const attribute = match[0];
					rewritten =
						rewritten.slice(0, start) +
						attribute.replace(classAttribute, styleAttribute) +
						rewritten.slice(start + attribute.length);
				}
				if (rewritten !== code) return { code: rewritten, residuals: [] };
			}
		}
	}
	for (const expression of expressions) {
		const attribute = "className=" + expression;
		const starts: number[] = [];
		let searchFrom = 0;
		while (searchFrom < code.length) {
			const start = code.indexOf(attribute, searchFrom);
			if (start < 0) break;
			starts.push(start);
			searchFrom = start + attribute.length;
		}
		if (starts.length === 0) continue;
		let rewritten = code;
		for (const start of starts.toReversed()) {
			const tagStart = rewritten.lastIndexOf("<", start);
			const tagEnd = rewritten.indexOf(">", start);
			if (tagStart < 0 || tagEnd < 0 || rewritten.lastIndexOf(">", start) > tagStart) continue;
			const openingTag = rewritten.slice(tagStart, tagEnd + 1);
			if (!/^<[a-z][\w.-]*\b/u.test(openingTag)) continue;
			if (/\sstyle\s*=/u.test(openingTag))
				return {
					code,
					residuals: [
						{
							kind: StyleProgramResidualKindTag.HostFramework,
							text: expression,
							hint: "Tokenami host conversion cannot merge an existing style prop automatically",
						},
					],
				};
			rewritten =
				rewritten.slice(0, start) +
				"style={" +
				expression +
				"}" +
				rewritten.slice(start + attribute.length);
		}
		if (rewritten !== code) return { code: rewritten, residuals: [] };
	}
	return {
		code,
		residuals: [
			{
				kind: StyleProgramResidualKindTag.HostFramework,
				text: binding ?? emittedExpression,
				hint: "Tokenami style-object projection needs an exact intrinsic className binding",
			},
		],
	};
}

const rewriteTokenamiComponent = (
	context: AdapterComponentRewriteContext,
): AdapterComponentRewriteResult => {
	if (
		context.framework !== BuiltinHostFramework.React &&
		context.framework !== BuiltinHostFramework.Preact
	)
		return {
			code: context.code,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: context.binding,
					hint: "Tokenami component projection requires React-compatible JSX",
				},
			],
		};
	const tag = /^[a-z][\w-]*$/u.test(context.tag) ? context.tag : undefined;
	if (tag === undefined)
		return {
			code: context.code,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: context.program.source?.subject ?? context.binding,
					hint: "Tokenami component projection requires a statically known intrinsic styled subject",
				},
			],
		};
	const attrsValue = componentAttrsValueExpression(context.attrsExpression, "props");
	if (attrsValue === undefined)
		return {
			code: context.code,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: context.attrsExpression ?? context.binding,
					hint: "Tokenami component projection requires static attrs or a props callback",
				},
			],
		};
	const escapedBinding = context.binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const assignment = new RegExp(`\\b(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*[^;]+;`).exec(
		context.code,
	);
	if (assignment === null)
		return {
			code: context.code,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: context.binding,
					hint: "Tokenami component declaration could not be located",
				},
			],
		};
	const declaration =
		context.attrsExpression === undefined
			? `${context.binding} = (props) => { const { as: propsAs, style: propsStyle, ...rest } = props; const Component = propsAs ?? ${JSON.stringify(tag)}; return <Component {...rest} style={css(${context.emittedExpression}, propsStyle)} />; };`
			: `${context.binding} = (props) => { const attrs = ${attrsValue}; const { as: attrsAs, className: attrsClassName, style: attrsStyle, ...attrsProps } = attrs; const { as: propsAs, className: propsClassName, style: propsStyle, ...rest } = props; const Component = attrsAs ?? propsAs ?? ${JSON.stringify(tag)}; return <Component {...rest} {...attrsProps} className={[propsClassName, attrsClassName].filter(Boolean).join(" ") || undefined} style={css(${context.emittedExpression}, propsStyle, attrsStyle)} />; };`;
	const bindingOffset = assignment[0].indexOf(context.binding);
	return {
		code:
			context.code.slice(0, assignment.index + bindingOffset) +
			declaration +
			context.code.slice(assignment.index + assignment[0].length),
		residuals: [],
	};
};

/** Semantic Tokenami source adapter. It owns Tokenami's encoded property keys and aliases. */
export function createTokenamiAdapter(
	options: { readonly moduleLoader?: ProjectModuleLoader | null } = {},
) {
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	return defineCodemodAdapter({
		id: CodemodAdapterId.Tokenami,
		officialApi: {
			pluginSystems: ["aliases", "conditions", "themes", "composition", "variants"],
			compilerIntegrations: ["@tokenami/css"],
		},
		packages: {
			packages: [{ name: "@tokenami/css", kind: AdapterDependencyKindTag.Runtime }],
		},
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Tokenami, "partial", {
			"token-values": "exact",
			"custom-properties": "exact",
			"named-conditions": "partial",
			"pseudo-conditions": "exact",
			"selector-conditions": "exact",
			composition: "partial",
			"theme-context": "partial",
			"runtime-context": "exact",
			"framework-semantics": "exact",
			"global-rules": "unsupported",
			keyframes: "unsupported",
			layers: "unsupported",
			"supports-rules": "unsupported",
		}),
		namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
		detectPatterns: [
			/@tokenami\/(?:css|config)/,
			/\bcss\.compose\s*\(/,
			/['"]--(?:[A-Za-z_$][\w$-]*)(?:_[^'"]+)?['"]\s*:/,
		],
		sourceModules: ["@tokenami/css"],
		configFiles: [".tokenami/tokenami.config.ts", ".tokenami/tokenami.config.js", "package.json"],
		loadConfig: tokenamiConfig,
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialTokenamiConfig(context, moduleLoader),
				}),
		sourceObjectOptions: tokenamiSourceOptions,
		tokenPolicy: TOKENAMI_TOKEN_POLICY,
		patterns: [
			{ name: "css", regex: /\bcss\s*\(\s*\{/g, transform: normalizeProgram },
			{
				name: CodemodPatternId.TokenamiCompose,
				regex: /\bcss\.compose\s*\(\s*\{/g,
				transform: normalizeTokenamiComposeProgram,
			},
		],
		migration: {
			targetPolicy: {
				preflight: ({ program }) =>
					(program.compositions?.length ?? 0) > 0
						? [
								{
									kind: StyleProgramResidualKindTag.Capability,
									text: "style composition",
									hint: "Tokenami css.compose returns a class/style invocation helper that does not preserve the source composition API",
								},
							]
						: [],
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				handlesSourceHostAttributes: true,
				handlesDynamicValues: true,
				hostFrameworks: [
					BuiltinHostFramework.React,
					BuiltinHostFramework.Preact,
					BuiltinHostFramework.Solid,
					BuiltinHostFramework.Qwik,
					BuiltinHostFramework.Vue,
				],
				hostContextRequiredHint:
					"Tokenami component projection requires a statically known intrinsic styled subject",
				hostRepresentation: StyleHostRepresentationKind.StyleProp,
				resolveHostRepresentation: ({ hasHostContext, program, framework, sourceFramework }) => {
					if (!hasHostContext && program.source?.subject === undefined) return undefined;
					const hostFramework = sourceFramework ?? framework;
					const hostSupportsStyle =
						hostFramework === undefined ||
						hostFramework === BuiltinHostFramework.React ||
						hostFramework === BuiltinHostFramework.Preact ||
						hostFramework === BuiltinHostFramework.Solid ||
						hostFramework === BuiltinHostFramework.Qwik ||
						hostFramework === BuiltinHostFramework.Vue;
					if (!hostSupportsStyle) return undefined;
					return StyleHostRepresentationKind.StyleProp;
				},
				rewriteComponent: rewriteTokenamiComponent,
				rewriteHost: rewriteTokenamiStyleHost,
			},
		},
		emit(program, { programObject }, context) {
			const targetProgram = tokenamiTargetProgram(
				program,
				context === undefined ? undefined : configModuleValue(context.config.values.tokenamiConfig),
			);
			if (targetProgram.program === undefined)
				return { text: "", residuals: targetProgram.residuals, semantic: program };
			return {
				text: `css(${programObject(targetProgram.program)})`,
				imports: ['import { css } from "@tokenami/css";'],
				semantic: program,
			};
		},
	});
}
