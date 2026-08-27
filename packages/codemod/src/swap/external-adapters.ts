import { join } from "node:path";
import { readFileSync } from "node:fs";
import { applyEdits } from "../migrate.ts";
import { computeExcludedRanges, matchBlock } from "../sources.ts";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "./capabilities.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	type AdapterConfigContext,
	type AdapterDependencies,
	type AdapterDetectionContext,
	type AdapterLossiness,
	type AdapterMatch,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterProjectConfig,
	type AdapterValidationResult,
	type StyleAdapter,
} from "./adapter-contract.ts";
import {
	styleProgramFromRules,
	styleProgramFromSourceObject,
	styleProgramToCanonicalCss,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
	type StyleProgramSource,
} from "./semantic-ir.ts";
import {
	asStyleDialect,
	createStyleSystem,
	createStyleSystemRegistry,
	type StyleSystemRegistry,
} from "./style-systems.ts";
import { createStyleAdapterRegistry, type StyleAdapterRegistry } from "./adapter-registry.ts";
import { EXTRA_ADAPTERS } from "./extra-adapters.ts";

/** Adapter ids are registry-defined so adding an adapter does not require a central union edit. */
export type ExternalAdapterId = string;

type CallPattern = {
	readonly name: string;
	readonly regex: RegExp;
	readonly form?: "object" | "template";
};

const dependency = (
	name: string,
	kind: "runtime" | "development" | "peer" | "config",
): AdapterDependencies => ({
	packages: [{ name, kind }],
});

const allRuleCapabilities = (
	adapterId: string,
	dynamic: "exact" | "partial" | "unsupported",
	capabilities: Partial<AdapterCapabilities["capabilities"]> = {},
): AdapterCapabilities => ({
	schema: ADAPTER_CAPABILITIES_SCHEMA,
	adapter: adapterId,
	capabilities: {
		declarations: "exact",
		"rule-level": "exact",
		"global-rules": "exact",
		keyframes: "exact",
		"font-face": "exact",
		layers: "exact",
		"supports-rules": "exact",
		"property-rules": "exact",
		selectors: "exact",
		nesting: "exact",
		ordering: "exact",
		"token-values": "exact",
		"custom-properties": "exact",
		"dynamic-values": dynamic,
		"pseudo-conditions": "exact",
		"selector-conditions": "exact",
		"media-conditions": "exact",
		"container-conditions": "exact",
		"supports-conditions": "exact",
		...capabilities,
	},
});

const CONFIG_FILES: Readonly<Record<ExternalAdapterId, readonly string[]>> = {
	pandwind: ["pandwind.config.ts", "package.json"],
	emotion: [".emotionrc", "emotion.config.js", "package.json"],
	"styled-components": ["package.json"],
	"vanilla-extract": ["package.json"],
	stitches: ["stitches.config.ts", "package.json"],
	linaria: ["linaria.config.js", "package.json"],
	jss: ["jss.config.js", "package.json"],
};

function configFor(id: string, context: AdapterConfigContext): AdapterProjectConfig {
	const files: string[] = [];
	const values: Record<string, unknown> = {};
	const readFile =
		context.readFile ??
		((file: string) => {
			try {
				return readFileSync(file, "utf8");
			} catch {
				return undefined;
			}
		});
	const packageText =
		context.packageJson === undefined && context.root !== undefined && readFile !== undefined
			? readFile(join(context.root, "package.json"))
			: undefined;
	let packageJson = context.packageJson;
	if (packageJson === undefined && packageText !== undefined) {
		try {
			packageJson = JSON.parse(packageText) as Readonly<Record<string, unknown>>;
		} catch {
			values.packageJsonError = "package.json could not be parsed";
		}
	}
	if (packageJson !== undefined) values.packageJson = packageJson;
	for (const relative of CONFIG_FILES[id as ExternalAdapterId] ?? []) {
		if (context.root === undefined || readFile === undefined) continue;
		const file = join(context.root, relative);
		const text = readFile(file);
		if (text === undefined) continue;
		files.push(file);
		if (relative.endsWith(".json")) {
			try {
				values[relative] = JSON.parse(text);
			} catch {
				values[`${relative}:error`] = "configuration JSON could not be parsed";
			}
		} else {
			values[relative] = text;
		}
	}
	return { adapter: id, root: context.root, files, values };
}

