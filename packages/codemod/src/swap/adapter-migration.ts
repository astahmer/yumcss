import { applyEdits } from "../migrate.ts";
import { ensureImport } from "../shared.ts";
import { SOURCE_SCANNER_SERVICE, type SourceScanResult } from "pandwind/source";
import type { PandwindMeta } from "../meta.ts";
import {
	inspectAdapterCapabilities,
	type AdapterCapabilityMode,
	type AdapterCapabilityReport,
} from "./capabilities.ts";
import type {
	AdapterDependencies,
	AdapterParseContext,
	AdapterValidationResult,
	StyleAdapter,
} from "./adapter-contract.ts";
import {
	styleProgramFromRules,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import {
	STYLE_LOWERING_REGISTRY,
	type StyleLoweringPlan,
	type StyleLoweringRegistry,
} from "./lowering.ts";
import type { StyleSystemRegistry } from "./style-systems.ts";
import { consolidateImports, removeSourceImports, validationSource } from "./external-adapters.ts";
import { createBrowserCodemodCatalog } from "./browser-adapter-catalog.ts";
import { MigrationDiagnostics } from "./migration-diagnostics.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import {
	getHostComponentRewriter,
	componentTagForSubject,
	intrinsicTagForSubject,
	rewriteDynamicCarrier,
	rewriteDynamicExpressionCarrier,
	type HostComponentRewriteRequest,
	type StandaloneHostComponentRewriteRequest,
} from "./host-component-rewriter.ts";
import { BuiltinHostFramework, detectHostFramework } from "./host-adapters.ts";
import {
	StyleHostRepresentationKind,
	StyleMigrationOutcome,
	StyleRepresentationKind,
} from "./identifiers.ts";

function programHasDynamic(program: StyleProgram): boolean {
	return program.rules.some(function containsDynamic(rule): boolean {
		return (
			(rule.selector?.includes("${") ?? false) ||
			rule.conditions.some(
				(condition) => condition.name.includes("${") || condition.value?.includes("${"),
			) ||
			rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
			rule.children.some(containsDynamic)
		);
	});
}

function programHasFunctionDynamic(program: StyleProgram): boolean {
	return program.rules.some(function containsFunction(rule): boolean {
		return (
			rule.declarations.some(
				(declaration) =>
					declaration.value.kind === "dynamic" &&
					/=>|^function\b/.test(declaration.value.expression.trim()),
			) || rule.children.some(containsFunction)
		);
	});
}

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
		(/\.(?:jsx|tsx)$/.test(file)
			? BuiltinHostFramework.React
			: file.endsWith(".vue")
				? BuiltinHostFramework.Vue
				: file.endsWith(".svelte")
					? BuiltinHostFramework.Svelte
					: file.endsWith(".astro")
						? BuiltinHostFramework.Astro
						: undefined)
	);
}

