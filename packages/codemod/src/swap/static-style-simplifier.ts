import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { NodeKind, type OxcNode, walk, walkWithParent } from "pandwind/tw/literal";
import { SourcePass, type SourceEdit } from "../source-pass-utils.ts";

export interface PandwindStaticStyleSimplification {
	readonly code: string;
	readonly changed: boolean;
}

type StaticClassCall = {
	readonly node: OxcNode;
	readonly properties: readonly OxcNode[];
};

type StackAttribute = {
	readonly text: string;
};

const isNode = (value: unknown): value is OxcNode => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	return "type" in value && typeof value.type === "string";
};

const childNode = (node: unknown, name: string): OxcNode | undefined => {
	if (!isNode(node)) return undefined;
	const value = node[name];
	return isNode(value) ? value : undefined;
};

const childNodes = (node: unknown, name: string): readonly OxcNode[] | undefined => {
	if (!isNode(node)) return undefined;
	const value = node[name];
	if (!Array.isArray(value) || !value.every(isNode)) return undefined;
	return value;
};

const nodeName = (value: unknown): string | undefined => {
	if (!isNode(value) || typeof value.name !== "string") return undefined;
	return value.name;
};

const nodeRange = (node: unknown): { readonly start: number; readonly end: number } | undefined => {
	if (!isNode(node)) return undefined;
	if (typeof node.start !== "number" || typeof node.end !== "number") return undefined;
	return { start: node.start, end: node.end };
};

const unwrapExpression = (value: unknown): OxcNode | undefined => {
	if (!isNode(value)) return undefined;
	if (
		value.type === NodeKind.ParenthesizedExpression ||
		value.type === NodeKind.TSAsExpression ||
		value.type === NodeKind.TSSatisfiesExpression ||
		value.type === NodeKind.TSTypeAssertion
	)
		return unwrapExpression(value.expression);
	return value;
};

const isStaticLiteral = (node: OxcNode): boolean => {
	if (node.type !== NodeKind.Literal) return false;
	const value = node.value;
	return value === null || ["string", "number", "boolean", "bigint"].includes(typeof value);
};

const propertyName = (property: OxcNode): string | undefined => {
	if (property.type !== NodeKind.Property || property.computed === true) return undefined;
	const key = childNode(property, "key");
	if (key === undefined) return undefined;
	if (key.type === NodeKind.Identifier || key.type === NodeKind.JSXIdentifier) return nodeName(key);
	if (key.type === NodeKind.Literal && typeof key.value === "string") return key.value;
	return undefined;
};

const isStaticExpression = (value: unknown): boolean => {
	const node = unwrapExpression(value);
	if (node === undefined) return false;
	if (isStaticLiteral(node)) return true;
	if (node.type === NodeKind.Identifier) return nodeName(node) === "undefined";
	if (node.type === NodeKind.TemplateLiteral) {
		const expressions = node["expressions"];
		return Array.isArray(expressions) && expressions.length === 0;
	}
	if (node.type === NodeKind.UnaryExpression) {
		const argument = node["argument"];
		return isStaticExpression(argument);
	}
	if (node.type === NodeKind.ArrayExpression) {
		const elements = node["elements"];
		return (
			Array.isArray(elements) &&
			elements.every((element) => element === null || isStaticExpression(element))
		);
	}
	if (node.type === NodeKind.ObjectExpression) {
		const properties = childNodes(node, "properties");
		return properties !== undefined && properties.every(isStaticProperty);
	}
	return false;
};

const isSimpleStaticExpression = (value: unknown): boolean => {
	const node = unwrapExpression(value);
	if (node === undefined) return false;
	if (isStaticLiteral(node)) return true;
	if (node.type !== NodeKind.TemplateLiteral) return false;
	const expressions = node["expressions"];
	return Array.isArray(expressions) && expressions.length === 0;
};

