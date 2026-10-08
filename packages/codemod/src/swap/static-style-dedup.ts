import { SOURCE_SCANNER_SERVICE, SourceBindings } from "yumcss/source";
import { NodeKind, type OxcNode, walk } from "yumcss/tw/literal";
import { SourcePass, type SourceEdit } from "../source-pass-utils.ts";

export interface StaticStyleCall {
	readonly moduleSpecifier: string;
	readonly importedName: string;
	readonly property?: string;
}

const isNode = (value: unknown): value is OxcNode =>
	typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const isStaticValue = (value: unknown): boolean => {
	if (!isNode(value)) return false;
	if (value.type === NodeKind.Literal)
		return value.value === null || ["string", "number", "boolean"].includes(typeof value.value);
	if (value.type === NodeKind.UnaryExpression)
		return ["+", "-", "!", "~"].includes(String(value.operator)) && isStaticValue(value.argument);
	if (value.type === NodeKind.TemplateLiteral)
		return Array.isArray(value.expressions) && value.expressions.length === 0;
	if (value.type === NodeKind.ArrayExpression)
		return Array.isArray(value.elements) && value.elements.every(isStaticValue);
	if (value.type !== NodeKind.ObjectExpression || !Array.isArray(value.properties)) return false;
	return value.properties.every(
		(property) =>
			isNode(property) &&
			property.type === NodeKind.Property &&
			property.kind === "init" &&
			property.computed !== true &&
			property.method !== true &&
			property.shorthand !== true &&
			isStaticValue(property.value),
	);
};

export const deduplicateStaticStyleCalls = (input: {
	readonly source: string;
	readonly file: string;
	readonly staticStyleCalls?: readonly StaticStyleCall[];
}): string => {
	const { source, file } = input;
	const staticStyleCalls = input.staticStyleCalls ?? [
		{ moduleSpecifier: "yumcss/tw", importedName: "tw" },
		{ moduleSpecifier: "yumcss/css", importedName: "css", property: "class" },
	];
	const parsed = SOURCE_SCANNER_SERVICE.scan({ file, source });
	if (parsed.program === undefined) return source;
	const bindings = SourceBindings.fromProgram(parsed.program);
	const usedNames = new Set<string>();
	const groups = new Map<
		string,
		{
			readonly text: string;
			readonly occurrences: Array<{ readonly start: number; readonly end: number }>;
		}
	>();
	walk(parsed.program, (node) => {
		if (node.type === NodeKind.Identifier && typeof node.name === "string")
			usedNames.add(node.name);
		if (
			node.type !== NodeKind.CallExpression ||
			typeof node.start !== "number" ||
			typeof node.end !== "number"
		)
			return;
		const site = bindings.callSites.find((candidate) => candidate.start === node.start);
		if (
			site === undefined ||
			site.binding === undefined ||
			bindings.isShadowedAt(site.localName, site.start)
		)
			return;
		const binding = site.binding;
		if (binding === undefined || typeof binding.source !== "string") return;
		const styleCall = staticStyleCalls.find(
			(candidate) =>
				candidate.moduleSpecifier === binding.source &&
				candidate.importedName === binding.importedName &&
				candidate.property === site.property,
		);
		if (styleCall === undefined) return;
		if (
			!Array.isArray(node.arguments) ||
			node.arguments.length !== 1 ||
			!isStaticValue(node.arguments[0])
		)
			return;
		const text = source.slice(node.start, node.end);
		const groupKey = `${binding.source}\u0000${binding.importedName}\u0000${site.property ?? ""}\u0000${text}`;
		const group = groups.get(groupKey) ?? { text, occurrences: [] };
		group.occurrences.push({ start: node.start, end: node.end });
		groups.set(groupKey, group);
	});
	const edits: SourceEdit[] = [];
	const declarations: string[] = [];
	let nextIndex = 1;
	for (const { text, occurrences } of groups.values()) {
		if (occurrences.length < 2) continue;
		let name = `pwStyle${nextIndex++}`;
		while (usedNames.has(name)) name = `pwStyle${nextIndex++}`;
		usedNames.add(name);
		declarations.push(`const ${name} = ${text};`);
		for (const occurrence of occurrences) edits.push({ ...occurrence, text: name });
	}
	if (declarations.length === 0) return source;
	const shebangEnd = source.startsWith("#!")
		? source.indexOf("\n") === -1
			? source.length
			: source.indexOf("\n") + 1
		: 0;
	let insertion = shebangEnd;
	const program = parsed.program;
	if (isNode(program) && Array.isArray(program.body)) {
		for (const statement of program.body) {
			if (!isNode(statement) || typeof statement.end !== "number") continue;
			if (statement.directive === undefined && statement.type !== NodeKind.ImportDeclaration) break;
			insertion = statement.end;
		}
	}
	edits.push({ start: insertion, end: insertion, text: `\n${declarations.join("\n")}\n` });
	return SourcePass.applyEdits(source, edits);
};

export const staticStyleCallsFromSource = (input: {
	readonly source: string;
	readonly file: string;
	readonly callStarts?: ReadonlySet<number>;
	readonly twModuleSpecifiers?: ReadonlySet<string>;
}): StaticStyleCall[] => {
	const parsed = SOURCE_SCANNER_SERVICE.scan({ file: input.file, source: input.source });
	if (parsed.program === undefined) return [];
	const bindings = SourceBindings.fromProgram(parsed.program);
	const calls = new Map<string, StaticStyleCall>();
	for (const site of bindings.callSites) {
		if (input.callStarts !== undefined && !input.callStarts.has(site.start)) continue;
		const binding = site.binding;
		if (binding === undefined || typeof binding.source !== "string") continue;
		if (
			binding.importedName === "tw" &&
			site.property === undefined &&
			input.twModuleSpecifiers?.has(binding.source) === true
		) {
			const call = { moduleSpecifier: binding.source, importedName: "tw" };
			calls.set(`${binding.source}\u0000tw`, call);
		}
		if (binding.importedName === "css" && site.property === "class") {
			const call = { moduleSpecifier: binding.source, importedName: "css", property: "class" };
			calls.set(`${binding.source}\u0000css\u0000class`, call);
		}
	}
	return [...calls.values()];
};
