import { SOURCE_SCANNER_SERVICE, type SourceScannerService } from "../source-scanner.ts";
import { isLiteralKeyframeBody } from "../css/keyframes.ts";
import { evalLiteral, type OxcNode, walk, walkWithParent } from "../tw/literal.ts";
import { memberName } from "./ast-walk.ts";
import type {
	AuthoredCssImport,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticReporter,
	CssSourceInspection,
	CssSourceScanner,
} from "./css-extraction-contracts.ts";
import { ImportKindTag, NodeKind } from "../ast-node-kind.ts";
import {
	findReactStrictDomBindings,
	isReactStrictDomCreateCall,
	type ReactStrictDomBindings,
} from "./css-react-strict-dom.ts";
import { createFirstThatWorksEvaluator } from "./css-first-that-works.ts";
import { findCssFactoryBindingsInProgram } from "./css-factory-source.ts";
import { createCssLiteralScopeResolver } from "./css-literal-scope.ts";

/**
 * Language-aware source observations for the CSS extraction façade.
 * Parsing, import discovery, call-site classification, and diagnostics share
 * one AST so consumers do not infer CSS from regexes or parse the module
 * repeatedly. Extraction and rewriting remain separate ports.
 */
interface ImportNode extends OxcNode {
	start?: number;
	end?: number;
	source?: { value?: string };
	specifiers?: OxcSpecifier[];
	importKind?: string;
}

interface OxcSpecifier {
	type: string;
	imported?: { name?: string };
	local?: { name?: string };
	importKind?: string;
}

const FIRST_THAT_WORKS_SOURCE = "pandwind/css";

const isFirstThatWorksImport = (declaration: ImportNode, specifier: OxcSpecifier): boolean =>
	declaration.source?.value === FIRST_THAT_WORKS_SOURCE &&
	declaration.importKind !== ImportKindTag.Type &&
	specifier.importKind !== ImportKindTag.Type &&
	specifier.type === NodeKind.ImportSpecifier &&
	specifier.imported?.name === "firstThatWorks";

export const findFirstThatWorksBindings = (program: OxcNode): ReadonlySet<string> => {
	const names = new Set<string>();
	walk(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const declaration = node as ImportNode;
		for (const specifier of declaration.specifiers ?? []) {
			if (!isFirstThatWorksImport(declaration, specifier)) continue;
			const local = specifier.local?.name;
			if (typeof local === "string") names.add(local);
		}
	});
	return names;
};

interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

const cssSourceMatches = (source: string, matchers: readonly (string | RegExp)[]): boolean =>
	matchers.some((matcher) =>
		typeof matcher === "string"
			? source === matcher ||
				source.endsWith(`/${matcher}`) ||
				source.endsWith(`/${matcher}.generated`) ||
				source.endsWith(`/${matcher}.ts`) ||
				source.endsWith(`/${matcher}.tsx`) ||
				source.endsWith(`/${matcher}.generated.ts`) ||
				source.endsWith(`/${matcher}.generated.tsx`) ||
				source.endsWith(`/${matcher}.js`) ||
				source.endsWith(`/${matcher}.jsx`) ||
				source.endsWith(`/${matcher}.generated.js`) ||
				source.endsWith(`/${matcher}.generated.jsx`)
			: matcher.test(source),
	);

const location = (code: string, start: number): { line: number; column: number } => {
	const before = code.slice(0, start);
	return {
		line: before.split("\n").length,
		column: start - (before.lastIndexOf("\n") + 1) + 1,
	};
};

