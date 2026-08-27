/**
 * Swap orchestration (plans/022): parse source-API call sites -> SwapIR ->
 * emit target API. One pass per (from, to) pair over one file's text.
 *
 * Losslessness contract: a call site is rewritten only when EVERY literal
 * entry can be represented in the target; otherwise the original call stays
 * and a skip marker documents the residuals. Partial rewrites would silently
 * change styling — never acceptable.
 */
import type { PandwindMeta } from "../meta.ts";
import type { TransformOptions, TransformResult } from "../migrate.ts";
import { applyEdits } from "../migrate.ts";
import { computeExcludedRanges, insertSkipMarker, matchBlock } from "../sources.ts";
import { hasCssBinding, relativeModuleImport, ensureImport } from "../shared.ts";
import { parseTwCalls, parseCssLiterals } from "./parse.ts";
import { SWAP_EMITTERS, type EmitterContext, type EmitterResult } from "./emit.ts";
import { SWAP_OUTBOUND_EMITTERS } from "./outbound.ts";
import type { TokenRefMode } from "./tokens.ts";
import {
	styleProgramFromSourceObject,
	styleProgramFromSwapIR,
	type StyleProgram,
	type StyleProgramOptions,
} from "./semantic-ir.ts";
import {
	inspectAdapterCapabilities,
	SWAP_ADAPTER_CAPABILITIES,
	type AdapterCapabilities,
	type AdapterCapabilityMode,
	type AdapterCapabilityReport,
} from "./capabilities.ts";

type SwapEmitter = (ir: SwapIR, meta: PandwindMeta, ctx: EmitterContext) => EmitterResult;

/** Every swap target: core pandwind APIs + outbound library adapters. */
const EMITTERS: Record<string, SwapEmitter> = {
	...SWAP_EMITTERS,
	...SWAP_OUTBOUND_EMITTERS,
};

export const SWAP_TARGETS = Object.keys(EMITTERS);
export type SwapTarget = "css.class" | "design" | "dss" | "tw" | "tailwind" | "panda" | "stylex";
import type { SwapIR } from "./ir.ts";

export const SWAP_SOURCES = ["auto", "tw", "css", "design", "panda"] as const;
export type SwapSource = (typeof SWAP_SOURCES)[number];

export type SwapMissResolver = (
	utilityClass: string,
) => Array<{ prop: string; value: string }> | null;

export { createEngineMissResolver } from "./engine.ts";
export { runPandaMigration } from "./panda-migrate.ts";
export { inferCommonRoot } from "./panda-migrate.ts";
export type { TwMissResolver } from "./engine.ts";
export {
	STYLE_PROGRAM_SCHEMA,
	inferSemanticConditionKind,
	orderStyleRules,
	styleProgramFromRules,
	styleProgramFromSourceObject,
	styleProgramFromSwapIR,
	styleProgramToCanonicalCss,
	swapIRFromStyleProgram,
} from "./semantic-ir.ts";
export {
	ADAPTER_CAPABILITIES_SCHEMA,
	SWAP_ADAPTER_CAPABILITIES,
	inspectAdapterCapabilities,
	requiredAdapterCapabilities,
} from "./capabilities.ts";
export type {
	SemanticConditionKind,
	StyleCondition,
	StyleConditionOperator,
	StyleDeclaration,
	StyleDynamicValue,
	StyleDynamicLowering,
	StyleLiteralValue,
	StyleProgram,
	StyleProgramOptions,
	StyleProgramResidual,
	StyleProgramSource,
	StyleRule,
	StyleRuleInput,
	StyleRuleKind,
	StyleTokenValue,
	StyleValue,
} from "./semantic-ir.ts";
export type {
	AdapterCapabilities,
	AdapterCapability,
	AdapterCapabilityIssue,
	AdapterCapabilityLevel,
	AdapterCapabilityMode,
	AdapterCapabilityReport,
	ProgramCapabilityRequirement,
} from "./capabilities.ts";

