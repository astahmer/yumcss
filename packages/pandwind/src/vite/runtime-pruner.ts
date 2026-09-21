import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { walkWithParent, type OxcNode } from "../tw/literal.ts";
import { ImportKindTag, NodeKind } from "../ast-node-kind.ts";
import {
	CSS_RUNTIME_METHODS,
	CssRuntimeFactoryTag,
	CssRuntimeMethodTag,
	normalizeCssRuntimeMethods,
	renderCssRuntimeModule,
	type CssRuntimeFactory,
	type CssRuntimeMethod,
} from "../css/runtime-codegen.ts";
import { identifierName, memberName as genericMemberName } from "./ast-walk.ts";
import { markCssFactoryCallsPure } from "./css-call-rewriter.ts";
import type { CssPreset } from "./css-extract.ts";

const VIRTUAL_PREFIX = "pandwind:runtime/css";
const CSS_RUNTIME_SOURCES =
	/(?:^|\/)pandwind\/(?:css(?:\/(?:index|create-css|generated))?|unsafe\/css|design)(?:\.[cm]?[jt]s)?$/;

interface ImportSpecifierNode {
	type?: string;
	imported?: { name?: string };
	local?: { name?: string; start?: number };
	importKind?: string;
}

interface ImportNode extends OxcNode {
	start?: number;
	end?: number;
	source?: { value?: string; start?: number; end?: number };
	specifiers?: ImportSpecifierNode[];
	importKind?: string;
}

interface IdentifierNode extends OxcNode {
	name?: string;
	start?: number;
	end?: number;
}

interface MemberNode extends OxcNode {
	object?: OxcNode | null;
	property?: IdentifierNode | null;
	computed?: boolean;
}

interface CallNode extends OxcNode {
	callee?: OxcNode | null;
	arguments?: OxcNode[];
}

interface DeclaratorNode extends OxcNode {
	id?: IdentifierNode;
	init?: CallNode | null;
}

interface RuntimeImport {
	sourceStart: number;
	sourceEnd: number;
	local: string;
	factory: CssRuntimeFactory;
}

interface Usage {
	readonly methods: Set<CssRuntimeMethod>;
	readonly properties: Set<string>;
	readonly conditions: Set<string>;
	readonly escaped: boolean;
	readonly sliceable: boolean;
}

const factoryForImport = (
	specifier: ImportSpecifierNode,
	declaration: ImportNode,
): CssRuntimeFactory | undefined => {
	if (
		declaration.importKind === ImportKindTag.Type ||
		specifier.importKind === ImportKindTag.Type ||
		specifier.type !== NodeKind.ImportSpecifier ||
		specifier.local?.name === undefined
	)
		return undefined;
	const source = (declaration.source?.value ?? "").replace(/\.[cm]?[jt]sx?$/u, "");
	const imported = specifier.imported?.name;
	if (imported === "createUnsafeCss" && source.endsWith("/unsafe/css"))
		return CssRuntimeFactoryTag.Unsafe;
	if (
		imported === "createCss" &&
		(source.endsWith("/css") || source.endsWith("/css/index") || source.endsWith("/css/create-css"))
	)
		return CssRuntimeFactoryTag.Preset;
	if (imported === "createGeneratedCss" && source.endsWith("/css/generated"))
		return CssRuntimeFactoryTag.Generated;
	if (
		imported === "createDesignCss" &&
		(source.endsWith("/design") || source.endsWith("/design/index"))
	)
		return CssRuntimeFactoryTag.Design;
	return undefined;
};

const isCreateCssImport = (specifier: ImportSpecifierNode, declaration: ImportNode): boolean =>
	factoryForImport(specifier, declaration) !== undefined;

const isCssRuntimeSource = (source: string): boolean => CSS_RUNTIME_SOURCES.test(source);

const memberName = (node: OxcNode | null | undefined): CssRuntimeMethod | undefined => {
	if (node?.type !== NodeKind.MemberExpression) return undefined;
	const member = node as MemberNode;
	if (member.computed === true) return undefined;
	const name = genericMemberName(node);
	return CSS_RUNTIME_METHODS.includes(name as CssRuntimeMethod)
		? (name as CssRuntimeMethod)
		: undefined;
};

const literalKeyName = (node: OxcNode | null | undefined): string | undefined => {
	if (node?.type === NodeKind.Identifier) return identifierName(node);
	if (node?.type !== NodeKind.Literal) return undefined;
	const value = (node as { value?: unknown }).value;
	return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
};