const authoredSpecifier = (source: string): boolean => /\.css(?:[?#].*)?$/.test(source);

const isMemberCall = (callee: OxcNode | null, names: ReadonlySet<string>): boolean => {
	if (callee?.type !== NodeKind.MemberExpression) return false;
	const object = (callee as { object?: OxcNode | null }).object;
	const property = (callee as { property?: { name?: string } | null }).property;
	const member = property?.name;
	return (
		object?.type === NodeKind.Identifier &&
		names.has((object as { name?: string }).name ?? "") &&
		(member === "class" || member === "raw" || member === "group" || member === "keyframes")
	);
};

/**
 * A matched CSS module may export its carrier under any value name, such as
 * `untypedCss`. Factory imports are deliberately excluded because their
 * arguments describe configuration rather than style declarations.
 */
const isCssCarrierImport = (declaration: ImportNode, specifier: OxcSpecifier): boolean => {
	if (declaration.importKind === ImportKindTag.Type || specifier.importKind === ImportKindTag.Type)
		return false;
	if (specifier.type === NodeKind.ImportDefaultSpecifier) return true;
	if (specifier.type !== NodeKind.ImportSpecifier) return false;
	const imported = specifier.imported?.name;
	return typeof imported === "string" && !imported.startsWith("create");
};

const callKind = (
	callee: OxcNode | null,
	names: ReadonlySet<string>,
	reactStrictDom: ReactStrictDomBindings,
): CssCallSite["callKind"] | undefined => {
	if (callee?.type === NodeKind.Identifier && names.has((callee as { name?: string }).name ?? "")) {
		return "css";
	}
	if (isReactStrictDomCreateCall(callee, reactStrictDom.cssNames)) return "css.create";
	if (!isMemberCall(callee, names)) return undefined;
	const member = memberName(callee);
	return member === "class" || member === "raw" || member === "group" || member === "keyframes"
		? `css.${member}`
		: undefined;
};

const isObjectLiteral = (
	argument: unknown,
	literalConstants: ReadonlyMap<string, unknown>,
	evaluateCall: ReturnType<typeof createFirstThatWorksEvaluator>,
): boolean => {
	const literal = evalLiteral(argument as never, literalConstants, evaluateCall);
	return typeof literal === "object" && literal !== null;
};

const collectNames = (program: OxcNode, matchers: readonly (string | RegExp)[]): Set<string> => {
	const names = new Set<string>();
	walk(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const declaration = node as ImportNode;
		const source = declaration.source?.value;
		if (typeof source !== "string" || !cssSourceMatches(source, matchers)) return;
		for (const specifier of declaration.specifiers ?? []) {
			const local = specifier.local?.name;
			if (typeof local !== "string") continue;
			if (isCssCarrierImport(declaration, specifier)) names.add(local);
		}
	});
	const factoryBindings = findCssFactoryBindingsInProgram(program);
	const matchedFactoryNames = new Set(
		factoryBindings
			.filter((binding) => cssSourceMatches(binding.source, matchers))
			.map((binding) => binding.local),
	);
	const factoryNames = new Set(factoryBindings.map((binding) => binding.local));
	walk(program, (node) => {
		if (node.type !== NodeKind.VariableDeclarator) return;
		const declarator = node as unknown as {
			id?: { type?: string; name?: string };
			init?: { type?: string; callee?: { type?: string; name?: string } } | null;
		};
		const local = declarator.id?.name;
		const callee = declarator.init?.callee;
		if (
			declarator.id?.type !== NodeKind.Identifier ||
			declarator.init?.type !== NodeKind.CallExpression ||
			callee?.type !== NodeKind.Identifier ||
			local === undefined ||
			!factoryNames.has(callee.name ?? "") ||
			!matchedFactoryNames.has(callee.name ?? "")
		)
			return;
		names.add(local);
	});
	for (const name of findReactStrictDomBindings(program).cssNames) names.add(name);
	return names;
};

const collectCssCarrierImportSources = (
	program: OxcNode,
	matchers: readonly (string | RegExp)[],
): readonly string[] => {
	const sources = new Set<string>();
	walk(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const declaration = node as ImportNode;
		const source = declaration.source?.value;
		if (typeof source !== "string" || !cssSourceMatches(source, matchers)) return;
		if (
			(declaration.specifiers ?? []).some((specifier) => isCssCarrierImport(declaration, specifier))
		)
			sources.add(source);
	});
	return [...sources];
};

export const findCssCarrierImportSources = (
	code: string,
	id: string,
	matchers: readonly (string | RegExp)[],
): readonly string[] => {
	if (!SOURCE_SCANNER_SERVICE.isScriptFile(id)) return [];
	const program = SOURCE_SCANNER_SERVICE.parse({
		file: id,
		source: code,
		language: SOURCE_SCANNER_SERVICE.languageForFile(id),
	}).program as unknown as OxcNode;
	return collectCssCarrierImportSources(program, matchers);
};

const findCallSites = (
	code: string,
	id: string,
	names: ReadonlySet<string>,
	program: OxcNode,
): readonly CssCallSite[] => {
	if (names.size === 0) return [];
	const sites: CssCallSite[] = [];
	const reactStrictDom = findReactStrictDomBindings(program);
	const evaluateCall = createFirstThatWorksEvaluator(findFirstThatWorksBindings(program));
	const resolveLiteralScope = createCssLiteralScopeResolver(program, evaluateCall);
	walkWithParent(program, (node, _parent, ancestors) => {
		if (node.type !== NodeKind.CallExpression) return;
		const call = node as CallNode;
		const kind = callKind(call.callee, names, reactStrictDom);
		if (kind === undefined) return;
		const literalConstants = resolveLiteralScope(call, ancestors);
		const staticArguments = call.arguments.filter((argument) =>
			isObjectLiteral(argument, literalConstants, evaluateCall),
		).length;
		sites.push({
			file: id,
			start: call.start,
			end: call.end,
			...location(code, call.start),
			callKind: kind,
			staticArguments,
			dynamicArguments: call.arguments.length - staticArguments,
		});
	});
	return sites;
};