export interface SwapOptions {
	from: SwapSource;
	to: SwapTarget;
	file: string;
	skipMarker?: string;
	metaDir?: string;
	/** Token-reference emission for value-capable targets (default "bare"). */
	tokenRefs?: TokenRefMode;
	/** Resolve bridge misses through the real Tailwind engine. */
	engineResolver?: (utilityClass: string) => Array<{ prop: string; value: string }> | null;
	/** Tokenize-this: rewrite raw values to authored $tokens (css sources). */
	tokenize?: boolean;
	/** Canonical property-order sorting in emitted scopes. */
	sort?: boolean;
	/** Hoist repeated identical literal call sites into module constants. */
	dedup?: boolean;
	/** Optional source condition metadata supplied by a project adapter. */
	conditionKinds?: StyleProgramOptions["conditionKinds"];
	conditionValues?: StyleProgramOptions["conditionValues"];
	conditionRaw?: StyleProgramOptions["conditionRaw"];
	/** Contract override for a custom target adapter. */
	adapterCapabilities?: AdapterCapabilities;
	/** Enforce the declared contract; omitted preserves legacy behavior. */
	capabilityMode?: AdapterCapabilityMode;
}

export interface SwapTransformResult extends TransformResult {
	readonly capabilityReports: readonly AdapterCapabilityReport[];
}

interface Match {
	start: number;
	end: number;
	ir: SwapIR;
	/** Which parser produced this match ("tw" | "css" | "design"). */
	shape: "tw" | "css" | "design";
}

type MissResolver = (utilityClass: string) => Array<{ prop: string; value: string }> | null;

function collectMatches(
	source: string,
	from: SwapSource,
	meta: PandwindMeta,
	file: string,
	engineResolver?: MissResolver,
	tokenize?: boolean,
): Array<Match> {
	const { isExcluded } = computeExcludedRanges(source, file);
	const matches: Array<Match> = [];
	if (from === "auto" || from === "tw") {
		for (const m of parseTwCalls(source, meta, isExcluded, engineResolver)) {
			matches.push({ ...m, shape: "tw" });
		}
	}
	if (from === "auto" || from === "css" || from === "design") {
		for (const m of parseCssLiterals(source, isExcluded, { tokenize, tokens: meta.tokens })) {
			const shape = from === "auto" ? (m.design ? "design" : "css") : (from as "css" | "design");
			if (from === "css" && m.design) continue;
			if (from === "design" && !m.design) continue;
			matches.push({ start: m.start, end: m.end, ir: m.ir, shape });
		}
	}
	const aligned = matches.toSorted((a, b) => a.start - b.start);
	// Parsers end at the OBJECT literal's closing brace; the call expression
	// owns one more character — its closing paren. Consume it, or the
	// replacement leaves a stray `)` behind.
	for (const m of aligned) {
		if (source[m.end] === ")") m.end += 1;
	}
	return aligned;
}

