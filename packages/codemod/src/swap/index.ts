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
import { insertSkipMarker, matchBlock } from "../sources.ts";
import { hasCssBinding, relativeModuleImport, ensureImport } from "../shared.ts";
import { SWAP_REGISTRY } from "./swap-registry.ts";
import { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
import type { ExternalAdapterId } from "./external-adapters.ts";
import type { TokenRefMode } from "./tokens.ts";
import {
	styleProgramFromSourceObject,
	styleProgramFromSwapIR,
	type StyleProgram,
	type StyleProgramOptions,
} from "./semantic-ir.ts";
import {
	inspectAdapterCapabilities,
	type AdapterCapabilities,
	type AdapterCapabilityMode,
	type AdapterCapabilityReport,
} from "./capabilities.ts";
import { CodemodAdapterId, SwapTargetId } from "./identifiers.ts";

const builtinAdapterCatalog = createBuiltinCodemodCatalog();
const builtinAdapterIds = builtinAdapterCatalog.adapters.map((adapter) => adapter.id);

export const SWAP_TARGETS = [
	...SWAP_REGISTRY.targets.map((adapter) => adapter.id),
	...builtinAdapterIds,
];
export type SwapTarget = SwapTargetId | CodemodAdapterId | ExternalAdapterId;
import type { SwapIR } from "./ir.ts";

export const SWAP_SOURCES = [
	...SWAP_REGISTRY.sources.map((adapter) => adapter.id),
	CodemodAdapterId.Panda,
	...builtinAdapterIds,
] as const;
export type SwapSource = (typeof SWAP_SOURCES)[number];

export type SwapMissResolver = (
	utilityClass: string,
) => Array<{ prop: string; value: string }> | null;

export { createEngineMissResolver } from "./engine.ts";
export { runPandaMigration } from "./adapters/panda/index.ts";
export type {
	PandaMigrateOptions,
	PandaMigrateReport,
	PandaCall,
	PandaRecipeIR,
} from "./adapters/panda/index.ts";
export {
	PANDA_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE_SCHEMA,
	createPandaMigrationPipeline,
} from "./adapters/panda/index.ts";
export type {
	PandaMigrationContext,
	PandaMigrationPipeline,
	PandaMigrationStageResult,
	PandaMigrationArtifacts,
} from "./adapters/panda/index.ts";
export {
	PANDA_DISCOVERY_SCHEMA,
	discoverPandaFiles,
	discoverPandaMigration,
	extractPandaMigrationUsage,
	loadPandaMigrationTheme,
	scanPandaMigrationSources,
} from "./adapters/panda/index.ts";
export type {
	PandaMigrationFile,
	PandaMigrationSource,
	PandaMigrationWorkspace,
} from "./adapters/panda/index.ts";
export {
	PANDA_MIGRATION_STAGES_SCHEMA,
	convertPandaRecipe,
	convertPandaStyle,
	emitPandaStyle,
	rewritePandaSource,
	validatePandaSource,
} from "./adapters/panda/index.ts";
export { inferCommonRoot } from "./adapters/panda/index.ts";
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
	CodemodAdapterId,
	CodemodPatternId,
	CodemodPluginId,
	SwapSourceId,
	SwapTargetId,
	StyleProgramCompositionKind,
	StyleProgramConditionOrder,
	StyleProgramEmissionHint,
	StyleValidatorId,
	StyleLoweringId,
	MigrationStageId,
	HostComponentRewriterId,
	PandaMigrationStageId,
	externalIdentifier,
} from "./identifiers.ts";
export type { ExternalIdentifier } from "./identifiers.ts";
export { TokenFormatId } from "./token-format-contracts.ts";
export {
	ADAPTER_CAPABILITIES_SCHEMA,
	inspectAdapterCapabilities,
	requiredAdapterCapabilities,
} from "./capabilities.ts";
export { runAdapterMigration } from "./adapter-migration.ts";
export { defineCodemodAdapter, dependency, allRuleCapabilities } from "./external-adapters.ts";
export type { ExternalAdapterId } from "./external-adapters.ts";
export { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
export { getProjectMigrationCommand } from "./project-commands.ts";
export type { ProjectMigrationCommand, ProjectMigrationContext } from "./project-command.ts";
export const getCodemodAdapter = (id: string) => builtinAdapterCatalog.registry.get(id);
export function listCodemodAdapterIds(): readonly string[] {
	return builtinAdapterIds;
}
export type { CodemodAdapterCatalog } from "./adapter-catalog.ts";
export type {
	AdapterConfigContext,
	AdapterDependencies,
	AdapterDependency,
	AdapterDependencyKind,
	AdapterDetectionContext,
	AdapterDetectionResult,
	AdapterEmitContext,
	AdapterEmitResult,
	AdapterMatch,
	AdapterParseContext,
	AdapterParseResult,
	AdapterProjectConfig,
	AdapterValidationResult,
	AdapterLossiness,
	AdapterDynamicPreparationContext,
	AdapterDynamicPreparation,
	AdapterRewriteContext,
	AdapterRewriteResult,
	AdapterMigrationHooks,
	StyleAdapter,
} from "./adapter-contract.ts";
export { ADAPTER_CONTRACT_SCHEMA } from "./adapter-contract.ts";
export {
	STYLE_LOWERING_REGISTRY,
	STYLE_LOWERING_SCHEMA,
	STYLE_LOWERINGS,
	STYLE_LOWERING_PLUGIN_SCHEMA,
	BUILTIN_STYLE_LOWERING_PLUGIN,
	createStyleLoweringRegistry,
} from "./lowering.ts";
export type {
	StyleLowering,
	StyleLoweringPlugin,
	StyleLoweringContext,
	StyleLoweringRegistry,
	StyleLoweringResult,
} from "./lowering.ts";
export type { AdapterMigrationOptions, AdapterMigrationResult } from "./external-adapters.ts";
export type {
	CodemodAdapterSpec,
	AdapterRenderers,
	AdapterSourceObjectOptions,
	AdapterSourceObjectOptionsProvider,
} from "./external-adapters.ts";
export {
	ADAPTER_MIGRATION_PIPELINE,
	MIGRATION_PIPELINE_SCHEMA,
	createAdapterMigrationPipeline,
} from "./migration-pipeline.ts";
export type {
	AdapterMigrationInput,
	AdapterMigrationPipeline,
	MigrationStage,
} from "./migration-pipeline.ts";
export {
	ADAPTER_PLUGIN_SCHEMA,
	createStyleAdapterPlugin,
	createStyleAdapterRegistry,
} from "./adapter-registry.ts";
export {
	ADAPTER_MANIFEST_SCHEMA,
	ADAPTER_PACKAGE_FIELD,
	createStyleAdapterManifest,
	readAdapterPackageDeclaration,
	validateStyleAdapterManifest,
} from "./adapter-manifest.ts";
export type {
	AdapterPackageDeclaration,
	StyleAdapterManifest,
	StyleAdapterManifestEntry,
} from "./adapter-manifest.ts";
export type {
	AdapterDiscoveryOptions,
	AdapterDiscoveryResult,
	StyleAdapterPlugin,
	StyleAdapterRegistry,
} from "./adapter-registry.ts";
export { asStyleDialect, createStyleSystem, createStyleSystemRegistry } from "./style-systems.ts";
export type {
	StyleDialectAdapter,
	StyleDialectAddress,
	StyleDialectOptions,
	StyleDialectRole,
	StyleMigrationRoute,
	StyleSystemAdapter,
	StyleSystemRegistry,
} from "./style-systems.ts";
export { STYLE_SYSTEM_SCHEMA } from "./style-systems.ts";
export {
	STYLE_SYSTEMS,
	CORE_STYLE_SYSTEMS,
	PANDA_STYLE_SYSTEM,
	PANDWIND_STYLE_SYSTEM,
} from "./systems.ts";
export {
	SWAP_REGISTRY,
	SWAP_SOURCE_ADAPTERS,
	SWAP_TARGET_ADAPTERS,
	createSwapRegistry,
} from "./swap-registry.ts";
export type {
	SwapRegistry,
	SwapSourceAdapter,
	SwapSourceContext,
	SwapSourceMatch,
	SwapTargetAdapter,
} from "./swap-registry.ts";
export { runDifferentialFixture, runDifferentialSuite } from "./differential.ts";
export { DIFFERENTIAL_MATRIX_SCHEMA, runDifferentialMatrix } from "./differential-matrix.ts";
export {
	VALIDATOR_SCHEMA,
	STYLE_VALIDATORS,
	VALIDATOR_PLUGIN_SCHEMA,
	BUILTIN_STYLE_VALIDATOR_PLUGIN,
	createStyleValidatorRegistry,
} from "./validator-registry.ts";
export type {
	StyleValidationContext,
	StyleValidationEvidence,
	StyleValidator,
	StyleValidatorPlugin,
	StyleValidatorRegistry,
} from "./validator-registry.ts";
export type {
	DifferentialBrowserResult,
	DifferentialBrowserState,
	DifferentialFixture,
	DifferentialRender,
	DifferentialResult,
	DifferentialSsrHooks,
	DifferentialSsrResult,
	DifferentialStreamingHooks,
	DifferentialStreamingResult,
} from "./differential.ts";
export { createRealRepositoryCorpus } from "./real-repository-corpus.ts";
export type { RealRepositoryCorpus, RealRepositoryReference } from "./real-repository-corpus.ts";
export type {
	DifferentialMatrixCase,
	DifferentialMatrixCatalog,
	DifferentialMatrixResult,
} from "./differential-matrix.ts";
export { STYLE_RECIPE_SCHEMA, resolveStyleRecipe } from "./recipe-ir.ts";
export type {
	ResolvedStyleRecipe,
	StyleRecipeCompoundVariant,
	StyleRecipeProgram,
	StyleRecipeSelection,
	StyleRecipeVariant,
} from "./recipe-ir.ts";
export {
	detectHostFramework,
	getHostFrameworkAdapter,
	HOST_FRAMEWORK_ADAPTERS,
	HOST_FRAMEWORK_REGISTRY,
	HOST_FRAMEWORK_PLUGINS,
	HOST_FRAMEWORK_PLUGIN_SCHEMA,
	createHostFrameworkRegistry,
} from "./host-adapters.ts";
export type {
	BuiltinHostFramework,
	HostFramework,
	HostFrameworkAdapter,
	HostFrameworkPlugin,
	HostFrameworkRegistry,
} from "./host-adapters.ts";
export {
	HOST_COMPILER_PLUGINS,
	HOST_COMPILER_SCHEMA,
	createHostCompilerPlugin,
} from "./host-compiler.ts";
export {
	getHostComponentRewriter,
	intrinsicTagForSubject,
	rewriteDynamicCarrier,
	rewriteDynamicExpressionCarrier,
	HOST_COMPONENT_REWRITER_SCHEMA,
} from "./host-component-rewriter.ts";
export type {
	HostComponentRewriteRequest,
	HostComponentRewriteResult,
	HostComponentRewriter,
	HostDynamicCarrierRewriteResult,
} from "./host-component-rewriter.ts";
export type {
	HostCompilerContext,
	HostCompilerDiagnostic,
	HostCompilerPlugin,
	HostCompilerResult,
} from "./host-compiler.ts";
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
	if (from === CodemodAdapterId.Panda || builtinAdapterIds.includes(from)) return [];
	return [
		...SWAP_REGISTRY.scanSource(from, {
			source,
			file,
			meta,
			engineResolver,
			tokenize,
		}),
	];
}

