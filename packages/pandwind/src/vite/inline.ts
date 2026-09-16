import { NodeKind, VariableDeclarationKindTag } from "../ast-node-kind.ts";
/**
 * Pure helpers for the pandwind vite plugin — shared, unit-testable, and free
 * of vite/rollup types.
 *
 * The plugin statically inlines `tw({ ... })` calls whose argument is a pure
 * object literal: the object is compiled through the *same* `compileStyles`
 * the runtime uses, and the call is replaced by a plain string literal. The
 * transform runs before Tailwind's file scanner, so inlined classes are found
 * naturally and the runtime cost becomes zero. Calls with dynamic arguments
 * are left untouched and keep working through the normal runtime.
 */
import { type Expression } from "oxc-parser";
import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import {
	compileStyles,
	type TwComposeMeta,
	type TwConflictsMeta,
	type TwNestedStyles,
	type TwVariantsMeta,
	type TwValueTokensMeta,
} from "../tw/compile.ts";
import {
	evalLiteral,
	evalLiteralValues,
	type LiteralConstantScope,
	type OxcNode,
	walk,
} from "../tw/literal.ts";
import { collectModuleConstants, type ConstantScope } from "./cx-inline.ts";
import {
	createLineIndex,
	collectUnresolvedTokens,
	tokenHasExactCss,
	type UnresolvedToken,
} from "./unresolved.ts";

export interface TwConfig {
	variants: TwVariantsMeta;
	conflicts?: TwConflictsMeta;
	/** Real value sets for wildcard-collapsed utilities (see TwOptions). */
	wildcardValues?: Record<string, ReadonlySet<string>>;
	/** Raw CSS value to token spelling remap catalog for dynamic candidates. */
	valueTokens?: TwValueTokensMeta;
	compose?: TwComposeMeta;
}

interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

/**
 * The generated tw.build.ts serializes wildcard value sets as arrays; strict
 * candidate verification needs Set membership. Normalize at the extraction
 * boundary so the TwConfig contract always sees Sets.
 */
function normalizeWildcardValues(raw: unknown): Record<string, ReadonlySet<string>> | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;
	const out: Record<string, ReadonlySet<string>> = {};
	let entries = 0;
	for (const [utility, values] of Object.entries(raw as Record<string, unknown>)) {
		if (values instanceof Set) {
			out[utility] = values as ReadonlySet<string>;
			entries++;
			continue;
		}
		if (!Array.isArray(values)) return undefined;
		out[utility] = new Set(values.filter((value): value is string => typeof value === "string"));
		entries++;
	}
	return entries > 0 ? out : undefined;
}

/**
 * Extract the `createTw({ variants, conflicts, compose })` config from
 * generated tw entry and companion sources. The generated shape is stable,
 * so a plain oxc parse + literal evaluation is enough — no type info needed.
 */
export function extractTwConfig(source: string): TwConfig | undefined {
	return extractTwConfigFromSources([source]);
}

/**
 * Extract generated tw metadata from the entry, runtime, and build artifacts.
 * The sources are combined only for tooling; runtime modules never import the
 * build-only artifact.
 */
