import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import type { OxcNode } from "../tw/literal.ts";

enum CssRuntimeMethodTag {
	Class = "class",
	Vars = "vars",
	Raw = "raw",
	Props = "props",
	Group = "group",
	Input = "input",
}

const ALL_METHODS = Object.values(CssRuntimeMethodTag);
const VIRTUAL_PREFIX = "pandwind:runtime/css";
const VIRTUAL_ID_PREFIX = `\0${VIRTUAL_PREFIX}?methods=`;
const CSS_RUNTIME_SOURCES = /(?:^|\/)pandwind\/css(?:\/(?:index|create-css))?(?:\.[cm]?[jt]s)?$/;

interface ImportSpecifierNode {
	type?: string;
	imported?: { name?: string };
	local?: { name?: string; start?: number };
	importKind?: string;
}

interface ImportNode extends OxcNode {
	source?: { value?: string; start?: number; end?: number };
	specifiers?: ImportSpecifierNode[];
	importKind?: string;
}

interface IdentifierNode extends OxcNode {
	name?: string;
	start?: number;
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
}

interface Usage {
	readonly methods: Set<CssRuntimeMethodTag>;
	readonly escaped: boolean;
}

const walkWithParent = (
	node: unknown,
	visit: (node: OxcNode, parent: OxcNode | undefined, ancestors: readonly OxcNode[]) => void,
	parent?: OxcNode,
	ancestors: readonly OxcNode[] = [],
): void => {
	if (Array.isArray(node)) {
		for (const item of node) walkWithParent(item, visit, parent, ancestors);
		return;
	}
	if (node === null || typeof node !== "object") return;
	const current = node as OxcNode;
	if (typeof current.type !== "string") {
		for (const value of Object.values(current)) walkWithParent(value, visit, parent, ancestors);
		return;
	}
	visit(current, parent, ancestors);
	for (const value of Object.values(current))
		walkWithParent(value, visit, current, [...ancestors, current]);
};

const isCreateCssImport = (specifier: ImportSpecifierNode, declaration: ImportNode): boolean =>
	declaration.importKind !== "type" &&
	specifier.importKind !== "type" &&
	specifier.type === "ImportSpecifier" &&
	specifier.imported?.name === "createCss" &&
	specifier.local?.name !== undefined;

const isCssRuntimeSource = (source: string): boolean => CSS_RUNTIME_SOURCES.test(source);

const identifierName = (node: OxcNode | null | undefined): string | undefined =>
	node?.type === "Identifier" ? (node as IdentifierNode).name : undefined;

const memberName = (node: OxcNode | null | undefined): CssRuntimeMethodTag | undefined => {
	if (node?.type !== "MemberExpression") return undefined;
	const member = node as MemberNode;
	if (member.computed === true) return undefined;
	const name = member.property?.name;
	return ALL_METHODS.includes(name as CssRuntimeMethodTag)
		? (name as CssRuntimeMethodTag)
		: undefined;
};

const usageFor = (program: OxcNode, local: string): Usage => {
	const methods = new Set<CssRuntimeMethodTag>();
	let escaped = false;
	const declarations = new Set<number>();

	walkWithParent(program, (node, _parent, ancestors) => {
		if (node.type !== "VariableDeclarator") return;
		const declarator = node as DeclaratorNode;
		if (declarator.id?.name !== local || declarator.id.start === undefined) return;
		declarations.add(declarator.id.start);
		if (ancestors.some((ancestor) => ancestor.type.startsWith("Export"))) escaped = true;
	});

	walkWithParent(program, (node, parent) => {
		if (node.type !== "Identifier") return;
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
		if (parent.type === "CallExpression" && (parent as CallNode).callee === node) return;
		if (parent.type === "MemberExpression" && (parent as MemberNode).object === node) {
			const method = memberName(parent);
			if (method === undefined) escaped = true;
			else methods.add(method);
			return;
		}
		escaped = true;
	});

	return { methods, escaped };
};

