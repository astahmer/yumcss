import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseSync, type Expression } from "oxc-parser";
import { define } from "pandwind/preset";
import { evalLiteral } from "pandwind/tw/literal";
import {
	presetTokenVocabularyByProperty,
	type PresetTokenVocabulary,
} from "pandwind/vite/preset-context";
import { NodeKind } from "./ast-node-kind.ts";

type AstNode = { readonly type: string; readonly [key: string]: any };
type ModuleImport = { readonly source: string; readonly imported: string };
type ModuleExport =
	| { readonly local: string }
	| { readonly source: string; readonly imported: string }
	| { readonly expression: AstNode }
	| { readonly namespaceSource: string };
type ParsedModule = {
	readonly filename: string;
	readonly variables: ReadonlyMap<string, AstNode>;
	readonly imports: ReadonlyMap<string, ModuleImport>;
	readonly exports: ReadonlyMap<string, ModuleExport>;
	readonly exportAll: readonly string[];
	readonly jsonValue?: unknown;
};

const MODULE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const DEFINE_BUILDERS = new Set(["conditions", "properties", "preset", "theme", "tokens"]);
const TOKEN_CATALOG_BUILDERS = new Set(["defineColorPalettes", "defineSemanticTokens"]);
const CSS_FACTORY_SOURCES = new Set(["pandwind", "pandwind/css"]);
const CSS_FACTORY_NAMES = new Set(["createCss", "createGeneratedCss"]);
const MODULE_CACHE_LIMIT = 256;
const UNRESOLVED = Symbol("unresolved project value");
const moduleCache = new Map<
	string,
	{ readonly mtimeMs: number; readonly size: number; readonly module: ParsedModule | null }
>();
const isNode = (value: unknown): value is AstNode =>
	typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const nameOf = (node: AstNode | undefined): string | undefined => {
	if (node?.type === NodeKind.Identifier) return node.name;
	if (node?.type === NodeKind.Literal && typeof node.value === "string") return node.value;
	return undefined;
};

const sourceOf = (node: AstNode | undefined): string | undefined =>
	typeof node?.value === "string" ? node.value : undefined;

const expressionPath = (node: AstNode | undefined): readonly string[] => {
	if (node?.type === NodeKind.Identifier && typeof node.name === "string") return [node.name];
	if (node?.type !== NodeKind.MemberExpression || node.computed === true) return [];
	const objectPath = expressionPath(node.object);
	const property = nameOf(node.property);
	return property === undefined ? [] : [...objectPath, property];
};

const languageFor = (filename: string): "js" | "jsx" | "ts" | "tsx" => {
	const extension = extname(filename);
	if (extension === ".tsx") return "tsx";
	if (extension === ".jsx") return "jsx";
	if (extension === ".ts" || extension === ".mts" || extension === ".cts") return "ts";
	return "js";
};

