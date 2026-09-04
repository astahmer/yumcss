import { SOURCE_SCANNER_SERVICE, type SourceScannerService } from "../source-scanner.ts";
import { evalLiteral, type OxcNode, walk } from "../tw/literal.ts";
import type {
	AuthoredCssImport,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticReporter,
	CssSourceInspection,
	CssSourceScanner,
} from "./css-extraction-contracts.ts";
import { NodeKind } from "../ast-node-kind.ts";

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
}

interface OxcSpecifier {
	type: string;
	imported?: { name?: string };
	local?: { name?: string };
}

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
				source.endsWith(`/${matcher}.ts`) ||
				source.endsWith(`/${matcher}.tsx`) ||
				source.endsWith(`/${matcher}.js`) ||
				source.endsWith(`/${matcher}.jsx`)
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

const memberName = (callee: OxcNode | null): string | undefined =>
	callee?.type === NodeKind.MemberExpression
		? (callee as { property?: { name?: string } | null }).property?.name
		: undefined;

const isMemberCall = (callee: OxcNode | null, names: ReadonlySet<string>): boolean => {
	if (callee?.type !== NodeKind.MemberExpression) return false;
	const object = (callee as { object?: OxcNode | null }).object;
	const property = (callee as { property?: { name?: string } | null }).property;
	return (
		object?.type === NodeKind.Identifier &&
		names.has((object as { name?: string }).name ?? "") &&
		(property?.name === "class" || property?.name === "raw" || property?.name === "group")
	);
};

const callKind = (
	callee: OxcNode | null,
	names: ReadonlySet<string>,
): CssCallSite["callKind"] | undefined => {
	if (callee?.type === NodeKind.Identifier && names.has((callee as { name?: string }).name ?? "")) {
		return "css";
	}
	if (!isMemberCall(callee, names)) return undefined;
	const member = memberName(callee);
	return member === "class" || member === "raw" || member === "group" ? `css.${member}` : undefined;
};

const isObjectLiteral = (argument: unknown): boolean => {
	const literal = evalLiteral(argument as never);
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
			if (
				specifier.type === NodeKind.ImportDefaultSpecifier ||
				(specifier.type === NodeKind.ImportSpecifier &&
					(specifier.imported?.name === "css" || specifier.imported?.name === "dcss"))
			) {
				names.add(local);
			}
		}
	});
	return names;
};

const findCallSites = (
	code: string,
	id: string,
	names: ReadonlySet<string>,
	program: OxcNode,
): readonly CssCallSite[] => {
	if (names.size === 0) return [];
	const sites: CssCallSite[] = [];
	walk(program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const call = node as CallNode;
		const kind = callKind(call.callee, names);
		if (kind === undefined) return;
		const staticArguments = call.arguments.filter(isObjectLiteral).length;
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
		if (cached?.source === code) return cached.program;
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
		if (property.value?.type === NodeKind.ObjectExpression) collectObjectKeys(property.value, full, out);
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
			["keyframes", "Authored keyframes are not extracted yet."],
			["fontFace", "Authored @font-face rules are not extracted yet."],
			["layer", "Authored layers are not extracted yet."],
			["supports", "Authored @supports rules are not extracted yet."],
			["property", "Authored @property rules are not extracted yet."],
		]);
		walk(
			program ??
				(this.sourceScanner.parse({
					file: id,
					source: code,
					language: this.sourceScanner.languageForFile(id),
				}).program as unknown as OxcNode),
			(node) => {
				if (node.type !== NodeKind.CallExpression) return;
				const call = node as CallNode;
				if (call.callee?.type !== NodeKind.MemberExpression) return;
				const object = (call.callee as { object?: OxcNode | null }).object;
				if (object?.type !== NodeKind.Identifier || !names.has((object as { name?: string }).name ?? ""))
					return;
				const member = memberName(call.callee);
				const start = call.start;
				const position = location(code, start);
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
				const kind = callKind(call.callee, names);
				if (kind === undefined) return;
				const staticArguments = call.arguments.filter(isObjectLiteral).length;
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
			},
		);
		return diagnostics;
	}
}