const findFactoryVariables = (program: OxcNode, imported: Set<string>): Set<string> => {
	const result = new Set<string>();
	walkWithParent(program, (node) => {
		if (node.type !== "VariableDeclarator") return;
		const declarator = node as DeclaratorNode;
		const local = declarator.id?.name;
		const init = declarator.init;
		if (
			local === undefined ||
			init?.type !== "CallExpression" ||
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
		if (node.type !== "ImportDeclaration") return;
		const declaration = node as ImportNode;
		const source = declaration.source?.value;
		const sourceStart = declaration.source?.start;
		const sourceEnd = declaration.source?.end;
		if (!isCssRuntimeSource(source ?? "") || sourceStart === undefined || sourceEnd === undefined)
			return;
		const hasOtherRuntimeImport = (declaration.specifiers ?? []).some(
			(specifier) =>
				declaration.importKind !== "type" &&
				specifier.importKind !== "type" &&
				!isCreateCssImport(specifier, declaration),
		);
		if (hasOtherRuntimeImport) return;
		for (const specifier of declaration.specifiers ?? []) {
			if (!isCreateCssImport(specifier, declaration)) continue;
			imports.push({ sourceStart, sourceEnd, local: specifier.local!.name! });
		}
	});
	return imports;
};

const methodsFor = (program: OxcNode, local: string): Set<CssRuntimeMethodTag> | undefined => {
	const variables = findFactoryVariables(program, new Set([local]));
	if (variables.size === 0) return undefined;
	const methods = new Set<CssRuntimeMethodTag>();
	for (const variable of variables) {
		const usage = usageFor(program, variable);
		if (usage.escaped) return undefined;
		for (const method of usage.methods) methods.add(method);
	}
	if (methods.has(CssRuntimeMethodTag.Group)) methods.add(CssRuntimeMethodTag.Vars);
	return methods;
};

const virtualIdFor = (methods: ReadonlySet<CssRuntimeMethodTag>): string =>
	`${VIRTUAL_PREFIX}?methods=${ALL_METHODS.filter((method) => methods.has(method)).join(",")}`;

const parseMethods = (id: string): CssRuntimeMethodTag[] => {
	const raw = id.slice(`${VIRTUAL_ID_PREFIX}`.length).split(",");
	return ALL_METHODS.filter((method) => raw.includes(method));
};

const runtimeModule = (methods: readonly CssRuntimeMethodTag[]): string => {
	const imports = [
		`import { createCssRuntime } from "pandwind/_runtime/css-base";`,
		...methods.map(
			(method) =>
				`import { attach${method[0]!.toUpperCase()}${method.slice(1)} } from "pandwind/_runtime/css-${method}";`,
		),
	].join("\n");
	return `${imports}\nexport const createCss = (presetOrOptions, options) => createCssRuntime(presetOrOptions, options, [${methods.map((method) => `attach${method[0]!.toUpperCase()}${method.slice(1)}`).join(", ")}]);\n`;
};

export interface RuntimePruningTransform {
	transform(code: string, id: string): { code: string; map: null } | null;
	resolveId(source: string): string | null;
	load(id: string): string | null;
}

/** Select the smallest safe CSS runtime for each local factory usage. */
export const createRuntimePruningTransform = (): RuntimePruningTransform => ({
	transform(code, id) {
		if (!SOURCE_SCANNER_SERVICE.isScriptFile(id)) return null;
		const program = SOURCE_SCANNER_SERVICE.parse({ file: id, source: code })
			.program as unknown as OxcNode;
		const imports = collectImports(program);
		if (imports.length === 0) return null;
		const replacements = new Map<string, { start: number; end: number; text: string }>();
		for (const runtimeImport of imports) {
			const methods = methodsFor(program, runtimeImport.local);
			if (methods === undefined || methods.size === ALL_METHODS.length) continue;
			const replacement = {
				start: runtimeImport.sourceStart,
				end: runtimeImport.sourceEnd,
				text: JSON.stringify(virtualIdFor(methods)),
			};
			replacements.set(`${replacement.start}:${replacement.end}`, replacement);
		}
		if (replacements.size === 0) return null;
		let output = code;
		for (const replacement of [...replacements.values()].toReversed()) {
			output =
				output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
		}
		return { code: output, map: null };
	},
	resolveId(source) {
		return source.startsWith(VIRTUAL_PREFIX) ? `\0${source}` : null;
	},
	load(id) {
		return id.startsWith(VIRTUAL_ID_PREFIX) ? runtimeModule(parseMethods(id)) : null;
	},
});