const isStaticProperty = (property: OxcNode): boolean => {
	if (
		property.type !== NodeKind.Property ||
		property.kind !== "init" ||
		property.method === true ||
		property.computed === true ||
		propertyName(property) === undefined
	)
		return false;
	return isStaticExpression(property.value);
};

const isCssClassCall = (value: unknown): StaticClassCall | undefined => {
	const call = unwrapExpression(value);
	if (call?.type !== NodeKind.CallExpression) return undefined;
	const callee = childNode(call, "callee");
	if (
		callee?.type !== NodeKind.MemberExpression ||
		callee.computed === true ||
		nodeName(callee.object) !== "css" ||
		nodeName(callee.property) !== "class"
	)
		return undefined;
	const args = childNodes(call, "arguments");
	if (args?.length !== 1) return undefined;
	const object = unwrapExpression(args[0]);
	if (object?.type !== NodeKind.ObjectExpression) return undefined;
	const properties = childNodes(object, "properties");
	if (properties === undefined || !properties.every(isStaticProperty)) return undefined;
	return { node: call, properties };
};

const isCxCall = (value: unknown): value is OxcNode => {
	const node = unwrapExpression(value);
	return node?.type === NodeKind.CallExpression && nodeName(node.callee) === "cx";
};

type StaticObjectProperty = {
	readonly name: string;
	readonly keySource: string;
	readonly node: OxcNode;
	readonly source: string;
};

const staticObjectProperties = (
	node: OxcNode,
	source: string,
): readonly StaticObjectProperty[] | undefined => {
	const object = unwrapExpression(node);
	if (object?.type !== NodeKind.ObjectExpression) return undefined;
	const properties = childNodes(object, "properties");
	if (properties === undefined) return undefined;
	const output: StaticObjectProperty[] = [];
	for (const property of properties) {
		const name = propertyName(property);
		const key = childNode(property, "key");
		const value = childNode(property, "value");
		const keyRange = key === undefined ? undefined : nodeRange(key);
		const range = nodeRange(property);
		if (
			name === undefined ||
			keyRange === undefined ||
			range === undefined ||
			value === undefined ||
			!isStaticExpression(value)
		)
			return undefined;
		output.push({
			name,
			keySource: source.slice(keyRange.start, keyRange.end),
			node: value,
			source: source.slice(range.start, range.end),
		});
	}
	return output;
};

const staticValueSource = (node: OxcNode, source: string): string | undefined => {
	const range = nodeRange(node);
	return range === undefined ? undefined : source.slice(range.start, range.end);
};

const staticConditionProperties = (
	node: OxcNode,
	source: string,
): readonly StaticObjectProperty[] | undefined => {
	if (isSimpleStaticExpression(node)) {
		const valueSource = staticValueSource(node, source);
		return valueSource === undefined
			? undefined
			: [{ name: "base", keySource: "base", node, source: `base: ${valueSource}` }];
	}
	return staticObjectProperties(node, source);
};

const mergeStaticValueSources = (
	left: OxcNode,
	right: OxcNode,
	source: string,
): string | undefined => {
	const leftNode = unwrapExpression(left);
	const rightNode = unwrapExpression(right);
	if (leftNode === undefined || rightNode === undefined) return undefined;
	const leftSource = staticValueSource(leftNode, source);
	const rightSource = staticValueSource(rightNode, source);
	if (leftSource === undefined || rightSource === undefined) return undefined;
	if (leftSource === rightSource) return rightSource;
	if (isSimpleStaticExpression(leftNode) && isSimpleStaticExpression(rightNode)) return rightSource;
	const leftProperties = staticConditionProperties(leftNode, source);
	const rightProperties = staticConditionProperties(rightNode, source);
	if (leftProperties === undefined || rightProperties === undefined) return undefined;
	const propertiesByName = new Map<string, StaticObjectProperty>();
	const propertyOrder: string[] = [];
	for (const property of [...leftProperties, ...rightProperties]) {
		const previous = propertiesByName.get(property.name);
		if (previous === undefined) {
			propertyOrder.push(property.name);
			propertiesByName.set(property.name, property);
			continue;
		}
		const mergedValue = mergeStaticValueSources(previous.node, property.node, source);
		if (mergedValue === undefined) return undefined;
		propertiesByName.set(property.name, {
			...property,
			source: `${property.keySource}: ${mergedValue}`,
		});
	}
	return `{ ${propertyOrder.map((name) => propertiesByName.get(name)?.source ?? "").join(", ")} }`;
};

