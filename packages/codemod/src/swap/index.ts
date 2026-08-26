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
import { computeExcludedRanges, insertSkipMarker } from "../sources.ts";
import { hasCssBinding, relativeModuleImport, ensureImport } from "../shared.ts";
import { parseTwCalls, parseCssLiterals } from "./parse.ts";
import { SWAP_EMITTERS, type EmitterContext, type EmitterResult } from "./emit.ts";
import { SWAP_OUTBOUND_EMITTERS } from "./outbound.ts";
import type { TokenRefMode } from "./tokens.ts";

type SwapEmitter = (ir: SwapIR, meta: PandwindMeta, ctx: EmitterContext) => EmitterResult;

/** Every swap target: core pandwind APIs + outbound library adapters. */
const EMITTERS: Record<string, SwapEmitter> = {
	...SWAP_EMITTERS,
	...SWAP_OUTBOUND_EMITTERS,
};

export const SWAP_TARGETS = Object.keys(EMITTERS);
export type SwapTarget = "css.class" | "design" | "tw" | "tailwind" | "panda" | "stylex";
import type { SwapIR } from "./ir.ts";

export const SWAP_SOURCES = ["auto", "tw", "css", "design"] as const;
export type SwapSource = (typeof SWAP_SOURCES)[number];

export interface SwapOptions {
	from: SwapSource;
	to: SwapTarget;
	file: string;
	skipMarker?: string;
	metaDir?: string;
	/** Token-reference emission for value-capable targets (default "bare"). */
	tokenRefs?: TokenRefMode;
}

interface Match {
	start: number;
	end: number;
	ir: SwapIR;
	/** Which parser produced this match ("tw" | "css" | "design"). */
	shape: "tw" | "css" | "design";
}

function collectMatches(
	source: string,
	from: SwapSource,
	meta: PandwindMeta,
	file: string,
): Array<Match> {
	const { isExcluded } = computeExcludedRanges(source, file);
	const matches: Array<Match> = [];
	if (from === "auto" || from === "tw") {
		for (const m of parseTwCalls(source, meta, isExcluded)) {
			matches.push({ ...m, shape: "tw" });
		}
	}
	if (from === "auto" || from === "css" || from === "design") {
		for (const m of parseCssLiterals(source, isExcluded)) {
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
): TransformResult {
	const marker = options.skipMarker ?? "pandwind:migrate-skip";
	const file = options.file;
	const emitter = EMITTERS[options.to] as SwapEmitter | undefined;
	if (emitter === undefined) throw new Error(`codemod swap: unknown target '${options.to}'`);
	const matches = collectMatches(source, options.from, meta, file);

	type Edit = { start: number; end: number; text: string };
	let code = source;
	const edits: Edit[] = [];
	const residualsOut: Array<{ file: string; token: string; reason: string }> = [];
	let converted = 0;
	let skippedByMarker = 0;

	let siteIndex = 0;
	const tokenRefs: TokenRefMode = options.tokenRefs ?? "bare";
	const headers: string[] = [];
	const imports: string[] = [];
	for (const match of matches) {
		const { ir } = match;
		siteIndex += 1;
		// Only in-house class-string targets ride an existing pandwind css
		// binding; external libraries bring their own imports.
		const needsCssTarget = options.to === "css.class" || options.to === "design";
		if (needsCssTarget && !hasCssBinding(code)) {
			code = insertSkipMarker(
				code,
				match.start,
				`no local pandwind css instance to swap into (${options.to})`,
				marker,
			);
			skippedByMarker++;
			continue;
		}
		const result = emitter(ir, meta, { index: siteIndex, tokenRefs });
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

	return {
		code,
		changed: code !== source,
		converted,
		unmappedTokens: residualsOut,
		skippedByMarker,
	};
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
				`codemod swap: unknown flag '${arg}' (--write --diff --report --from= --to= --meta= --skip-marker=)`,
			);
		} else args.patterns.push(arg);
	}
	if (args.patterns.length === 0) {
		throw new Error(
			"codemod swap: no input patterns given.\n" +
				"usage: pandwind-codemod swap --from=<auto|tw|css|design> --to=<css.class|design|tw> [--write] [--diff] [--report] [--meta=<dir>] <globs...>",
		);
	}
	return args;
}
