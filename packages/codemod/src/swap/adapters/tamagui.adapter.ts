import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import type {
	AdapterConfigContext,
	AdapterParseContext,
	AdapterParseResult,
	AdapterProjectConfig,
	AdapterMatch,
} from "../adapter-contract.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import {
	styleProgramFromRules,
	styleProgramFromSourceObject,
	StyleProgramResidualKindTag,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
import { CodemodAdapterId, StyleHostRepresentationKind } from "../identifiers.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { joinDocumentPath } from "../../path-utils.ts";
import { SourcePass } from "../../source-pass-utils.ts";

function balancedCall(source: string, open: number): { end: number; body: string } | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") depth++;
		if (character === ")" && --depth === 0)
			return { end: index + 1, body: source.slice(open + 1, index) };
	}
	return undefined;
}

function topLevelComma(source: string, start: number, end: number): number | undefined {
	let parens = 0;
	let braces = 0;
	let brackets = 0;
	let quote: string | undefined;
	for (let index = start; index < end; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") parens++;
		else if (character === ")") parens--;
		else if (character === "{") braces++;
		else if (character === "}") braces--;
		else if (character === "[") brackets++;
		else if (character === "]") brackets--;
		else if (character === "," && parens === 0 && braces === 0 && brackets === 0) return index;
	}
	return undefined;
}

function parseTamaguiStyles(source: string, context: AdapterParseContext): AdapterParseResult {
	const matches: AdapterMatch[] = [];
	const residuals: StyleProgramResidual[] = [];
	const styledNames = new Set<string>();
	const configurationNames = new Set<string>();
	for (const importMatch of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s*["'](?:tamagui|@tamagui\/core)["']/gu,
	)) {
		for (const specifier of (importMatch[1] ?? "").split(",")) {
			const parts = specifier.trim().split(/\s+as\s+/u);
			if (parts[0] === "styled") styledNames.add(parts[1] ?? parts[0]);
			if (/^(?:createTamagui|createTokens|createFont)$/u.test(parts[0] ?? ""))
				configurationNames.add(parts[1] ?? parts[0]!);
		}
	}
	if (
		styledNames.size === 0 &&
		/import\s+styled\s+from\s*["'](?:tamagui|@tamagui\/core)["']/u.test(source)
	)
		styledNames.add("styled");
	for (const namespace of source.matchAll(
		/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*["'](?:tamagui|@tamagui\/core)["']/gu,
	)) {
		if (namespace[1] !== undefined) styledNames.add(`${namespace[1]}.styled`);
		if (namespace[1] !== undefined)
			for (const name of ["createTamagui", "createTokens", "createFont"])
				configurationNames.add(`${namespace[1]}.${name}`);
	}
	for (const name of configurationNames) {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
		for (const match of source.matchAll(new RegExp(`\\b${escaped}\\s*\\(`, "gu"))) {
			const start = match.index ?? 0;
			const call = balancedCall(source, source.indexOf("(", start));
			residuals.push({
				kind: StyleProgramResidualKindTag.Configuration,
				text: call === undefined ? source.slice(start) : source.slice(start, call.end),
				hint: "Tamagui tokens and compiler configuration require official project context",
			});
		}
	}
	if (styledNames.size === 0) return { matches, residuals };
	const escapedNames = [...styledNames].map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
	const pattern = new RegExp(`\\b(?:${escapedNames.join("|")})\\s*\\(`, "gu");
	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		const open = source.indexOf("(", start);
		const call = balancedCall(source, open);
		if (call === undefined) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(start),
				hint: "Tamagui styled call is unbalanced",
			});
			continue;
		}
		const comma = topLevelComma(call.body, 0, call.body.length);
		if (comma === undefined) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(start, call.end),
				hint: "Tamagui styled requires a component and style object",
			});
			continue;
		}
		const objectOpen = source.indexOf("{", open + 1 + comma);
		const block = objectOpen === -1 ? undefined : SourcePass.matchBlock(source, objectOpen);
		if (block === null || block === undefined) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(start, call.end),
				hint: "Tamagui styled style object is unbalanced",
			});
			continue;
		}
		const subject = call.body.slice(0, comma).trim();
		const styleArgument = call.body.slice(comma + 1).trim();
		if (!styleArgument.startsWith("{")) {
			matches.push({
				start,
				end: call.end,
				sourceText: source.slice(start, call.end),
				program: styleProgramFromRules([], {
					source: {
						file: context.file,
						start,
						end: call.end,
						adapter: CodemodAdapterId.Tamagui,
						subject,
					},
					residuals: [
						{
							kind: StyleProgramResidualKindTag.FunctionDynamic,
							text: styleArgument,
							hint: "Tamagui function-valued styles require a theme/props wrapper",
						},
					],
				}),
			});
			continue;
		}
		const program = styleProgramFromSourceObject(block.body, {
			source: {
				file: context.file,
				start,
				end: call.end,
				adapter: CodemodAdapterId.Tamagui,
				subject: `styled(${subject})`,
				subjectKind: "call",
			},
			sourceOffset: objectOpen + 1,
		});
		matches.push({ start, end: call.end, program, sourceText: source.slice(start, call.end) });
	}
	return { matches, residuals };
}

