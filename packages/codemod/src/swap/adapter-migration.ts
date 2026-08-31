import { applyEdits } from "../migrate.ts";
import { ensureImport } from "../shared.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
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

function classExpressionFromEmission(emitted: string): string | undefined {
	const expression = emitted.trim();
	return expression.length === 0 ? undefined : expression;
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
	let skipped = 0;
	for (const [index, match] of selectNonOverlappingMatches(parsed.matches).entries()) {
		const lowering = loweringRegistry.plan({
			program: match.program,
			target: targetAdapter.capabilities,
			mode,
			hostFramework: targetAdapter.migration?.targetPolicy?.handlesFrameworkSemantics === true,
		});
		loweringPlans.push(lowering);
		let program = lowering.program;
		const sourceSubject = program.source?.subject;
		let dynamicCarrier: { binding?: string; framework: string } | undefined;
		if (hasTargetHostPort(targetAdapter) && program.source?.subject === undefined) {
			const hasDynamic = programHasDynamic(program);
			if (hasDynamic) {
				const binding = source
					.slice(0, match.start)
					.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1];
				const framework =
					document.framework ??
					options.semantic?.source?.framework ??
					(/\.(?:jsx|tsx)$/.test(options.file) ? "react" : undefined);
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
				const dynamicHandled = hostDynamicHandled || dynamicPolicy?.handled === true;
				const dynamicStandalone = dynamicPolicy?.standalone === true;
				if (
					(preview === undefined || preview.residuals.length > 0) &&
					!dynamicHandled &&
					!dynamicStandalone
				) {
					skipped++;
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
				if (dynamicHandled || preview?.residuals.length === 0) {
					program = {
						...program,
						residuals: program.residuals.filter((residual) => residual.kind !== "dynamic"),
					};
				}
				if (framework !== undefined && !dynamicStandalone && !dynamicHandled)
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
			const framework =
				document.framework ??
				options.semantic?.source?.framework ??
				(/\.(?:jsx|tsx)$/.test(options.file) ? "react" : undefined);
			const rewriter =
				binding !== undefined && tag !== undefined && framework !== undefined
					? getHostComponentRewriter(framework)
					: undefined;
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
				(framework === "solid" ||
					framework === "vue" ||
					framework === "react" ||
					framework === "preact");
			if (standaloneExport || frameworkWrapper) {
				program = { ...program, source: { ...program.source, subject: undefined } };
				if (frameworkWrapper)
					program = {
						...program,
						residuals: program.residuals.filter((residual) => residual.kind !== "dynamic"),
					};
			}
			if (
				standaloneExport ||
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
				const residualsCanUseHostLowering = program.residuals.every(
					(residual) => residual.kind === "dynamic",
				);
				const rewriteKey = `${binding}:${tag}:${framework}`;
				if (preview.residuals.length === 0 && residualsCanUseHostLowering && !hasFunctionDynamic) {
					program = {
						...program,
						residuals: hasDynamic
							? program.residuals.filter((residual) => residual.kind !== "dynamic")
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
					new RegExp(`styled\\(\\s*${binding}\\s*\\)`).test(source)
				) {
					program = { ...program, source: { ...program.source, subject: undefined } };
					pendingComponentDeclarationRewrites.set(index, {
						binding,
						tag,
						framework,
					});
				}
			}
		}
		const report = inspectAdapterCapabilities(targetAdapter.capabilities, program, mode);
		const resolvedCapabilities = new Set(lowering.resolvedCapabilities ?? []);
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
		const hasSemanticResiduals = program.residuals.length > 0 || lowering.residuals.length > 0;
		if (!effectiveReport.convertible || (mode === "safe" && hasSemanticResiduals)) {
			skipped++;
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
				...lowering.residuals,
			);
			edits.push({
				start: match.start,
				end: match.start,
				text:
					MigrationDiagnostics.skipMarker({
						marker,
						parseResiduals: program.residuals,
						loweringResiduals: lowering.residuals,
						blockers: report.blockers,
						availableRepresentations: lowering.availableRepresentations,
					}) + "\n",
			});
			continue;
		}
		residuals.push(...lowering.residuals);
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
				...(program.source?.framework ? { framework: program.source.framework } : {}),
				...(sourceSubject ? { subject: sourceSubject } : {}),
			},
		});
		const emittedForValidation = validationSource(emitted.text, program);
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
		if (!validation.valid && mode === "safe") {
			skipped++;
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
						loweringResiduals: [
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
	}
	const edited = applyEdits(source, edits);
	let runtimeEdited = edited;
	let needsCx = false;
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
		runtimeEdited = ensureImport(runtimeEdited, 'import { createCx } from "pandwind/cx";');
		runtimeEdited = ensureImport(runtimeEdited, "const cx = createCx();");
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
	for (const statement of consolidateImports(imports)) code = ensureImport(code, statement);
	return {
		code,
		changed: code !== source,
		converted: parsed.matches.length - skipped,
		skipped,
		reports,
		validations,
		dependencies,
		residuals,
		loweringPlans,
	};
}