/** Run one swap pass over a file's source. */
export function runSwap(
	source: string,
	meta: PandwindMeta,
	options: SwapOptions & Pick<TransformOptions, "metaDir">,
): SwapTransformResult {
	const marker = options.skipMarker ?? "pandwind:migrate-skip";
	const file = options.file;
	const emitter = SWAP_REGISTRY.getTarget(options.to);
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
		const capabilities = options.adapterCapabilities ?? emitter.capabilities;
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
		const needsCssTarget =
			options.to === SwapTargetId.CssClass || options.to === SwapTargetId.Design;
		const needsDssTarget = options.to === SwapTargetId.Dss;
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
		const result = emitter.emit(ir, meta, {
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
		if (options.to === SwapTargetId.Tw && options.metaDir !== undefined && options.metaDir !== "") {
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
	/** Capability policy for adapter routes; external routes default to safe. */
	capabilityMode?: AdapterCapabilityMode;
	reportFormat: "text" | "json";
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
		capabilityMode: undefined,
		reportFormat: "text",
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
		else if (arg === "--report=json") {
			args.report = true;
			args.reportFormat = "json";
		} else if (arg === "--safe") args.capabilityMode = "safe";
		else if (arg === "--partial") args.capabilityMode = "partial";
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
				`codemod swap: unknown flag '${arg}' (--write --diff --report[=json] --safe --partial --force --from= --to= --meta= --out= --skip-marker= --token-refs= --engine --tokenize --sort --dedup)`,
			);
		} else args.patterns.push(arg);
	}
	if (args.patterns.length === 0) {
		throw new Error(
			"codemod swap: no input patterns given.\n" +
				"usage: pandwind-codemod swap --from=<auto|tw|css|design|panda> --to=<css.class|design|tw> [--safe|--partial] [--write] [--diff] [--report[=json]] [--meta=<dir>] [--out=<dir>] <globs...>",
		);
	}
	return args;
}
