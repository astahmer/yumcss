import type { PandwindMeta } from "../meta.ts";
import { computeExcludedRanges } from "../sources.ts";
import { parseCssLiterals, parseTwCalls } from "./parse.ts";
import { SWAP_EMITTERS, type Emitter, type EmitterContext, type EmitterResult } from "./emit.ts";
import { SWAP_OUTBOUND_EMITTERS } from "./outbound.ts";
import type { SwapIR } from "./ir.ts";
import type { StyleProgramOptions } from "./semantic-ir.ts";

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
	readonly engineResolver?: (utilityClass: string) => Array<{ prop: string; value: string }> | null;
	readonly tokenize?: boolean;
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

const target = (id: string, emit: Emitter): SwapTargetAdapter => ({ id, emit });

const source = (id: string, parse: SwapSourceAdapter["parse"]): SwapSourceAdapter => ({
	id,
	parse,
});

export const SWAP_TARGET_ADAPTERS: readonly SwapTargetAdapter[] = [
	target("css.class", SWAP_EMITTERS["css.class"]),
	target("design", SWAP_EMITTERS.design),
	target("dss", SWAP_EMITTERS.dss),
	target("tw", SWAP_EMITTERS.tw),
	target("tailwind", SWAP_OUTBOUND_EMITTERS.tailwind),
	target("panda", SWAP_OUTBOUND_EMITTERS.panda),
	target("stylex", SWAP_OUTBOUND_EMITTERS.stylex),
];

const coreSource = (id: "tw" | "css" | "design"): SwapSourceAdapter =>
	source(id, (context, excluded) => {
		if (id === "tw")
			return parseTwCalls(context.source, context.meta, excluded, context.engineResolver).map(
				(match) => ({
					...match,
					shape: "tw" as const,
				}),
			);
		return parseCssLiterals(context.source, excluded, {
			tokenize: context.tokenize,
			tokens: context.meta.tokens,
		})
			.filter((match) => (id === "design" ? match.design : !match.design))
			.map((match) => ({ start: match.start, end: match.end, ir: match.ir, shape: id }));
	});

const autoSource = source("auto", (context, excluded) => [
	...coreSource("tw").parse(context, excluded),
	...parseCssLiterals(context.source, excluded, {
		tokenize: context.tokenize,
		tokens: context.meta.tokens,
	}).map((match) => ({
		start: match.start,
		end: match.end,
		ir: match.ir,
		shape: match.design ? ("design" as const) : ("css" as const),
	})),
]);

export const SWAP_SOURCE_ADAPTERS: readonly SwapSourceAdapter[] = [
	autoSource,
	coreSource("tw"),
	coreSource("css"),
	coreSource("design"),
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
			const mask = computeExcludedRanges(context.source, context.file);
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

export type SwapConditionOptions = Pick<
	StyleProgramOptions,
	"conditionKinds" | "conditionValues" | "conditionRaw"
>;