/** Run one swap pass over a file's source. */
export function runSwap(
	source: string,
	meta: PandwindMeta,
	options: SwapOptions & Pick<TransformOptions, "metaDir">,
): SwapTransformResult {
	const marker = options.skipMarker ?? "pandwind:migrate-skip";
	const file = options.file;
	const emitter = EMITTERS[options.to] as SwapEmitter | undefined;
	if (emitter === undefined) throw new Error(`codemod swap: unknown target '${options.to}'`);
	const matches = collectMatches(
		source,
		options.from,
		meta,
		file,
		options.engineResolver,
		options.tokenize,
	);

	type Edit = { start: number; end: number; text: string };
	let code = source;
	const edits: Edit[] = [];
	const residualsOut: Array<{ file: string; token: string; reason: string }> = [];
	let converted = 0;
	let skippedByMarker = 0;
	const capabilityReports: AdapterCapabilityReport[] = [];

	let siteIndex = 0;
	const tokenRefs: TokenRefMode = options.tokenRefs ?? "bare";
	const headers: string[] = [];
	const imports: string[] = [];
	for (const match of matches) {
		const { ir } = match;
		siteIndex += 1;
		const program = semanticProgramForMatch(source, match, file, options);
		const capabilities = options.adapterCapabilities ?? SWAP_ADAPTER_CAPABILITIES[options.to];
		const capabilityReport =
			capabilities === undefined
				? undefined
				: inspectAdapterCapabilities(capabilities, program, options.capabilityMode ?? "partial");
		if (capabilityReport !== undefined) {
			capabilityReports.push(capabilityReport);
			if (options.capabilityMode !== undefined && !capabilityReport.convertible) {
				const reason = capabilityReport.blockers
					.map((issue) => `${issue.capability}: ${issue.detail}`)
					.join("; ");
				code = insertSkipMarker(code, match.start, reason || "adapter capability mismatch", marker);
				skippedByMarker++;
				for (const issue of capabilityReport.blockers) {
					residualsOut.push({ file, token: issue.detail, reason: issue.level });
				}
				continue;
			}
		}
		// Only in-house class-string targets ride an existing pandwind css
		// binding; external libraries bring their own imports.
		const needsCssTarget = options.to === "css.class" || options.to === "design";
		const needsDssTarget = options.to === "dss";
		const hasDssBinding =
			/\b(?:const|let|var)\s+dss\b/.test(code) || /import\s*\{[^}]*\bdss\b[^}]*}\s*from/.test(code);
		if ((needsCssTarget && !hasCssBinding(code)) || (needsDssTarget && !hasDssBinding)) {
			code = insertSkipMarker(
				code,
				match.start,
				`no local ${needsDssTarget ? "dss" : "pandwind css"} instance to swap into (${options.to})`,
				marker,
			);
			skippedByMarker++;
			continue;
		}
		const result = emitter(ir, meta, {
			index: siteIndex,
			tokenRefs,
			sort: options.sort,
			program,
			capabilities,
			capabilityReport,
		});
		if (result.headers !== undefined && result.headers.length > 0) headers.push(...result.headers);
		if (result.imports !== undefined && result.imports.length > 0) imports.push(...result.imports);
		if (result.text === "") {
			// Nothing representable — document why, keep the original.
			const hints = (ir.residuals.length > 0 ? ir.residuals : result.residuals)
				.map((r) => r.hint ?? r.kind)
				.join("; ");
			code = insertSkipMarker(code, match.start, hints || "unconvertible", marker);
			skippedByMarker++;
			continue;
		}
		edits.push({ start: match.start, end: match.end, text: result.text });
		converted++;
		for (const residual of [...ir.residuals, ...result.residuals]) {
			residualsOut.push({
				file,
				token: residual.text,
				reason: residual.hint ?? residual.kind,
			});
		}
	}

	if (edits.length > 0) {
		code = applyEdits(code, edits);
		for (const statement of imports) code = ensureImport(code, statement);
		if (headers.length > 0) {
			// Structural blocks (stylex.create) go after the import section.
			for (const header of headers) code = ensureImport(code, header);
		}
		// Target-import hygiene: tw targets need the app's generated tw module
		// unless the file already binds it; css.class/design ride the existing
		// css binding (gated above).
		if (options.to === "tw" && options.metaDir !== undefined && options.metaDir !== "") {
			if (
				!/\btw\s*\(/.test(
					code
						.split("\n")
						.filter((l) => l.startsWith("import"))
						.join("\n"),
				) &&
				!/(?:^|\n)\s*import\s*\{[^}]*\btw\b[^}]*\}\s*from/.test(code)
			) {
				code = ensureImport(
					code,
					`import { tw } from "${relativeModuleImport(file, options.metaDir, "tw")}";`,
				);
			}
		}
	}

	if (options.dedup === true) code = dedupLiteralCallSites(code);

	return {
		code,
		changed: code !== source,
		converted,
		unmappedTokens: residualsOut,
		skippedByMarker,
		capabilityReports,
	};
}

function semanticProgramForMatch(
	source: string,
	match: Match,
	file: string,
	options: SwapOptions,
): StyleProgram {
	const programOptions: StyleProgramOptions = {
		source: { file, start: match.start, end: match.end, adapter: match.shape },
		conditionKinds: options.conditionKinds,
		conditionValues: options.conditionValues,
		conditionRaw: options.conditionRaw,
	};
	const hasDynamicSource = match.ir.residuals.some((residual) => residual.kind === "dynamic");
	if (hasDynamicSource) {
		const open = source.indexOf("{", match.start);
		const block = open === -1 ? null : matchBlock(source, open);
		if (block !== null) {
			return styleProgramFromSourceObject(block.body, {
				...programOptions,
				sourceOffset: open + 1,
			});
		}
	}
	return styleProgramFromSwapIR(match.ir, programOptions);
}