const mergedClassExpression = (
	calls: readonly StaticClassCall[],
	source: string,
): string | undefined => {
	const propertiesByName = new Map<string, { readonly node: OxcNode; readonly source: string }>();
	const propertyOrder: string[] = [];
	for (const call of calls) {
		for (const property of call.properties) {
			const name = propertyName(property);
			const range = nodeRange(property);
			if (name === undefined || range === undefined) return undefined;
			const propertySource = source.slice(range.start, range.end);
			const previous = propertiesByName.get(name);
			if (previous === undefined) {
				propertyOrder.push(name);
				propertiesByName.set(name, { node: property, source: propertySource });
				continue;
			}
			if (previous.source === propertySource) continue;
			const previousValue = childNode(previous.node, "value");
			const currentValue = childNode(property, "value");
			if (previousValue === undefined || currentValue === undefined) return undefined;
			const mergedValue = mergeStaticValueSources(previousValue, currentValue, source);
			const key = childNode(property, "key");
			const keyRange = key === undefined ? undefined : nodeRange(key);
			if (mergedValue === undefined || keyRange === undefined) return undefined;
			propertiesByName.set(name, {
				node: property,
				source: `${source.slice(keyRange.start, keyRange.end)}: ${mergedValue}`,
			});
		}
	}
	return `css.class({ ${propertyOrder.map((name) => propertiesByName.get(name)!.source).join(", ")} })`;
};

const simplifyStaticCxCalls = (source: string, file: string): string => {
	if (!isScriptFile(file)) return source;
	const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
	if (parsed.errors.length > 0) return source;
	const edits: SourceEdit[] = [];
	walk(parsed.program, (node) => {
		if (node.type !== NodeKind.CallExpression || !isCxCall(node)) return;
		const calls = childNodes(node, "arguments")?.map(isCssClassCall);
		const range = nodeRange(node);
		if (
			calls === undefined ||
			range === undefined ||
			!calls.every((call): call is StaticClassCall => call !== undefined)
		)
			return;
		const replacement = mergedClassExpression(calls, source);
		if (replacement !== undefined)
			edits.push({ start: range.start, end: range.end, text: replacement });
	});
	return SourcePass.applyEdits(source, edits);
};

const simplifyMixedStaticCxCalls = (source: string, file: string): string => {
	if (!isScriptFile(file)) return source;
	const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
	if (parsed.errors.length > 0) return source;
	const edits: SourceEdit[] = [];
	walk(parsed.program, (node) => {
		if (node.type !== NodeKind.CallExpression || !isCxCall(node)) return;
		const args = childNodes(node, "arguments");
		const range = nodeRange(node);
		if (args === undefined || range === undefined) return;
		if (
			args.every((argument) => isCssClassCall(argument) !== undefined) ||
			args.every((argument) => isCssClassCall(argument) === undefined)
		)
			return;
		const expressions: string[] = [];
		for (let index = 0; index < args.length;) {
			const staticCalls: StaticClassCall[] = [];
			while (index < args.length) {
				const staticCall = isCssClassCall(args[index]);
				if (staticCall === undefined) break;
				staticCalls.push(staticCall);
				index += 1;
			}
			if (staticCalls.length > 0) {
				const merged = mergedClassExpression(staticCalls, source);
				if (merged === undefined) return;
				expressions.push(merged);
				continue;
			}
			const argumentRange = nodeRange(args[index]);
			if (argumentRange === undefined) return;
			expressions.push(source.slice(argumentRange.start, argumentRange.end));
			index += 1;
		}
		edits.push({
			start: range.start,
			end: range.end,
			text: `css.props(${expressions.join(", ")}).className`,
		});
	});
	return SourcePass.applyEdits(source, edits);
};