interface RuntimeStyleUsage {
	readonly properties: Set<string>;
	readonly conditions: Set<string>;
	sliceable: boolean;
}

const collectStyleObject = (node: OxcNode, usage: RuntimeStyleUsage): void => {
	if (!usage.sliceable) return;
	if (node.type !== NodeKind.ObjectExpression) {
		usage.sliceable = false;
		return;
	}
	const properties = (node as { properties?: OxcNode[] }).properties ?? [];
	for (const propertyNode of properties) {
		if (propertyNode.type === NodeKind.SpreadElement) {
			usage.sliceable = false;
			return;
		}
		const property = propertyNode as {
			computed?: boolean;
			key?: OxcNode | null;
			value?: OxcNode | null;
		};
		const key = literalKeyName(property.key);
		if (property.computed === true || key === undefined) {
			usage.sliceable = false;
			return;
		}
		usage.properties.add(key);
		if (key.startsWith("_") || key.startsWith("@")) usage.conditions.add(key);
		const value = property.value;
		if (value?.type === NodeKind.ObjectExpression) collectStyleObject(value, usage);
		else if (value?.type === NodeKind.ArrayExpression) {
			for (const element of (value as { elements?: OxcNode[] }).elements ?? []) {
				if (element?.type === NodeKind.ObjectExpression) collectStyleObject(element, usage);
			}
		}
	}
};

const collectStyleArguments = (
	argumentsList: readonly OxcNode[],
	usage: RuntimeStyleUsage,
): void => {
	for (const argument of argumentsList) collectStyleObject(argument, usage);
};

const collectGroupArgument = (argument: OxcNode | undefined, usage: RuntimeStyleUsage): void => {
	if (argument?.type !== NodeKind.ObjectExpression) {
		usage.sliceable = false;
		return;
	}
	for (const groupNode of (argument as { properties?: OxcNode[] }).properties ?? []) {
		if (groupNode.type === NodeKind.SpreadElement) {
			usage.sliceable = false;
			return;
		}
		const group = groupNode as { computed?: boolean; value?: OxcNode | null };
		if (group.computed === true) {
			usage.sliceable = false;
			return;
		}
		if (group.value?.type === NodeKind.ObjectExpression) collectStyleObject(group.value, usage);
		else if (group.value?.type !== NodeKind.Literal) usage.sliceable = false;
	}
};

const usageFor = (program: OxcNode, local: string): Usage => {
	const methods = new Set<CssRuntimeMethod>();
	const styleUsage: RuntimeStyleUsage = {
		properties: new Set(),
		conditions: new Set(),
		sliceable: true,
	};
	let escaped = false;
	const declarations = new Set<number>();

	walkWithParent(program, (node, _parent, ancestors) => {
		if (node.type !== NodeKind.VariableDeclarator) return;
		const declarator = node as DeclaratorNode;
		if (declarator.id?.name !== local || declarator.id.start === undefined) return;
		declarations.add(declarator.id.start);
		if (ancestors.some((ancestor) => ancestor.type.startsWith("Export"))) escaped = true;
	});

	walkWithParent(program, (node, parent, ancestors) => {
		if (node.type === NodeKind.CallExpression) {
			const call = node as CallNode;
			const callee = call.callee;
			const direct = identifierName(callee) === local;
			const member =
				callee?.type === NodeKind.MemberExpression &&
				(callee as MemberNode).object !== null &&
				identifierName((callee as MemberNode).object) === local
					? memberName(callee)
					: undefined;
			if (direct || member !== undefined) {
				if (member !== undefined) methods.add(member);
				if (member === CssRuntimeMethodTag.Group)
					collectGroupArgument(call.arguments?.[0], styleUsage);
				else if (
					direct ||
					member === CssRuntimeMethodTag.Class ||
					member === CssRuntimeMethodTag.Vars ||
					member === CssRuntimeMethodTag.Raw
				)
					collectStyleArguments(call.arguments ?? [], styleUsage);
			}
		}
		if (node.type !== NodeKind.Identifier) return;
		const identifier = node as IdentifierNode;
		if (
			identifier.name !== local ||
			identifier.start === undefined ||
			declarations.has(identifier.start)
		)
			return;

		if (parent === undefined) {
			escaped = true;
			return;
		}
		if (parent.type === NodeKind.CallExpression && (parent as CallNode).callee === node) return;
		if (parent.type === NodeKind.MemberExpression && (parent as MemberNode).object === node) {
			const method = memberName(parent);
			const grandparent = ancestors.at(-2);
			if (
				method === undefined ||
				grandparent?.type !== NodeKind.CallExpression ||
				(grandparent as CallNode).callee !== parent
			)
				escaped = true;
			else methods.add(method);
			return;
		}
		escaped = true;
	});

	return {
		methods,
		properties: styleUsage.properties,
		conditions: styleUsage.conditions,
		escaped,
		sliceable: styleUsage.sliceable,
	};
};

