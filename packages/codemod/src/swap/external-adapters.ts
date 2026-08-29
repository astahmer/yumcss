import { applyEdits } from "../migrate.ts";
import { matchBlock } from "../source-pass-utils.ts";
import { computeExcludedRanges } from "pandwind/source";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "./capabilities.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	ADAPTER_CONTRACT_VERSION,
	type AdapterDependencies,
	type AdapterEmitContext,
	type AdapterEmitResult,
	type AdapterMigrationHooks,
	type AdapterLossiness,
	type AdapterMatch,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterValidationResult,
	type StyleAdapter,
} from "./adapter-contract.ts";
import {
	styleProgramFromRules,
	styleProgramFromSourceObject,
	styleProgramToCanonicalCss,
	type StyleProgram,
	type StyleProgramOptions,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import { JsxStyleHost, type JsxStyleHostMatch } from "./jsx-style-host.ts";
import { CodemodAdapterSupport } from "./adapter-support.ts";
import { CodemodAdapterParser, CodemodAdapterRenderer } from "./adapter-style-engine.ts";

/** Adapter ids are registry-defined so adding an adapter does not require a central union edit. */
export type ExternalAdapterId = string;

type CallPattern = {
	readonly name: string;
	readonly regex: RegExp;
	readonly form?: "object" | "template" | "reference" | "jsx-style";
	readonly kind?: "style" | "styled" | "keyframes" | "global" | "font-face";
	readonly objectKind?: StyleProgramOptions["nestedObjectKind"];
	readonly styleProps?: readonly string[];
	/** Source-specific host props that must remain for component semantics. */
	readonly preserveHostStyleProps?: (host: JsxStyleHostMatch) => readonly string[];
	readonly transform?: (program: StyleProgram, context: AdapterParseContext) => StyleProgram;
};

export type AdapterSourceObjectOptions = Pick<
	StyleProgramOptions,
	| "conditionKinds"
	| "conditionValues"
	| "conditionRaw"
	| "nestedObjectKind"
	| "propertyValueConditions"
	| "unwrapNestedObjectKeys"
	| "variantContainerKeys"
	| "computedKeys"
	| "computedKeyResolver"
	| "dynamicReferences"
	| "objectReferences"
	| "propertyAliases"
	| "valueTransforms"
	| "emissionHints"
	| "canonicalization"
	| "compositions"
>;
export type AdapterSourceObjectOptionsProvider =
	| AdapterSourceObjectOptions
	| ((source: string) => AdapterSourceObjectOptions);

export interface AdapterRenderers {
	readonly firstKind: (program: StyleProgram) => StyleProgram["rules"][number]["kind"];
	readonly programObject: (program: StyleProgram) => string;
	readonly declarationsObject: (
		declarations: readonly StyleProgram["declarations"][number][],
	) => string;
	readonly templateCss: (program: StyleProgram) => string;
}

export interface CodemodAdapterSpec {
	readonly id: ExternalAdapterId;
	readonly patterns: readonly CallPattern[];
	readonly packages: AdapterDependencies;
	readonly capabilities: AdapterCapabilities;
	readonly detectPatterns: readonly RegExp[];
	readonly sourceModules: readonly string[];
	readonly configFiles?: readonly string[];
	readonly sourceObjectOptions?: AdapterSourceObjectOptionsProvider;
	readonly migration?: AdapterMigrationHooks;
	emit(
		program: StyleProgram,
		renderers: AdapterRenderers,
		context?: AdapterEmitContext,
	): Pick<AdapterEmitResult, "text" | "imports">;
}

// oxlint-disable-next-line typescript/no-extraneous-class -- scoped adapter construction policy
export class CodemodAdapterKit {
	static dependency(
		name: string,
		kind: AdapterDependencies["packages"][number]["kind"],
	): AdapterDependencies {
		return { packages: [{ name, kind }] };
	}

	static allRuleCapabilities(
		adapterId: string,
		dynamic: "exact" | "partial" | "unsupported",
		capabilities: Partial<AdapterCapabilities["capabilities"]> = {},
	): AdapterCapabilities {
		return {
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
				"dynamic-values": dynamic,
				"pseudo-conditions": "exact",
				"selector-conditions": "exact",
				"media-conditions": "exact",
				"container-conditions": "exact",
				"supports-conditions": "exact",
				...capabilities,
			},
		};
	}
}