const isPandwindStaticCarrier = (value: unknown, carrierNames: ReadonlySet<string>): boolean => {
	const node = unwrapExpression(value);
	if (node === undefined) return false;
	if (isCssClassCall(node)) return true;
	if (node.type === NodeKind.Identifier) return carrierNames.has(nodeName(node) ?? "");
	if (node.type === NodeKind.ConditionalExpression) {
		return (
			isPandwindStaticCarrier(node.consequent, carrierNames) ||
			isPandwindStaticCarrier(node.alternate, carrierNames)
		);
	}
	if (node.type === NodeKind.LogicalExpression) {
		return (
			isPandwindStaticCarrier(node.left, carrierNames) ||
			isPandwindStaticCarrier(node.right, carrierNames)
		);
	}
	return false;
};

const topLevelPandwindStaticCarrierNames = (program: unknown): ReadonlySet<string> => {
	const names = new Set<string>();
	for (const statement of childNodes(program, "body") ?? []) {
		if (statement.type !== NodeKind.VariableDeclaration) continue;
		for (const declaration of childNodes(statement, "declarations") ?? []) {
			const name = bindingName(declaration.id);
			if (name !== undefined && isPandwindStaticCarrier(declaration.init, new Set()))
				names.add(name);
		}
	}
	return names;
};

const flattenedCxArguments = (node: OxcNode, source: string): readonly string[] | undefined => {
	if (!isCxCall(node)) {
		const range = nodeRange(node);
		return range === undefined ? undefined : [source.slice(range.start, range.end)];
	}
	const argumentsList = childNodes(node, "arguments");
	if (argumentsList === undefined) return undefined;
	const flattened: string[] = [];
	for (const argument of argumentsList) {
		const values = flattenedCxArguments(argument, source);
		if (values === undefined) return undefined;
		flattened.push(...values);
	}
	return flattened;
};

const simplifyCarrierCxCalls = (source: string, file: string): string => {
	if (!isScriptFile(file)) return source;
	const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
	if (parsed.errors.length > 0) return source;
	const carrierNames = topLevelPandwindStaticCarrierNames(parsed.program);
	if (carrierNames.size === 0) return source;
	const edits: SourceEdit[] = [];
	walkWithParent(parsed.program, (node, _parent, ancestors) => {
		if (!isCxCall(node) || ancestors.some((ancestor) => isCxCall(ancestor))) return;
		const argumentsList = childNodes(node, "arguments");
		const range = nodeRange(node);
		if (argumentsList === undefined || range === undefined) return;
		if (!argumentsList.some((argument) => isPandwindStaticCarrier(argument, carrierNames))) return;
		const flattened = flattenedCxArguments(node, source);
		if (flattened === undefined || flattened.length === 0) return;
		edits.push({
			start: range.start,
			end: range.end,
			text: `css.props(${flattened.join(", ")}).className`,
		});
	});
	return SourcePass.applyEdits(source, edits);
};

const SCRIPT_FILE_PATTERN = /\.(?:c|m)?(?:j|t)sx?$/u;
const FUNCTION_NODE_TYPES: ReadonlySet<string> = new Set([
	NodeKind.ArrowFunctionExpression,
	NodeKind.FunctionDeclaration,
	NodeKind.FunctionExpression,
]);

const isDirectiveStatement = (node: OxcNode): boolean => {
	if (node.type !== NodeKind.ExpressionStatement) return false;
	const expression = unwrapExpression(node.expression);
	return expression?.type === NodeKind.Literal && typeof expression.value === "string";
};

