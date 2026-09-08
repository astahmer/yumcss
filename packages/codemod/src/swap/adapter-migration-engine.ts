import {
	StyleProgramResidualKindTag,
	SwapResidualKindTag,
	styleProgramFromRules,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import { SourcePass } from "../source-pass-utils.ts";
import {
	SourceBindings,
	createSourceProjectBindingIndex,
	type SourceBindingIndex,
} from "pandwind/source";
import { dirnameDocumentPath, joinDocumentPath } from "../path-utils.ts";
import {
	inspectAdapterCapabilities,
	AdapterCapabilityLevelTag,
	type AdapterCapabilityReport,
} from "./capabilities.ts";
import type {
	AdapterDependencies,
	AdapterGeneratedFile,
	AdapterHostFrameworkConversion,
	AdapterValidationResult,
	AdapterTargetMigrationPolicy,
	StyleAdapter,
} from "./adapter-contract.ts";
import type { StyleLoweringPlan, StyleLoweringRegistry } from "./lowering.ts";
import { MigrationOutput } from "./migration-output.ts";
import { NODE_PROJECT_MODULE_LOADER, type ProjectModuleLoader } from "./project-module-loader.ts";
import { MigrationDiagnostics } from "./migration-diagnostics.ts";
import type {
	AdapterMigrationExecutor,
	AdapterMigrationOptions,
	AdapterMigrationOutcome,
	AdapterMigrationPorts,
	AdapterMigrationResult,
} from "./adapter-migration-contract.ts";
import {
	getHostComponentRewriter,
	componentTagForSubject,
	isDiscardedExpressionStatement,
	rewriteDynamicCarrier,
	rewriteDynamicExpressionCarrier,
	type HostComponentRewriteRequest,
	type StandaloneHostComponentRewriteRequest,
} from "./host-component-rewriter.ts";
import { DynamicClassHost } from "./adapters/class-target-dynamic.ts";
import { BuiltinHostFramework, type HostFramework } from "./host-adapters.ts";
import { createAdapterMigrationSupport } from "./adapter-migration-support.ts";
import {
	StyleHostRepresentationKind,
	StyleMigrationOutcome,
	StyleRepresentationKind,
} from "./identifiers.ts";
import { StyleProgramAnalysis } from "./style-program-analysis.ts";
import { StyleProgramCore } from "./style-program-core.ts";

/**
 * File migrations may omit per-rule outcomes; derive one explicit outcome per
 * lowering plan so conservative skips stay visible to the contract gates.
 */
function derivedFileOutcomes(
	source: string,
	plans: readonly StyleLoweringPlan[],
): AdapterMigrationOutcome[] {
	return plans.map((plan) => ({
		sourceStart: 0,
		sourceText: source,
		outcome:
			plan.representation === StyleRepresentationKind.Residual
				? StyleMigrationOutcome.Residual
				: StyleMigrationOutcome.TargetNative,
		representation: plan.representation,
	}));
}

function migrationContext(source: string, options: AdapterMigrationOptions) {
	return {
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile: options.readFile,
		listFiles: options.listFiles,
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
		fileChanges: [],
		residuals: [],
		loweringPlans: [],
		outcomes: [],
	};
}

function hasAdjacentSkipMarker(source: string, position: number, marker: string): boolean {
	const prefix = source.slice(0, position);
	const lineStart = prefix.lastIndexOf("\n") + 1;
	if (prefix.slice(lineStart).includes(marker)) return true;
	const previousLineEnd = Math.max(0, lineStart - 1);
	const previousLineStart = prefix.lastIndexOf("\n", previousLineEnd - 1) + 1;
	return prefix.slice(previousLineStart, previousLineEnd).includes(marker);
}

function withoutDuplicateSkipMarkers(
	source: string,
	edits: readonly { readonly start: number; readonly end: number; readonly text: string }[],
	marker: string,
): readonly { readonly start: number; readonly end: number; readonly text: string }[] {
	return edits.filter(
		(edit) =>
			!(edit.start === edit.end && edit.text.includes(marker)) ||
			!hasAdjacentSkipMarker(source, edit.start, marker),
	);
}

interface LoadedAdapterConfigs {
	readonly source: ReturnType<StyleAdapter["loadConfig"]>;
	readonly target: ReturnType<StyleAdapter["loadConfig"]>;
}

/**
 * Migration callers may inject a loader scoped to a harness root (sandbox,
 * proof script) while adapters resolve optional packages from the migrated
 * project root. The fallback order preserves that boundary: project first,
 * caller-provided loader second.
 */
function withProjectLoaderFallback(fallback: ProjectModuleLoader): ProjectModuleLoader {
	return {
		async importPackage<T>(packageName: string, root: string): Promise<T | undefined> {
			return (
				(await NODE_PROJECT_MODULE_LOADER.importPackage<T>(packageName, root)) ??
				(await fallback.importPackage<T>(packageName, root))
			);
		},
		importFile<T>(file: string): Promise<T | undefined> {
			return NODE_PROJECT_MODULE_LOADER.importFile<T>(file).then(
				(loaded) => loaded ?? fallback.importFile<T>(file),
			);
		},
	};
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
						kind: StyleProgramResidualKindTag.Configuration,
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
		fileChanges: [],
		residuals: [
			{
				kind: StyleProgramResidualKindTag.Configuration,
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

async function runAdapterMigrationAsyncInternal(
	source: string,
	options: AdapterMigrationOptions,
	ports: AdapterMigrationPorts,
): Promise<AdapterMigrationResult> {
	const adapterRegistry =
		options.adapterRegistry ??
		(await ports.resolveAdapterRegistry?.(
			options.moduleLoader === undefined
				? undefined
				: withProjectLoaderFallback(options.moduleLoader),
		)) ??
		ports.adapterRegistry;
	const route = (options.registry ?? adapterRegistry.toStyleSystemRegistry()).resolveRoute(
		options.from,
		options.to,
	);
	if (route.source.id === route.target.id) return noOpMigration(source);
	const context = migrationContext(source, options);
	const detection = route.source.detect(context);
	if (!detection.matched)
		return runAdapterMigrationInternal(source, { ...options, adapterRegistry }, ports);
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
	const fileMigration = route.source.migration?.file;
	if (fileMigration?.runAsync !== undefined) {
		const result = await fileMigration.runAsync({
			source,
			file: options.file,
			root: options.root,
			target: route.target,
			sourceConfig,
			targetConfig,
			readFile: options.readFile,
			listFiles: options.listFiles,
		});
		return {
			...result,
			fileChanges: result.fileChanges ?? [],
			...(result.sourceMaps === undefined ? {} : { sourceMaps: result.sourceMaps }),
			reports: [],
			validations: result.validations ?? [],
			loweringPlans: result.loweringPlans,
			outcomes: result.outcomes ?? derivedFileOutcomes(source, result.loweringPlans),
		};
	}
	return runAdapterMigrationInternal(source, { ...options, adapterRegistry }, ports, {
		source: sourceConfig,
		target: targetConfig,
	});
}

function runAdapterMigrationInternal(
	source: string,
	options: AdapterMigrationOptions,
	ports: AdapterMigrationPorts,
	loadedConfigs?: LoadedAdapterConfigs,
): AdapterMigrationResult {
	const support = createAdapterMigrationSupport(ports.sourceScanner);
	const adapterRegistry = options.adapterRegistry ?? ports.adapterRegistry;
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
			fileChanges: [],
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
	const fileMigration = sourceAdapter.migration?.file;
	if (fileMigration !== undefined) {
		const result = fileMigration.run({
			source,
			file: options.file,
			root: options.root,
			target: targetAdapter,
			sourceConfig: config,
			targetConfig,
			readFile,
			listFiles: options.listFiles,
		});
		return {
			...result,
			fileChanges: result.fileChanges ?? [],
			...(result.sourceMaps === undefined ? {} : { sourceMaps: result.sourceMaps }),
			reports: [],
			validations: result.validations ?? [],
			loweringPlans: result.loweringPlans,
			outcomes: result.outcomes ?? derivedFileOutcomes(source, result.loweringPlans),
		};
	}
	const document = ports.sourceScanner.scan({
		file: options.file,
		source,
		root: options.root,
	});
	let bindings: SourceBindingIndex | undefined;
	let resolveBinding:
		| ((localName: string) => SourceBindingIndex["bindings"][number] | undefined)
		| undefined;
	try {
		bindings = SourceBindings.fromDocument(document.document);
		if (readFile !== undefined) {
			const projectBindings = createSourceProjectBindingIndex({
				read: (file) => {
					const sourceText = readFile(file);
					return sourceText === undefined ? undefined : { file, source: sourceText };
				},
				resolve: (importer, specifier) => {
					if (!specifier.startsWith(".")) return undefined;
					const base = joinDocumentPath(dirnameDocumentPath(importer), specifier);
					const candidates = [
						base,
						`${base}.ts`,
						`${base}.tsx`,
						`${base}.js`,
						`${base}.jsx`,
						`${base}/index.ts`,
						`${base}/index.tsx`,
					];
					return candidates.find((candidate) => readFile(candidate) !== undefined);
				},
			});
			resolveBinding = (localName) => projectBindings.resolve(options.file, localName);
		}
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
		...(resolveBinding === undefined ? {} : { resolveBinding }),
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
		options.loweringRegistry ?? ports.loweringRegistry,
		sourceAdapter,
		targetAdapter,
	);
	const marker = options.skipMarker ?? "pandwind:migrate-skip";
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const imports = new Set<string>();
	const generatedStatements = new Set<string>();
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
	// Host rewrites that collapse a factory-qualified host to its canonical
	// element leave the source factory namespace without references. The runner
	// owns that cleanup because several rewrite batches may demote the same tag.
	const demotedFactoryHosts = new Set<string>();
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
	// A recognized package import is not itself a style construct. Leave files
	// that contain only ordinary host components/config imports unchanged; the
	// adapter's explicit residual patterns own unsupported semantics.
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
	for (const [index, match] of support.selectNonOverlappingMatches(parsed.matches).entries()) {
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
		let sourceSubjectDiscarded = false;
		const targetPolicy = targetAdapter.migration?.targetPolicy;
		let hostRepresentation = targetPolicy?.hostRepresentation;
		const sourceHostFramework = support.frameworkForHost(
			options.file,
			document,
			options.semantic,
			program,
		);
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
		const bindingBeforeMatch = support.bindingForMatch(bindings, match.start);
		const hasHostContext =
			program.source?.hostOpenTag !== undefined ||
			support.hasHostBindingUse(bindings, bindingBeforeMatch) ||
			support.hasInlineHostUse(bindings, match.start, source) ||
			support.hasComponentBindingUse(bindings, bindingBeforeMatch);
		const discardableStaticSubject =
			sourceSubject !== undefined &&
			bindingBeforeMatch === undefined &&
			!StyleProgramAnalysis.hasDynamic(program) &&
			!hasHostContext &&
			isDiscardedExpressionStatement(source, match.start, match.end);
		if (discardableStaticSubject) {
			sourceSubjectDiscarded = true;
			program = {
				...program,
				source: { ...program.source, subject: undefined },
			};
		}
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
						kind: StyleProgramResidualKindTag.DynamicValues,
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
										kind: StyleProgramResidualKindTag.DynamicValues,
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
				support.isStandaloneDefaultExport(source, match.start);
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
								kind: StyleProgramResidualKindTag.Capability,
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
			sourceConfig: config,
			mode,
			capability: effectiveReport,
			loweringResiduals: carrierResiduals,
			index,
			document,
			sourceModules: sourceAdapter.sourceModules,
			sourceModuleMatchers: sourceAdapter.sourceModuleMatchers,
			meta: options.meta,
			project: options.project,
			tokenReferenceFormat: options.tokenReferenceFormat,
			host: {
				...(bindingBeforeMatch === undefined ? {} : { binding: bindingBeforeMatch }),
				...(hostFramework === undefined ? {} : { framework: hostFramework }),
				...(sourceSubjectDiscarded ? {} : sourceSubject ? { subject: sourceSubject } : {}),
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
		residuals.push(...(emitted.preservedResiduals ?? []));
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
		// A portable artifact emission already carries its semantic program from
		// the registry. Reparsing the TS carrier through the target parser would
		// only fabricate parse residuals for valid emitted source.
		const portableSemanticEmission =
			emitted.semantic !== undefined &&
			targetRepresentationKind === StyleRepresentationKind.PortableArtifact;
		const reparsed = portableSemanticEmission
			? undefined
			: targetAdapter.parse(emittedForValidation, {
					file: options.file,
					source: emittedForValidation,
					root: options.root,
					config: targetConfig,
					readFile,
					meta: options.meta,
					document,
					semantic: options.semantic,
				});
		const targetProgram = portableSemanticEmission
			? emitted.semantic
			: (emitted.semantic ??
				(reparsed!.matches.length === 0
					? program
					: styleProgramFromRules(
							reparsed!.matches.flatMap((candidate) => candidate.program.rules),
							{
								source: program.source,
								residuals: reparsed!.residuals,
								canonicalization: program.canonicalization,
							},
						)));
		const validation = targetAdapter.validate(emitted.semantic ?? program, targetProgram, [
			...emitted.residuals,
			...(reparsed === undefined
				? []
				: reparsed.residuals.filter((residual) => !preservedResidualKinds.has(residual.kind))),
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
		for (const statement of emitted.generatedStatements ?? []) generatedStatements.add(statement);
		if (emitted.dependencies !== undefined) dependencies.push(emitted.dependencies);
		residuals.push(...emitted.residuals);
		const declarationRewrite = pendingComponentDeclarationRewrites.get(index);
		if (declarationRewrite !== undefined) {
			const classExpression = support.classExpressionFromEmission(emitted.text);
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
			support.tagForStandalone(source, match.start) !== undefined &&
			support.isStandaloneDefaultExport(source, match.start)
		) {
			const tag = support.tagForStandalone(source, match.start);
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
			edits.push({
				start: match.start,
				end: match.end,
				text: support.hostClassExpression(source, match.start, match.end, emitted.text),
			});
		converted++;
		const successfulRepresentation = targetRepresentationKind;
		const emissionDetail = emitted.emissionDecisions
			?.map((decision) => `${decision.property}: ${decision.representation} (${decision.reason})`)
			.join("; ");
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
			...(emissionDetail === undefined || emissionDetail === "" ? {} : { detail: emissionDetail }),
		});
	}
	const edited = SourcePass.applyEdits(source, withoutDuplicateSkipMarkers(source, edits, marker));
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
		for (const tag of rewrite.demotedFactoryHosts ?? []) {
			// The host rewrite reports the qualified tag it demoted; only the
			// factory namespace is an import specifier candidate.
			demotedFactoryHosts.add(tag.split(".")[0] ?? tag);
		}
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
		runtimeEdited = support.ensureGeneratedStatement(
			runtimeEdited,
			'import { createCx } from "pandwind/cx";',
			options.file,
		);
		runtimeEdited = support.ensureGeneratedStatement(
			runtimeEdited,
			"const cx = createCx();",
			options.file,
		);
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
		for (const handled of rewrite.handledResiduals ?? []) {
			for (let index = residuals.length - 1; index >= 0; index--) {
				const residual = residuals[index];
				if (
					residual?.kind === handled.kind &&
					residual.text === handled.text &&
					residual.hint === handled.hint
				)
					residuals.splice(index, 1);
			}
			for (let index = outcomes.length - 1; index >= 0; index--) {
				const outcome = outcomes[index];
				if (
					outcome?.outcome === StyleMigrationOutcome.Residual &&
					outcome.sourceText === handled.text
				) {
					outcomes.splice(index, 1);
					skipped = Math.max(0, skipped - 1);
				}
			}
		}
	}
	const documentProgram = parsed.matches[0]?.program;
	const documentSourceFramework =
		documentProgram === undefined
			? undefined
			: support.frameworkForHost(options.file, document, options.semantic, documentProgram);
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
	let code = runtimeEdited;
	if (converted > 0 && skipped === 0 && residuals.length === 0) {
		code = MigrationOutput.removeSourceImports(
			code,
			[...sourceAdapter.sourceModules, ...sourceModulesToRemove],
			sourceAdapter.sourceModuleMatchers,
			support.generatedBindings(imports),
		);
		code = MigrationOutput.removeNamedImportSpecifiers(
			code,
			[...sourceAdapter.sourceModules, ...sourceModulesToRemove],
			["css", "createCss", "createRuntimeCss"],
		);
		if (
			imports.has('import { createCss } from "pandwind/css";') ||
			imports.has('import { createRuntimeCss } from "pandwind/css/runtime";')
		)
			code = MigrationOutput.removeNamedImportSpecifiers(code, sourceAdapter.sourceModules, [
				"css",
			]);
		// A demoted factory-qualified host no longer references its factory
		// namespace; its import would make the emitted module import an API the
		// target dialect never calls.
		code = MigrationOutput.removeUnreferencedImportSpecifiers(code, [...demotedFactoryHosts]);
	}
	if (imports.has('import { createRuntimeCss } from "pandwind/css/runtime";')) {
		const hasRenamedStaticCss =
			/\b(?:pandwindCss|pwCss)\s*=\s*createCss\(\)/u.test(code) ||
			[...imports].some((statement) =>
				/\b(?:pandwindCss|pwCss)\s*=\s*createCss\(\)/u.test(statement),
			);
		const runtimeUsesSameBinding = [...imports].some((statement) =>
			/\b(?:css|pandwindCss|pwCss)\s*=\s*createRuntimeCss\(/u.test(statement),
		);
		if (!hasRenamedStaticCss || runtimeUsesSameBinding) {
			imports.delete('import { createCss } from "pandwind/css";');
			if (runtimeUsesSameBinding) {
				for (const statement of imports)
					if (/\b(?:css|pandwindCss|pwCss)\s*=\s*createCss\(\)/u.test(statement))
						imports.delete(statement);
			} else imports.delete("const css = createCss();");
		}
		// A residual-carrying source module keeps its original statements; the
		// skipped code still binds `css`. Only a fully converted document has
		// the static binding replaced by the runtime carrier, and leaving it in
		// place would declare `css` twice.
		if (converted > 0 && skipped === 0 && residuals.length === 0 && !hasRenamedStaticCss)
			code = MigrationOutput.removeGeneratedStatements(code, ["const css = createCss();"]);
	}
	const targetUsesPandwindCss =
		imports.has('import { createCss } from "pandwind/css";') ||
		imports.has('import { createRuntimeCss } from "pandwind/css/runtime";');
	if (!targetUsesPandwindCss)
		code = MigrationOutput.removeGeneratedStatements(code, ["const css = createCss();"]);
	const outputFile = support.fileWithExtension(options.file, outputExtension);
	for (const statement of generatedStatements)
		code = support.ensureGeneratedStatement(code, statement, outputFile);
	for (const statement of MigrationOutput.consolidateImports(imports))
		code = support.ensureGeneratedStatement(code, statement, outputFile);
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
		fileChanges: [],
		loweringPlans,
		outcomes,
	};
}

export function createAdapterMigrationEngine(
	ports: AdapterMigrationPorts,
): AdapterMigrationExecutor {
	return {
		run: (source, options) =>
			runAdapterMigrationInternal(
				source,
				{
					...options,
					adapterRegistry: options.adapterRegistry ?? ports.adapterRegistry,
				},
				ports,
			),
		runAsync: (source, options) => runAdapterMigrationAsyncInternal(source, options, ports),
	};
}
