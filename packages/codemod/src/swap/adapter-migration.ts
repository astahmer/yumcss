import {
	StyleProgramResidualKindTag,
	SwapResidualKindTag,
	styleProgramFromRules,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import { SourcePass } from "../source-pass-utils.ts";
import { ensureImport } from "../shared.ts";
import {
	SOURCE_SCANNER_SERVICE,
	SourceBindings,
	type SourceBindingIndex,
	type SourceScanResult,
} from "pandwind/source";
import type { PandwindMeta } from "../meta.ts";
import {
	inspectAdapterCapabilities,
	AdapterCapabilityLevelTag,
	type AdapterCapabilityMode,
	type AdapterCapabilityReport,
} from "./capabilities.ts";
import type {
	AdapterDependencies,
	AdapterGeneratedFile,
	AdapterHostFrameworkConversion,
	AdapterParseContext,
	AdapterValidationResult,
	AdapterTargetMigrationPolicy,
	StyleAdapter,
} from "./adapter-contract.ts";
import {
	STYLE_LOWERING_REGISTRY,
	type StyleLoweringPlan,
	type StyleLoweringRegistry,
} from "./lowering.ts";
import type { StyleSystemRegistry } from "./style-systems.ts";
import { MigrationOutput } from "./migration-output.ts";
import { createBrowserCodemodCatalog } from "./browser-adapter-catalog.ts";
import { MigrationDiagnostics } from "./migration-diagnostics.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import {
	getHostComponentRewriter,
	componentTagForSubject,
	intrinsicTagForSubject,
	isDiscardedExpressionStatement,
	rewriteDynamicCarrier,
	rewriteDynamicExpressionCarrier,
	type HostComponentRewriteRequest,
	type StandaloneHostComponentRewriteRequest,
} from "./host-component-rewriter.ts";
import { DynamicClassHost } from "./adapters/class-target-dynamic.ts";
import { BuiltinHostFramework, detectHostFramework, type HostFramework } from "./host-adapters.ts";
import {
	StyleHostRepresentationKind,
	StyleMigrationOutcome,
	StyleRepresentationKind,
} from "./identifiers.ts";
import { StyleProgramAnalysis } from "./style-program-analysis.ts";
import { StyleProgramCore } from "./style-program-core.ts";

function tagForStandalone(source: string, start: number): string | undefined {
	const subject = source
		.slice(start)
		.match(/^styled\s*(\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))/)?.[0]
		.trim();
	return subject === undefined ? undefined : intrinsicTagForSubject(subject);
}

function isStandaloneDefaultExport(source: string, start: number): boolean {
	return /export\s+default\s*$/.test(source.slice(0, start));
}

function bindingForMatch(source: string, start: number): string | undefined {
	return source.slice(0, start).match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1];
}

function frameworkForHost(
	file: string,
	document: SourceScanResult,
	semantic: AdapterParseContext["semantic"],
	program: StyleProgram,
): string | undefined {
	return (
		semantic?.source?.framework ??
		detectHostFramework(document.document.source, document.document.file)?.id ??
		document.framework ??
		program.source?.framework ??
		(
			{
				tsx: BuiltinHostFramework.React,
				jsx: BuiltinHostFramework.React,
				vue: BuiltinHostFramework.Vue,
				svelte: BuiltinHostFramework.Svelte,
				astro: BuiltinHostFramework.Astro,
			} as Partial<Record<string, BuiltinHostFramework>>
		)[document.language ?? SOURCE_SCANNER_SERVICE.languageForFile(file)]
	);
}

function hasHostBindingUse(source: string, binding: string | undefined): boolean {
	if (binding === undefined) return false;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`(?:<\\s*${escaped}\\b|\\b(?:class|className|style|css)\\s*=\\s*\\{\\s*${escaped}\\s*\\})`,
	).test(source);
}

function hasComponentBindingUse(source: string, binding: string | undefined): boolean {
	if (binding === undefined) return false;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`<\\s*${escaped}\\b`).test(source);
}