const moduleStyleInsertionOffset = (program: unknown, source: string): number => {
	const body = childNodes(program, "body") ?? [];
	const imports = body.filter((node) => node.type === NodeKind.ImportDeclaration);
	const lastImport = imports.at(-1);
	const cssInitializer = body.find(
		(node) =>
			node.type === NodeKind.VariableDeclaration &&
			(childNodes(node, "declarations") ?? []).some(
				(declaration) => bindingName(declaration.id) === "css",
			),
	);
	const requiredStatements = [lastImport, cssInitializer].filter(
		(statement): statement is OxcNode => statement !== undefined,
	);
	const lastRequiredStatement = requiredStatements
		.toSorted((left, right) => (nodeRange(left)?.end ?? 0) - (nodeRange(right)?.end ?? 0))
		.at(-1);
	if (lastRequiredStatement !== undefined)
		return nodeRange(lastRequiredStatement)?.end ?? source.length;
	const firstNonDirective = body.find((node) => !isDirectiveStatement(node));
	return firstNonDirective === undefined
		? source.length
		: (nodeRange(firstNonDirective)?.start ?? source.length);
};

const isScriptFile = (file: string): boolean => SCRIPT_FILE_PATTERN.test(file);

const bindingName = (node: unknown): string | undefined => {
	if (!isNode(node)) return undefined;
	return node.type === NodeKind.Identifier ? nodeName(node) : undefined;
};

const topLevelBindingNames = (program: unknown): ReadonlySet<string> => {
	const names = new Set<string>();
	for (const statement of childNodes(program, "body") ?? []) {
		if (statement.type === NodeKind.VariableDeclaration) {
			for (const declaration of childNodes(statement, "declarations") ?? []) {
				const name = bindingName(declaration.id);
				if (name !== undefined) names.add(name);
			}
			continue;
		}
		if (
			statement.type === NodeKind.FunctionDeclaration ||
			statement.type === NodeKind.ClassDeclaration
		) {
			const name = bindingName(statement.id);
			if (name !== undefined) names.add(name);
			continue;
		}
		if (statement.type !== NodeKind.ImportDeclaration) continue;
		for (const specifier of childNodes(statement, "specifiers") ?? []) {
			const name = bindingName(specifier.local);
			if (name !== undefined) names.add(name);
		}
	}
	return names;
};