function hasHostBindingUse(source: string, binding: string | undefined): boolean {
	if (binding === undefined) return false;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`(?:<\\s*${escaped}\\b|\\b(?:class|className|style|css)\\s*=\\s*\\{\\s*${escaped}\\s*\\})`,
	).test(source);
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
	if (!file.endsWith(".vue") || code.includes(statement)) return ensureImport(code, statement);
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
	readonly changed: boolean;
	readonly converted: number;
	readonly skipped: number;
	readonly reports: readonly AdapterCapabilityReport[];
	readonly validations: readonly AdapterValidationResult[];
	readonly dependencies: readonly AdapterDependencies[];
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
	const readFile = options.readFile;
	const context = {
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile,
	};
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
	if (sourceAdapter.id === targetAdapter.id)
		return {
			code: source,
			changed: false,
			converted: 0,
			skipped: 0,
			reports: [],
			validations: [],
			dependencies: [],
			residuals: [],
			loweringPlans: [],
			outcomes: [],
		};
	const readFile = options.readFile;
	const detection = sourceAdapter.detect({
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile,
	});
	if (!detection.matched) {
		return {
			code: source,
			changed: false,
			converted: 0,
			skipped: 0,
			reports: [],
			validations: [],
			dependencies: [],
			residuals: [],
			loweringPlans: [],
			outcomes: [],
		};
	}
	const config =
		loadedConfigs?.source ??
		sourceAdapter.loadConfig({
			file: options.file,
			source,
			root: options.root,
			packageJson: options.packageJson,
			readFile,
		});
	const targetConfig =
		loadedConfigs?.target ??
		targetAdapter.loadConfig({
			file: options.file,
			source,
			root: options.root,
			packageJson: options.packageJson,
			readFile,
		});
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
	const parsed = sourceAdapter.parse(source, {
		file: options.file,
		source,
		root: options.root,
		config,
		readFile,
		meta: options.meta,
		document,
		semantic: options.semantic,
	});
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
	const residuals: StyleProgramResidual[] = [...parsed.residuals];
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
		readonly binding?: string;
		readonly framework?: string;
		readonly representation: StyleHostRepresentationKind;
	}> = [];
	const targetComponentRewrites: Array<{
		readonly program: StyleProgram;
		readonly binding: string;
		readonly tag: string;
		readonly framework: string;
		readonly emittedExpression: string;
		readonly representation: StyleHostRepresentationKind;
	}> = [];
	let skipped = 0;
	let converted = 0;
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
		let lowering = loweringRegistry.plan({
			program: match.program,
			target: targetAdapter.capabilities,
			mode,
			hostFramework: targetAdapter.migration?.targetPolicy?.handlesFrameworkSemantics === true,
		});
		let loweringResiduals = lowering.residuals;
		let program = lowering.program;
		const sourceSubject = program.source?.subject;
		const targetPolicy = targetAdapter.migration?.targetPolicy;
		let hostRepresentation = targetPolicy?.hostRepresentation;
		if (
			program.source?.framework !== undefined &&
			hostRepresentation === StyleHostRepresentationKind.Component &&
			targetPolicy?.hostFrameworks?.includes(program.source.framework)
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
			hasInlineHostUse(source, match.start);
		const hostFramework = frameworkForHost(options.file, document, options.semantic, program);
		const resolvedHostRepresentation = targetPolicy?.resolveHostRepresentation;
		hostRepresentation =
			resolvedHostRepresentation === undefined
				? hostRepresentation
				: resolvedHostRepresentation({
						program,
						hasHostContext,
						...(hostFramework === undefined ? {} : { framework: hostFramework }),
						...(bindingBeforeMatch === undefined ? {} : { binding: bindingBeforeMatch }),
						source,
					});
		const resolvedRepresentation = targetPolicy?.resolveRepresentation?.({
			program,
			hasHostContext,
			...(hostFramework === undefined ? {} : { framework: hostFramework }),
			...(bindingBeforeMatch === undefined ? {} : { binding: bindingBeforeMatch }),
			...(hostRepresentation === undefined ? {} : { hostRepresentation }),
		});
		if (resolvedRepresentation !== undefined) targetRepresentationKind = resolvedRepresentation;
		const representationCapabilities =
			targetPolicy?.capabilitiesForRepresentation?.({
				program,
				representation: targetRepresentationKind,
				}) ?? [];
		if (!lowering.availableRepresentations.includes(targetRepresentationKind))
			lowering = {
				...lowering,
				availableRepresentations: [
					...lowering.availableRepresentations,
					targetRepresentationKind,
				],
			};
		loweringPlans.push(lowering);
		if (
			targetRepresentationKind === StyleRepresentationKind.PortableArtifact &&
			hostRepresentation !== undefined
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
			const hasDynamic = programHasDynamic(program);
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
					!programHasFunctionDynamic(program);
				const nativeFunctionHandled =
					programHasFunctionDynamic(program) &&
					program.source?.hostOpenTag === undefined &&
					targetAdapter.capabilities.capabilities["function-values"] !== "unsupported";
				const dynamicHandled = hostDynamicHandled || dynamicPolicy?.handled === true;
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
						residuals: program.residuals.filter((residual) => residual.kind !== "dynamic"),
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
			const hasDynamic = programHasDynamic(program);
			const hasFunctionDynamic = programHasFunctionDynamic(program);
			const binding = source
				.slice(0, match.start)
				.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1];
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
				targetAdapter.capabilities.capabilities.components !== "unsupported"
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
						(residual) => residual.kind !== "dynamic" && residual.kind !== "function-dynamic",
					);
				if (frameworkWrapper)
					program = {
						...program,
						residuals: program.residuals.filter(
							(residual) => residual.kind !== "dynamic" && residual.kind !== "function-dynamic",
						),
					};
			}
			const residualsCanUseHostLowering = program.residuals.every(
				(residual) =>
					residual.kind === "dynamic" ||
					(residual.kind === "function-dynamic" && hasFunctionDynamic),
			);
			if (
				hasTargetComponentUsage &&
				!hasDynamic &&
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
				if (preview.residuals.length === 0 && residualsCanUseHostLowering && !hasFunctionDynamic) {
					program = {
						...program,
						residuals: hasDynamic
							? program.residuals.filter(
									(residual) => residual.kind !== "dynamic" && residual.kind !== "function-dynamic",
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
		const emitted = targetAdapter.emit(program, {
			file: options.file,
			config: targetConfig,
			mode,
			capability: effectiveReport,
			index,
			document,
			meta: options.meta,
			host: {
				...(bindingForMatch(source, match.start) === undefined
					? {}
					: { binding: bindingForMatch(source, match.start) }),
				...(hostFramework === undefined ? {} : { framework: hostFramework }),
				...(sourceSubject ? { subject: sourceSubject } : {}),
				...(emittedHostRepresentation === undefined
					? {}
					: { representation: emittedHostRepresentation }),
				...(targetRepresentationKind === lowering.representation
					? {}
					: { representationKind: targetRepresentationKind }),
			},
		});
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
					emittedExpression: emitted.text,
					representation: hostRepresentation,
				});
		}
		// Preserve target-owned residuals in the public report as well as in
		// validation. A failed validation is an aggregate consequence; it must
		// not hide the precise semantic reason emitted by the target adapter.
		residuals.push(...emitted.residuals);
		const emittedForValidation = validationSource(emitted.text, program);
		if (
			targetAdapter.migration?.targetPolicy?.rewriteHost !== undefined &&
			!targetComponentProjection &&
			emittedHostRepresentation !== undefined &&
			program.source?.subject === undefined &&
			program.source?.hostOpenTag === undefined
		) {
			targetHostRewrites.push({
				program,
				emittedExpression: emitted.text,
				representation: emittedHostRepresentation,
				...(bindingForMatch(source, match.start) === undefined
					? {}
					: { binding: bindingForMatch(source, match.start) }),
				...(hostFramework === undefined ? {} : { framework: hostFramework }),
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
		const validation = targetAdapter.validate(program, targetProgram, [
			...emitted.residuals,
			...reparsed.residuals,
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
			program.source?.subject === undefined &&
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
		const emittedBinding = bindingForMatch(source, match.start);
		if (emittedBinding !== undefined) convertedBindings.add(emittedBinding);
		edits.push({ start: match.start, end: match.end, text: emitted.text });
		converted++;
		const successfulRepresentation = targetRepresentationKind;
		outcomes.push({
			sourceStart: match.start,
			sourceText: match.sourceText,
			outcome:
				successfulRepresentation === StyleRepresentationKind.PortableArtifact
					? StyleMigrationOutcome.PortableArtifact
					: programHasDynamic(program) || dynamicCarrier !== undefined
						? StyleMigrationOutcome.HostRuntime
						: successfulRepresentation === StyleRepresentationKind.Static
							? StyleMigrationOutcome.Static
							: StyleMigrationOutcome.TargetNative,
			representation: successfulRepresentation,
		});
	}
	const edited = applyEdits(source, edits);
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
	// Keep source imports whenever a skipped/residual match still depends on the
	// source runtime. Removing them would turn a safe residual into broken code.
	let code =
		skipped === 0 && residuals.length === 0
			? removeSourceImports(runtimeEdited, sourceAdapter.sourceModules)
			: runtimeEdited;
	if (imports.has('import { createRuntimeCss } from "pandwind/css/runtime";')) {
		imports.delete('import { createCss } from "pandwind/css";');
		imports.delete("const css = createCss();");
	}
	for (const statement of consolidateImports(imports))
		code = ensureGeneratedStatement(code, statement, options.file);
	return {
		code,
		changed: code !== source,
		converted,
		skipped,
		reports,
		validations,
		dependencies,
		residuals,
		loweringPlans,
		outcomes,
	};
}