export function extractTwConfigFromSources(sources: readonly string[]): TwConfig | undefined {
	const source = sources.join("\n");
	const result = SOURCE_SCANNER_SERVICE.parse({ file: "tw.ts", source });
	let config: TwConfig | undefined;

	// The generator may pass the config as a module-level const identifier
	// (`const __pandwindConfig = {...}; createTw(__pandwindConfig)`) so apps
	// can reuse it for runtime cx(). Resolve such identifiers to their
	// initializer before evaluating.
	const topLevelConsts = new Map<string, Expression>();
	walk(result.program, (node) => {
		if (
			node.type !== NodeKind.VariableDeclaration ||
			node.kind !== VariableDeclarationKindTag.Const
		)
			return;
		for (const declarator of (
			node as unknown as {
				declarations: Array<{
					id: { type: string; name?: string };
					init: Expression | null | undefined;
				}>;
			}
		).declarations) {
			if (declarator.id.type === NodeKind.Identifier && declarator.id.name && declarator.init) {
				topLevelConsts.set(declarator.id.name, declarator.init);
			}
		}
	});
	// Generated runtime metadata shares repeated arrays and token catalogs in
	// module-level consts. Resolve those references lazily so the extractor
	// accepts the compact generated form as well as a fully inline object.
	const constantValues = new Map<string, unknown>();
	const resolving = new Set<string>();
	const resolveConstant = (name: string): unknown => {
		if (constantValues.has(name)) return constantValues.get(name);
		const initializer = topLevelConsts.get(name);
		if (initializer === undefined || resolving.has(name)) return undefined;
		resolving.add(name);
		const value = evalLiteral(initializer, {
			get: resolveConstant,
		} as LiteralConstantScope);
		resolving.delete(name);
		constantValues.set(name, value);
		return value;
	};
	const constantScope = { get: resolveConstant } as LiteralConstantScope;
	const buildMetadata = resolveConstant("__pandwindBuildMetadata");
	const buildWildcardValues =
		typeof buildMetadata === "object" && buildMetadata !== null
			? (buildMetadata as { wildcardValues?: unknown }).wildcardValues
			: undefined;
	const configFromOptions = (value: unknown): TwConfig | undefined => {
		if (typeof value !== "object" || value === null) return undefined;
		const options = value as Record<string, unknown>;
		const variants = options.variants;
		if (typeof variants !== "object" || variants === null) return undefined;
		return {
			variants: variants as TwVariantsMeta,
			conflicts:
				typeof options.conflicts === "object" && options.conflicts !== null
					? (options.conflicts as TwConflictsMeta)
					: undefined,
			wildcardValues: normalizeWildcardValues(options.wildcardValues ?? buildWildcardValues),
			valueTokens:
				typeof options.valueTokens === "object" && options.valueTokens !== null
					? (options.valueTokens as TwValueTokensMeta)
					: undefined,
			compose: Array.isArray(options.compose) ? (options.compose as string[]) : undefined,
		};
	};
	// The generated entry is intentionally cheap and contains only variant
	// joins. Its companion exports the complete config without calling
	// createTw, so read that named artifact directly instead of making the
	// runtime entry import the large conflict catalog.
	config = configFromOptions(resolveConstant("__pandwindRuntimeConfig"));
	walk(result.program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const callee = node.callee as OxcNode | null;
		if (callee?.type !== NodeKind.Identifier || callee.name !== "createTw") return;
		const argument = (node.arguments as Expression[])[0];
		if (argument === undefined || argument === null) return;
		const literal = evalLiteral(argument, constantScope);
		const candidate = configFromOptions(literal);
		if (candidate === undefined) return;
		// Prefer a complete companion config when the cheap generated entry and
		// an explicit createTw call are both present in the source set.
		if (
			config === undefined ||
			(config.conflicts === undefined && candidate.conflicts !== undefined)
		)
			config = candidate;
	});

	return config;
}

export interface InlineResult {
	code: string;
	inlined: number;
	/** Folded class tokens outside the design system (onUnresolved lane). */
	unresolved?: UnresolvedToken[];
	/**
	 * Classes a dynamic-but-bounded `tw()` call may produce at runtime
	 * (finite ternary/union/constant sets). The source is left untouched —
	 * the runtime still selects the real class — but the host can register
	 * every candidate so the Tailwind scanner emits CSS for all of them.
	 * Only verified candidates are reported: every token must compile
	 * through the generated conflict map (exact token match or arbitrary
	 * value), so the scanner never receives an invented class. Tokens
	 * outside the design system surface through the `onUnresolved` lane.
	 */
	candidates?: string[];
}

/**
 * Fail-fast policy for folded class tokens outside the design system —
 * arbitrary `[...]` values and tokens Tailwind will not compile. Collection
 * only runs when the mode is set; the plugin core owns reporting.
 */
export type OnUnresolved = "warn" | "error" | "off";

/** Runtime-safe identity values; this module is also loaded by Node's Vite config loader. */
export const OnUnresolvedTag = {
	Warn: "warn",
	Error: "error",
	Off: "off",
} as const;

export interface UnresolvedOptions {
	/** Collect unresolved tokens for the plugin's onUnresolved lane. */
	onUnresolved?: OnUnresolved;
	/** Reuse a program parsed by a sibling analysis pass. */
	parsedProgram?: OxcNode;
}

