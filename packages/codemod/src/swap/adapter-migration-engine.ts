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
	AdapterProjectConfig,
	AdapterValidationResult,
} from "./adapter-contract.ts";
import type { StyleLoweringPlan } from "./lowering.ts";
import { MigrationOutput } from "./migration-output.ts";
import { migrationCommentStyleForFile, migrationSkipMarker } from "./migration-diagnostics.ts";
import type {
	AdapterMigrationOptions,
	AdapterMigrationOutcome,
	AdapterMigrationPorts,
	AdapterMigrationResult,
	StyleMigrationImplementation,
} from "./adapter-migration-contract.ts";
import {
	getHostComponentRewriter,
	canonicalSourceHostClosingEdit,
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
	CodemodAdapterId,
} from "./identifiers.ts";
import { simplifyPandwindStaticStyles } from "./static-style-simplifier.ts";
import { StyleProgramAnalysis } from "./style-program-analysis.ts";
import { StyleProgramCore } from "./style-program-core.ts";
import {
	derivedFileOutcomes,
	hasTargetHostPort,
	hostFrameworkConversion,
	loweringRegistryForRoute,
	normalizeAsyncMigrationResult,
	normalizeForeignCssBinding,
	normalizeSourceCssBinding,
	sourceImportsModule,
	sourceImportsBinding,
	targetAcceptsSourceFramework,
	targetHostFramework,
	withoutDuplicateSkipMarkers,
} from "./adapter-migration-policy.ts";
import {
	isMigrationResult,
	prepareMigration,
	prepareMigrationAsync,
	type PreparedAdapterMigration,
} from "./adapter-migration-preparation.ts";