const findFactoryVariables = (program: OxcNode, imported: Set<string>): Set<string> => {
	const result = new Set<string>();
	walkWithParent(program, (node) => {
		if (node.type !== NodeKind.VariableDeclarator) return;
		const declarator = node as DeclaratorNode;
		const local = declarator.id?.name;
		const init = declarator.init;
		if (
			local === undefined ||
			init?.type !== NodeKind.CallExpression ||
			identifierName(init.callee) === undefined ||
			!imported.has(identifierName(init.callee)!)
		)
			return;
		result.add(local);
	});
	return result;
};

const collectImports = (program: OxcNode): RuntimeImport[] => {
	const imports: RuntimeImport[] = [];
	walkWithParent(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const declaration = node as ImportNode;
		const source = declaration.source?.value;
		const sourceStart = declaration.source?.start;
		const sourceEnd = declaration.source?.end;
		if (!isCssRuntimeSource(source ?? "") || sourceStart === undefined || sourceEnd === undefined)
			return;
		const hasOtherRuntimeImport = (declaration.specifiers ?? []).some(
			(specifier) =>
				declaration.importKind !== ImportKindTag.Type &&
				specifier.importKind !== ImportKindTag.Type &&
				!isCreateCssImport(specifier, declaration),
		);
		if (hasOtherRuntimeImport) return;
		for (const specifier of declaration.specifiers ?? []) {
			const factory = factoryForImport(specifier, declaration);
			if (factory === undefined) continue;
			imports.push({ sourceStart, sourceEnd, local: specifier.local!.name!, factory });
		}
	});
	return imports;
};

const usageForFactory = (program: OxcNode, local: string): Usage | undefined => {
	const variables = findFactoryVariables(program, new Set([local]));
	if (variables.size === 0) return undefined;
	const methods = new Set<CssRuntimeMethod>();
	const properties = new Set<string>();
	const conditions = new Set<string>();
	let sliceable = true;
	for (const variable of variables) {
		const usage = usageFor(program, variable);
		if (usage.escaped) return undefined;
		for (const method of usage.methods) methods.add(method);
		for (const property of usage.properties) properties.add(property);
		for (const condition of usage.conditions) conditions.add(condition);
		sliceable &&= usage.sliceable;
	}
	return {
		methods: new Set(normalizeCssRuntimeMethods([...methods])),
		properties,
		conditions,
		escaped: false,
		sliceable,
	};
};