const moduleFromProgram = (filename: string, program: AstNode): ParsedModule => {
	const variables = new Map<string, AstNode>();
	const imports = new Map<string, ModuleImport>();
	const exports = new Map<string, ModuleExport>();
	const exportAll: string[] = [];

	const collectVariables = (declaration: AstNode, isExported: boolean): void => {
		if (declaration.type !== NodeKind.VariableDeclaration || declaration.kind !== "const") return;
		for (const declarator of declaration.declarations ?? []) {
			if (!isNode(declarator.init)) continue;
			if (declarator.id?.type === NodeKind.Identifier) {
				const local = declarator.id.name;
				variables.set(local, declarator.init);
				if (isExported) exports.set(local, { local });
				continue;
			}
			if (declarator.id?.type !== "ObjectPattern") continue;
			for (const property of declarator.id.properties ?? []) {
				if (
					property.type !== NodeKind.Property ||
					property.value?.type !== NodeKind.Identifier ||
					!isNode(property.key)
				)
					continue;
				const local = property.value.name;
				variables.set(local, {
					type: NodeKind.MemberExpression,
					object: declarator.init,
					property: property.key,
					computed: property.computed === true,
				});
				if (isExported) exports.set(local, { local });
			}
		}
	};

	for (const statement of program.body ?? []) {
		if (!isNode(statement)) continue;
		if (statement.type === NodeKind.ImportDeclaration) {
			const source = sourceOf(statement.source);
			if (source === undefined || statement.importKind === "type") continue;
			for (const specifier of statement.specifiers ?? []) {
				if (!isNode(specifier) || specifier.importKind === "type") continue;
				const local = nameOf(specifier.local);
				if (local === undefined) continue;
				const imported =
					specifier.type === NodeKind.ImportNamespaceSpecifier
						? "*"
						: specifier.type === NodeKind.ImportDefaultSpecifier
							? "default"
							: nameOf(specifier.imported);
				if (imported !== undefined) imports.set(local, { source, imported });
				continue;
			}
			continue;
		}
		if (statement.type === NodeKind.VariableDeclaration) {
			collectVariables(statement, false);
			continue;
		}
		if (statement.type === NodeKind.ExportDefaultDeclaration) {
			if (isNode(statement.declaration))
				exports.set("default", { expression: statement.declaration });
			continue;
		}
		if (statement.type === NodeKind.ExportAllDeclaration) {
			const source = sourceOf(statement.source);
			if (source === undefined) continue;
			const exported = nameOf(statement.exported);
			if (exported === undefined) exportAll.push(source);
			else exports.set(exported, { namespaceSource: source });
			continue;
		}
		if (statement.type !== NodeKind.ExportNamedDeclaration) continue;
		if (isNode(statement.declaration)) collectVariables(statement.declaration, true);
		const source = sourceOf(statement.source);
		for (const specifier of statement.specifiers ?? []) {
			if (!isNode(specifier)) continue;
			const exported = nameOf(specifier.exported);
			const imported = nameOf(specifier.local);
			if (exported === undefined || imported === undefined) continue;
			if (source === undefined) exports.set(exported, { local: imported });
			else exports.set(exported, { source, imported });
		}
	}

	return { filename, variables, imports, exports, exportAll };
};

const candidateFiles = (path: string): readonly string[] => {
	if (extname(path) !== "") return [path];
	return [
		path,
		...MODULE_EXTENSIONS.map((extension) => `${path}${extension}`),
		...MODULE_EXTENSIONS.map((extension) => resolve(path, `index${extension}`)),
	];
};

const existingModuleFile = (path: string): string | undefined =>
	candidateFiles(path).find((candidate) => existsSync(candidate));

const resolveModuleFile = (from: string, source: string): string | undefined => {
	if (source.startsWith(".") || isAbsolute(source))
		return existingModuleFile(resolve(dirname(from), source));
	try {
		return existingModuleFile(createRequire(from).resolve(source));
	} catch {
		return undefined;
	}
};

const parsedModuleFromFile = (filename: string): ParsedModule | null => {
	let stats: ReturnType<typeof statSync>;
	try {
		stats = statSync(filename);
	} catch {
		return null;
	}
	const cached = moduleCache.get(filename);
	if (cached !== undefined && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size)
		return cached.module;

	let module: ParsedModule | null = null;
	try {
		if (extname(filename) === ".json") {
			module = {
				filename,
				variables: new Map(),
				imports: new Map(),
				exports: new Map(),
				exportAll: [],
				jsonValue: JSON.parse(readFileSync(filename, "utf8")),
			};
		} else {
			const parsed = parseSync(filename, readFileSync(filename, "utf8"), {
				lang: languageFor(filename),
				sourceType: "module",
			});
			if (parsed.errors.length === 0 && isNode(parsed.program))
				module = moduleFromProgram(filename, parsed.program);
		}
	} catch {
		module = null;
	}

	if (moduleCache.size >= MODULE_CACHE_LIMIT) {
		const oldest = moduleCache.keys().next().value;
		if (oldest !== undefined) moduleCache.delete(oldest);
	}
	moduleCache.set(filename, { mtimeMs: stats.mtimeMs, size: stats.size, module });
	return module;
};