const generatedCssBindingPattern = /\b(?:css|targetCss|pwCss)\s*=\s*createUnsafeCss\(\)/u;
const runtimeCssBindingPattern = /\b(?:css|targetCss|pwCss)\s*=\s*createRuntimeCss\(/u;

const sourceModuleOwnership = (
	adapter: import("./adapter-contract.ts").StyleAdapter,
	config: import("./adapter-contract.ts").AdapterProjectConfig,
) =>
	adapter.resolveSourceModuleOwnership?.(config) ?? {
		modules: adapter.sourceModules,
		matchers: adapter.sourceModuleMatchers,
	};

const targetConfigForMigration = (
	targetConfig: AdapterProjectConfig,
	project: AdapterMigrationOptions["project"],
): AdapterProjectConfig =>
	project?.conditionCatalog === undefined
		? targetConfig
		: {
				...targetConfig,
				conditionCatalog: {
					...targetConfig.conditionCatalog,
					...project.conditionCatalog,
				},
			};

const canonicalizeGeneratedCssBinding = (
	emission: { text: string; imports: readonly string[] },
	binding: string,
): { text: string; imports: readonly string[] } => {
	if (binding === "css") return emission;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const rename = (value: string) =>
		value
			.replace(new RegExp(`\\b${escaped}(?=\\s*[.({,;}])`, "gu"), "css")
			.replace(new RegExp(`\\b${escaped}(?=\\s*=)`, "gu"), "css")
			.replace(/\bcss\s+as\s+css\b/gu, "css");
	return { text: rename(emission.text), imports: emission.imports.map(rename) };
};

async function runAdapterMigrationAsyncInternal(
	source: string,
	options: AdapterMigrationOptions,
	ports: AdapterMigrationPorts,
): Promise<AdapterMigrationResult> {
	const preparation = await prepareMigrationAsync(source, options, ports);
	if (isMigrationResult(preparation)) return preparation;
	const fileMigration = preparation.sourceAdapter.migration?.file;
	if (fileMigration?.runAsync !== undefined) {
		const targetConfig = targetConfigForMigration(preparation.targetConfig, options.project);
		const result = await fileMigration.runAsync({
			source,
			file: options.file,
			root: options.root,
			target: preparation.targetAdapter,
			sourceConfig: preparation.sourceConfig,
			targetConfig,
			readFile: options.readFile,
			listFiles: options.listFiles,
		});
		return normalizeAsyncMigrationResult(source, result);
	}
	return runAdapterMigrationInternal(source, options, ports, preparation);
}

function runAdapterMigrationInternal(
	source: string,
	options: AdapterMigrationOptions,
	ports: AdapterMigrationPorts,
	prepared?: PreparedAdapterMigration,
): AdapterMigrationResult {
	const support = createAdapterMigrationSupport(ports.sourceScanner);
	const preparation = prepared ?? prepareMigration(source, options, ports);
	if (isMigrationResult(preparation)) return preparation;
	const { sourceAdapter, targetAdapter, context, sourceConfig: config } = preparation;
	const targetConfig = targetConfigForMigration(preparation.targetConfig, options.project);
	const readFile = context.readFile;
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
	const sourceOwnership = sourceModuleOwnership(sourceAdapter, config);
	const targetOwnership = sourceModuleOwnership(targetAdapter, targetConfig);
	if (
		targetAdapter.id === CodemodAdapterId.Pandwind &&
		sourceImportsModule(source, sourceOwnership.modules, sourceOwnership.matchers)
	) {
		source = normalizeForeignCssBinding(
			source,
			sourceOwnership.modules,
			sourceOwnership.matchers,
			targetOwnership.modules,
			targetOwnership.matchers,
		);
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
		targetId: targetAdapter.id,
		readFile,
		sourceModules: sourceOwnership.modules,
		sourceModuleMatchers: sourceOwnership.matchers,
		sourceModuleSemanticMatchers: sourceOwnership.semanticMatchers,
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
	const renderSkipMarker = (index: number, text: string): string => {
		const rendered = SourcePass.markerText(source, options.file, index, text);
		return `${rendered}\n`;
	};
	const migrationSkipMarkerText = (
		input: Parameters<typeof migrationSkipMarker>[0],
		location: "document" | "embedded-code",
	) => migrationSkipMarker(input, migrationCommentStyleForFile(options.file, location));
	const skipMarkerEdit = (index: number, text: string) => {
		const start = source.lastIndexOf("\n", index - 1) + 1;
		return { start, end: start, text: renderSkipMarker(index, text) };
	};
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
	const sourceModulesForRemoval = [
		...new Set([
			...(sourceAdapter.sourceModulesToRemove?.(targetAdapter.id) ?? []),
			...sourceOwnership.modules,
		]),
	];
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
			text: renderSkipMarker(
				0,
				migrationSkipMarkerText(
					{
						marker,
						sourceAdapter: sourceAdapter.id,
						targetAdapter: targetAdapter.id,
						parseResiduals: unpreservedParseResiduals,
					},
					"document",
				),
			),
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
		const moduleFile = targetPolicy?.moduleFile;
		const moduleFileResiduals =
			moduleFile !== undefined &&
			!moduleFile.acceptedSuffixes.some((suffix) => options.file.endsWith(suffix))
				? [
						{
							kind: StyleProgramResidualKindTag.Capability,
							text: match.sourceText,
							hint: moduleFile.unsupportedFileHint,
						},
					]
				: [];
		const targetPreflightResiduals = [
			...moduleFileResiduals,
			...(targetPolicy?.preflight?.({
				file: options.file,
				source,
				program,
				hasHostContext,
			}) ?? []),
		];
		if (targetPreflightResiduals.length > 0)
			loweringResiduals = [...loweringResiduals, ...targetPreflightResiduals];
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
					edits.push(
						skipMarkerEdit(
							match.start,
							migrationSkipMarkerText(
								{
									marker,
									loweringResiduals: [
										{
											kind: StyleProgramResidualKindTag.DynamicValues,
											text: match.sourceText,
											hint: "dynamic values require a host-bound class/style carrier",
										},
									],
								},
								"embedded-code",
							),
						),
					);
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
			edits.push(
				skipMarkerEdit(
					match.start,
					migrationSkipMarkerText(
						{
							marker,
							sourceAdapter: sourceAdapter.id,
							targetAdapter: targetAdapter.id,
							parseResiduals: program.residuals,
							loweringResiduals,
							blockers: effectiveReport.blockers,
							availableRepresentations: lowering.availableRepresentations,
						},
						"embedded-code",
					),
				),
			);
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
			sourceModules: sourceOwnership.modules,
			sourceModuleMatchers: sourceOwnership.matchers,
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
			edits.push(
				skipMarkerEdit(
					match.start,
					migrationSkipMarkerText(
						{
							marker,
							sourceAdapter: sourceAdapter.id,
							targetAdapter: targetAdapter.id,
							loweringResiduals: [emptyEmission, ...emitted.residuals],
							availableRepresentations: lowering.availableRepresentations,
						},
						"embedded-code",
					),
				),
			);
			continue;
		}
		// Preserve target-owned residuals in the public report as well as in
		// validation. A failed validation is an aggregate consequence; it must
		// not hide the precise semantic reason emitted by the target adapter.
		residuals.push(...emitted.residuals);
		residuals.push(...(emitted.preservedResiduals ?? []));
		const emittedForValidation = MigrationOutput.validationSource(emitted.text, program);
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
					targetId: targetAdapter.id,
					readFile,
					sourceModules: targetOwnership.modules,
					sourceModuleMatchers: targetOwnership.matchers,
					sourceModuleSemanticMatchers: targetOwnership.semanticMatchers,
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
			edits.push(
				skipMarkerEdit(
					match.start,
					migrationSkipMarkerText(
						{
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
						},
						"embedded-code",
					),
				),
			);
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
					framework,
					sourceFramework: sourceHostFramework,
					tag,
					emittedExpression: emitted.text,
					representation: hostRepresentation,
				});
		}
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
				sourceModules: sourceOwnership.modules,
				representation: emittedHostRepresentation,
				representationKind: targetRepresentationKind,
				residuals: carrierResiduals,
				...(bindingBeforeMatch === undefined ? {} : { binding: bindingBeforeMatch }),
				...(hostFramework === undefined ? {} : { framework: hostFramework }),
				...(sourceHostFramework === undefined ? {} : { sourceFramework: sourceHostFramework }),
			});
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
					...(emitted.componentExpression === true ? { componentExpression: true } : {}),
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
		const closingEdit = canonicalSourceHostClosingEdit(source, options.file, program);
		if (closingEdit !== undefined) edits.push(closingEdit);
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
	const appliedEdits = withoutDuplicateSkipMarkers(source, edits, marker);
	const appliedSkipMarkerEdits = appliedEdits.filter(
		(edit) => edit.start === edit.end && edit.text.includes(marker),
	);
	const edited = SourcePass.applyEdits(source, appliedEdits);
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
		sourceConfig: config,
		...(options.project === undefined ? {} : { project: options.project }),
		convertedBindings,
		complete: skipped === 0 && residuals.length === 0,
	});
	if (rewrite !== undefined) {
		runtimeEdited = rewrite.code;
		for (const statement of rewrite.imports ?? []) imports.add(statement);
		residuals.push(...rewrite.residuals);
		for (const handled of rewrite.handledResiduals ?? []) {
			converted++;
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
				renderSkipMarker(
					0,
					migrationSkipMarkerText(
						{
							marker,
							sourceAdapter: sourceAdapter.id,
							targetAdapter: targetAdapter.id,
							loweringResiduals: documentRewrite.residuals,
						},
						"document",
					),
				) + source;
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
			renderSkipMarker(
				0,
				migrationSkipMarkerText(
					{
						marker,
						sourceAdapter: sourceAdapter.id,
						targetAdapter: targetAdapter.id,
						loweringResiduals: generatedFileResiduals,
					},
					"document",
				),
			) + source;
		converted = 0;
		skipped = Math.max(1, skipped);
		imports.clear();
		generatedFiles.clear();
		outputExtension = undefined;
	}
	// Prune only source bindings that are no longer referenced. This is safe even
	// when another match remains residual: used Chakra/Panda bindings stay in the
	// file, while dead layout imports do not keep the old runtime surface alive.
	let code = runtimeEdited;
	if (converted > 0) {
		code = MigrationOutput.removeSourceImports(
			code,
			[...sourceModulesForRemoval, ...sourceModulesToRemove],
			sourceOwnership.matchers,
			support.generatedBindings(imports),
		);
	}
	if (converted > 0 && skipped === 0 && residuals.length === 0) {
		code = MigrationOutput.removeNamedImportSpecifiers(
			code,
			[...sourceModulesForRemoval, ...sourceModulesToRemove],
			["css", "createCss", "createUnsafeCss", "createRuntimeCss"],
		);
		if (
			imports.has('import { createUnsafeCss } from "pandwind/unsafe/css";') ||
			imports.has('import { createRuntimeCss } from "pandwind/css/runtime";')
		)
			code = MigrationOutput.removeNamedImportSpecifiers(code, sourceModulesForRemoval, ["css"]);
		// A demoted factory-qualified host no longer references its factory
		// namespace; its import would make the emitted module import an API the
		// target dialect never calls.
		code = MigrationOutput.removeUnreferencedImportSpecifiers(code, [...demotedFactoryHosts]);
	}
	if (converted > 0 && skipped === 0 && residuals.length === 0) {
		const generatedTargetBinding =
			/\b(?:const|let|var)\s+(targetCss|pwCss)\s*=\s*createUnsafeCss\(|\bcss\s+as\s+(targetCss|pwCss)\b/u.exec(
				[code, ...imports, ...generatedStatements].join("\n"),
			);
		const binding = generatedTargetBinding?.[1] ?? generatedTargetBinding?.[2];
		if (binding !== undefined) {
			const canonical = canonicalizeGeneratedCssBinding(
				{ text: code, imports: [...imports] },
				binding,
			);
			code = canonical.text;
			imports.clear();
			for (const statement of canonical.imports) imports.add(statement);
			const canonicalStatements = canonicalizeGeneratedCssBinding(
				{ text: "", imports: [...generatedStatements] },
				binding,
			);
			generatedStatements.clear();
			for (const statement of canonicalStatements.imports) generatedStatements.add(statement);
		}
	}
	if (imports.has('import { createRuntimeCss } from "pandwind/css/runtime";')) {
		const runtimeUsesSameBinding = [...imports].some((statement) =>
			runtimeCssBindingPattern.test(statement),
		);
		if (runtimeUsesSameBinding) {
			imports.delete('import { createUnsafeCss } from "pandwind/unsafe/css";');
			for (const statement of imports)
				if (generatedCssBindingPattern.test(statement)) imports.delete(statement);
		}
		// Keep the extracted `css` lane when the runtime carrier has its own
		// binding. Remove only a legacy same-name initializer after a complete
		// migration, where retaining it would redeclare that local.
		if (converted > 0 && skipped === 0 && residuals.length === 0 && runtimeUsesSameBinding)
			code = MigrationOutput.removeGeneratedStatements(code, ["const css = createUnsafeCss();"]);
	}
	const targetUsesPandwindCss =
		imports.has('import { createUnsafeCss } from "pandwind/unsafe/css";') ||
		imports.has('import { createRuntimeCss } from "pandwind/css/runtime";');
	if (converted > 0 && skipped === 0 && residuals.length === 0 && !targetUsesPandwindCss)
		code = MigrationOutput.removeGeneratedStatements(code, ["const css = createUnsafeCss();"]);
	const outputFile = support.fileWithExtension(options.file, outputExtension);
	for (const statement of generatedStatements)
		code = support.ensureGeneratedStatement(code, statement, outputFile);
	for (const statement of MigrationOutput.consolidateImports(imports))
		code = support.ensureGeneratedStatement(code, statement, outputFile);
	const sourceCssSurvives =
		converted > 0 &&
		sourceImportsBinding(code, "css", sourceOwnership.modules, sourceOwnership.matchers);
	if (sourceCssSurvives) {
		code = normalizeSourceCssBinding(code, sourceOwnership.modules, sourceOwnership.matchers);
		code = MigrationOutput.removeUnreferencedImportSpecifiers(code, ["sourceCss"]);
	} else {
		const generatedTargetBinding =
			/\b(?:const|let|var)\s+(targetCss|pwCss)\s*=\s*createUnsafeCss\(|\bcss\s+as\s+(targetCss|pwCss)\b/u.exec(
				code,
			);
		const binding = generatedTargetBinding?.[1] ?? generatedTargetBinding?.[2];
		if (binding !== undefined)
			code = canonicalizeGeneratedCssBinding({ text: code, imports: [] }, binding).text;
		code = code.replace(/\bcss\s+as\s+css\b/gu, "css");
	}
	if (targetAdapter.id === CodemodAdapterId.Pandwind)
		code = simplifyPandwindStaticStyles(code, outputFile, {
			hoistStaticStyles: options.hoistStaticStyles,
		}).code;
	if (converted > 0 && skipped === 0 && residuals.length === 0)
		for (const edit of appliedSkipMarkerEdits) code = code.replace(edit.text, "");
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
): StyleMigrationImplementation {
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
