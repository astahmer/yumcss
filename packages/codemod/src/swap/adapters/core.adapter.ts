import type { PandwindMeta } from "../../meta.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import { SWAP_EMITTERS, type Emitter } from "../emit.ts";
import { OUTBOUND_EMITTERS } from "./outbound/plugin.ts";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "../capabilities.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	type AdapterDependencies,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterProjectConfig,
	type StyleAdapter,
} from "../adapter-contract.ts";
import { parseCssLiterals, parseTwCalls } from "../parse.ts";
import {
	createStyleSystem,
	asStyleDialect,
	type StyleDialectAdapter,
	type StyleSystemAdapter,
} from "../style-systems.ts";
import {
	styleProgramFromSourceObject,
	styleProgramFromSwapIR,
	styleProgramToCanonicalCss,
	swapIRFromStyleProgram,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
import { CodemodAdapterId, SwapSourceId, SwapTargetId } from "../identifiers.ts";

const CORE_DEPENDENCIES: AdapterDependencies = {
	packages: [{ name: "pandwind", kind: "runtime" }],
};

const CORE_CAPABILITIES = (adapter: string): AdapterCapabilities => ({
	schema: ADAPTER_CAPABILITIES_SCHEMA,
	adapter,
	version: "1",
	capabilities: {
		declarations: "exact",
		"rule-level": "partial",
		"global-rules": "partial",
		keyframes: "partial",
		"font-face": "partial",
		layers: "partial",
		"supports-rules": "partial",
		selectors: "partial",
		nesting: "partial",
		ordering: "partial",
		"named-conditions": "exact",
		"pseudo-conditions": "exact",
		"media-conditions": "exact",
		"selector-conditions": "exact",
		"supports-conditions": "exact",
		"framework-semantics": "exact",
	},
});

const emptyConfig = (
	id: string,
	context: { root?: string; file: string },
): AdapterProjectConfig => ({
	adapter: id,
	root: context.root,
	files: [context.file],
	values: {},
});

function parseDss(source: string, context: AdapterParseContext): AdapterParseResult {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [];
	const mask = context.document?.isExcluded ?? (() => false);
	for (const match of source.matchAll(/\bdss\s*\(\s*\{/g)) {
		const start = match.index ?? 0;
		if (mask(start)) continue;
		const open = source.indexOf("{", start);
		const block = SourcePass.matchBlock(source, open);
		if (block === null) {
			residuals.push({ kind: "parse", text: source.slice(start), hint: "unbalanced dss object" });
			continue;
		}
		const program = styleProgramFromSourceObject(block.body, {
			source: { file: context.file, start, end: block.end, adapter: context.config.adapter },
			sourceOffset: open + 1,
		});
		matches.push({ start, end: block.end, program, sourceText: source.slice(start, block.end) });
	}
	return { matches, residuals };
}

function parseCoreDialect(
	id: string,
	source: string,
	context: AdapterParseContext,
): AdapterParseResult {
	const excluded = context.document?.isExcluded ?? (() => false);
	if (id === SwapSourceId.Tw) {
		if (context.meta === undefined)
			return {
				matches: [],
				residuals: [{ kind: "config", text: "tw({...})", hint: "Pandwind metadata is required" }],
			};
		return {
			matches: parseTwCalls(source, context.meta, excluded).map((match) => ({
				...match,
				program: styleProgramFromSwapIR(match.ir, {
					source: {
						file: context.file,
						start: match.start,
						end: match.end,
						adapter: context.config.adapter,
					},
				}),
				sourceText: source.slice(match.start, match.end),
			})),
			residuals: [],
		};
	}
	if (id === SwapSourceId.Dss) return parseDss(source, context);
	return {
		matches: parseCssLiterals(source, excluded, { tokens: context.meta?.tokens }).map((match) => ({
			start: match.start,
			end: match.end,
			program: styleProgramFromSwapIR(match.ir, {
				source: {
					file: context.file,
					start: match.start,
					end: match.end,
					adapter: context.config.adapter,
				},
			}),
			sourceText: source.slice(match.start, match.end),
		})),
		residuals: [],
	};
}

function makeCoreAdapter(
	system: string,
	dialect: SwapSourceId,
	role: "source" | "target" | "both",
	emitter: Emitter,
): StyleDialectAdapter {
	const id = `${system}:${dialect}`;
	const adapter: StyleAdapter = {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id,
		version: "1",
		sourceModules:
			dialect === SwapSourceId.Tw
				? ["pandwind/tw"]
				: dialect === SwapSourceId.Dss
					? ["pandwind/design"]
					: ["pandwind/css"],
		capabilities: CORE_CAPABILITIES(id),
		dependencies: CORE_DEPENDENCIES,
		detect: (context) => ({
			matched: new RegExp(`\\b${dialect}\\s*\\(`).test(context.source),
			confidence: 1,
			evidence: [dialect],
		}),
		loadConfig: (context) => emptyConfig(id, context),
		parse: (source, context) => parseCoreDialect(dialect, source, context),
		emit: (program, context) => {
			const meta: PandwindMeta | undefined = context.meta;
			if (meta === undefined)
				return {
					text: "",
					residuals: [{ kind: "config", text: id, hint: "Pandwind metadata is required" }],
				};
			const result = emitter(swapIRFromStyleProgram(program), meta, { index: context.index, meta });
			return { text: result.text, imports: result.imports, residuals: [...result.residuals] };
		},
		validate: (source, target, residuals = []) => {
			const canonicalSource = styleProgramToCanonicalCss(source);
			const canonicalTarget = styleProgramToCanonicalCss(target);
			return {
				valid: canonicalSource === canonicalTarget && residuals.length === 0,
				lossiness:
					canonicalSource !== canonicalTarget
						? "unsupported"
						: residuals.length > 0
							? "lossy"
							: "lossless",
				canonicalSource,
				canonicalTarget,
				differences:
					canonicalSource === canonicalTarget && residuals.length === 0
						? []
						: ["canonical CSS differs or has residuals"],
				residuals,
			};
		},
	};
	return asStyleDialect(adapter, { system, dialect, role });
}

const pandaTw = makeCoreAdapter(
	CodemodAdapterId.Panda,
	SwapSourceId.Tw,
	"both",
	OUTBOUND_EMITTERS[CodemodAdapterId.Panda],
);
const pandaDss = makeCoreAdapter(
	CodemodAdapterId.Panda,
	SwapSourceId.Dss,
	"source",
	OUTBOUND_EMITTERS[CodemodAdapterId.Panda],
);
const pandaCss = makeCoreAdapter(
	CodemodAdapterId.Panda,
	SwapSourceId.Css,
	"source",
	OUTBOUND_EMITTERS[CodemodAdapterId.Panda],
);
const pandwindTw = makeCoreAdapter(
	CodemodAdapterId.Pandwind,
	SwapSourceId.Tw,
	"target",
	SWAP_EMITTERS[SwapSourceId.Tw],
);
const pandwindDss = makeCoreAdapter(
	CodemodAdapterId.Pandwind,
	SwapSourceId.Dss,
	"target",
	SWAP_EMITTERS[SwapSourceId.Dss],
);
const pandwindCss = makeCoreAdapter(
	CodemodAdapterId.Pandwind,
	SwapSourceId.Css,
	"target",
	SWAP_EMITTERS[SwapTargetId.CssClass],
);

export const PANDA_STYLE_SYSTEM: StyleSystemAdapter = createStyleSystem(CodemodAdapterId.Panda, [
	pandaTw,
	pandaDss,
	pandaCss,
]);
export const PANDWIND_STYLE_SYSTEM: StyleSystemAdapter = createStyleSystem(
	CodemodAdapterId.Pandwind,
	[pandwindTw, pandwindDss, pandwindCss],
);
export const CORE_STYLE_SYSTEMS: readonly StyleSystemAdapter[] = [
	PANDA_STYLE_SYSTEM,
	PANDWIND_STYLE_SYSTEM,
];