function removeStaticStyledBinding(source: string, code: string): string {
	const styledLocals = new Set<string>();
	for (const importMatch of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s*["'](?:tamagui|@tamagui\/core)["']/gu,
	)) {
		for (const specifier of (importMatch[1] ?? "").split(",")) {
			const parts = specifier.trim().split(/\s+as\s+/u);
			if (parts[0] === "styled") styledLocals.add(parts[1] ?? parts[0]);
		}
	}
	if (styledLocals.size === 0) return code;
	return code.replace(
		/import\s*\{([^}]*)\}\s*from\s*(["'])(tamagui|@tamagui\/core)\2\s*;?/gu,
		(full, specifiers: string, quote: string, moduleName: string) => {
			const kept = specifiers
				.split(",")
				.map((specifier) => specifier.trim())
				.filter((specifier) => {
					const local = specifier.split(/\s+as\s+/u).at(-1);
					return local === undefined || !styledLocals.has(local);
				});
			return kept.length === 0
				? ""
				: `import { ${kept.join(", ")} } from ${quote}${moduleName}${quote};`;
		},
	);
}

function config(id: CodemodAdapterId, context: AdapterConfigContext): AdapterProjectConfig {
	const candidates = ["tamagui.config.ts", "tamagui.config.js", "tamagui.build.ts"];
	const files = candidates
		.map((file) => (context.root === undefined ? file : joinDocumentPath(context.root, file)))
		.filter((file) => context.readFile?.(file) !== undefined);
	return {
		adapter: id,
		root: context.root,
		files: [context.file, ...files],
		values: { configFiles: files },
	};
}

export function createTamaguiAdapter(
	options: { readonly moduleLoader?: ProjectModuleLoader | null } = {},
) {
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	return defineCodemodAdapter({
		id: CodemodAdapterId.Tamagui,
		patterns: [
			{
				name: "tamagui-create-system",
				regex: /\b(?:createTamagui|createTokens|createFont)\s*\(/gu,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.Configuration,
					hint: "Tamagui project configuration must be evaluated through its official compiler context",
				},
			},
		],
		packages: {
			packages: [
				{ name: "tamagui", kind: AdapterDependencyKindTag.Config },
				{ name: "@tamagui/core", kind: AdapterDependencyKindTag.Config },
				{ name: "@tamagui/static", kind: AdapterDependencyKindTag.Config },
			],
		},
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Tamagui, "unsupported", {
			"theme-context": "partial",
			composition: "partial",
			components: "partial",
			"framework-semantics": "partial",
		}),
		detectPatterns: [/@tamagui\/(?:core|static)/u, /from\s+["']tamagui["']/u],
		// Tamagui subjects such as `styled(View, ...)` can carry behavior that
		// belongs to the imported base component. Keep those imports available to
		// the generated host wrapper; the styled binding itself becomes unused and
		// can be removed by the normal import-organizer pass.
		sourceModules: [],
		configFiles: ["tamagui.config.ts", "tamagui.config.js", "tamagui.build.ts"],
		detect: (context) => {
			// Tamagui components also live inside framework documents (a Vue SFC
			// script block, for example). Language-appropriate files stay
			// detectable through the shared scanner instead of a hardcoded
			// script-extension list that silently orphans whole documents.
			const matched =
				SOURCE_SCANNER_SERVICE.isSupportedFile(context.file) &&
				/(?:@tamagui\/|from\s+["']tamagui["'])/u.test(context.source);
			return {
				matched,
				confidence: matched ? 1 : 0,
				evidence: matched ? [CodemodAdapterId.Tamagui] : [],
			};
		},
		loadConfig: (context) => config(CodemodAdapterId.Tamagui, context),
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: async (context: AdapterConfigContext) => {
						const loaded =
							context.root === undefined
								? undefined
								: await moduleLoader.importPackage("@tamagui/static", context.root);
						const fallback = config(CodemodAdapterId.Tamagui, context);
						const values = {
							...fallback.values,
							officialCompiler: loaded === undefined ? "unavailable" : "available",
						};
						const configFiles = (
							Array.isArray(fallback.values.configFiles) ? fallback.values.configFiles : []
						).filter((file): file is string => typeof file === "string");
						const withCompiler = {
							...fallback,
							values,
						};
						if (configFiles.length === 0) return withCompiler;
						return AdapterEvidence.configurationFailure(
							withCompiler,
							"Tamagui project configuration",
							loaded === undefined
								? "the official @tamagui/static compiler is unavailable for a discovered config"
								: "the official Tamagui compiler was detected but did not evaluate the discovered project config",
						);
					},
				}),
		parse: parseTamaguiStyles,
		migration: {
			rewrite: ({ source, code, complete }) => ({
				code: complete ? removeStaticStyledBinding(source, code) : code,
				residuals: [],
			}),
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				hostRepresentation: StyleHostRepresentationKind.Class,
			},
		},
		emit(program, { programObject }) {
			const subject = program.source?.subject;
			return {
				text: `styled(${subject ?? "View"}, ${programObject(program)})`,
				// The emitted subject wrapper requires the styled factory to be in
				// scope. @tamagui/core is the package the parser accepts as the
				// canonical styled source, so re-emitting its import keeps the
				// generated module self-contained and roundtrip-detectable.
				// The default View subject is injected here rather than coming from
				// the source, so it must be imported alongside styled; a source
				// subject keeps its own preserved imports.
				imports: [
					subject === undefined
						? 'import { styled, View } from "@tamagui/core";'
						: 'import { styled } from "@tamagui/core";',
				],
				semantic: program,
				residuals: [],
			};
		},
	});
}
