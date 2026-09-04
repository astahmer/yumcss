import type { PandwindMeta } from "../meta.ts";
import { SourcePass } from "../source-pass-utils.ts";
import { parseCssLiterals, parseTwCalls } from "./parse.ts";
import type { GovernanceSuggestionInput } from "./tokens.ts";
import { type EmitterContext, type EmitterResult } from "./emit.ts";
import { OUTBOUND_ADAPTERS } from "./adapters/outbound/plugin.ts";
import type { SwapIR } from "./ir.ts";
import type { AdapterCapabilities } from "./capabilities.ts";
import { CORE_SWAP_TARGETS } from "./adapters/core-targets.adapter.ts";
import { SwapSourceId } from "./identifiers.ts";

export interface SwapSourceMatch {
	readonly start: number;
	readonly end: number;
	readonly ir: SwapIR;
	readonly shape: "tw" | "css" | "design";
}

export interface SwapSourceContext {
	readonly source: string;
	readonly file: string;
	readonly meta: PandwindMeta;
	readonly engineResolver?: (
		utilityClass: string,
	) => readonly { prop: string; value: string }[] | null;
	readonly tokenize?: boolean;
	/** Exact raw->token suggestions from a governance report (plans/054). */
	readonly suggestions?: ReadonlyArray<GovernanceSuggestionInput>;
}

export interface SwapSourceAdapter {
	readonly id: string;
	parse(
		context: SwapSourceContext,
		excluded: (start: number) => boolean,
	): readonly SwapSourceMatch[];
}

export interface SwapTargetAdapter {
	readonly id: string;
	emit(ir: SwapIR, meta: PandwindMeta, context: EmitterContext): EmitterResult;
	readonly capabilities?: AdapterCapabilities;
}

export interface SwapRegistry {
	readonly sources: readonly SwapSourceAdapter[];
	readonly targets: readonly SwapTargetAdapter[];
	registerSource(adapter: SwapSourceAdapter): SwapRegistry;
	registerTarget(adapter: SwapTargetAdapter): SwapRegistry;
	getSource(id: string): SwapSourceAdapter | undefined;
	getTarget(id: string): SwapTargetAdapter | undefined;
	scanSource(id: string, context: SwapSourceContext): readonly SwapSourceMatch[];
}

const source = (id: string, parse: SwapSourceAdapter["parse"]): SwapSourceAdapter => ({
	id,
	parse,
});

export const SWAP_TARGET_ADAPTERS: readonly SwapTargetAdapter[] = [
	...CORE_SWAP_TARGETS,
	...OUTBOUND_ADAPTERS,
];

const coreSource = (
	id: SwapSourceId.Tw | SwapSourceId.Css | SwapSourceId.Design,
): SwapSourceAdapter =>
	source(id, (context, excluded) => {
		if (id === SwapSourceId.Tw)
			return parseTwCalls(context.source, context.meta, excluded, context.engineResolver).map(
				(match) => ({
					...match,
					shape: "tw" as const,
				}),
			);
		return parseCssLiterals(context.source, excluded, {
			tokenize: context.tokenize,
			tokens: context.meta.tokens,
			suggestions: context.suggestions,
		})
			.filter((match) => (id === SwapSourceId.Design ? match.design : !match.design))
			.map((match) => ({ start: match.start, end: match.end, ir: match.ir, shape: id }));
	});

const autoSource = source(SwapSourceId.Auto, (context, excluded) => [
	...coreSource(SwapSourceId.Tw).parse(context, excluded),
	...parseCssLiterals(context.source, excluded, {
		tokenize: context.tokenize,
		tokens: context.meta.tokens,
		suggestions: context.suggestions,
	}).map((match) => ({
		start: match.start,
		end: match.end,
		ir: match.ir,
		shape: match.design ? ("design" as const) : ("css" as const),
	})),
]);

export const SWAP_SOURCE_ADAPTERS: readonly SwapSourceAdapter[] = [
	autoSource,
	coreSource(SwapSourceId.Tw),
	coreSource(SwapSourceId.Css),
	coreSource(SwapSourceId.Design),
];

export function createSwapRegistry(
	initialSources: readonly SwapSourceAdapter[] = SWAP_SOURCE_ADAPTERS,
	initialTargets: readonly SwapTargetAdapter[] = SWAP_TARGET_ADAPTERS,
): SwapRegistry {
	const sources = new Map<string, SwapSourceAdapter>();
	const targets = new Map<string, SwapTargetAdapter>();
	const registry: SwapRegistry = {
		get sources() {
			return [...sources.values()];
		},
		get targets() {
			return [...targets.values()];
		},
		registerSource(adapter) {
			if (sources.has(adapter.id)) throw new Error(`swap source already registered: ${adapter.id}`);
			sources.set(adapter.id, adapter);
			return registry;
		},
		registerTarget(adapter) {
			if (targets.has(adapter.id)) throw new Error(`swap target already registered: ${adapter.id}`);
			targets.set(adapter.id, adapter);
			return registry;
		},
		getSource: (id) => sources.get(id),
		getTarget: (id) => targets.get(id),
		scanSource(id, context) {
			const adapter = sources.get(id);
			if (adapter === undefined) throw new Error(`unknown swap source: ${id}`);
			const mask = SourcePass.computeExcludedRanges(context.source, context.file);
			return adapter
				.parse(context, mask.isExcluded)
				.toSorted((a, b) => a.start - b.start)
				.map((match) => ({
					...match,
					end: context.source[match.end] === ")" ? match.end + 1 : match.end,
				}));
		},
	};
	for (const adapter of initialSources) registry.registerSource(adapter);
	for (const adapter of initialTargets) registry.registerTarget(adapter);
	return registry;
}

export const SWAP_REGISTRY = createSwapRegistry();