const findVarKeys = (names: ReadonlySet<string>, program: OxcNode): readonly string[] => {
	if (names.size === 0) return [];
	const keys = new Set<string>();
	walk(program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const call = node as CallNode;
		if (call.callee?.type !== NodeKind.MemberExpression) return;
		const object = (call.callee as { object?: OxcNode | null }).object;
		const property = (call.callee as { property?: { name?: string } | null }).property;
		if (
			object?.type !== NodeKind.Identifier ||
			!names.has((object as { name?: string }).name ?? "") ||
			property?.name !== "vars"
		)
			return;
		for (const argument of call.arguments) collectObjectKeys(argument as OxcNode, "", keys);
	});
	return [...keys];
};

const authoredImports = (code: string, id: string, program: OxcNode): AuthoredCssImport[] => {
	const imports: AuthoredCssImport[] = [];
	walk(program, (node) => {
		if (node.type !== NodeKind.ImportDeclaration) return;
		const declaration = node as ImportNode;
		const source = declaration.source?.value;
		if (typeof source !== "string" || !authoredSpecifier(source)) return;
		const start = declaration.start ?? 0;
		const end = declaration.end ?? start;
		imports.push({
			file: id,
			source,
			start,
			end,
			...location(code, start),
			kind: (declaration.specifiers?.length ?? 0) === 0 ? "side-effect" : "binding",
		});
	});
	return imports;
};

export class CssSourceScannerService implements CssSourceScanner {
	private readonly matchers: readonly (string | RegExp)[];
	private readonly sourceScanner: Pick<
		SourceScannerService,
		"languageForFile" | "isScriptFile" | "parse"
	>;
	private readonly programs = new Map<
		string,
		{ readonly source: string; readonly program: OxcNode }
	>();

	private static readonly PROGRAM_CACHE_LIMIT = 256;

	constructor(
		matchers: readonly (string | RegExp)[],
		sourceScanner: Pick<
			SourceScannerService,
			"languageForFile" | "isScriptFile" | "parse"
		> = SOURCE_SCANNER_SERVICE,
	) {
		this.matchers = matchers;
		this.sourceScanner = sourceScanner;
	}

	private canParse(file: string): boolean {
		return this.sourceScanner.isScriptFile(file);
	}

	private parseProgram(code: string, id: string): OxcNode {
		const cached = this.programs.get(id);
		if (cached?.source === code) {
			this.programs.delete(id);
			this.programs.set(id, cached);
			return cached.program;
		}
		if (cached !== undefined) this.programs.delete(id);
		const program = this.sourceScanner.parse({
			file: id,
			source: code,
			language: this.sourceScanner.languageForFile(id),
		}).program as unknown as OxcNode;
		if (this.programs.size >= CssSourceScannerService.PROGRAM_CACHE_LIMIT)
			this.programs.delete(this.programs.keys().next().value!);
		this.programs.set(id, { source: code, program });
		return program;
	}

	matches(source: string): boolean {
		return cssSourceMatches(source, this.matchers);
	}

	parse(code: string, id: string): OxcNode {
		return this.parseProgram(code, id);
	}

	findImports(code: string, id: string): ReadonlySet<string> {
		if (!this.canParse(id)) return new Set();
		return collectNames(this.parseProgram(code, id), this.matchers);
	}

	findAuthoredImports(code: string, id: string): readonly AuthoredCssImport[] {
		if (!this.canParse(id)) return [];
		return authoredImports(code, id, this.parseProgram(code, id));
	}

	findCallSites(code: string, id: string, names: ReadonlySet<string>): readonly CssCallSite[] {
		if (names.size === 0 || !this.canParse(id)) return [];
		return findCallSites(code, id, names, this.parseProgram(code, id));
	}

	inspect(code: string, id: string): CssSourceInspection {
		if (!this.canParse(id))
			return { authoredCss: [], cssNames: new Set(), cssSources: [], cssDiagnostics: [] };
		const program = this.parseProgram(code, id);
		const cssNames = collectNames(program, this.matchers);
		const cssSources = findCallSites(code, id, cssNames, program);
		return {
			authoredCss: authoredImports(code, id, program),
			cssNames,
			cssSources,
			cssDiagnostics: new CssDiagnosticScanner(this.sourceScanner).diagnose(
				code,
				id,
				cssNames,
				program,
			),
		};
	}