function detectBy(
	patterns: readonly RegExp[],
	context: AdapterDetectionContext,
): { matched: boolean; confidence: number; evidence: string[] } {
	const evidence = patterns.flatMap((pattern) =>
		pattern.test(context.source) ? [pattern.source] : [],
	);
	return {
		matched: evidence.length > 0,
		confidence: evidence.length === 0 ? 0 : Math.min(1, 0.5 + evidence.length * 0.2),
		evidence,
	};
}

function sourceName(source: string, start: number, fallback: string): string {
	const prefix = source.slice(Math.max(0, start - 160), start);
	return prefix.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1] ?? fallback;
}

function adapterSource(
	context: AdapterParseContext,
	start: number,
	extra: Partial<StyleProgramSource> = {},
): StyleProgramSource {
	return {
		file: context.file,
		start,
		adapter: context.config.adapter,
		...(context.document?.framework ? { framework: context.document.framework } : {}),
		...extra,
	};
}

function styledSubject(source: string, start: number): Partial<StyleProgramSource> {
	const match = source.slice(start).match(/^styled\s*(\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(/);
	if (match?.[1] === undefined) return {};
	const subject = `styled${match[1].replace(/\s+/g, " ").replace(/\.\s+/g, ".")}`;
	return { subject, subjectKind: match[1].trim().startsWith(".") ? "member" : "call" };
}

function linariaStyledSubject(source: string, start: number): Partial<StyleProgramSource> {
	const match = source.slice(start).match(/^styled\s*(\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`/);
	if (match?.[1] === undefined) return {};
	const subject = `styled${match[1].replace(/\s+/g, " ").replace(/\.\s+/g, ".")}`;
	return { subject, subjectKind: match[1].trim().startsWith(".") ? "member" : "call" };
}

function conditionKey(condition: StyleProgram["rules"][number]["conditions"][number]): string {
	if (condition.raw !== undefined) return condition.raw;
	if (condition.kind === "pseudo")
		return condition.name.startsWith(":") ? `&${condition.name}` : `&:${condition.name}`;
	if (condition.kind === "media")
		return condition.value === undefined ? condition.name : `@media ${condition.value}`;
	if (condition.kind === "container")
		return condition.value === undefined ? condition.name : `@container ${condition.value}`;
	if (condition.kind === "supports")
		return condition.value === undefined ? condition.name : `@supports ${condition.value}`;
	return condition.name;
}

type ObjectNode = { entries: Array<[string, string]>; children: Array<[string, ObjectNode]> };

function objectNode(): ObjectNode {
	return { entries: [], children: [] };
}

function renderValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function renderKey(key: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function renderObjectNode(node: ObjectNode): string {
	const entries = node.entries.map(([key, value]) => `${renderKey(key)}: ${value}`);
	const children = node.children.map(
		([key, child]) => `${renderKey(key)}: ${renderObjectNode(child)}`,
	);
	return `{ ${[...entries, ...children].join(", ")} }`;
}

function addDeclaration(
	node: ObjectNode,
	declaration: StyleDeclaration,
	conditions: readonly string[],
): void {
	if (conditions.length === 0) {
		node.entries.push([declaration.property, renderValue(declaration.value)]);
		return;
	}
	const key = conditions[0]!;
	let child = node.children.find(([candidate]) => candidate === key)?.[1];
	if (child === undefined) {
		child = objectNode();
		node.children.push([key, child]);
	}
	addDeclaration(child, declaration, conditions.slice(1));
}

function declarationsObject(declarations: readonly StyleDeclaration[]): string {
	const root = objectNode();
	for (const declaration of declarations) {
		addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
	}
	return renderObjectNode(root);
}

function ruleObject(rule: StyleProgram["rules"][number]): string {
	if (rule.kind === "style" || rule.kind === "font-face" || rule.kind === "property") {
		return declarationsObject(rule.declarations);
	}
	if (rule.kind === "global") {
		return `{ ${JSON.stringify(rule.selector ?? "*")}: ${declarationsObject(rule.declarations)} }`;
	}
	if (rule.kind === "keyframes") {
		return `{ ${rule.children
			.map(
				(child) =>
					`${JSON.stringify(child.selector ?? "from")}: ${declarationsObject(child.declarations)}`,
			)
			.join(", ")} }`;
	}
	const body = declarationsObject(rule.declarations);
	const prefix =
		rule.kind === "layer"
			? `@layer ${rule.layer ?? rule.name ?? ""}`
			: `@supports ${rule.name ?? ""}`;
	return `{ ${JSON.stringify(prefix)}: ${body} }`;
}

function programObject(program: StyleProgram): string {
	if (program.rules.length === 1) return ruleObject(program.rules[0]!);
	if (program.rules.every((rule) => rule.kind === "global")) {
		const root = objectNode();
		for (const rule of program.rules) {
			root.entries.push([rule.selector ?? "*", declarationsObject(rule.declarations)]);
		}
		return renderObjectNode(root);
	}
	const root = objectNode();
	for (const rule of program.rules) {
		if (rule.kind === "style") {
			for (const declaration of rule.declarations) {
				addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
			}
		} else {
			root.entries.push([rule.selector ?? rule.name ?? rule.kind, ruleObject(rule)]);
		}
	}
	return renderObjectNode(root);
}

function firstKind(program: StyleProgram): StyleProgram["rules"][number]["kind"] {
	return program.rules[0]?.kind ?? "style";
}

function parseKeyframeProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
	name: string,
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		source: adapterSource(context, start),
		conditionKinds: { from: "selector", to: "selector" },
		sourceOffset: start + 1,
	});
	const groups = new Map<string, StyleDeclaration[]>();
	for (const declaration of base.declarations) {
		const selector = declaration.conditions[0]?.name ?? "from";
		const list = groups.get(selector) ?? [];
		list.push({ ...declaration, conditions: [] });
		groups.set(selector, list);
	}
	return styleProgramFromRules(
		[
			{
				kind: "keyframes",
				name,
				conditions: [],
				declarations: [],
				children: [...groups].map(([selector, declarations], order) => ({
					kind: "style" as const,
					selector,
					conditions: [],
					declarations,
					children: [],
					order,
				})),
				order: 0,
			},
		],
		{
			source: adapterSource(context, start),
			residuals: base.residuals,
		},
	);
}

function parseGlobalProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		source: adapterSource(context, start),
		nestedObjectKind: "selector",
		sourceOffset: start + 1,
	});
	const groups = new Map<string, StyleDeclaration[]>();
	for (const declaration of base.declarations) {
		const selector = declaration.conditions[0]?.name ?? "*";
		const list = groups.get(selector) ?? [];
		list.push({ ...declaration, conditions: declaration.conditions.slice(1) });
		groups.set(selector, list);
	}
	return styleProgramFromRules(
		[...groups].map(([selector, declarations], order) => ({
			kind: "global" as const,
			selector,
			conditions: [],
			declarations,
			children: [],
			order,
		})),
		{
			source: adapterSource(context, start),
			residuals: base.residuals,
		},
	);
}

function camelProperty(property: string): string {
	return property
		.trim()
		.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
}

function parseTemplateProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
): StyleProgram {
	if (body.includes("${")) {
		return styleProgramFromRules(
			[
				{
					kind: "style",
					conditions: [],
					declarations: [],
					children: [],
					order: 0,
				},
			],
			{
				source: adapterSource(context, start),
				residuals: [
					{
						kind: "dynamic",
						text: body,
						hint: "template interpolation requires a runtime adapter",
					},
				],
			},
		);
	}
	const declarations: StyleDeclaration[] = [];
	for (const statement of body.split(";")) {
		const trimmed = statement.replace(/\/\*.*?\*\//gs, "").trim();
		if (trimmed === "") continue;
		const colon = trimmed.indexOf(":");
		if (colon <= 0) {
			return styleProgramFromRules(
				[
					{
						kind: "style",
						conditions: [],
						declarations: [],
						children: [],
						order: 0,
					},
				],
				{
					source: adapterSource(context, start),
					residuals: [
						{ kind: "parse", text: statement, hint: "nested template CSS requires a rule parser" },
					],
				},
			);
		}
		declarations.push({
			conditions: [],
			property: camelProperty(trimmed.slice(0, colon)),
			value: { kind: "literal", value: trimmed.slice(colon + 1).trim() },
		});
	}
	return styleProgramFromRules(
		[
			{
				kind: "style",
				conditions: [],
				declarations,
				children: [],
				order: 0,
			},
		],
		{ source: adapterSource(context, start) },
	);
}

function kebabProperty(property: string): string {
	return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Emit the static subset as authored CSS for template-based adapters. */
const templateValue = (value: StyleProgram["declarations"][number]["value"]): string => {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return value.authored;
	return String(value.value);
};

function templateCss(program: StyleProgram): string {
	const renderRule = (rule: StyleProgram["rules"][number]): string => {
		const declarations = rule.declarations
			.filter((declaration) => declaration.conditions.length === 0)
			.map(
				(declaration) =>
					`${kebabProperty(declaration.property)}: ${templateValue(declaration.value)};`,
			)
			.join(" ");
		const nested = rule.children.map(renderRule).join(" ");
		if (rule.kind !== "style") return `${declarations}${nested}`;
		const base = declarations === "" ? nested : `${declarations}${nested}`;
		return base;
	};
	return program.rules.map(renderRule).join(" ");
}

function parseCalls(
	source: string,
	context: AdapterParseContext,
	patterns: readonly CallPattern[],
): AdapterParseResult {
	const matches: AdapterMatch[] = [];
	const residuals: StyleProgramResidual[] = [];
	let mask: ReturnType<typeof computeExcludedRanges> | undefined;
	try {
		mask = computeExcludedRanges(source, context.file);
	} catch {
		// Source parsers are allowed to operate on snippets that are not complete
		// modules; the adapter remains conservative through its balanced matcher.
	}
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern.regex)) {
			const start = match.index ?? 0;
			if (mask?.isExcluded(start)) continue;
			if (pattern.form === "template") {
				const template = match[0];
				const firstTick = template.indexOf("`");
				const lastTick = template.lastIndexOf("`");
				if (firstTick === -1 || lastTick <= firstTick) continue;
				let program = parseTemplateProgram(template.slice(firstTick + 1, lastTick), context, start);
				if (pattern.name.startsWith("styled"))
					program = { ...program, source: { ...program.source, ...styledSubject(source, start) } };
				if (pattern.name === "linaria-styled")
					program = {
						...program,
						source: { ...program.source, ...linariaStyledSubject(source, start) },
					};
				matches.push({ start, end: start + template.length, program, sourceText: template });
				continue;
			}
			const open = source.indexOf("{", start);
			if (open === -1) continue;
			const block = matchBlock(source, open);
			if (block === null) {
				residuals.push({
					kind: "parse",
					text: source.slice(start),
					hint: "unbalanced style object",
				});
				continue;
			}
			const end = source[block.end] === ")" ? block.end + 1 : block.end;
			const fallbackName = `${pattern.name}Style${matches.length + 1}`;
			let program: StyleProgram;
			if (pattern.name === "keyframes") {
				program = parseKeyframeProgram(
					block.body,
					context,
					start,
					sourceName(source, start, fallbackName),
				);
			} else if (
				pattern.name === "global" ||
				pattern.name === "globalCss" ||
				pattern.name === "createGlobalStyle"
			) {
				program = parseGlobalProgram(block.body, context, start);
			} else {
				const base = styleProgramFromSourceObject(block.body, {
					source: {
						file: context.file,
						start,
						end,
						adapter: context.config.adapter,
						...(context.document?.framework ? { framework: context.document.framework } : {}),
						...(pattern.name === "styled" ? styledSubject(source, start) : {}),
						...context.semantic?.source,
					},
					sourceOffset: open + 1,
					...(context.semantic?.themes ? { themes: context.semantic.themes } : {}),
					...(context.semantic?.compositions
						? { compositions: context.semantic.compositions }
						: {}),
					...(context.semantic?.runtime ? { runtime: context.semantic.runtime } : {}),
					...(context.semantic?.plugins ? { plugins: context.semantic.plugins } : {}),
					...(pattern.name.startsWith("jss-") ? { nestedObjectKind: "named" as const } : {}),
					...(pattern.name === "style" ? { unwrapNestedObjectKeys: ["selectors"] } : {}),
				});
				if (pattern.name === "globalStyle") {
					const args = source.slice(start, open);
					const selector = /\(\s*(["'`])([^"'`]+)\1\s*,/.exec(args)?.[2] ?? "*";
					program = styleProgramFromRules(
						[
							{
								kind: "global",
								selector,
								conditions: [],
								declarations: base.declarations,
								children: [],
								order: 0,
							},
						],
						{ source: base.source, residuals: base.residuals },
					);
				} else if (pattern.name === "fontFace") {
					program = styleProgramFromRules(
						[
							{
								kind: "font-face",
								conditions: [],
								declarations: base.declarations,
								children: [],
								order: 0,
							},
						],
						{ source: base.source, residuals: base.residuals },
					);
				} else {
					program = base;
				}
				if (pattern.name.startsWith("jss-")) {
					program = {
						...program,
						source: {
							...program.source,
							subject: pattern.name === "jss-styleSheet" ? "createStyleSheet" : "createUseStyles",
							subjectKind: "call",
						},
					};
				}
			}
			matches.push({ start, end, program, sourceText: source.slice(start, end) });
		}
	}
	matches.sort((a, b) => a.start - b.start);
	return { matches, residuals };
}

function validatePrograms(
	source: StyleProgram,
	target: StyleProgram,
	residuals: readonly StyleProgramResidual[] = [],
): AdapterValidationResult {
	const canonicalSource = styleProgramToCanonicalCss(source);
	const canonicalTarget = styleProgramToCanonicalCss(target);
	const differences: string[] = [];
	if (canonicalSource !== canonicalTarget) differences.push("canonical CSS differs");
	if (residuals.length > 0) differences.push(`${residuals.length} residual conversion(s)`);
	const lossiness: AdapterLossiness =
		canonicalSource !== canonicalTarget
			? "unsupported"
			: residuals.length > 0
				? "lossy"
				: "lossless";
	return {
		valid: differences.length === 0,
		lossiness,
		canonicalSource,
		canonicalTarget,
		differences,
		residuals,
	};
}

const SOURCE_MODULES: Readonly<Record<ExternalAdapterId, readonly string[]>> = {
	pandwind: ["pandwind/css", "pandwind/css/runtime"],
	emotion: ["@emotion/css", "@emotion/react"],
	"styled-components": ["styled-components"],
	"vanilla-extract": ["@vanilla-extract/css"],
	stitches: ["@stitches/react", "@stitches/core"],
	linaria: ["@linaria/core", "@linaria/react"],
	jss: ["jss", "react-jss"],
};

function adapter(
	id: ExternalAdapterId,
	patterns: readonly CallPattern[],
	packages: AdapterDependencies,
	capabilities: AdapterCapabilities,
	emitCall: (program: StyleProgram) => { text: string; imports: readonly string[] },
	detectPatterns: readonly RegExp[],
): StyleAdapter {
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id,
		version: "2",
		sourceModules: SOURCE_MODULES[id] ?? [],
		capabilities,
		dependencies: packages,
		detect: (context) => detectBy(detectPatterns, context),
		loadConfig: (context) => configFor(id, context),
		parse: (source, context) => parseCalls(source, context, patterns),
		emit: (program, _context) => {
			const rendered = emitCall(program);
			return { ...rendered, dependencies: packages, residuals: [...program.residuals] };
		},
		validate: validatePrograms,
	};
}

function removeExcludedMatches(source: string, pattern: RegExp): string {
	let mask: ReturnType<typeof computeExcludedRanges> | undefined;
	try {
		mask = computeExcludedRanges(source, "pandwind-adapter.ts");
	} catch {
		// Keep cleanup best-effort for incomplete source snippets.
	}
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		if (mask?.isExcluded(start)) continue;
		edits.push({ start, end: start + match[0].length, text: "" });
	}
	return applyEdits(source, edits);
}

export function removeSourceImports(code: string, modules: readonly string[]): string {
	let result = code;
	for (const module of modules) {
		const quoted = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		result = removeExcludedMatches(
			result,
			new RegExp(`\\bimport\\s+(?:[^;]*?\\s+from\\s+)?["']${quoted}["']\\s*;?`, "g"),
		);
	}
	result = removeExcludedMatches(
		result,
		/\b(?:const|let|var)\s+css\s*=\s*(?:createCss|createRuntimeCss)\s*\([^;]*\);?/g,
	);
	return removeExcludedMatches(result, /\bconst\s*\{[^}]*\}\s*=\s*createStitches\s*\([^;]*\);?/g);
}

export function consolidateImports(statements: Iterable<string>): string[] {
	const grouped = new Map<string, { defaultImport?: string; named: Set<string> }>();
	const other: string[] = [];
	for (const statement of statements) {
		const match = /^import\s+(.+?)\s+from\s+["']([^"']+)["'];?$/.exec(statement.trim());
		if (match?.[1] === undefined || match[2] === undefined) {
			other.push(statement);
			continue;
		}
		const group = grouped.get(match[2]) ?? { named: new Set<string>() };
		const specifier = match[1].trim();
		if (specifier.startsWith("{")) {
			for (const name of specifier.slice(1, -1).split(",")) {
				const trimmed = name.trim();
				if (trimmed) group.named.add(trimmed);
			}
		} else {
			const [defaultPart, namedPart] = specifier.split(/\s*,\s*\{/);
			if (defaultPart !== undefined && defaultPart !== "") group.defaultImport = defaultPart.trim();
			if (namedPart !== undefined) {
				for (const name of namedPart.replace(/}\s*$/, "").split(",")) {
					const trimmed = name.trim();
					if (trimmed) group.named.add(trimmed);
				}
			}
		}
		grouped.set(match[2], group);
	}
	return [
		...[...grouped].map(([module, group]) => {
			const named = group.named.size > 0 ? `{ ${[...group.named].toSorted().join(", ")} }` : "";
			const specifier = [group.defaultImport, named].filter(Boolean).join(", ");
			return `import ${specifier} from "${module}";`;
		}),
		...other,
	];
}

export function validationSource(text: string, program: StyleProgram): string {
	const rule = program.rules[0];
	return rule?.kind === "keyframes" && rule.name !== undefined
		? `const ${rule.name} = ${text}`
		: text;
}

const EMOTION = adapter(
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
		"framework-semantics": "partial",
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
	[/@emotion\/(?:css|styled)/, /\bcss\s*\(\s*\{/],
);

const STYLED_COMPONENTS = adapter(
	"styled-components",
	[
		{ name: "styled", regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*\{/g },
		{
			name: "styled-template",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
		{ name: "createGlobalStyle", regex: /\bcreateGlobalStyle\s*\(\s*\{/g },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	dependency("styled-components", "peer"),
	allRuleCapabilities("styled-components", "exact", {
		"theme-context": "exact",
		"runtime-context": "exact",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "partial",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
		components: "exact",
	}),
	(program) => {
		const kind = firstKind(program);
		if (kind === "keyframes")
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "styled-components";'],
			};
		if (kind === "global")
			return {
				text: `createGlobalStyle(${programObject(program)})`,
				imports: ['import { createGlobalStyle } from "styled-components";'],
			};
		return {
			text: `${program.source?.subject ?? "styled.div"}(${programObject(program)})`,
			imports: ['import styled from "styled-components";'],
		};
	},
	[/styled-components/, /\bstyled\s*\./],
);

const VANILLA_EXTRACT = adapter(
	"vanilla-extract",
	[
		{ name: "style", regex: /\bstyle\s*\(\s*\{/g },
		{ name: "globalStyle", regex: /\bglobalStyle\s*\([^,{]+,\s*\{/g },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
		{ name: "fontFace", regex: /\bfontFace\s*\(\s*\{/g },
	],
	dependency("@vanilla-extract/css", "runtime"),
	allRuleCapabilities("vanilla-extract", "unsupported", {
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	(program) => {
		const kind = firstKind(program);
		if (kind === "keyframes")
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@vanilla-extract/css";'],
			};
		if (kind === "global") {
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
		}
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
	[/@vanilla-extract\/css/, /\b(?:style|globalStyle|keyframes)\s*\(/],
);

const STITCHES = adapter(
	"stitches",
	[
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{ name: "globalCss", regex: /\bglobalCss\s*\(\s*\{/g },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	dependency("@stitches/react", "peer"),
	allRuleCapabilities("stitches", "exact", {
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
	[/@stitches\/(?:react|core)/, /\bcreateStitches\s*\(/],
);

const LINARIA = adapter(
	"linaria",
	[
		{ name: "linaria-css", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{
			name: "linaria-styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
	],
	{
		packages: [
			dependency("@linaria/core", "peer").packages[0]!,
			dependency("@linaria/react", "peer").packages[0]!,
		],
	},
	allRuleCapabilities("linaria", "unsupported", {
		"dynamic-values": "partial",
		components: "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	(program) => {
		const component = program.source?.subject;
		const text = templateCss(program);
		if (component !== undefined)
			return {
				text: `${component}\`${text}\``,
				imports: ['import { styled } from "@linaria/react";'],
			};
		return {
			text: `css\`${text}\``,
			imports: ['import { css } from "@linaria/core";'],
		};
	},
	[/@linaria\/(?:core|react)/, /\b(?:css|styled)\s*`/],
);

const JSS = adapter(
	"jss",
	[
		{ name: "jss-useStyles", regex: /\bcreateUseStyles\s*\(\s*\{/g },
		{ name: "jss-styleSheet", regex: /\b(?:jss\.)?createStyleSheet\s*\(\s*\{/g },
	],
	{
		packages: [
			dependency("jss", "runtime").packages[0]!,
			dependency("react-jss", "peer").packages[0]!,
		],
	},
	allRuleCapabilities("jss", "unsupported", {
		"named-conditions": "exact",
		"dynamic-values": "partial",
		"rule-level": "partial",
		"global-rules": "unsupported",
		keyframes: "unsupported",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	(program) => {
		const subject = program.source?.subject ?? "createUseStyles";
		return {
			text: `${subject}(${programObject(program)})`,
			imports:
				subject === "createStyleSheet"
					? ['import { createStyleSheet } from "jss";']
					: ['import { createUseStyles } from "react-jss";'],
		};
	},
	[/from\s+["'](?:jss|react-jss)["']/, /\bcreate(?:UseStyles|StyleSheet)\s*\(/],
);

const PANDWIND = adapter(
	"pandwind",
	[{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g }],
	{ packages: [] },
	allRuleCapabilities("pandwind", "partial", { "dynamic-values": "partial" }),
	(program) => ({
		text: `css.class(${programObject(program)})`,
		imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
	}),
	[/\bcss\.class\s*\(/, /\bcreateCss\s*\(/],
);

export const EXTERNAL_ADAPTERS: Readonly<Record<ExternalAdapterId, StyleAdapter>> = {
	pandwind: PANDWIND,
	emotion: EMOTION,
	"styled-components": STYLED_COMPONENTS,
	"vanilla-extract": VANILLA_EXTRACT,
	stitches: STITCHES,
	linaria: LINARIA,
	jss: JSS,
	...Object.fromEntries(EXTRA_ADAPTERS.map((extraAdapter) => [extraAdapter.id, extraAdapter])),
};

/** Built-ins are merely the default plugin set; consumers may derive a registry and discover more. */
export const EXTERNAL_ADAPTER_REGISTRY: StyleAdapterRegistry = createStyleAdapterRegistry(
	Object.values(EXTERNAL_ADAPTERS),
);

const externalDialect = (registeredAdapter: StyleAdapter) =>
	asStyleDialect(registeredAdapter, {
		system: registeredAdapter.id === "pandwind" ? "pandwind-external" : registeredAdapter.id,
		dialect: "css",
		role: "both",
	});

/** Registry is the extension point; the object remains a read-only lookup projection. */
export const EXTERNAL_STYLE_SYSTEMS: StyleSystemRegistry = createStyleSystemRegistry(
	Object.values(EXTERNAL_ADAPTERS).map((registeredAdapter) =>
		createStyleSystem(
			registeredAdapter.id === "pandwind" ? "pandwind-external" : registeredAdapter.id,
			[externalDialect(registeredAdapter)],
		),
	),
);

export const EXTERNAL_ADAPTER_IDS: readonly ExternalAdapterId[] = Object.keys(EXTERNAL_ADAPTERS);

export function getExternalAdapter(id: string): StyleAdapter | undefined {
	return EXTERNAL_STYLE_SYSTEMS.getDialect(id);
}

export { runAdapterMigration } from "./adapter-migration.ts";
export type { AdapterMigrationOptions, AdapterMigrationResult } from "./adapter-migration.ts";