/**
 * Replace `tw({ ... })` calls with literal arguments by their compiled class
 * string. `twNames` are the local bindings imported from the generated tw
 * module (including aliases). Module-level constants (see
 * `collectModuleConstants`) participate: property values referencing proven
 * constants fold like literals. Returns the transformed code and the number
 * of calls inlined; unrepresentable calls are left for the runtime.
 */
export function inlineTwCalls(
	code: string,
	id: string,
	config: TwConfig,
	twNames: ReadonlySet<string>,
	importedConstants?: ConstantScope,
	options?: UnresolvedOptions,
): InlineResult {
	const result =
		options?.parsedProgram === undefined
			? SOURCE_SCANNER_SERVICE.parse({ file: id, source: code })
			: { program: options.parsedProgram };
	// evalLiteral consumes RAW constant values, not the {value, declStart}
	// records the cx evaluator uses for its TDZ position guard.
	const importedScope: ConstantScope = importedConstants ?? new Map();
	const consts: LiteralConstantScope = new Map([
		// Cross-module imported constants sit under same-module declarations.
		...[...importedScope].map(([name, known]) => [name, known.value] as const),
		...[...collectModuleConstants(result.program as unknown as OxcNode)].map(
			([name, known]) => [name, known.value] as const,
		),
	]);
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let inlined = 0;
	let candidates: string[] | undefined;
	const checkUnresolved =
		options?.onUnresolved !== undefined && options.onUnresolved !== OnUnresolvedTag.Off;
	const lines = checkUnresolved ? createLineIndex(code) : undefined;
	const unresolved: UnresolvedToken[] = [];

	walk(result.program, (node) => {
		if (node.type !== NodeKind.CallExpression) return;
		const call = node as CallNode;
		const callee = call.callee;
		const calleeName = (callee as { name?: string } | null)?.name;
		if (callee?.type !== NodeKind.Identifier || !twNames.has(calleeName ?? "")) {
			return;
		}
		if (call.arguments.length !== 1) return;
		const styles = evalLiteral(call.arguments[0] as Expression, consts);
		if (typeof styles !== "object" || styles === null || Array.isArray(styles)) {
			// Not a proven literal: fall back to finite candidate discovery.
			// Unbounded or non-object sets are left for the runtime with no
			// candidates (the scanner/residual lane owns the diagnostic).
			const valueSet = evalLiteralValues(call.arguments[0] as Expression, consts);
			if (valueSet === undefined) return;
			const compiled: string[] = [];
			for (const candidateStyles of valueSet.values) {
				if (
					typeof candidateStyles !== "object" ||
					candidateStyles === null ||
					Array.isArray(candidateStyles)
				) {
					return;
				}
				try {
					const classes = compileStyles(
						candidateStyles as TwNestedStyles,
						config.variants,
						config.conflicts,
						config.compose,
						config.valueTokens,
					);
					// Exact-match gate: only register classes whose every token
					// compiles through the generated conflict map. This is token
					// preservation, not invention — an unresolvable member is left
					// to the runtime and reported through the onUnresolved lane.
					let verified = true;
					for (const token of classes.split(/\s+/)) {
						if (token !== "" && !tokenHasExactCss(token, config)) {
							verified = false;
							if (lines !== undefined) {
								unresolved.push({
									token,
									line: lines.lineOf(call.start),
									reason: "no-css",
								});
							}
							break;
						}
					}
					if (verified) compiled.push(classes);
				} catch {
					return;
				}
			}
			(candidates ??= []).push(...compiled);
			return;
		}
		try {
			const compiled = compileStyles(
				styles as TwNestedStyles,
				config.variants,
				config.conflicts,
				config.compose,
				config.valueTokens,
			);
			edits.push({
				start: call.start,
				end: call.end,
				text: JSON.stringify(compiled),
			});
			inlined++;
			if (lines !== undefined) {
				unresolved.push(...collectUnresolvedTokens(compiled, lines.lineOf(call.start), config));
			}
		} catch {
			// Invalid style object (e.g. modifier variant without a nested
			// variant) — leave the call so the runtime surfaces the error.
		}
	});

	if (edits.length === 0) {
		return {
			code,
			inlined: 0,
			...(candidates !== undefined && { candidates }),
			...(unresolved.length > 0 && { unresolved }),
		};
	}
	let output = code;
	for (const edit of [...edits].toSorted((a, b) => b.start - a.start)) {
		output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
	}
	return { code: output, inlined, unresolved, candidates };
}