	findVarKeys(code: string, id: string, names: ReadonlySet<string>): readonly string[] {
		if (names.size === 0 || !this.canParse(id)) return [];
		return findVarKeys(names, this.parseProgram(code, id));
	}
}

const collectObjectKeys = (
	node: OxcNode | null | undefined,
	prefix: string,
	out: Set<string>,
): void => {
	if (node?.type !== NodeKind.ObjectExpression) return;
	for (const property of (
		node as {
			properties?: Array<{
				type?: string;
				key?: { name?: string; value?: string };
				value?: OxcNode;
			}>;
		}
	).properties ?? []) {
		if (property.type === NodeKind.SpreadElement) continue;
		const key = property.key?.name ?? property.key?.value;
		if (typeof key !== "string") continue;
		const full = prefix === "" ? key : `${prefix}__${key}`;
		if (property.value?.type === NodeKind.ObjectExpression)
			collectObjectKeys(property.value, full, out);
		else out.add(full);
	}
};

export class CssDiagnosticScanner implements CssDiagnosticReporter {
	private readonly sourceScanner: Pick<
		SourceScannerService,
		"languageForFile" | "isScriptFile" | "parse"
	>;

	constructor(
		sourceScanner: Pick<
			SourceScannerService,
			"languageForFile" | "isScriptFile" | "parse"
		> = SOURCE_SCANNER_SERVICE,
	) {
		this.sourceScanner = sourceScanner;
	}

	diagnose(
		code: string,
		id: string,
		names: ReadonlySet<string>,
		program?: OxcNode,
	): readonly CssDiagnostic[] {
		if (names.size === 0) return [];
		const diagnostics: CssDiagnostic[] = [];
		const unsupported = new Map([
			["global", "Authored global rules are not extracted yet."],
			["fontFace", "Authored @font-face rules are not extracted yet."],
			["layer", "Authored layers are not extracted yet."],
			["supports", "Authored @supports rules are not extracted yet."],
			["property", "Authored @property rules are not extracted yet."],
		]);
		const parsed =
			program ??
			(this.sourceScanner.parse({
				file: id,
				source: code,
				language: this.sourceScanner.languageForFile(id),
			}).program as unknown as OxcNode);
		const reactStrictDom = findReactStrictDomBindings(parsed);
		const evaluateCall = createFirstThatWorksEvaluator(findFirstThatWorksBindings(parsed));
		const resolveLiteralScope = createCssLiteralScopeResolver(parsed, evaluateCall);
		walkWithParent(parsed, (node, _parent, ancestors) => {
			if (node.type !== NodeKind.CallExpression) return;
			const call = node as CallNode;
			if (call.callee?.type !== NodeKind.MemberExpression) return;
			const object = (call.callee as { object?: OxcNode | null }).object;
			if (
				object?.type !== NodeKind.Identifier ||
				!names.has((object as { name?: string }).name ?? "")
			)
				return;
			const member = memberName(call.callee);
			const start = call.start;
			const position = location(code, start);
			if (member === "keyframes") {
				const literalConstants = resolveLiteralScope(call, ancestors);
				const body = evalLiteral(call.arguments[0] as never, literalConstants, evaluateCall);
				if (call.arguments.length !== 1 || !isLiteralKeyframeBody(body)) {
					diagnostics.push({
						kind: "unsupported-construct",
						file: id,
						start,
						end: call.end,
						...position,
						message: "css.keyframes needs one static object literal body.",
						suggestion:
							"Keep every step and declaration literal, or keep the @keyframes rule in authored CSS.",
					});
				}
				return;
			}
			if (member !== undefined && unsupported.has(member)) {
				diagnostics.push({
					kind: "unsupported-construct",
					file: id,
					start,
					end: call.end,
					...position,
					message: unsupported.get(member)!,
					suggestion:
						"Use css.class/css.raw for declarations, or keep this rule in authored CSS until build-time support is added.",
				});
				return;
			}
			const kind = callKind(call.callee, names, reactStrictDom);
			if (kind === undefined) return;
			const literalConstants = resolveLiteralScope(call, ancestors);
			const staticArguments = call.arguments.filter((argument) =>
				isObjectLiteral(argument, literalConstants, evaluateCall),
			).length;
			if (call.arguments.length === 0 || staticArguments !== call.arguments.length) {
				diagnostics.push({
					kind: "missing-extraction",
					file: id,
					start,
					end: call.end,
					...position,
					message:
						call.arguments.length === 0
							? `${kind} has no style object to extract.`
							: `${kind} has dynamic argument(s); only literal style objects enter the generated stylesheet.`,
					suggestion:
						"Keep the style shape literal for build-time extraction, or use css.vars for dynamic values and verify the runtime path.",
				});
			}
		});
		return diagnostics;
	}
}
