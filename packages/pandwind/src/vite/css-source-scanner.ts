import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import { evalLiteral, type OxcNode, walk } from "../tw/literal.ts";
import type {
	AuthoredCssImport,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticReporter,
	CssSourceInspection,
	CssSourceScanner,
} from "./css-extraction-contracts.ts";

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

const parse = (file: string, source: string) =>
	SOURCE_SCANNER_SERVICE.parse({
		file,
		source,
		language: SOURCE_SCANNER_SERVICE.languageForFile(file),
	});

const canParse = (file: string): boolean => SOURCE_SCANNER_SERVICE.isScriptFile(file);

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
	callee?.type === "MemberExpression"
		? (callee as { property?: { name?: string } | null }).property?.name
		: undefined;

const isMemberCall = (callee: OxcNode | null, names: ReadonlySet<string>): boolean => {
	if (callee?.type !== "MemberExpression") return false;
	const object = (callee as { object?: OxcNode | null }).object;
	const property = (callee as { property?: { name?: string } | null }).property;
	return (
		object?.type === "Identifier" &&
		names.has((object as { name?: string }).name ?? "") &&
		(property?.name === "class" || property?.name === "raw")
	);
};

const callKind = (
	callee: OxcNode | null,
	names: ReadonlySet<string>,
): CssCallSite["callKind"] | undefined => {
	if (callee?.type === "Identifier" && names.has((callee as { name?: string }).name ?? "")) {
		return "css";
	}
	if (!isMemberCall(callee, names)) return undefined;
	const member = memberName(callee);
	return member === "class" || member === "raw" ? `css.${member}` : undefined;
};

const isObjectLiteral = (argument: unknown): boolean => {
	const literal = evalLiteral(argument as never);
	return typeof literal === "object" && literal !== null;
};

const collectNames = (program: OxcNode, matchers: readonly (string | RegExp)[]): Set<string> => {
	const names = new Set<string>();
	walk(program, (node) => {
		if (node.type !== "ImportDeclaration") return;
		const declaration = node as ImportNode;
		const source = declaration.source?.value;
		if (typeof source !== "string" || !cssSourceMatches(source, matchers)) return;
		for (const specifier of declaration.specifiers ?? []) {
			const local = specifier.local?.name;
			if (typeof local !== "string") continue;
			if (
				specifier.type === "ImportDefaultSpecifier" ||
				(specifier.type === "ImportSpecifier" &&
					(specifier.imported?.name === "css" || specifier.imported?.name === "dcss"))
			) {
				names.add(local);
			}
		}
	});
	return names;
};

const authoredImports = (code: string, id: string, program: OxcNode): AuthoredCssImport[] => {
	const imports: AuthoredCssImport[] = [];
	walk(program, (node) => {
		if (node.type !== "ImportDeclaration") return;
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
	constructor(private readonly matchers: readonly (string | RegExp)[]) {}

	matches(source: string): boolean {
		return cssSourceMatches(source, this.matchers);
	}

	parse(code: string, id: string): OxcNode {
		return parse(id, code).program as unknown as OxcNode;
	}

	findImports(code: string, id: string): ReadonlySet<string> {
		if (!canParse(id)) return new Set();
		return collectNames(parse(id, code).program as unknown as OxcNode, this.matchers);
	}

	findAuthoredImports(code: string, id: string): readonly AuthoredCssImport[] {
		if (!canParse(id)) return [];
		return authoredImports(code, id, parse(id, code).program as unknown as OxcNode);
	}

	findCallSites(code: string, id: string, names: ReadonlySet<string>): readonly CssCallSite[] {
		if (names.size === 0 || !canParse(id)) return [];
		const sites: CssCallSite[] = [];
		walk(parse(id, code).program, (node) => {
			if (node.type !== "CallExpression") return;
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
	}

	inspect(code: string, id: string): CssSourceInspection {
		if (!canParse(id))
			return { authoredCss: [], cssNames: new Set(), cssSources: [], cssDiagnostics: [] };
		const program = parse(id, code).program as unknown as OxcNode;
		const cssNames = collectNames(program, this.matchers);
		const cssSources = this.findCallSites(code, id, cssNames);
		return {
			authoredCss: authoredImports(code, id, program),
			cssNames,
			cssSources,
			cssDiagnostics: new CssDiagnosticScanner().diagnose(code, id, cssNames),
		};
	}

	findVarKeys(code: string, id: string, names: ReadonlySet<string>): readonly string[] {
		if (names.size === 0 || !canParse(id)) return [];
		const keys = new Set<string>();
		walk(parse(id, code).program, (node) => {
			if (node.type !== "CallExpression") return;
			const call = node as CallNode;
			if (call.callee?.type !== "MemberExpression") return;
			const object = (call.callee as { object?: OxcNode | null }).object;
			const property = (call.callee as { property?: { name?: string } | null }).property;
			if (
				object?.type !== "Identifier" ||
				!names.has((object as { name?: string }).name ?? "") ||
				property?.name !== "vars"
			)
				return;
			for (const argument of call.arguments) collectObjectKeys(argument as OxcNode, "", keys);
		});
		return [...keys];
	}
}

const collectObjectKeys = (
	node: OxcNode | null | undefined,
	prefix: string,
	out: Set<string>,
): void => {
	if (node?.type !== "ObjectExpression") return;
	for (const property of (
		node as {
			properties?: Array<{
				type?: string;
				key?: { name?: string; value?: string };
				value?: OxcNode;
			}>;
		}
	).properties ?? []) {
		if (property.type === "SpreadElement") continue;
		const key = property.key?.name ?? property.key?.value;
		if (typeof key !== "string") continue;
		const full = prefix === "" ? key : `${prefix}__${key}`;
		if (property.value?.type === "ObjectExpression") collectObjectKeys(property.value, full, out);
		else out.add(full);
	}
};

export class CssDiagnosticScanner implements CssDiagnosticReporter {
	diagnose(code: string, id: string, names: ReadonlySet<string>): readonly CssDiagnostic[] {
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
		walk(parse(id, code).program, (node) => {
			if (node.type !== "CallExpression") return;
			const call = node as CallNode;
			if (call.callee?.type !== "MemberExpression") return;
			const object = (call.callee as { object?: OxcNode | null }).object;
			if (object?.type !== "Identifier" || !names.has((object as { name?: string }).name ?? ""))
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
		});
		return diagnostics;
	}
}