/** Move static css.class calls out of render functions so they run once per module. */
const hoistStaticCssClassCalls = (source: string, file: string): string => {
	if (!isScriptFile(file)) return source;
	const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
	if (parsed.errors.length > 0) return source;
	const usedNames = new Set<string>();
	const candidates: Array<{
		readonly node: OxcNode;
		readonly source: string;
		readonly bindingName?: string;
		readonly declaration?: OxcNode;
	}> = [];
	walkWithParent(parsed.program, (node, parent, ancestors) => {
		if (node.type === NodeKind.Identifier || node.type === NodeKind.JSXIdentifier) {
			const name = nodeName(node);
			if (name !== undefined) usedNames.add(name);
		}
		if (
			node.type !== NodeKind.CallExpression ||
			!ancestors.some((ancestor) => FUNCTION_NODE_TYPES.has(ancestor.type))
		)
			return;
		const call = isCssClassCall(node);
		const range = call === undefined ? undefined : nodeRange(node);
		if (call === undefined || range === undefined) return;
		const declaration =
			parent?.type === NodeKind.VariableDeclarator && parent.init === node
				? [...ancestors]
						.toReversed()
						.find((ancestor) => ancestor.type === NodeKind.VariableDeclaration)
				: undefined;
		const declarationIsSimpleConst =
			declaration?.kind === "const" && childNodes(declaration, "declarations")?.length === 1;
		const localName = declarationIsSimpleConst ? bindingName(parent?.id) : undefined;
		candidates.push({
			node,
			source: source.slice(range.start, range.end),
			...(localName === undefined || declaration === undefined
				? {}
				: { bindingName: localName, declaration }),
		});
	});
	if (candidates.length === 0) return source;

	const declarationNamesBySource = new Map<string, Set<string>>();
	for (const candidate of candidates) {
		if (candidate.bindingName === undefined) continue;
		const names = declarationNamesBySource.get(candidate.source) ?? new Set<string>();
		names.add(candidate.bindingName);
		declarationNamesBySource.set(candidate.source, names);
	}
	const topLevelNames = topLevelBindingNames(parsed.program);
	const namesBySource = new Map<string, string>();
	const assignedNames = new Set<string>();
	let nameIndex = 1;
	for (const candidate of candidates) {
		if (namesBySource.has(candidate.source)) continue;
		const declarationNames = declarationNamesBySource.get(candidate.source);
		const preferredName = declarationNames?.size === 1 ? [...declarationNames][0] : undefined;
		const canUsePreferredName =
			preferredName !== undefined &&
			!topLevelNames.has(preferredName) &&
			!assignedNames.has(preferredName);
		let name = canUsePreferredName ? preferredName : `staticClassName${nameIndex}`;
		while ((usedNames.has(name) && name !== preferredName) || assignedNames.has(name))
			name = `staticClassName${++nameIndex}`;
		nameIndex += 1;
		usedNames.add(name);
		assignedNames.add(name);
		namesBySource.set(candidate.source, name);
	}
	const replacements = candidates.flatMap((candidate) => {
		const range = nodeRange(candidate.node);
		const name = namesBySource.get(candidate.source);
		const hasHoistedDeclaration =
			candidate.declaration !== undefined && candidate.bindingName === name;
		if (hasHoistedDeclaration) return [];
		return range === undefined || name === undefined
			? []
			: [{ start: range.start, end: range.end, text: name }];
	});
	const removedDeclarations = candidates.flatMap((candidate) => {
		if (
			candidate.declaration === undefined ||
			candidate.bindingName !== namesBySource.get(candidate.source)
		)
			return [];
		const range = nodeRange(candidate.declaration);
		return range === undefined ? [] : [{ start: range.start, end: range.end, text: "" }];
	});
	const declarations = [...namesBySource.entries()]
		.map(([styleSource, name]) => `const ${name} = ${styleSource};`)
		.join("\n");
	const insertion = moduleStyleInsertionOffset(parsed.program, source);
	const prefix = insertion > 0 && source[insertion - 1] === "\n" ? "" : "\n";
	const suffix = source[insertion] === "\n" || source[insertion] === "\r" ? "" : "\n\n";
	return SourcePass.applyEdits(source, [
		...replacements,
		...removedDeclarations,
		{ start: insertion, end: insertion, text: `${prefix}${declarations}${suffix}` },
	]);
};

const literalValue = (node: unknown): string | number | undefined => {
	if (!isNode(node) || node.type !== NodeKind.Literal) return undefined;
	if (typeof node.value === "string" || typeof node.value === "number") return node.value;
	return undefined;
};

const stackDirection: ReadonlyMap<string, string | undefined> = new Map([
	["row", undefined],
	["column", "column"],
	["row-reverse", "row-reverse"],
	["column-reverse", "column-reverse"],
] as const);

const stackAlign: ReadonlyMap<string, string | undefined> = new Map([
	["start", "start"],
	["flex-start", "start"],
	["center", "center"],
	["end", "end"],
	["flex-end", "end"],
	["stretch", "stretch"],
	["baseline", "baseline"],
] as const);

const stackJustify: ReadonlyMap<string, string | undefined> = new Map([
	["start", "start"],
	["flex-start", "start"],
	["center", "center"],
	["end", "end"],
	["flex-end", "end"],
	["space-between", "between"],
	["space-around", "around"],
	["space-evenly", "evenly"],
] as const);

const renderStackAttribute = (name: string, value: string | number): StackAttribute => ({
	text: typeof value === "string" ? `${name}=${JSON.stringify(value)}` : `${name}={${value}}`,
});

const stackAttributeName = (attribute: OxcNode): string | undefined =>
	attribute.type === NodeKind.JSXAttribute ? nodeName(attribute.name) : undefined;