function hasInlineHostUse(source: string, start: number): boolean {
	return /(?:class|className|style|css)\s*=\s*\{\s*$/.test(source.slice(0, start));
}

function classExpressionFromEmission(emitted: string): string | undefined {
	const expression = emitted.trim();
	return expression.length === 0 ? undefined : expression;
}

/** Keep generated module statements inside the executable block of an SFC. */
function ensureGeneratedStatement(code: string, statement: string, file: string): string {
	if (SOURCE_SCANNER_SERVICE.languageForFile(file) !== "vue" || code.includes(statement))
		return ensureImport(code, statement);
	const script = /<script(?:\s+setup)?(?:\s[^>]*)?>/i.exec(code);
	if (script === null) return `<script setup>\n${statement}\n</script>\n${code}`;
	const contentStart = script.index + script[0].length;
	const contentEnd = code.indexOf("</script>", contentStart);
	if (contentEnd === -1)
		return `${code.slice(0, contentStart)}\n${statement}${code.slice(contentStart)}`;
	const content = code.slice(contentStart, contentEnd);
	const updated = ensureImport(content, statement);
	return `${code.slice(0, contentStart)}${updated.startsWith("\n") ? "" : "\n"}${updated}${code.slice(contentEnd)}`;
}

function fileWithExtension(file: string, extension: string | undefined): string {
	if (extension === undefined) return file;
	const slash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
	const dot = file.lastIndexOf(".");
	return dot > slash ? `${file.slice(0, dot)}${extension}` : `${file}${extension}`;
}

function selectNonOverlappingMatches<
	T extends { start: number; end: number; program: StyleProgram },
>(matches: readonly T[]): readonly T[] {
	const selected: T[] = [];
	for (const match of matches.toSorted(
		(left, right) => left.start - right.start || right.end - left.end,
	)) {
		const containing = selected.at(-1);
		if (containing === undefined || match.start >= containing.end) {
			selected.push(match);
			continue;
		}
		if (
			containing.start <= match.start &&
			match.end <= containing.end &&
			containing.program.source?.hostOpenTag !== undefined
		)
			continue;
		if (match.start === containing.start && match.end > containing.end)
			selected[selected.length - 1] = match;
	}
	return selected;
}

export interface AdapterMigrationOptions {
	readonly from: string;
	readonly to: string;
	readonly file: string;
	readonly root?: string;
	readonly meta?: PandwindMeta;
	readonly packageJson?: Readonly<Record<string, unknown>>;
	readonly readFile?: (file: string) => string | undefined;
	readonly mode?: AdapterCapabilityMode;
	readonly skipMarker?: string;
	/** Optional registry for third-party or core dialect routes. */
	readonly registry?: StyleSystemRegistry;
	/** Optional adapter registry, including adapters discovered from plugins. */
	readonly adapterRegistry?: StyleAdapterRegistry;
	/** Optional target-aware semantic lowering registry. */
	readonly loweringRegistry?: StyleLoweringRegistry;
	/** Framework/project metadata that cannot be recovered from syntax alone. */
	readonly semantic?: AdapterParseContext["semantic"];
}

export interface AdapterMigrationResult {
	readonly code: string;
	/** Suggested extension when a host dialect projection changes file syntax. */
	readonly outputExtension?: string;
	readonly changed: boolean;
	readonly converted: number;
	readonly skipped: number;
	readonly reports: readonly AdapterCapabilityReport[];
	readonly validations: readonly AdapterValidationResult[];
	readonly dependencies: readonly AdapterDependencies[];
	/** Target-owned project-relative files emitted with the rewritten module. */
	readonly generatedFiles: readonly AdapterGeneratedFile[];
	readonly residuals: readonly StyleProgramResidual[];
	/** One inspectable representation decision for each parsed source match. */
	readonly loweringPlans: readonly StyleLoweringPlan[];
	/** One final, validated outcome for each parsed source match. */
	readonly outcomes: readonly AdapterMigrationOutcome[];
}

export interface AdapterMigrationOutcome {
	readonly sourceStart: number;
	readonly sourceText: string;
	readonly outcome: StyleMigrationOutcome;
	readonly representation: StyleRepresentationKind;
	readonly detail?: string;
}

function migrationContext(source: string, options: AdapterMigrationOptions) {
	return {
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile: options.readFile,
	};
}

function noOpMigration(source: string): AdapterMigrationResult {
	return {
		code: source,
		changed: false,
		converted: 0,
		skipped: 0,
		reports: [],
		validations: [],
		dependencies: [],
		generatedFiles: [],
		residuals: [],
		loweringPlans: [],
		outcomes: [],
	};
}

interface LoadedAdapterConfigs {
	readonly source: ReturnType<StyleAdapter["loadConfig"]>;
	readonly target: ReturnType<StyleAdapter["loadConfig"]>;
}

const defaultAdapterRegistry = createBrowserCodemodCatalog().registry;

async function resolveNodeAdapterRegistry(): Promise<StyleAdapterRegistry> {
	const { createBuiltinCodemodCatalog } = await import(/* @vite-ignore */ "./adapter-catalog.ts");
	return createBuiltinCodemodCatalog().registry;
}

function configurationFailure(
	source: string,
	detail: string,
	marker = "pandwind:migrate-skip",
): AdapterMigrationResult {
	return {
		code:
			MigrationDiagnostics.skipMarker({
				marker,
				configurationResiduals: [
					{
						kind: "configuration",
						text: "official project configuration",
						hint: `official adapter configuration loading failed: ${detail}`,
					},
				],
			}) +
			"\n" +
			source,
		changed: false,
		converted: 0,
		skipped: 1,
		reports: [],
		validations: [],
		dependencies: [],
		generatedFiles: [],
		residuals: [
			{
				kind: "configuration",
				text: "official project configuration",
				hint: `official adapter configuration loading failed: ${detail}`,
			},
		],
		loweringPlans: [],
		outcomes: [
			{
				sourceStart: 0,
				sourceText: source,
				outcome: StyleMigrationOutcome.Residual,
				representation: StyleRepresentationKind.Residual,
				detail: "official project configuration could not be loaded",
			},
		],
	};
}

function hasTargetHostPort(adapter: StyleAdapter): boolean {
	return adapter.migration?.targetPolicy?.handlesHostRewrites === true;
}

function hostFrameworkConversion(
	policy: AdapterTargetMigrationPolicy | undefined,
	sourceFramework: HostFramework | undefined,
	context: { readonly file: string; readonly source: string; readonly program: StyleProgram },
): AdapterHostFrameworkConversion | undefined {
	if (sourceFramework === undefined) return undefined;
	return policy?.hostFrameworkConversions?.find(
		(candidate) =>
			candidate.from === sourceFramework &&
			(candidate.canConvert === undefined || candidate.canConvert(context)),
	);
}

function targetHostFramework(
	policy: AdapterTargetMigrationPolicy | undefined,
	sourceFramework: HostFramework | undefined,
	context: { readonly file: string; readonly source: string; readonly program: StyleProgram },
): HostFramework | undefined {
	if (sourceFramework === undefined) return undefined;
	if (policy?.hostFrameworks?.includes(sourceFramework)) return sourceFramework;
	if (policy?.hostFrameworks === undefined && policy?.hostFrameworkConversions === undefined)
		return sourceFramework;
	const conversion = hostFrameworkConversion(policy, sourceFramework, context);
	return conversion?.to ?? sourceFramework;
}

function targetAcceptsSourceFramework(
	policy: AdapterTargetMigrationPolicy | undefined,
	sourceFramework: HostFramework | undefined,
	context: { readonly file: string; readonly source: string; readonly program: StyleProgram },
): boolean {
	if (sourceFramework === undefined) return false;
	if (policy?.hostFrameworks?.includes(sourceFramework)) return true;
	if (policy?.hostFrameworks === undefined && policy?.hostFrameworkConversions === undefined)
		return true;
	return hostFrameworkConversion(policy, sourceFramework, context) !== undefined;
}

function loweringRegistryForRoute(
	base: StyleLoweringRegistry,
	source: StyleAdapter,
	target: StyleAdapter,
): StyleLoweringRegistry {
	const byId = new Map<string, NonNullable<StyleAdapter["lowerings"]>[number]>();
	for (const lowering of [...(source.lowerings ?? []), ...(target.lowerings ?? [])])
		byId.set(lowering.id, lowering);
	return byId.size === 0 ? base : base.extend([...byId.values()]);
}

/** Run one v2 adapter-to-adapter migration over a source file. */
export function runAdapterMigration(
	source: string,
	options: AdapterMigrationOptions,
): AdapterMigrationResult {
	return runAdapterMigrationInternal(source, options);
}

/**
 * Project-aware migration entry point. Official ecosystem packages are
 * optional: adapters use them when installed in the host project and retain
 * their deterministic source fallback otherwise.
 */
export async function runAdapterMigrationAsync(
	source: string,
	options: AdapterMigrationOptions,
): Promise<AdapterMigrationResult> {
	const adapterRegistry = options.adapterRegistry ?? (await resolveNodeAdapterRegistry());
	const route = (options.registry ?? adapterRegistry.toStyleSystemRegistry()).resolveRoute(
		options.from,
		options.to,
	);
	const context = migrationContext(source, options);
	const detection = route.source.detect(context);
	if (!detection.matched)
		return runAdapterMigrationInternal(source, { ...options, adapterRegistry });
	let sourceConfig: LoadedAdapterConfigs["source"];
	let targetConfig: LoadedAdapterConfigs["target"];
	try {
		[sourceConfig, targetConfig] = await Promise.all([
			route.source.loadConfigAsync?.(context) ?? route.source.loadConfig(context),
			route.target.loadConfigAsync?.(context) ?? route.target.loadConfig(context),
		]);
	} catch (error) {
		return configurationFailure(
			source,
			error instanceof Error ? error.message : String(error),
			options.skipMarker,
		);
	}
	return runAdapterMigrationInternal(
		source,
		{ ...options, adapterRegistry },
		{
			source: sourceConfig,
			target: targetConfig,
		},
	);
}

function runAdapterMigrationInternal(
	source: string,
	options: AdapterMigrationOptions,
	loadedConfigs?: LoadedAdapterConfigs,
): AdapterMigrationResult {
	const adapterRegistry = options.adapterRegistry ?? defaultAdapterRegistry;
	const route = (options.registry ?? adapterRegistry.toStyleSystemRegistry()).resolveRoute(
		options.from,
		options.to,
	);
	const sourceAdapter = route.source;
	const targetAdapter = route.target;
	// Migrating a dialect to itself is an identity operation. Do not make the
	// source re-enter target capability negotiation: that can turn a valid
	// source construct into a false mismatch merely because the adapter marks
	// its cross-framework component contract as partial.
	if (sourceAdapter.id === targetAdapter.id) return noOpMigration(source);
	const context = migrationContext(source, options);
	const readFile = context.readFile;
	const detection = sourceAdapter.detect(context);
	if (!detection.matched) return noOpMigration(source);
	const config = loadedConfigs?.source ?? sourceAdapter.loadConfig(context);
	const targetConfig = loadedConfigs?.target ?? targetAdapter.loadConfig(context);
	const configurationResiduals = [...(config.residuals ?? []), ...(targetConfig.residuals ?? [])];
	if (configurationResiduals.length > 0) {
		const marker = options.skipMarker ?? "pandwind:migrate-skip";
		return {
			code:
				MigrationDiagnostics.skipMarker({
					marker,
					configurationResiduals,
				}) +
				"\n" +
				source,
			changed: false,
			converted: 0,
			skipped: 1,
			reports: [],
			validations: [],
			dependencies: [],
			generatedFiles: [],
			residuals: configurationResiduals,
			loweringPlans: [],
			outcomes: [
				{
					sourceStart: 0,
					sourceText: source,
					outcome: StyleMigrationOutcome.Residual,
					representation: StyleRepresentationKind.Residual,
					detail: "official project configuration could not be loaded",
				},
			],
		};
	}
	const document = SOURCE_SCANNER_SERVICE.scan({
		file: options.file,
		source,
		root: options.root,
	});
	let bindings: SourceBindingIndex | undefined;
	try {
		bindings = SourceBindings.fromDocument(document.document);
	} catch {
		// Snippet-like inputs can be scanned without a complete module AST. The
		// adapter remains conservative and uses its bounded fallback matcher.
	}
	const parsedResult = sourceAdapter.parse(source, {
		file: options.file,
		source,
		root: options.root,
		config,
		readFile,
		meta: options.meta,
		document,
		...(bindings === undefined ? {} : { bindings }),
		semantic: options.semantic,
	});
	// Every frontend crosses the same compiler-core boundary before lowering.
	// This keeps target adapters independent from source-specific object shape
	// and makes the versioned StyleProgram contract observable at the pivot.
	const parsed = {
		...parsedResult,
		matches: parsedResult.matches.map((match) => ({
			...match,
			program: StyleProgramCore.normalize(match.program),
		})),
	};
	const mode = options.mode ?? "safe";
	const loweringRegistry = loweringRegistryForRoute(
		options.loweringRegistry ?? STYLE_LOWERING_REGISTRY,
		sourceAdapter,
		targetAdapter,
	);
	const marker = options.skipMarker ?? "pandwind:migrate-skip";
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const imports = new Set<string>();
	const reports: AdapterCapabilityReport[] = [];
	const validations: AdapterValidationResult[] = [];
	const dependencies: AdapterDependencies[] = [targetAdapter.dependencies];
	const generatedFiles = new Map<string, AdapterGeneratedFile>();
	const generatedFileResiduals: StyleProgramResidual[] = [];
	const collectGeneratedFiles = (files: readonly AdapterGeneratedFile[] | undefined): void => {
		for (const file of files ?? []) {
			const path = file.path.replaceAll("\\", "/");
			const segments = path.split("/");
			if (
				path === "" ||
				path.startsWith("/") ||
				/^[A-Za-z]:\//u.test(path) ||
				segments.some((segment) => segment === "..")
			) {
				generatedFileResiduals.push({
					kind: "generated-file",
					text: file.path,
					hint: "generated file paths must be non-empty project-relative paths",
				});
				continue;
			}
			const normalizedPath = segments
				.filter((segment) => segment !== "" && segment !== ".")
				.join("/");
			if (normalizedPath === "") {
				generatedFileResiduals.push({
					kind: "generated-file",
					text: file.path,
					hint: "generated file paths must be non-empty project-relative paths",
				});
				continue;
			}
			const existing = generatedFiles.get(normalizedPath);
			if (existing === undefined) {
				generatedFiles.set(normalizedPath, { ...file, path: normalizedPath });
				continue;
			}
			if (existing.content !== file.content) {
				generatedFileResiduals.push({
					kind: "generated-file",
					text: normalizedPath,
					hint: "multiple target emissions produced conflicting content for one generated file",
				});
			}
		}
	};
	const residuals: StyleProgramResidual[] = [...parsed.residuals];
	const sourceModulesToRemove = new Set<string>();
	const loweringPlans: StyleLoweringPlan[] = [];
	const outcomes: AdapterMigrationOutcome[] = [];
	const convertedBindings = new Set<string>();
	const componentRewrites: HostComponentRewriteRequest[] = [];
	const pendingComponentDeclarationRewrites = new Map<
		number,
		Omit<HostComponentRewriteRequest, "source" | "classExpression">
	>();
	const componentDeclarationRewrites = new Map<number, HostComponentRewriteRequest>();
	const standaloneComponentRewrites: Array<
		StandaloneHostComponentRewriteRequest & { emittedExpression: string }
	> = [];
	const componentRewriteKeys = new Set<string>();
	const dynamicRewrites: Array<{ binding?: string; expression: string; framework: string }> = [];
	const targetHostRewrites: Array<{
		readonly program: StyleProgram;
		readonly emittedExpression: string;
		readonly sourceModules: readonly string[];
		readonly binding?: string;
		readonly framework?: string;
		readonly sourceFramework?: HostFramework;
		readonly representation: StyleHostRepresentationKind;
		readonly representationKind: StyleRepresentationKind;
		readonly residuals: readonly StyleProgramResidual[];
	}> = [];
	const targetComponentRewrites: Array<{
		readonly program: StyleProgram;
		readonly binding: string;
		readonly tag: string;
		readonly framework: string;
		readonly sourceFramework?: HostFramework;
		readonly emittedExpression: string;
		readonly representation: StyleHostRepresentationKind;
	}> = [];
	let skipped = 0;
	let converted = 0;
	let outputExtension: string | undefined;
	const unpreservedParseResiduals = parsed.residuals.filter(
		(residual) => residual.preserved !== true,
	);
	if (unpreservedParseResiduals.length > 0) {
		skipped++;
		outcomes.push({
			sourceStart: 0,
			sourceText: source,
			outcome: StyleMigrationOutcome.Residual,
			representation: StyleRepresentationKind.Residual,
			detail: "source parser produced an unpreserved residual",
		});
		edits.push({
			start: 0,
			end: 0,
			text:
				MigrationDiagnostics.skipMarker({
					marker,
					sourceAdapter: sourceAdapter.id,
					targetAdapter: targetAdapter.id,
					parseResiduals: unpreservedParseResiduals,
				}) + "\n",
		});
	}
	for (const [index, match] of selectNonOverlappingMatches(parsed.matches).entries()) {
		const sourceHasFunctionDynamic = StyleProgramAnalysis.hasFunctionDynamic(match.program);
		let lowering = loweringRegistry.plan({
			program: match.program,
			target: targetAdapter.capabilities,
			mode,
			hostFramework: targetAdapter.migration?.targetPolicy?.handlesFrameworkSemantics === true,
		});
		let loweringResiduals = lowering.residuals;
		let program = lowering.program;
		const hasFunctionDynamic =
			sourceHasFunctionDynamic || StyleProgramAnalysis.hasFunctionDynamic(program);
		const sourceSubject = program.source?.subject;
		const targetPolicy = targetAdapter.migration?.targetPolicy;
		let hostRepresentation = targetPolicy?.hostRepresentation;
		const sourceHostFramework = frameworkForHost(options.file, document, options.semantic, program);
		const hostConversionContext = { file: options.file, source, program };
		if (
			program.source?.framework !== undefined &&
			hostRepresentation === StyleHostRepresentationKind.Component &&
			targetAcceptsSourceFramework(targetPolicy, sourceHostFramework, hostConversionContext)
		) {
			program = { ...program, source: { ...program.source, framework: undefined } };
		}
		let targetHostProjection = false;
		let targetComponentProjection = false;
		let emittedHostRepresentation: StyleHostRepresentationKind | undefined;
		let targetRepresentationKind = lowering.representation;
		let dynamicCarrier: { binding?: string; framework: string } | undefined;
		const bindingBeforeMatch = bindingForMatch(source, match.start);
		const hasHostContext =
			program.source?.hostOpenTag !== undefined ||
			hasHostBindingUse(source, bindingBeforeMatch) ||
			hasInlineHostUse(source, match.start) ||
			hasComponentBindingUse(source, bindingBeforeMatch);
		const discardableStaticSubject =
			sourceSubject !== undefined &&
			bindingBeforeMatch === undefined &&
			!StyleProgramAnalysis.hasDynamic(program) &&
			!hasHostContext &&
			isDiscardedExpressionStatement(source, match.start, match.end);
		if (discardableStaticSubject)
			program = {
				...program,
				source: { ...program.source, subject: undefined },
			};
		const hostFramework = targetHostFramework(targetPolicy, sourceHostFramework, {
			...hostConversionContext,
			program,
		});
		const resolvedHostRepresentation = targetPolicy?.resolveHostRepresentation;
		hostRepresentation =
			resolvedHostRepresentation === undefined
				? hostRepresentation
				: resolvedHostRepresentation({
						program,
						hasHostContext,
						...(hostFramework === undefined ? {} : { framework: hostFramework }),
						...(sourceHostFramework === undefined ? {} : { sourceFramework: sourceHostFramework }),
						...(bindingBeforeMatch === undefined ? {} : { binding: bindingBeforeMatch }),
						source,
					});
		const resolvedRepresentation = targetPolicy?.resolveRepresentation?.({
			program,
			representation: lowering.representation,
			targetCapabilities: targetAdapter.capabilities,
			hasHostContext,
			...(hostFramework === undefined ? {} : { framework: hostFramework }),
			...(sourceHostFramework === undefined ? {} : { sourceFramework: sourceHostFramework }),
			...(bindingBeforeMatch === undefined ? {} : { binding: bindingBeforeMatch }),
			...(hostRepresentation === undefined ? {} : { hostRepresentation }),
			source,
		});
		const representationNegotiated = resolvedRepresentation !== undefined;
		if (resolvedRepresentation !== undefined) targetRepresentationKind = resolvedRepresentation;
		const representationCapabilities =
			targetPolicy?.capabilitiesForRepresentation?.({
				program,
				representation: targetRepresentationKind,
			}) ?? [];
		const preservedResidualKinds = new Set(
			representationNegotiated
				? (targetPolicy?.preservesResidualKindsForRepresentation?.({
						program,
						representation: targetRepresentationKind,
					}) ?? [])
				: [],
		);
		const carrierResiduals = loweringResiduals;
		const hasDynamicCarrier = carrierResiduals.some(
			(residual) =>
				residual.kind === StyleProgramResidualKindTag.DynamicCustomProperty ||
				residual.kind === SwapResidualKindTag.Dynamic ||
				residual.kind === StyleProgramResidualKindTag.DynamicValues,
		);
		if (preservedResidualKinds.size > 0)
			program = {
				...program,
				residuals: program.residuals.map((residual) =>
					preservedResidualKinds.has(residual.kind) ? { ...residual, preserved: true } : residual,
				),
			};
		if (preservedResidualKinds.size > 0)
			loweringResiduals = loweringResiduals.filter(
				(residual) => !preservedResidualKinds.has(residual.kind),
			);
		if (!lowering.availableRepresentations.includes(targetRepresentationKind))
			lowering = {
				...lowering,
				availableRepresentations: [...lowering.availableRepresentations, targetRepresentationKind],
			};
		loweringPlans.push(lowering);
		if (
			targetRepresentationKind === StyleRepresentationKind.PortableArtifact &&
			hostRepresentation !== undefined
		)
			emittedHostRepresentation = hostRepresentation;
		if (
			targetRepresentationKind === StyleRepresentationKind.CustomProperty &&
			hostRepresentation !== undefined &&
			hasHostContext
		)
			emittedHostRepresentation = hostRepresentation;
		// Host-aware native emitters may return a plain object (for example a
		// Mantine style prop) instead of a portable artifact or custom-property
		// carrier. The host rewrite still has to replace the source style props;
		// otherwise the object is left in the expression position of the source
		// JSX and can become invalid JavaScript.
		if (
			targetPolicy?.handlesHostRewrites === true &&
			hostRepresentation !== undefined &&
			hasHostContext &&
			program.source?.subject === undefined
		)
			emittedHostRepresentation = hostRepresentation;
		if (
			(targetPolicy?.requiresHostContext === true || targetPolicy?.handlesHostRewrites === true) &&
			resolvedHostRepresentation !== undefined &&
			hostRepresentation === undefined &&
			(targetPolicy.requiresHostContext === true
				? program.source?.subject === undefined
				: hasHostContext || program.source?.subject !== undefined)
		) {
			loweringResiduals = [
				...loweringResiduals,
				{
					kind: "host-framework",
					text: program.source?.subject ?? match.sourceText,
					hint:
						targetPolicy.hostContextRequiredHint ??
						`${targetAdapter.id} has no host representation for ${hostFramework ?? "the detected framework"}`,
				},
			];
		}
		if (
			hasTargetHostPort(targetAdapter) &&
			program.source?.subject === undefined &&
			(hasHostContext || program.source?.hostStyleAttributes !== undefined)
		) {
			if (hostRepresentation !== undefined) emittedHostRepresentation = hostRepresentation;
			const hasDynamic = StyleProgramAnalysis.hasDynamic(program);
			if (hasDynamic) {
				const binding = bindingBeforeMatch;
				const framework = hostFramework;
				const preview =
					binding !== undefined && framework !== undefined
						? rewriteDynamicCarrier(source, binding, framework, options.file)
						: framework !== undefined
							? rewriteDynamicExpressionCarrier(source, match.sourceText, framework, options.file)
							: undefined;
				const dynamicPolicy = sourceAdapter.migration?.prepareDynamic?.({
					source,
					file: options.file,
					targetId: targetAdapter.id,
					program,
					...(binding === undefined ? {} : { binding }),
					...(framework === undefined ? {} : { framework }),
				});
				const hostDynamicHandled =
					program.source?.hostOpenTag !== undefined &&
					program.source.hostStyleAttributes !== undefined &&
					!hasFunctionDynamic;
				const nativeFunctionHandled =
					hasFunctionDynamic &&
					program.source?.hostOpenTag === undefined &&
					targetAdapter.capabilities.capabilities["function-values"] !==
						AdapterCapabilityLevelTag.Unsupported;
				const dynamicHandled =
					hostDynamicHandled ||
					dynamicPolicy?.handled === true ||
					targetPolicy?.handlesDynamicValues === true;
				const dynamicHandledWithTarget = dynamicHandled || nativeFunctionHandled;
				const dynamicStandalone = dynamicPolicy?.standalone === true;
				if (
					(preview === undefined || preview.residuals.length > 0) &&
					!dynamicHandledWithTarget &&
					!dynamicStandalone
				) {
					skipped++;
					outcomes.push({
						sourceStart: match.start,
						sourceText: match.sourceText,
						outcome: StyleMigrationOutcome.Residual,
						representation: targetRepresentationKind,
						detail: "dynamic value has no validated host carrier",
					});
					residuals.push({
						kind: "dynamic-values",
						text: match.sourceText,
						hint:
							preview?.residuals[0]?.hint ?? "dynamic values need a host-bound class/style carrier",
					});
					edits.push({
						start: match.start,
						end: match.start,
						text:
							MigrationDiagnostics.skipMarker({
								marker,
								loweringResiduals: [
									{
										kind: "dynamic-values",
										text: match.sourceText,
										hint: "dynamic values require a host-bound class/style carrier",
									},
								],
							}) + "\n",
					});
					continue;
				}
				if (dynamicHandledWithTarget || preview?.residuals.length === 0) {
					program = {
						...program,
						residuals: program.residuals.filter(
							(residual) => residual.kind !== SwapResidualKindTag.Dynamic,
						),
					};
				}
				if (framework !== undefined && !dynamicStandalone && !dynamicHandledWithTarget)
					dynamicCarrier = {
						...(binding === undefined ? {} : { binding }),
						framework,
					};
			}
		}
		if (hasTargetHostPort(targetAdapter) && program.source?.subject !== undefined) {
			const hasDynamic = StyleProgramAnalysis.hasDynamic(program);
			const binding = bindingBeforeMatch;
			const tag = componentTagForSubject(program.source.subject);
			const framework = hostFramework;
			const targetComponentRewriter = targetPolicy?.rewriteComponent;
			const targetComponentPreview =
				binding !== undefined &&
				tag !== undefined &&
				framework !== undefined &&
				targetComponentRewriter !== undefined
					? targetComponentRewriter({
							source,
							code: source,
							file: options.file,
							targetId: targetAdapter.id,
							program,
							binding,
							tag,
							framework,
							sourceFramework: sourceHostFramework,
							emittedExpression: binding,
							representation: hostRepresentation ?? StyleHostRepresentationKind.Component,
						})
					: undefined;
			const rewriter =
				binding !== undefined && tag !== undefined && framework !== undefined
					? getHostComponentRewriter(framework)
					: undefined;
			const hasTargetComponentUsage = targetComponentPreview?.residuals.length === 0;
			const hasHostUsage =
				hasTargetComponentUsage ||
				(binding !== undefined &&
					tag !== undefined &&
					framework !== undefined &&
					rewriter !== undefined &&
					rewriter.rewrite({
						source,
						file: options.file,
						binding,
						tag,
						framework,
						classExpression: binding,
					}).changed);
			if (
				!hasHostUsage &&
				program.source?.subject !== undefined &&
				targetPolicy?.standaloneHostRepresentation !== undefined &&
				targetAdapter.capabilities.capabilities.components !== AdapterCapabilityLevelTag.Unsupported
			) {
				// A target may preserve an unused styled subject as its own component
				// factory even when its host-bound representation is a class. Select the
				// standalone contract before deciding whether a class wrapper is needed.
				hostRepresentation = targetPolicy.standaloneHostRepresentation;
			}
			const standaloneExport =
				binding === undefined &&
				tag !== undefined &&
				framework !== undefined &&
				getHostComponentRewriter(framework)?.rewriteStandalone !== undefined &&
				isStandaloneDefaultExport(source, match.start);
			const frameworkWrapper =
				hasFunctionDynamic &&
				binding !== undefined &&
				tag !== undefined &&
				(framework === BuiltinHostFramework.Solid ||
					framework === BuiltinHostFramework.Vue ||
					framework === BuiltinHostFramework.React ||
					framework === BuiltinHostFramework.Preact) &&
				((targetAdapter.migration?.targetPolicy?.standaloneHostRepresentation ??
					hostRepresentation) === StyleHostRepresentationKind.Class ||
					hasHostUsage);
			const standaloneRepresentation =
				targetAdapter.migration?.targetPolicy?.standaloneHostRepresentation ?? hostRepresentation;
			if (standaloneExport || frameworkWrapper) {
				emittedHostRepresentation = standaloneExport
					? standaloneRepresentation
					: hostRepresentation;
				targetHostProjection = emittedHostRepresentation === StyleHostRepresentationKind.Class;
				if (targetHostProjection)
					program = { ...program, source: { ...program.source, subject: undefined } };
				if (frameworkWrapper)
					loweringResiduals = loweringResiduals.filter(
						(residual) =>
							residual.kind !== SwapResidualKindTag.Dynamic &&
							residual.kind !== SwapResidualKindTag.FunctionDynamic &&
							residual.kind !== StyleProgramResidualKindTag.DynamicCustomProperty,
					);
				if (frameworkWrapper)
					program = {
						...program,
						residuals: program.residuals.filter(
							(residual) =>
								residual.kind !== SwapResidualKindTag.Dynamic &&
								residual.kind !== SwapResidualKindTag.FunctionDynamic &&
								residual.kind !== StyleProgramResidualKindTag.DynamicCustomProperty,
						),
					};
				if (
					frameworkWrapper &&
					binding !== undefined &&
					tag !== undefined &&
					framework !== undefined &&
					hostRepresentation === StyleHostRepresentationKind.Class
				) {
					pendingComponentDeclarationRewrites.set(index, {
						binding,
						tag,
						framework,
						...(DynamicClassHost.styleExpression(carrierResiduals, "props") === undefined
							? {}
							: {
									styleExpression: DynamicClassHost.styleExpression(carrierResiduals, "props"),
								}),
					});
				}
			}
			const residualsCanUseHostLowering = program.residuals.every(
				(residual) =>
					residual.kind === SwapResidualKindTag.Dynamic ||
					(residual.kind === SwapResidualKindTag.FunctionDynamic && hasFunctionDynamic),
			);
			const dynamicClassSubjectProjection =
				(hasDynamic || hasDynamicCarrier) &&
				!hasFunctionDynamic &&
				program.source?.subject !== undefined &&
				binding !== undefined &&
				tag !== undefined &&
				framework !== undefined &&
				hostRepresentation === StyleHostRepresentationKind.Class &&
				targetRepresentationKind === StyleRepresentationKind.CustomProperty &&
				DynamicClassHost.styleExpression(carrierResiduals) !== undefined &&
				getHostComponentRewriter(framework)?.rewriteDeclaration !== undefined;
			if (dynamicClassSubjectProjection) {
				// A scalar dynamic value can still be static CSS: the target class
				// contains var(--pandwind-dynamic-*), while the generated wrapper
				// binds that variable from the original lexical expression. Keep the
				// component value a component; never assign a class string to Card.
				emittedHostRepresentation = hostRepresentation;
				targetHostProjection = true;
				program = {
					...program,
					source: {
						...program.source,
						subject: undefined,
						...(targetPolicy?.handlesFrameworkSemantics === true ? { framework: undefined } : {}),
					},
				};
				pendingComponentDeclarationRewrites.set(index, {
					binding,
					tag,
					framework,
					styleExpression: DynamicClassHost.styleExpression(carrierResiduals),
				});
			}
			if (
				hasTargetComponentUsage &&
				(!hasDynamic || targetPolicy?.handlesDynamicComponentValues === true) &&
				!hasDynamicCarrier &&
				!hasFunctionDynamic &&
				residualsCanUseHostLowering
			) {
				emittedHostRepresentation = hostRepresentation;
				targetComponentProjection = true;
				program = {
					...program,
					source: {
						...program.source,
						subject: undefined,
						...(targetPolicy?.handlesFrameworkSemantics === true ? { framework: undefined } : {}),
					},
				};
			} else if (
				standaloneExport ||
				hostRepresentation === StyleHostRepresentationKind.Component ||
				binding === undefined ||
				tag === undefined ||
				framework === undefined ||
				rewriter === undefined
			) {
				// Leave the subject in the program so the target capability contract
				// blocks unsafe class-string conversion.
			} else {
				const preview = rewriter.rewrite({
					source,
					file: options.file,
					binding,
					tag,
					framework,
					classExpression: binding,
				});
				const rewriteKey = `${binding}:${tag}:${framework}`;
				if (
					!dynamicClassSubjectProjection &&
					preview.residuals.length === 0 &&
					residualsCanUseHostLowering &&
					!hasFunctionDynamic
				) {
					program = {
						...program,
						residuals: hasDynamic
							? program.residuals.filter(
									(residual) =>
										residual.kind !== SwapResidualKindTag.Dynamic &&
										residual.kind !== SwapResidualKindTag.FunctionDynamic,
								)
							: program.residuals,
						source: {
							...program.source,
							subject: undefined,
							...(targetAdapter.migration?.targetPolicy?.handlesFrameworkSemantics === true
								? { framework: undefined }
								: {}),
						},
					};
					if (!componentRewriteKeys.has(rewriteKey)) {
						emittedHostRepresentation = hostRepresentation;
						targetHostProjection = hostRepresentation === StyleHostRepresentationKind.Class;
						componentRewriteKeys.add(rewriteKey);
						componentRewrites.push({
							binding,
							tag,
							framework,
							file: options.file,
							classExpression: hasDynamic ? `${binding}.class` : binding,
							...(hasDynamic ? { styleExpression: `${binding}.style` } : {}),
							source,
						});
					}
				} else if (
					preview.residuals.length > 0 &&
					getHostComponentRewriter(framework)?.rewriteDeclaration !== undefined &&
					program.source?.subject !== undefined
				) {
					// A styled subject with no local JSX use still has component
					// semantics. Lower the style to the target's class carrier and
					// schedule the shared host declaration rewrite; assigning a class
					// expression directly to `Card` would silently change its public
					// value from a component to a string.
					emittedHostRepresentation = hostRepresentation;
					targetHostProjection = hostRepresentation === StyleHostRepresentationKind.Class;
					program = {
						...program,
						source: {
							...program.source,
							subject: undefined,
							...(targetPolicy?.handlesFrameworkSemantics === true ? { framework: undefined } : {}),
						},
					};
					pendingComponentDeclarationRewrites.set(index, {
						binding,
						tag,
						framework,
						...(DynamicClassHost.styleExpression(loweringResiduals, "props") === undefined
							? {}
							: {
									styleExpression: DynamicClassHost.styleExpression(loweringResiduals, "props"),
								}),
					});
				}
			}
		}
		const report = inspectAdapterCapabilities(targetAdapter.capabilities, program, mode);
		const resolvedCapabilities = new Set([
			...(lowering.resolvedCapabilities ?? []),
			...representationCapabilities,
		]);
		if (targetComponentProjection) {
			resolvedCapabilities.add("components");
			if (targetPolicy?.handlesFrameworkSemantics === true)
				resolvedCapabilities.add("framework-semantics");
		}
		const effectiveReport =
			resolvedCapabilities.size === 0
				? report
				: {
						...report,
						blockers: report.blockers.filter(
							(issue) => !resolvedCapabilities.has(issue.capability),
						),
						convertible: report.blockers.every(
							(issue) => resolvedCapabilities.has(issue.capability) === true,
						),
					};
		reports.push(effectiveReport);
		const unpreservedSemanticResiduals = [...program.residuals, ...loweringResiduals].filter(
			(residual) => residual.preserved !== true,
		);
		if (!effectiveReport.convertible || unpreservedSemanticResiduals.length > 0) {
			skipped++;
			outcomes.push({
				sourceStart: match.start,
				sourceText: match.sourceText,
				outcome: StyleMigrationOutcome.Residual,
				representation: targetRepresentationKind,
				detail:
					effectiveReport.blockers.length > 0
						? "target capability has no validated representation"
						: "semantic residual remains after lowering",
			});
			residuals.push(
				...program.residuals,
				...(effectiveReport.blockers.length === 0
					? []
					: [
							{
								kind: "capability",
								text: match.sourceText,
								hint: effectiveReport.blockers
									.map((issue) => `${issue.capability}: ${issue.detail}`)
									.join("; "),
							},
						]),
				...loweringResiduals,
			);
			edits.push({
				start: match.start,
				end: match.start,
				text:
					MigrationDiagnostics.skipMarker({
						marker,
						sourceAdapter: sourceAdapter.id,
						targetAdapter: targetAdapter.id,
						parseResiduals: program.residuals,
						loweringResiduals,
						blockers: effectiveReport.blockers,
						availableRepresentations: lowering.availableRepresentations,
					}) + "\n",
			});
			continue;
		}
		residuals.push(...loweringResiduals);
		const emitContext = {
			file: options.file,
			config: targetConfig,
			mode,
			capability: effectiveReport,
			loweringResiduals: carrierResiduals,
			index,
			document,
			meta: options.meta,
			host: {
				...(bindingBeforeMatch === undefined ? {} : { binding: bindingBeforeMatch }),
				...(hostFramework === undefined ? {} : { framework: hostFramework }),
				...(sourceSubject ? { subject: sourceSubject } : {}),
				...(emittedHostRepresentation === undefined
					? {}
					: { representation: emittedHostRepresentation }),
				...(targetRepresentationKind === lowering.representation
					? {}
					: { representationKind: targetRepresentationKind }),
			},
		};
		const emissionProgram = targetAdapter.tokenPolicy?.preserve(program, emitContext) ?? program;
		const emitted = targetAdapter.emit(emissionProgram, emitContext);
		if (emitted.text.trim() === "") {
			const emptyEmission = {
				kind: "emission-empty",
				text: match.sourceText,
				hint: "target adapter produced no representable output",
			} as const;
			skipped++;
			outcomes.push({
				sourceStart: match.start,
				sourceText: match.sourceText,
				outcome: StyleMigrationOutcome.Residual,
				representation: targetRepresentationKind,
				detail: emptyEmission.hint,
			});
			residuals.push(emptyEmission, ...emitted.residuals);
			edits.push({
				start: match.start,
				end: match.start,
				text:
					MigrationDiagnostics.skipMarker({
						marker,
						sourceAdapter: sourceAdapter.id,
						targetAdapter: targetAdapter.id,
						loweringResiduals: [emptyEmission, ...emitted.residuals],
						availableRepresentations: lowering.availableRepresentations,
					}) + "\n",
			});
			continue;
		}
		if (
			targetComponentProjection &&
			program.source?.subject === undefined &&
			bindingBeforeMatch !== undefined &&
			program.source?.framework === undefined &&
			sourceSubject !== undefined
		) {
			const tag = componentTagForSubject(sourceSubject);
			const framework = hostFramework;
			if (tag !== undefined && framework !== undefined && hostRepresentation !== undefined)
				targetComponentRewrites.push({
					program,
					binding: bindingBeforeMatch,
					tag,
					framework,
					sourceFramework: sourceHostFramework,
					emittedExpression: emitted.text,
					representation: hostRepresentation,
				});
		}
		// Preserve target-owned residuals in the public report as well as in
		// validation. A failed validation is an aggregate consequence; it must
		// not hide the precise semantic reason emitted by the target adapter.
		residuals.push(...emitted.residuals);
		const emittedForValidation = MigrationOutput.validationSource(emitted.text, program);
		if (
			targetAdapter.migration?.targetPolicy?.rewriteHost !== undefined &&
			!targetComponentProjection &&
			!targetHostProjection &&
			hasHostContext &&
			emittedHostRepresentation !== undefined &&
			program.source?.subject === undefined &&
			(program.source?.hostOpenTag === undefined ||
				targetAdapter.migration.targetPolicy.handlesSourceHostAttributes === true)
		) {
			targetHostRewrites.push({
				program,
				emittedExpression: emitted.text,
				sourceModules: sourceAdapter.sourceModules,
				representation: emittedHostRepresentation,
				representationKind: targetRepresentationKind,
				residuals: carrierResiduals,
				...(bindingBeforeMatch === undefined ? {} : { binding: bindingBeforeMatch }),
				...(hostFramework === undefined ? {} : { framework: hostFramework }),
				...(sourceHostFramework === undefined ? {} : { sourceFramework: sourceHostFramework }),
			});
		}
		const reparsed = targetAdapter.parse(emittedForValidation, {
			file: options.file,
			source: emittedForValidation,
			root: options.root,
			config: targetConfig,
			readFile,
			meta: options.meta,
			document,
			semantic: options.semantic,
		});
		const targetProgram =
			emitted.semantic ??
			(reparsed.matches.length === 0
				? program
				: styleProgramFromRules(
						reparsed.matches.flatMap((candidate) => candidate.program.rules),
						{
							source: program.source,
							residuals: reparsed.residuals,
							canonicalization: program.canonicalization,
						},
					));
		const validation = targetAdapter.validate(emitted.semantic ?? program, targetProgram, [
			...emitted.residuals,
			...reparsed.residuals.filter((residual) => !preservedResidualKinds.has(residual.kind)),
		]);
		validations.push(validation);
		if (!validation.valid) {
			skipped++;
			outcomes.push({
				sourceStart: match.start,
				sourceText: match.sourceText,
				outcome: StyleMigrationOutcome.Residual,
				representation: targetRepresentationKind,
				detail: validation.differences.join("; "),
			});
			residuals.push({
				kind: "validation",
				text: emitted.text,
				hint: validation.differences.join("; "),
			});
			edits.push({
				start: match.start,
				end: match.start,
				text:
					MigrationDiagnostics.skipMarker({
						marker,
						sourceAdapter: sourceAdapter.id,
						targetAdapter: targetAdapter.id,
						loweringResiduals: [
							...emitted.residuals,
							{
								kind: "validation",
								text: emitted.text,
								hint: validation.differences.join("; "),
							},
						],
					}) + "\n",
			});
			continue;
		}
		collectGeneratedFiles(emitted.generatedFiles);
		for (const statement of emitted.imports ?? []) imports.add(statement);
		if (emitted.dependencies !== undefined) dependencies.push(emitted.dependencies);
		residuals.push(...emitted.residuals);
		const declarationRewrite = pendingComponentDeclarationRewrites.get(index);
		if (declarationRewrite !== undefined) {
			const classExpression = classExpressionFromEmission(emitted.text);
			if (classExpression === undefined) {
				residuals.push({
					kind: "host-framework",
					text: declarationRewrite.binding,
					hint: "converted styled subject declaration has no extractable class expression",
				});
			} else {
				componentDeclarationRewrites.set(index, {
					...declarationRewrite,
					source,
					classExpression,
				});
			}
		}
		if (
			hasTargetHostPort(targetAdapter) &&
			program.source?.subject === undefined &&
			program.source?.framework !== undefined &&
			tagForStandalone(source, match.start) !== undefined &&
			isStandaloneDefaultExport(source, match.start)
		) {
			const tag = tagForStandalone(source, match.start);
			const rewriter =
				tag === undefined ? undefined : getHostComponentRewriter(program.source.framework);
			if (tag !== undefined && rewriter?.rewriteStandalone !== undefined) {
				standaloneComponentRewrites.push({
					source,
					tag,
					framework: program.source.framework,
					classExpression: emitted.text,
					emittedExpression: emitted.text,
				});
			}
		}
		if (dynamicCarrier !== undefined) {
			dynamicRewrites.push({
				...dynamicCarrier,
				expression: emitted.text,
			});
		}
		const emittedBinding = bindingBeforeMatch;
		if (emittedBinding !== undefined) convertedBindings.add(emittedBinding);
		const deferSourceHostReplacement =
			targetAdapter.migration?.targetPolicy?.handlesSourceHostAttributes === true &&
			targetAdapter.migration.targetPolicy.rewriteHost !== undefined &&
			program.source?.hostOpenTag === match.sourceText &&
			(program.source.hostStyleAttributes?.length ?? 0) > 0;
		if (!deferSourceHostReplacement)
			edits.push({ start: match.start, end: match.end, text: emitted.text });
		converted++;
		const successfulRepresentation = targetRepresentationKind;
		outcomes.push({
			sourceStart: match.start,
			sourceText: match.sourceText,
			outcome:
				successfulRepresentation === StyleRepresentationKind.PortableArtifact
					? StyleMigrationOutcome.PortableArtifact
					: StyleProgramAnalysis.hasDynamic(program) ||
						  hasDynamicCarrier ||
						  dynamicCarrier !== undefined
						? StyleMigrationOutcome.HostRuntime
						: successfulRepresentation === StyleRepresentationKind.Static
							? StyleMigrationOutcome.Static
							: StyleMigrationOutcome.TargetNative,
			representation: successfulRepresentation,
		});
	}
	const edited = SourcePass.applyEdits(source, edits);
	let runtimeEdited = edited;
	let needsCx = false;
	for (const request of targetHostRewrites) {
		const rewrite = targetAdapter.migration?.targetPolicy?.rewriteHost?.({
			source,
			code: runtimeEdited,
			file: options.file,
			targetId: targetAdapter.id,
			...request,
		});
		if (rewrite === undefined) continue;
		runtimeEdited = rewrite.code;
		for (const statement of rewrite.imports ?? []) imports.add(statement);
		for (const module of rewrite.removeSourceModules ?? []) sourceModulesToRemove.add(module);
		residuals.push(...rewrite.residuals);
	}
	for (const request of targetComponentRewrites) {
		const rewrite = targetAdapter.migration?.targetPolicy?.rewriteComponent?.({
			source,
			code: runtimeEdited,
			file: options.file,
			targetId: targetAdapter.id,
			...request,
		});
		if (rewrite === undefined) continue;
		runtimeEdited = rewrite.code;
		for (const statement of rewrite.imports ?? []) imports.add(statement);
		residuals.push(...rewrite.residuals);
	}
	for (const request of dynamicRewrites) {
		const rewritten =
			request.binding === undefined
				? rewriteDynamicExpressionCarrier(
						runtimeEdited,
						request.expression,
						request.framework,
						options.file,
					)
				: rewriteDynamicCarrier(runtimeEdited, request.binding, request.framework, options.file);
		if (rewritten.residuals.length > 0) {
			residuals.push(...rewritten.residuals);
			continue;
		}
		runtimeEdited = rewritten.code;
		needsCx ||= rewritten.needsCx;
	}
	for (const request of componentRewrites) {
		const rewriter = getHostComponentRewriter(request.framework);
		if (rewriter === undefined) continue;
		const rewritten = rewriter.rewrite({ ...request, source: runtimeEdited });
		if (rewritten.residuals.length > 0) {
			residuals.push(...rewritten.residuals);
			continue;
		}
		runtimeEdited = rewritten.code;
		needsCx ||= rewritten.needsCx;
		for (const statement of rewritten.imports ?? []) imports.add(statement);
	}
	for (const request of componentDeclarationRewrites.values()) {
		const rewriter = getHostComponentRewriter(request.framework);
		if (rewriter?.rewriteDeclaration === undefined) continue;
		const rewritten = rewriter.rewriteDeclaration({
			...request,
			source: runtimeEdited,
		});
		if (rewritten.residuals.length > 0) {
			residuals.push(...rewritten.residuals);
			continue;
		}
		runtimeEdited = rewritten.code;
		needsCx ||= rewritten.needsCx;
		for (const statement of rewritten.imports ?? []) imports.add(statement);
	}
	for (const request of standaloneComponentRewrites) {
		const rewriter = getHostComponentRewriter(request.framework);
		if (rewriter?.rewriteStandalone === undefined) continue;
		const rewritten = rewriter.rewriteStandalone({
			source: runtimeEdited,
			tag: request.tag,
			framework: request.framework,
			classExpression: request.emittedExpression,
		});
		if (rewritten.residuals.length > 0) {
			residuals.push(...rewritten.residuals);
			continue;
		}
		runtimeEdited = rewritten.code;
		needsCx ||= rewritten.needsCx;
	}
	if (needsCx) {
		runtimeEdited = ensureGeneratedStatement(
			runtimeEdited,
			'import { createCx } from "pandwind/cx";',
			options.file,
		);
		runtimeEdited = ensureGeneratedStatement(runtimeEdited, "const cx = createCx();", options.file);
	}
	const rewrite = sourceAdapter.migration?.rewrite?.({
		source,
		code: runtimeEdited,
		file: options.file,
		targetId: targetAdapter.id,
		convertedBindings,
		complete: skipped === 0 && residuals.length === 0,
	});
	if (rewrite !== undefined) {
		runtimeEdited = rewrite.code;
		for (const statement of rewrite.imports ?? []) imports.add(statement);
		residuals.push(...rewrite.residuals);
	}
	const documentProgram = parsed.matches[0]?.program;
	const documentSourceFramework =
		documentProgram === undefined
			? undefined
			: frameworkForHost(options.file, document, options.semantic, documentProgram);
	const documentConversion = hostFrameworkConversion(
		targetAdapter.migration?.targetPolicy,
		documentSourceFramework,
		documentProgram === undefined
			? { file: options.file, source, program: styleProgramFromRules([]) }
			: { file: options.file, source, program: documentProgram },
	);
	if (
		documentConversion?.rewriteDocument !== undefined &&
		documentSourceFramework !== undefined &&
		documentProgram !== undefined &&
		converted > 0 &&
		skipped === 0 &&
		residuals.length === 0
	) {
		const targetFramework = documentConversion.to;
		const documentRewrite = documentConversion.rewriteDocument({
			source,
			code: runtimeEdited,
			file: options.file,
			targetId: targetAdapter.id,
			sourceFramework: documentSourceFramework,
			targetFramework,
			convertedBindings,
		});
		if (documentRewrite.residuals.length > 0) {
			residuals.push(...documentRewrite.residuals);
			runtimeEdited =
				MigrationDiagnostics.skipMarker({
					marker,
					sourceAdapter: sourceAdapter.id,
					targetAdapter: targetAdapter.id,
					loweringResiduals: documentRewrite.residuals,
				}) +
				"\n" +
				source;
			converted = 0;
			skipped = 1;
			imports.clear();
		} else {
			runtimeEdited = documentRewrite.code;
			outputExtension = documentRewrite.outputExtension;
			for (const statement of documentRewrite.imports ?? []) imports.add(statement);
		}
	}
	// A generated artifact is part of the same atomic migration as its source
	// module. Invalid paths or conflicting contents therefore preserve the
	// original module instead of producing a partially migrated project.
	if (generatedFileResiduals.length > 0) {
		residuals.push(...generatedFileResiduals);
		runtimeEdited =
			MigrationDiagnostics.skipMarker({
				marker,
				sourceAdapter: sourceAdapter.id,
				targetAdapter: targetAdapter.id,
				loweringResiduals: generatedFileResiduals,
			}) +
			"\n" +
			source;
		converted = 0;
		skipped = Math.max(1, skipped);
		imports.clear();
		generatedFiles.clear();
		outputExtension = undefined;
	}
	// Keep source imports whenever a skipped/residual match still depends on the
	// source runtime. Removing them would turn a safe residual into broken code.
	let code =
		skipped === 0 && residuals.length === 0
			? MigrationOutput.removeSourceImports(runtimeEdited, [
					...sourceAdapter.sourceModules,
					...sourceModulesToRemove,
				])
			: runtimeEdited;
	if (imports.has('import { createRuntimeCss } from "pandwind/css/runtime";')) {
		imports.delete('import { createCss } from "pandwind/css";');
		imports.delete("const css = createCss();");
	}
	const outputFile = fileWithExtension(options.file, outputExtension);
	for (const statement of MigrationOutput.consolidateImports(imports))
		code = ensureGeneratedStatement(code, statement, outputFile);
	return {
		code,
		...(outputExtension === undefined ? {} : { outputExtension }),
		changed: code !== source,
		converted,
		skipped,
		reports,
		validations,
		dependencies,
		residuals,
		generatedFiles: [...generatedFiles.values()],
		loweringPlans,
		outcomes,
	};
}