class ProjectPresetGraph {
	readonly #root: ParsedModule;
	readonly #compilerPackageRoot: string | undefined;
	readonly #modules = new Map<string, ParsedModule>();
	readonly #scopes = new Map<string, ReadonlyMap<string, unknown>>();

	constructor(root: ParsedModule) {
		this.#root = root;
		const packageJson = resolveModuleFile(root.filename, "pandwind/package.json");
		this.#compilerPackageRoot = packageJson === undefined ? undefined : dirname(packageJson);
		this.#modules.set(root.filename, root);
	}

	#moduleForImport(from: ParsedModule, source: string): ParsedModule | undefined {
		const filename = resolveModuleFile(from.filename, source);
		if (filename === undefined) return undefined;
		const cached = this.#modules.get(filename);
		if (cached !== undefined) return cached;
		const module = parsedModuleFromFile(filename);
		if (module !== null) this.#modules.set(filename, module);
		return module ?? undefined;
	}

	#key(module: ParsedModule, name: string): string {
		return `${module.filename}\u0000${name}`;
	}

	#isCompilerDefineImport(binding: ModuleImport): boolean {
		return (
			(binding.source === "pandwind" || binding.source === "pandwind/preset") &&
			binding.imported === "define"
		);
	}

	#isCompilerModule(filename: string): boolean {
		if (this.#compilerPackageRoot === undefined) return false;
		const pathFromPackageRoot = relative(this.#compilerPackageRoot, filename);
		return (
			pathFromPackageRoot === "" ||
			(!isAbsolute(pathFromPackageRoot) &&
				pathFromPackageRoot !== ".." &&
				!pathFromPackageRoot.startsWith(`..${sep}`))
		);
	}

	#isCompilerBuilderImport(module: ParsedModule, binding: ModuleImport): boolean {
		if (!DEFINE_BUILDERS.has(binding.imported)) return false;
		const importedFilename = resolveModuleFile(module.filename, binding.source);
		return (
			importedFilename !== undefined &&
			this.#isCompilerModule(importedFilename) &&
			basename(importedFilename).startsWith("define-preset.")
		);
	}

	#importedValue(module: ParsedModule, binding: ModuleImport, stack: ReadonlySet<string>): unknown {
		if (this.#isCompilerDefineImport(binding)) return define;
		if (CSS_FACTORY_SOURCES.has(binding.source) && CSS_FACTORY_NAMES.has(binding.imported))
			return UNRESOLVED;
		const importedFilename = resolveModuleFile(module.filename, binding.source);
		if (this.#isCompilerBuilderImport(module, binding))
			return Reflect.get(define, binding.imported);
		if (
			binding.imported === "define" &&
			importedFilename !== undefined &&
			this.#isCompilerModule(importedFilename)
		)
			return define;
		const importedModule = this.#moduleForImport(module, binding.source);
		if (importedModule === undefined) return UNRESOLVED;
		if (binding.imported === "*") return this.#namespaceValue(importedModule, stack);
		return this.#exportValue(importedModule, binding.imported, stack);
	}

	#namespaceValue(module: ParsedModule, stack: ReadonlySet<string>): unknown {
		const namespace: Record<string, unknown> = {};
		const names = new Set(module.exports.keys());
		for (const source of module.exportAll) {
			const imported = this.#moduleForImport(module, source);
			for (const name of imported?.exports.keys() ?? []) names.add(name);
		}
		for (const name of names) {
			const value = this.#exportValue(module, name, stack);
			if (value !== UNRESOLVED) namespace[name] = value;
		}
		return namespace;
	}

	#exportValue(module: ParsedModule, name: string, stack: ReadonlySet<string>): unknown {
		if (module.jsonValue !== undefined) return name === "default" ? module.jsonValue : UNRESOLVED;
		const key = this.#key(module, `export:${name}`);
		if (stack.has(key)) return UNRESOLVED;
		const nextStack = new Set(stack);
		nextStack.add(key);
		const binding = module.exports.get(name);
		if (binding !== undefined) {
			if ("local" in binding) return this.#identifierValue(module, binding.local, nextStack);
			if ("expression" in binding)
				return this.#expressionValue(module, binding.expression, nextStack);
			if ("namespaceSource" in binding) {
				const imported = this.#moduleForImport(module, binding.namespaceSource);
				return imported === undefined ? UNRESOLVED : this.#namespaceValue(imported, nextStack);
			}
			const imported = this.#moduleForImport(module, binding.source);
			return imported === undefined
				? UNRESOLVED
				: this.#exportValue(imported, binding.imported, nextStack);
		}
		for (const source of module.exportAll) {
			const imported = this.#moduleForImport(module, source);
			if (imported === undefined) continue;
			const value = this.#exportValue(imported, name, nextStack);
			if (value !== UNRESOLVED) return value;
		}
		return UNRESOLVED;
	}

	#identifierValue(module: ParsedModule, name: string, stack: ReadonlySet<string>): unknown {
		const key = this.#key(module, name);
		if (stack.has(key)) return UNRESOLVED;
		const nextStack = new Set(stack);
		nextStack.add(key);
		const imported = module.imports.get(name);
		if (imported !== undefined) return this.#importedValue(module, imported, nextStack);
		const initializer = module.variables.get(name);
		return initializer === undefined
			? UNRESOLVED
			: this.#expressionValue(module, initializer, nextStack);
	}

	#literalScope(module: ParsedModule, stack: ReadonlySet<string>): ReadonlyMap<string, unknown> {
		const cached = this.#scopes.get(module.filename);
		if (cached !== undefined) return cached;
		const scope = new Map<string, unknown>();
		for (const name of module.imports.keys()) {
			const value = this.#identifierValue(module, name, stack);
			if (value !== UNRESOLVED) scope.set(name, value);
		}
		const pending = new Map(module.variables);
		let madeProgress = true;
		while (pending.size > 0 && madeProgress) {
			madeProgress = false;
			for (const [name, initializer] of pending) {
				const value = this.#evaluateNode(module, initializer, scope, stack);
				if (value === UNRESOLVED) continue;
				scope.set(name, value);
				pending.delete(name);
				madeProgress = true;
			}
		}
		this.#scopes.set(module.filename, scope);
		return scope;
	}

	#defineMethodFor(module: ParsedModule, callee: AstNode): string | undefined {
		if (callee.type === NodeKind.Identifier && typeof callee.name === "string") {
			const binding = module.imports.get(callee.name);
			return binding !== undefined && this.#isCompilerBuilderImport(module, binding)
				? binding.imported
				: undefined;
		}
		const path = expressionPath(callee);
		if (path.length < 2) return undefined;
		const root = path[0];
		if (root === undefined) return undefined;
		const binding = module.imports.get(root);
		if (binding === undefined) return undefined;
		if (this.#isCompilerDefineImport(binding) && path.length === 2) return path[1];
		if (
			binding.imported === "*" &&
			(binding.source === "pandwind" || binding.source === "pandwind/preset") &&
			path.length === 3 &&
			path[1] === "define"
		)
			return path[2];
		return undefined;
	}

	#evaluateCall(
		module: ParsedModule,
		call: AstNode,
		scope: ReadonlyMap<string, unknown>,
		stack: ReadonlySet<string>,
	): unknown {
		const callee = call.callee;
		if (!isNode(callee)) return UNRESOLVED;
		const args = (call.arguments ?? []).map((argument: AstNode) =>
			this.#evaluateNode(module, argument, scope, stack),
		);
		if (args.some((argument: unknown) => argument === UNRESOLVED)) return UNRESOLVED;

		const defineMethod = this.#defineMethodFor(module, callee);
		if (defineMethod !== undefined && DEFINE_BUILDERS.has(defineMethod)) {
			const builder = Reflect.get(define, defineMethod);
			if (typeof builder !== "function") return UNRESOLVED;
			try {
				return Reflect.apply(builder, define, args);
			} catch {
				return UNRESOLVED;
			}
		}
		if (callee.type === NodeKind.Identifier && typeof callee.name === "string") {
			const helper = module.variables.get(callee.name);
			if (
				helper?.type === NodeKind.ArrowFunctionExpression &&
				Array.isArray(helper.params) &&
				helper.params.length === args.length &&
				isNode(helper.body)
			) {
				const helperStackKey = this.#key(module, `helper:${callee.name}`);
				if (stack.has(helperStackKey)) return UNRESOLVED;
				const parameters = new Map(scope);
				for (const [index, parameter] of helper.params.entries()) {
					if (parameter.type !== NodeKind.Identifier || typeof parameter.name !== "string")
						return UNRESOLVED;
					parameters.set(parameter.name, args[index]);
				}
				const helperStack = new Set(stack);
				helperStack.add(helperStackKey);
				return this.#evaluateNode(module, helper.body, parameters, helperStack);
			}
		}

		const method = expressionPath(callee).at(-1);
		if (
			callee.type !== NodeKind.MemberExpression ||
			method === undefined ||
			!TOKEN_CATALOG_BUILDERS.has(method)
		)
			return UNRESOLVED;
		const receiver = this.#evaluateNode(module, callee.object, scope, stack);
		if (receiver === UNRESOLVED || typeof receiver !== "object" || receiver === null)
			return UNRESOLVED;
		const builder = Reflect.get(receiver, method);
		if (typeof builder !== "function") return UNRESOLVED;
		try {
			return Reflect.apply(builder, receiver, args);
		} catch {
			return UNRESOLVED;
		}
	}

	#evaluateNode(
		module: ParsedModule,
		node: AstNode,
		scope: ReadonlyMap<string, unknown>,
		stack: ReadonlySet<string>,
	): unknown {
		const value = evalLiteral(node as Expression, scope, (call) =>
			this.#evaluateCall(module, call as AstNode, scope, stack),
		);
		return value === undefined ? UNRESOLVED : value;
	}

	#expressionValue(module: ParsedModule, expression: AstNode, stack: ReadonlySet<string>): unknown {
		if (expression.type === NodeKind.Identifier && typeof expression.name === "string")
			return this.#identifierValue(module, expression.name, stack);
		return this.#evaluateNode(module, expression, this.#literalScope(module, stack), stack);
	}

	#factoryKindForBinding(
		module: ParsedModule,
		name: string,
		stack: ReadonlySet<string>,
	): "css" | undefined {
		const key = this.#key(module, `factory:${name}`);
		if (stack.has(key)) return undefined;
		const nextStack = new Set(stack);
		nextStack.add(key);
		const imported = module.imports.get(name);
		if (imported !== undefined) {
			if (CSS_FACTORY_SOURCES.has(imported.source) && CSS_FACTORY_NAMES.has(imported.imported))
				return "css";
			if (imported.imported === "*") return undefined;
		}
		const initializer = module.variables.get(name);
		if (initializer?.type === NodeKind.Identifier && typeof initializer.name === "string")
			return this.#factoryKindForBinding(module, initializer.name, nextStack);
		return undefined;
	}

	#factoryKindForExpression(module: ParsedModule, expression: AstNode): "css" | undefined {
		if (expression.type === NodeKind.Identifier && typeof expression.name === "string")
			return this.#factoryKindForBinding(module, expression.name, new Set());
		const path = expressionPath(expression);
		if (path.length !== 2) return undefined;
		const root = path[0];
		const member = path[1];
		if (root === undefined || member === undefined) return undefined;
		const imported = module.imports.get(root);
		return imported?.imported === "*" &&
			CSS_FACTORY_SOURCES.has(imported.source) &&
			CSS_FACTORY_NAMES.has(member)
			? "css"
			: undefined;
	}

	#vocabularyForStyleExpression(
		module: ParsedModule,
		expression: AstNode,
		stack: ReadonlySet<string>,
	): PresetTokenVocabulary | undefined {
		if (expression.type === NodeKind.Identifier && typeof expression.name === "string")
			return this.#styleVocabularyForBinding(module, expression.name, stack);
		if (
			expression.type !== NodeKind.CallExpression ||
			!isNode(expression.callee) ||
			this.#factoryKindForExpression(module, expression.callee) !== "css"
		)
			return undefined;
		const presetExpression = expression.arguments?.[0];
		if (!isNode(presetExpression)) return undefined;
		const preset = this.#expressionValue(module, presetExpression, stack);
		if (preset === UNRESOLVED) return undefined;
		const vocabulary = presetTokenVocabularyByProperty(preset);
		return Object.keys(vocabulary).length === 0 ? undefined : vocabulary;
	}

	#styleVocabularyForBinding(
		module: ParsedModule,
		name: string,
		stack: ReadonlySet<string>,
	): PresetTokenVocabulary | undefined {
		const key = this.#key(module, `style:${name}`);
		if (stack.has(key)) return undefined;
		const nextStack = new Set(stack);
		nextStack.add(key);
		const imported = module.imports.get(name);
		if (imported !== undefined) {
			if (imported.imported === "*") return undefined;
			const importedModule = this.#moduleForImport(module, imported.source);
			return importedModule === undefined
				? undefined
				: this.#styleVocabularyForExport(importedModule, imported.imported, nextStack);
		}
		const initializer = module.variables.get(name);
		return initializer === undefined
			? undefined
			: this.#vocabularyForStyleExpression(module, initializer, nextStack);
	}

	#styleVocabularyForExport(
		module: ParsedModule,
		name: string,
		stack: ReadonlySet<string>,
	): PresetTokenVocabulary | undefined {
		const key = this.#key(module, `style-export:${name}`);
		if (stack.has(key)) return undefined;
		const nextStack = new Set(stack);
		nextStack.add(key);
		const binding = module.exports.get(name);
		if (binding !== undefined) {
			if ("local" in binding)
				return this.#styleVocabularyForBinding(module, binding.local, nextStack);
			if ("expression" in binding)
				return this.#vocabularyForStyleExpression(module, binding.expression, nextStack);
			if ("source" in binding) {
				const imported = this.#moduleForImport(module, binding.source);
				return imported === undefined
					? undefined
					: this.#styleVocabularyForExport(imported, binding.imported, nextStack);
			}
			return undefined;
		}
		for (const source of module.exportAll) {
			const imported = this.#moduleForImport(module, source);
			const vocabulary =
				imported === undefined
					? undefined
					: this.#styleVocabularyForExport(imported, name, nextStack);
			if (vocabulary !== undefined) return vocabulary;
		}
		return undefined;
	}

	forStyleBinding(path: string): PresetTokenVocabulary | undefined {
		const segments = path.split(".");
		const first = segments[0];
		if (first === undefined) return undefined;
		const binding = this.#root.imports.get(first);
		if (binding === undefined)
			return segments.length === 1
				? this.#styleVocabularyForBinding(this.#root, first, new Set())
				: undefined;
		if (binding.imported !== "*") {
			if (segments.length !== 1) return undefined;
			const module = this.#moduleForImport(this.#root, binding.source);
			return module === undefined
				? undefined
				: this.#styleVocabularyForExport(module, binding.imported, new Set());
		}
		const exported = segments[1];
		if (exported === undefined || segments.length !== 2) return undefined;
		const module = this.#moduleForImport(this.#root, binding.source);
		return module === undefined
			? undefined
			: this.#styleVocabularyForExport(module, exported, new Set());
	}
}

export const styleBindingPathForCall = (call: AstNode): string | undefined => {
	const callee = call.callee;
	if (!isNode(callee)) return undefined;
	const styleObject = callee.type === NodeKind.MemberExpression ? callee.object : callee;
	const path = expressionPath(styleObject);
	return path.length === 0 ? undefined : path.join(".");
};

export const createProjectTokenVocabularyResolver = (options: {
	readonly filename?: string;
	readonly cwd?: string;
	readonly program: AstNode;
}): ((styleBinding: string) => PresetTokenVocabulary | undefined) => {
	if (options.filename === undefined || options.filename.startsWith("<")) return () => undefined;
	const filename = resolve(options.cwd ?? process.cwd(), options.filename);
	const module = moduleFromProgram(filename, options.program);
	const graph = new ProjectPresetGraph(module);
	return (styleBinding) => graph.forStyleBinding(styleBinding);
};