const virtualIdFor = (
	factory: CssRuntimeFactory,
	methods: ReadonlySet<CssRuntimeMethod>,
	presetKey?: string,
): string => {
	const methodQuery = normalizeCssRuntimeMethods([...methods]).join(",");
	const factoryQuery = factory === CssRuntimeFactoryTag.Unsafe ? "" : `factory=${factory}&`;
	const sliceQuery = presetKey === undefined ? "" : `&slice=${presetKey}`;
	return `${VIRTUAL_PREFIX}?${factoryQuery}methods=${methodQuery}${sliceQuery}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isSerializableRuntimeValue = (value: unknown, seen = new Set<object>()): boolean => {
	if (value === undefined || value === null) return true;
	if (typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value !== "object" || seen.has(value)) return false;
	seen.add(value);
	const valid = Array.isArray(value)
		? value.every((item) => isSerializableRuntimeValue(item, seen))
		: isRecord(value) &&
			(Object.getPrototypeOf(value) === Object.prototype ||
				Object.getPrototypeOf(value) === null) &&
			Object.values(value).every((item) => isSerializableRuntimeValue(item, seen));
	seen.delete(value);
	return valid;
};

const runtimePresetSource = (
	preset: CssPreset,
	usage: Usage,
	factory: CssRuntimeFactory,
): string | undefined => {
	if (
		factory === CssRuntimeFactoryTag.Unsafe ||
		factory === CssRuntimeFactoryTag.Design ||
		!usage.sliceable
	)
		return undefined;

	const properties = Object.create(null) as Record<string, unknown>;
	const tokenGroups = new Set<string>();
	let needsColorPalettes = false;
	for (const propertyName of usage.properties) {
		const property = Object.entries(preset.properties).find(([name]) => name === propertyName)?.[1];
		if (property === undefined) continue;
		if (!isSerializableRuntimeValue(property)) return undefined;
		properties[propertyName] = property;
		if (isRecord(property) && typeof property.$tokens === "string")
			tokenGroups.add(property.$tokens);
		if (propertyName === "colorPalette") needsColorPalettes = true;
	}

	const conditions = Object.create(null) as Record<string, unknown>;
	const conditionNames = new Set([...usage.conditions, ...usage.properties]);
	for (const conditionName of conditionNames) {
		const condition = preset.conditions[conditionName];
		if (condition === undefined) continue;
		if (!isSerializableRuntimeValue(condition)) return undefined;
		conditions[conditionName] = condition;
	}

	const tokens = Object.create(null) as Record<string, unknown>;
	for (const group of tokenGroups) {
		const values = preset.tokens[group];
		if (values === undefined) continue;
		if (typeof values === "function" || !isSerializableRuntimeValue(values)) return undefined;
		tokens[group] = values;
	}

	const projected: Record<string, unknown> = {
		conditions,
		properties,
		strict: preset.strict,
		tokens,
	};
	if (needsColorPalettes && preset.colorPalettes !== undefined) {
		if (!isSerializableRuntimeValue(preset.colorPalettes)) return undefined;
		projected.colorPalettes = preset.colorPalettes;
	}
	if (preset.tokenVariables !== undefined) {
		const tokenVariables = Object.create(null) as Record<string, unknown>;
		for (const group of tokenGroups) {
			const values = preset.tokenVariables[group];
			if (values !== undefined) tokenVariables[group] = values;
		}
		projected.tokenVariables = tokenVariables;
	}
	if (!isSerializableRuntimeValue(projected)) return undefined;
	return JSON.stringify(projected);
};

const runtimePresetKey = (source: string): string => {
	let hash = 2166136261;
	for (let index = 0; index < source.length; index++) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
};

interface PresetArgumentRewrite {
	readonly edits: Array<{ start: number; end: number; text: string }>;
	readonly names: ReadonlySet<string>;
}

const presetArgumentEdits = (
	program: OxcNode,
	factoryLocal: string,
): PresetArgumentRewrite | undefined => {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const names = new Set<string>();
	walkWithParent(program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const call = node as CallNode;
		const argument = call.arguments?.[0] as IdentifierNode | undefined;
		if (
			identifierName(call.callee) !== factoryLocal ||
			argument?.start === undefined ||
			argument.end === undefined ||
			argument.type !== NodeKind.Identifier
		)
			return;
		const name = identifierName(argument);
		if (name === undefined) return;
		names.add(name);
		edits.push({
			start: argument.start!,
			end: argument.end!,
			text: "undefined",
		});
	});
	return names.size === 1 ? { edits, names } : undefined;
};

const dropUnusedPresetImport = (
	program: OxcNode,
	names: ReadonlySet<string>,
	argumentEdits: ReadonlySet<number>,
): Array<{ start: number; end: number; text: string }> => {
	const references = new Map<string, number>();
	walkWithParent(program, (node, parent) => {
		if (node.type !== NodeKind.Identifier) return;
		const identifier = node as IdentifierNode;
		if (identifier.name === undefined || identifier.start === undefined) return;
		if (
			parent?.type === NodeKind.ImportSpecifier ||
			parent?.type === NodeKind.ImportDefaultSpecifier ||
			parent?.type === NodeKind.ImportNamespaceSpecifier
		)
			return;
		if (argumentEdits.has(identifier.start)) return;
		references.set(identifier.name, (references.get(identifier.name) ?? 0) + 1);
	});
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let foundImport = false;
	walkWithParent(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const declaration = node as ImportNode;
		const specifiers = declaration.specifiers ?? [];
		const locals = specifiers
			.map((specifier) => specifier.local?.name)
			.filter((local): local is string => local !== undefined);
		if (
			locals.length !== 1 ||
			!locals.every((local) => names.has(local)) ||
			locals.some((local) => (references.get(local) ?? 0) > 0) ||
			declaration.start === undefined ||
			declaration.end === undefined
		)
			return;
		foundImport = true;
		edits.push({ start: declaration.start, end: declaration.end, text: "" });
	});
	return foundImport ? edits : [];
};

const parseRuntimeModule = (
	id: string,
): { factory: CssRuntimeFactory; methods: CssRuntimeMethod[] } => {
	const queryStart = id.indexOf("?");
	const query = queryStart === -1 ? "" : id.slice(queryStart + 1);
	const params = new URLSearchParams(query);
	const raw = params.get("methods")?.split(",") ?? [];
	const selected = CSS_RUNTIME_METHODS.filter((method) => raw.includes(method));
	const factoryValue = params.get("factory");
	const factory =
		factoryValue === CssRuntimeFactoryTag.Preset ||
		factoryValue === CssRuntimeFactoryTag.Generated ||
		factoryValue === CssRuntimeFactoryTag.Design
			? factoryValue
			: CssRuntimeFactoryTag.Unsafe;
	return { factory, methods: normalizeCssRuntimeMethods(selected) };
};

export interface RuntimePruningTransform {
	transform(code: string, id: string): { code: string; map: null } | null;
	resolveId(source: string): string | null;
	load(id: string): string | null;
}

export interface RuntimePruningOptions {
	readonly preset?: CssPreset;
}

/** Select the smallest safe CSS runtime for each local factory usage. */
export const createRuntimePruningTransform = (
	options: RuntimePruningOptions = {},
): RuntimePruningTransform => {
	const runtimeModuleCache = new Map<string, string>();
	const runtimePresetSources = new Map<string, string>();
	const runtimeModuleCacheLimit = 64;

	return {
		transform(code, id) {
			if (!SOURCE_SCANNER_SERVICE.isScriptFile(id)) return null;
			const pureCode = markCssFactoryCallsPure(code, id);
			const pureChanged = pureCode !== code;
			code = pureCode;
			const program = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code })
				.program as unknown as OxcNode;
			const imports = collectImports(program);
			if (imports.length === 0) return pureChanged ? { code, map: null } : null;
			const replacements = new Map<string, { start: number; end: number; text: string }>();
			for (const runtimeImport of imports) {
				const usage = usageForFactory(program, runtimeImport.local);
				if (usage === undefined) continue;
				const candidatePresetSource =
					options.preset === undefined
						? undefined
						: runtimePresetSource(options.preset, usage, runtimeImport.factory);
				const argumentRewrite =
					candidatePresetSource === undefined
						? undefined
						: presetArgumentEdits(program, runtimeImport.local);
				const presetSource =
					candidatePresetSource !== undefined && argumentRewrite !== undefined
						? candidatePresetSource
						: undefined;
				if (usage.methods.size === CSS_RUNTIME_METHODS.length && presetSource === undefined)
					continue;
				const presetKey = presetSource === undefined ? undefined : runtimePresetKey(presetSource);
				const virtualId = virtualIdFor(runtimeImport.factory, usage.methods, presetKey);
				const replacement = {
					start: runtimeImport.sourceStart,
					end: runtimeImport.sourceEnd,
					text: JSON.stringify(virtualId),
				};
				replacements.set(`${replacement.start}:${replacement.end}`, replacement);
				if (presetSource !== undefined) {
					runtimePresetSources.set(`\0${virtualId}`, presetSource);
					for (const edit of argumentRewrite!.edits) {
						replacements.set(`${edit.start}:${edit.end}`, edit);
					}
					for (const edit of dropUnusedPresetImport(
						program,
						argumentRewrite!.names,
						new Set(argumentRewrite!.edits.map((edit) => edit.start)),
					))
						replacements.set(`${edit.start}:${edit.end}`, edit);
				}
			}
			if (replacements.size === 0) return pureChanged ? { code, map: null } : null;
			let output = code;
			for (const replacement of [...replacements.values()].toSorted(
				(left, right) => right.start - left.start,
			)) {
				output =
					output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
			}
			return { code: output, map: null };
		},
		resolveId(source) {
			return source.startsWith(VIRTUAL_PREFIX) ? `\0${source}` : null;
		},
		load(id) {
			if (!id.startsWith(`\0${VIRTUAL_PREFIX}?`)) return null;
			const cached = runtimeModuleCache.get(id);
			if (cached !== undefined) return cached;
			if (runtimeModuleCache.size >= runtimeModuleCacheLimit) {
				runtimeModuleCache.clear();
				runtimePresetSources.clear();
			}
			const parsed = parseRuntimeModule(id);
			const module = renderCssRuntimeModule(parsed.methods, {
				factory: parsed.factory,
				presetSource: runtimePresetSources.get(id),
			});
			runtimeModuleCache.set(id, module);
			return module;
		},
	};
};