const simplifyStackOpening = (source: string, file: string): string => {
	if (!isScriptFile(file)) return source;
	const parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
	if (parsed.errors.length > 0) return source;
	const edits: SourceEdit[] = [];
	walk(parsed.program, (node) => {
		if (node.type !== NodeKind.JSXOpeningElement || nodeName(node.name) !== "Stack") return;
		const attributes = childNodes(node, "attributes");
		if (attributes === undefined) return;
		const classAttribute = attributes.find(
			(attribute) => stackAttributeName(attribute) === "className",
		);
		if (classAttribute === undefined) return;
		const attributeValue = childNode(classAttribute, "value");
		const expressionContainer =
			attributeValue?.type === NodeKind.JSXExpressionContainer
				? childNode(attributeValue, "expression")
				: undefined;
		const expression = unwrapExpression(expressionContainer);
		const directStyleCall = isCssClassCall(expression);
		let styleCall = directStyleCall;
		let cxArguments: readonly OxcNode[] | undefined;
		let staticArgumentIndex: number | undefined;
		if (styleCall === undefined && isCxCall(expression)) {
			const argumentsInCx = childNodes(expression, "arguments");
			if (argumentsInCx === undefined) return;
			const staticArguments = argumentsInCx
				.map((argument, index) => ({ argument, index, styleCall: isCssClassCall(argument) }))
				.filter(
					(
						item,
					): item is {
						readonly argument: OxcNode;
						readonly index: number;
						readonly styleCall: StaticClassCall;
					} => item.styleCall !== undefined,
				);
			if (staticArguments.length !== 1 || staticArguments[0]?.index !== 0) return;
			styleCall = staticArguments[0]?.styleCall;
			cxArguments = argumentsInCx;
			staticArgumentIndex = staticArguments[0]?.index;
		}
		if (styleCall === undefined) return;
		const styleProperties = styleCall.properties;
		const existingAttributes = new Set(attributes.map(stackAttributeName).filter(Boolean));
		const removed = new Set<OxcNode>();
		const stackAttributes: StackAttribute[] = [];
		const hasProperty = (name: string): boolean =>
			styleProperties.filter((property) => propertyName(property) === name).length === 1;
		const take = (name: string, attributeName: string, value: string | number): boolean => {
			if (existingAttributes.has(attributeName) || !hasProperty(name)) return false;
			const match = styleProperties.find((property) => propertyName(property) === name);
			if (match === undefined) return false;
			removed.add(match);
			stackAttributes.push(renderStackAttribute(attributeName, value));
			return true;
		};
		const display = styleProperties.find((property) => propertyName(property) === "display");
		if (hasProperty("display") && literalValue(display?.value) === "flex") removed.add(display!);
		const directionValue = styleValue(styleProperties, "flexDirection");
		if (typeof directionValue === "string" && !existingAttributes.has("direction")) {
			const value = stackDirection.get(directionValue);
			const match = styleProperties.find((property) => propertyName(property) === "flexDirection");
			if (match !== undefined && value !== undefined) {
				removed.add(match);
				stackAttributes.push(renderStackAttribute("direction", value));
			} else if (match !== undefined) removed.add(match);
		}
		const gap = styleValue(styleProperties, "gap");
		if (gap !== undefined) take("gap", "gap", gap);
		const padding = styleValue(styleProperties, "padding");
		if (padding !== undefined) take("padding", "padding", padding);
		const align = styleValue(styleProperties, "alignItems", stackAlign);
		if (align !== undefined) take("alignItems", "align", align);
		const justify = styleValue(styleProperties, "justifyContent", stackJustify);
		if (justify !== undefined) take("justifyContent", "justify", justify);
		if (removed.size === 0 && stackAttributes.length === 0) return;
		const range = nodeRange(classAttribute);
		if (range === undefined) return;
		const remaining = styleProperties.filter((property) => !removed.has(property));
		const remainingText = remaining.map((property) => {
			const propertyRange = nodeRange(property);
			return propertyRange === undefined
				? undefined
				: source.slice(propertyRange.start, propertyRange.end);
		});
		if (remainingText.some((property) => property === undefined)) return;
		const remainingClassExpression =
			remainingText.length === 0
				? undefined
				: `css.class({ ${remainingText.filter((property): property is string => property !== undefined).join(", ")} })`;
		let classExpression = remainingClassExpression;
		if (cxArguments !== undefined && staticArgumentIndex !== undefined) {
			const argumentSources = cxArguments
				.map((argument, index) => {
					if (index === staticArgumentIndex) return remainingClassExpression;
					const argumentRange = nodeRange(argument);
					return argumentRange === undefined
						? undefined
						: source.slice(argumentRange.start, argumentRange.end);
				})
				.filter((argument): argument is string => argument !== undefined);
			if (argumentSources.length === 0) classExpression = undefined;
			else if (argumentSources.length === 1) classExpression = argumentSources[0];
			else classExpression = `cx(${argumentSources.join(", ")})`;
		}
		const classText = classExpression === undefined ? "" : `className={${classExpression}}`;
		const replacement = [...stackAttributes.map((attribute) => attribute.text), classText]
			.filter(Boolean)
			.join(" ");
		edits.push({ start: range.start, end: range.end, text: replacement });
	});
	return SourcePass.applyEdits(source, edits);
};