/**
 * Dedup pass: identical literal `css.class({...})` / `tw({...})` call sites
 * appearing 2+ times hoist into one module constant placed after the import
 * section (ensureImport semantics); every occurrence references it.
 */
const DEDUP_CALL_REGEX = /\b(css\.class|tw)\(\{[^{}]*\}\)/g;

export function dedupLiteralCallSites(code: string): string {
	const counts = new Map<string, number>();
	for (const match of code.matchAll(DEDUP_CALL_REGEX)) {
		const key = `${match[1]}|${match[0]}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const duplicates = [...counts.entries()].filter(([, n]) => n >= 2);
	if (duplicates.length === 0) return code;
	let working = code;
	duplicates.forEach(([key], i) => {
		const literal = key.slice(key.indexOf("|") + 1);
		const name = `pwStyle${i + 1}`;
		working = working.split(literal).join(name);
		working = ensureImport(working, `const ${name} = ${literal};`);
	});
	return working;
}

export interface SwapCliArgs {
	from: SwapSource;
	to: SwapTarget;
	write: boolean;
	diff: boolean;
	report: boolean;
	patterns: string[];
	metaDir: string;
	skipMarker: string;
	tokenRefs: TokenRefMode;
	engine: boolean;
	tokenize: boolean;
	sort: boolean;
	dedup: boolean;
	/** Output folder for --from=panda project migration (default "pandwind"). */
	outDir: string;
	/** Regenerate existing panda migration modules. */
	force: boolean;
}

export function parseSwapArgs(argv: string[]): SwapCliArgs {
	const args: SwapCliArgs = {
		from: "auto",
		to: "css.class",
		write: false,
		diff: false,
		report: false,
		patterns: [],
		metaDir: "",
		skipMarker: "pandwind:migrate-skip",
		tokenRefs: "bare",
		engine: false,
		tokenize: false,
		sort: false,
		dedup: false,
		outDir: "",
		force: false,
	};
	for (const arg of argv) {
		if (arg.startsWith("--from=")) {
			const value = arg.slice("--from=".length) as SwapSource;
			if (!SWAP_SOURCES.includes(value)) {
				throw new Error(
					`codemod swap: unknown --from '${value}' (expected ${SWAP_SOURCES.join("|")})`,
				);
			}
			args.from = value;
		} else if (arg.startsWith("--to=")) {
			const value = arg.slice("--to=".length) as SwapTarget;
			if (!SWAP_TARGETS.includes(value)) {
				throw new Error(
					`codemod swap: unknown --to '${value}' (expected ${SWAP_TARGETS.join("|")})`,
				);
			}
			args.to = value;
		} else if (arg === "--write") args.write = true;
		else if (arg === "--diff") args.diff = true;
		else if (arg === "--report") args.report = true;
		else if (arg.startsWith("--out=")) args.outDir = arg.slice("--out=".length);
		else if (arg === "--force") args.force = true;
		else if (arg === "--engine") args.engine = true;
		else if (arg === "--tokenize") args.tokenize = true;
		else if (arg === "--sort") args.sort = true;
		else if (arg === "--dedup") args.dedup = true;
		else if (arg.startsWith("--token-refs=")) {
			const value = arg.slice("--token-refs=".length) as TokenRefMode;
			if (!["off", "bare", "group"].includes(value)) {
				throw new Error(`codemod swap: unknown --token-refs '${value}' (expected off|bare|group)`);
			}
			args.tokenRefs = value;
		} else if (arg.startsWith("--meta=")) args.metaDir = arg.slice("--meta=".length);
		else if (arg.startsWith("--skip-marker=")) args.skipMarker = arg.slice("--skip-marker=".length);
		else if (arg.startsWith("--")) {
			throw new Error(
				`codemod swap: unknown flag '${arg}' (--write --diff --report --force --from= --to= --meta= --out= --skip-marker= --token-refs= --engine --tokenize --sort --dedup)`,
			);
		} else args.patterns.push(arg);
	}
	if (args.patterns.length === 0) {
		throw new Error(
			"codemod swap: no input patterns given.\n" +
				"usage: pandwind-codemod swap --from=<auto|tw|css|design|panda> --to=<css.class|design|dss|tw> [--write] [--diff] [--report] [--meta=<dir>] [--out=<dir>] <globs...>",
		);
	}
	return args;
}