function parseCalls(
	source: string,
	context: AdapterParseContext,
	patterns: readonly CallPattern[],
	sourceObjectOptions: AdapterSourceObjectOptionsProvider | undefined = {},
): AdapterParseResult {
	const matches: AdapterMatch[] = [];
	const residuals: StyleProgramResidual[] = [];
	const resolvedObjectOptions =
		typeof sourceObjectOptions === "function"
			? sourceObjectOptions(context.source)
			: sourceObjectOptions;
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
			if (pattern.form === "jsx-style") {
				const initialTag = JsxStyleHost.parse(
					source,
					start,
					context,
					pattern.styleProps ?? [],
					CodemodAdapterSupport.source(context, start),
				);
				if (initialTag !== undefined) {
					const preserved = new Set(pattern.preserveHostStyleProps?.(initialTag) ?? []);
					const tag =
						preserved.size === 0
							? initialTag
							: JsxStyleHost.parse(
									source,
									start,
									context,
									(pattern.styleProps ?? []).filter((property) => !preserved.has(property)),
									CodemodAdapterSupport.source(context, start),
								);
					if (tag === undefined) continue;
					const program = styleProgramFromSourceObject(tag.body, {
						...resolvedObjectOptions,
						source: tag.source,
						sourceOffset: start,
					});
					matches.push({
						start,
						end: tag.end,
						program,
						sourceText: tag.openingTag,
					});
				}
				continue;
			}
			if (pattern.form === "reference") {
				const reference = match[1];
				if (reference === undefined) continue;
				const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const binding = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*\\{`, "g").exec(
					source,
				);
				if (binding === null) {
					residuals.push({
						kind: "parse",
						text: match[0],
						hint: `JSS style binding '${reference}' was not found`,
					});
					continue;
				}
				const open = binding.index + binding[0].lastIndexOf("{");
				const block = matchBlock(source, open);
				if (block === null) {
					residuals.push({
						kind: "parse",
						text: match[0],
						hint: `JSS style binding '${reference}' is unbalanced`,
					});
					continue;
				}
				const program = styleProgramFromSourceObject(block.body, {
					source: {
						file: context.file,
						start,
						end: start + match[0].length,
						adapter: context.config.adapter,
					},
					sourceOffset: open + 1,
					nestedObjectKind: "named",
				});
				matches.push({
					start,
					end: start + match[0].length,
					program,
					sourceText: match[0],
				});
				continue;
			}
			if (pattern.form === "template") {
				const firstTick =
					pattern.kind === "styled"
						? CodemodAdapterSupport.findStyledTemplateStart(source, start)
						: source.indexOf("`", start);
				const lastTick = CodemodAdapterSupport.templateEnd(source, firstTick);
				if (firstTick === -1 || lastTick === undefined || lastTick <= firstTick) continue;
				const template = source.slice(start, lastTick + 1);
				let program = CodemodAdapterParser.parseTemplateProgram(
					source.slice(firstTick + 1, lastTick),
					context,
					start,
				);
				program = {
					...program,
					source: {
						...program.source,
						...(pattern.kind === "styled"
							? CodemodAdapterSupport.styledSubject(source, start)
							: {}),
						...(context.document?.framework ? { framework: context.document.framework } : {}),
						...context.semantic?.source,
					},
				};
				program = pattern.transform?.(program, context) ?? program;
				program = {
					...program,
					source: { ...program.source, pattern: pattern.name },
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
			if (pattern.kind === "keyframes") {
				program = CodemodAdapterParser.parseKeyframeProgram(
					block.body,
					context,
					start,
					CodemodAdapterSupport.sourceName(source, start, fallbackName),
					resolvedObjectOptions,
				);
			} else if (pattern.kind === "global") {
				program = CodemodAdapterParser.parseGlobalProgram(block.body, context, start);
			} else {
				const base = styleProgramFromSourceObject(block.body, {
					source: {
						file: context.file,
						start,
						end,
						adapter: context.config.adapter,
						...(context.document?.framework ? { framework: context.document.framework } : {}),
						...(pattern.name === "styled"
							? CodemodAdapterSupport.styledSubject(source, start)
							: {}),
						...context.semantic?.source,
					},
					sourceOffset: open + 1,
					...(context.semantic?.themes ? { themes: context.semantic.themes } : {}),
					...(context.semantic?.compositions
						? { compositions: context.semantic.compositions }
						: {}),
					...(context.semantic?.runtime ? { runtime: context.semantic.runtime } : {}),
					...(context.semantic?.plugins ? { plugins: context.semantic.plugins } : {}),
					...resolvedObjectOptions,
					...(pattern.objectKind === undefined ? {} : { nestedObjectKind: pattern.objectKind }),
				});
				if (pattern.kind === "font-face") {
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
			}
			program = pattern.transform?.(program, context) ?? program;
			program = {
				...program,
				source: { ...program.source, pattern: pattern.name },
			};
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

export function defineCodemodAdapter(spec: CodemodAdapterSpec): StyleAdapter {
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: spec.id,
		version: ADAPTER_CONTRACT_VERSION,
		sourceModules: spec.sourceModules,
		capabilities: spec.capabilities,
		dependencies: spec.packages,
		migration: spec.migration,
		detect: (context) => CodemodAdapterSupport.detect(spec.detectPatterns, context),
		loadConfig: (context) => CodemodAdapterSupport.config(spec.id, spec.configFiles ?? [], context),
		parse: (source, context) =>
			parseCalls(source, context, spec.patterns, spec.sourceObjectOptions),
		emit: (program, context) => {
			const rendered = spec.emit(program, CodemodAdapterRenderer, context);
			return { ...rendered, dependencies: spec.packages, residuals: [...program.residuals] };
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

export function removeSourceImports(
	code: string,
	modules: readonly string[],
	file = "pandwind-adapter.ts",
): string {
	let result = code;
	for (const module of modules) {
		const quoted = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const pattern = new RegExp(`\\bimport\\s+([^;]*?)\\s+from\\s+(["'])${quoted}\\2\\s*;?`, "g");
		let mask: ReturnType<typeof computeExcludedRanges> | undefined;
		try {
			mask = computeExcludedRanges(result, file);
		} catch {
			// Keep cleanup best-effort for incomplete source snippets.
		}
		const edits: Array<{ start: number; end: number; text: string }> = [];
		for (const match of result.matchAll(pattern)) {
			const start = match.index ?? 0;
			if (mask?.isExcluded(start)) continue;
			const specifier = match[1]?.trim();
			if (specifier === undefined || specifier === "") continue;
			const remainder = result.slice(0, start) + result.slice(start + match[0].length);
			const declaredNames = new Set(
				[...remainder.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].flatMap(
					(entry) => (entry[1] === undefined ? [] : [entry[1]]),
				),
			);
			for (const imported of remainder.matchAll(/\bimport\s+([^;]*?)\s+from\s+["'][^"']+["']/g)) {
				const importedSpecifier = imported[1]?.trim() ?? "";
				const defaultName = /^[A-Za-z_$][\w$]*/.exec(importedSpecifier)?.[0];
				if (defaultName !== undefined) declaredNames.add(defaultName);
				const namespaceName = /^\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(importedSpecifier)?.[1];
				if (namespaceName !== undefined) declaredNames.add(namespaceName);
				const importedBlock = /\{([\s\S]*)\}/.exec(importedSpecifier)?.[1];
				for (const entry of importedBlock?.split(",") ?? []) {
					const parts = entry.trim().split(/\s+as\s+/);
					if (parts[0] !== undefined && parts[0] !== "") declaredNames.add(parts[1] ?? parts[0]);
				}
			}
			let remainderMask: ReturnType<typeof computeExcludedRanges> | undefined;
			try {
				remainderMask = computeExcludedRanges(remainder, file);
			} catch {
				// Keep import cleanup best-effort for incomplete source snippets.
			}
			const isReferenced = (name: string): boolean => {
				if (declaredNames.has(name)) return false;
				const references = new RegExp(
					`(?<![-\\w$])${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?![-\\w$])`,
					"g",
				);
				for (const reference of remainder.matchAll(references)) {
					if (remainderMask?.isExcluded(reference.index ?? 0) !== true) return true;
				}
				return false;
			};
			const defaultImport =
				/^[A-Za-z_$][\w$]*/.exec(specifier)?.[0] ??
				(specifier.startsWith("{") || specifier.startsWith("*") ? undefined : undefined);
			const namespace = /^\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(specifier)?.[1];
			const namedBlock = /\{([\s\S]*)\}/.exec(specifier)?.[1];
			const named =
				namedBlock === undefined
					? []
					: namedBlock.split(",").flatMap((entry) => {
							const trimmed = entry.trim();
							if (trimmed === "") return [];
							const parts = trimmed.split(/\s+as\s+/);
							const imported = parts[0]!;
							const local = parts[1] ?? imported;
							return isReferenced(local) ? [trimmed] : [];
						});
			const keptDefault =
				defaultImport !== undefined && isReferenced(defaultImport) ? defaultImport : undefined;
			const keptNamespace =
				namespace !== undefined && isReferenced(namespace) ? `* as ${namespace}` : undefined;
			const kept = [
				keptDefault,
				keptNamespace,
				named.length > 0 ? `{ ${named.join(", ")} }` : undefined,
			].filter((value): value is string => value !== undefined);
			edits.push({
				start,
				end: start + match[0].length,
				text: kept.length === 0 ? "" : `import ${kept.join(", ")} from "${module}";`,
			});
		}
		result = applyEdits(result, edits);
		result = removeExcludedMatches(result, new RegExp(`\\bimport\\s*["']${quoted}["']\\s*;?`, "g"));
	}
	return result;
}

export type { AdapterMigrationOptions, AdapterMigrationResult } from "./adapter-migration.ts";