const styleValue = (
	properties: readonly OxcNode[],
	name: string,
	values?: ReadonlyMap<string, string | undefined>,
): string | number | undefined => {
	const match = properties.find((property) => propertyName(property) === name);
	if (
		match === undefined ||
		properties.filter((property) => propertyName(property) === name).length !== 1
	)
		return undefined;
	const value = literalValue(match.value);
	if (value === undefined) return undefined;
	if (values === undefined) return value;
	return typeof value === "string" ? values.get(value) : undefined;
};

const removeUnusedCxBindings = (source: string): string => {
	const cxImport =
		/^[ \t]*import\s*\{\s*cx\s*\}\s*from\s*["'][^"']*pandwind\/cx["'];?[ \t]*\r?\n?/gmu;
	const createCxImport =
		/^[ \t]*import\s*\{\s*createCx\s*\}\s*from\s*["'][^"']*pandwind\/cx["'];?[ \t]*\r?\n?/gmu;
	const cxBinding = /^[ \t]*(?:const|let|var)\s+cx\s*=\s*createCx\([^\n;]*\);?[ \t]*\r?\n?/gmu;
	const withoutCxImport = source.replace(cxImport, "");
	const withoutCxBinding = withoutCxImport.replace(cxBinding, "");
	if (/\bcx\b/u.test(withoutCxBinding)) return source;
	const withoutCreateCxImport = withoutCxBinding.replace(createCxImport, "");
	if (/\bcreateCx\b/u.test(withoutCreateCxImport)) return source;
	return withoutCxBinding.replace(createCxImport, "");
};

const removeUnusedCssBinding = (source: string): string => {
	const cssImport =
		/^[ \t]*import\s*\{\s*css\s*\}\s*from\s*["'][^"']*pandwind\/css["'];?[ \t]*\r?\n?/gmu;
	const withoutCssImport = source.replace(cssImport, "");
	return /\bcss\b/u.test(withoutCssImport) ? source : withoutCssImport;
};

export const simplifyPandwindStaticStyles = (
	source: string,
	file = "migration.tsx",
): PandwindStaticStyleSimplification => {
	if (!isScriptFile(file)) return { code: source, changed: false };
	const composed = simplifyStaticCxCalls(source, file);
	const stacks = simplifyStackOpening(composed, file);
	const mixed = simplifyMixedStaticCxCalls(stacks, file);
	const hoisted = hoistStaticCssClassCalls(mixed, file);
	const composedCarriers = simplifyCarrierCxCalls(hoisted, file);
	const code = removeUnusedCssBinding(removeUnusedCxBindings(composedCarriers));
	return { code, changed: code !== source };
};
