import { readFileSync } from "node:fs";
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
} from "./adapter-contract.ts";
import {
	styleProgramFromRules,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import { STYLE_LOWERING_REGISTRY, type StyleLoweringRegistry } from "./lowering.ts";
import type { StyleSystemRegistry } from "./style-systems.ts";
import {
	EXTERNAL_ADAPTER_REGISTRY,
	consolidateImports,
	removeSourceImports,
	validationSource,
} from "./external-adapters.ts";
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

type Edit = { start: number; end: number; text: string };

function programHasDynamic(program: StyleProgram): boolean {
	return program.rules.some(function containsDynamic(rule): boolean {
		return (
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

function stylexPropsUses(source: string, binding: string): boolean {
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\bstylex\\.props\\(\\s*${escaped}\\s*\\.`).test(source);
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

function rewriteVanillaExtractBindings(source: string): string {
	let code = source.replace(
		/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createVar\s*\([\s\S]*?\)\s*;?/g,
		(_match, name: string) => `const ${name} = ${JSON.stringify(`--pw-${name}`)};`,
	);
	if (/\bfallbackVar\s*\(/.test(code) && !/\b(?:const|let|var)\s+fallbackVar\b/.test(code))
		code = `const fallbackVar = (variable, fallback) => \`var(\${variable}, \${fallback})\`;\n${code}`;
	return code;
}

function jssRuntimeRewrites(
	source: string,
	convertedBindings: ReadonlySet<string>,
): { edits: Edit[]; residuals: StyleProgramResidual[] } {
	const edits: Edit[] = [];
	const residuals: StyleProgramResidual[] = [];
	const addResidual = (text: string): void => {
		residuals.push({
			kind: "runtime-context",
			text,
			hint: "JSS rule application requires a converted Pandwind class binding",
		});
	};
	const sheetApplication =
		/\b([A-Za-z_$][\w$]*)\.getRule\(\s*["']([A-Za-z_$][\w$]*)["']\s*\)\.applyTo\(\s*([^)]*)\)/g;
	for (const match of source.matchAll(sheetApplication)) {
		const receiver = match[1];
		const rule = match[2];
		const element = match[3]?.trim();
		if (receiver === undefined || rule === undefined || element === undefined) continue;
		if (!convertedBindings.has(receiver)) {
			addResidual(match[0]);
			continue;
		}
		edits.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			text: `${element}.classList.add(${receiver}.${rule})`,
		});
	}
	const ruleApplication = /\b([A-Za-z_$][\w$]*)\.applyTo\(\s*([^)]*)\)/g;
	for (const match of source.matchAll(ruleApplication)) {
		const receiver = match[1];
		const element = match[2]?.trim();
		if (receiver === undefined || element === undefined) continue;
		if (!convertedBindings.has(receiver)) {
			addResidual(match[0]);
			continue;
		}
		edits.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			text: `${element}.classList.add(${receiver})`,
		});
	}
	return { edits, residuals };
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
}

/** Run one v2 adapter-to-adapter migration over a source file. */
export function runAdapterMigration(
	source: string,
	options: AdapterMigrationOptions,
): AdapterMigrationResult {
	const adapterRegistry = options.adapterRegistry ?? EXTERNAL_ADAPTER_REGISTRY;
	const route = (options.registry ?? adapterRegistry.toStyleSystemRegistry()).resolveRoute(
		options.from,
		options.to,
	);
	const sourceAdapter = route.source;
	const targetAdapter = route.target;
	const detection = sourceAdapter.detect({
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
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
		};
	}
	const readFile =
		options.readFile ??
		((file: string) => {
			try {
				return readFileSync(file, "utf8");
			} catch {
				return undefined;
			}
		});
	const config = sourceAdapter.loadConfig({
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile,
	});
	const targetConfig = targetAdapter.loadConfig({
		file: options.file,
		source,
		root: options.root,
		packageJson: options.packageJson,
		readFile,
	});
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
		meta: options.meta,
		document,
		semantic: options.semantic,
	});
	const mode = options.mode ?? "safe";
	const marker = options.skipMarker ?? "pandwind:migrate-skip";
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const imports = new Set<string>();
	const reports: AdapterCapabilityReport[] = [];
	const validations: AdapterValidationResult[] = [];
	const dependencies: AdapterDependencies[] = [targetAdapter.dependencies];
	const residuals: StyleProgramResidual[] = [...parsed.residuals];
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
	const stylexBindings = new Set<string>();
	let stylexNeedsRuntime = false;
	let skipped = 0;
	for (const [index, match] of parsed.matches.entries()) {
		const lowering = (options.loweringRegistry ?? STYLE_LOWERING_REGISTRY).lower({
			program: match.program,
			target: targetAdapter.capabilities,
			mode,
		});
		let program = lowering.program;
		const sourceSubject = program.source?.subject;
		let dynamicCarrier: { binding?: string; framework: string; stylexHost?: boolean } | undefined;
		if (targetAdapter.id === "pandwind" && program.source?.subject === undefined) {
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
				const stylexHost =
					options.from === "stylex" && binding !== undefined && stylexPropsUses(source, binding);
				const runtimeStandalone =
					(options.from === "vanilla-extract" || options.from === "treat") &&
					program.rules.every((rule) => rule.kind === "style");
				if (
					(preview === undefined || preview.residuals.length > 0) &&
					!stylexHost &&
					!runtimeStandalone
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
						text: `// ${marker} (dynamic values require a host-bound style carrier)\n`,
					});
					continue;
				}
				if (stylexHost || preview?.residuals.length === 0) {
					program = {
						...program,
						residuals: program.residuals.filter((residual) => residual.kind !== "dynamic"),
					};
				}
				if (framework !== undefined && !runtimeStandalone)
					dynamicCarrier = {
						...(binding === undefined ? {} : { binding }),
						framework,
						...(stylexHost ? { stylexHost: true } : {}),
					};
				if (stylexHost) {
					stylexBindings.add(binding!);
					stylexNeedsRuntime = true;
				}
			}
		}
		if (targetAdapter.id === "pandwind" && program.source?.subject !== undefined) {
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
						source: { ...program.source, subject: undefined },
					};
					if (!componentRewriteKeys.has(rewriteKey)) {
						componentRewriteKeys.add(rewriteKey);
						componentRewrites.push({
							binding,
							tag,
							framework,
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
		reports.push(report);
		const hasParseResiduals = program.residuals.length > 0 || lowering.residuals.length > 0;
		if (!report.convertible || (mode === "safe" && hasParseResiduals)) {
			skipped++;
			residuals.push(
				...program.residuals,
				...(report.blockers.length === 0
					? []
					: [
							{
								kind: "capability",
								text: match.sourceText,
								hint: report.blockers
									.map((issue) => `${issue.capability}: ${issue.detail}`)
									.join("; "),
							},
						]),
				...lowering.residuals,
			);
			edits.push({
				start: match.start,
				end: match.start,
				text: `// ${marker} (adapter capability mismatch)\n`,
			});
			continue;
		}
		residuals.push(...lowering.residuals);
		const emitted = targetAdapter.emit(program, {
			file: options.file,
			config: targetConfig,
			mode,
			capability: report,
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
			targetAdapter.id === "pandwind" &&
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
		if (dynamicCarrier !== undefined && dynamicCarrier.stylexHost !== true) {
			dynamicRewrites.push({
				...dynamicCarrier,
				expression: emitted.text,
			});
		}
		if (options.from === "jss" && targetAdapter.id === "pandwind") {
			const binding = source
				.slice(0, match.start)
				.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1];
			if (binding !== undefined) convertedBindings.add(binding);
		}
		const emittedForValidation = validationSource(emitted.text, program);
		const reparsed = targetAdapter.parse(emittedForValidation, {
			file: options.file,
			source: emittedForValidation,
			root: options.root,
			config: targetAdapter.loadConfig({
				file: options.file,
				source: emitted.text,
				root: options.root,
				packageJson: options.packageJson,
				readFile,
			}),
			meta: options.meta,
			document,
			semantic: options.semantic,
		});
		const targetProgram =
			reparsed.matches.length === 0
				? program
				: styleProgramFromRules(
						reparsed.matches.flatMap((candidate) => candidate.program.rules),
						{
							source: program.source,
							residuals: reparsed.residuals,
						},
					);
		const validation = targetAdapter.validate(program, targetProgram, [
			...emitted.residuals,
			...reparsed.residuals,
		]);
		validations.push(validation);
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
	if (needsCx) runtimeEdited = ensureImport(runtimeEdited, 'import { cx } from "pandwind/cx";');
	if (options.from === "jss" && targetAdapter.id === "pandwind") {
		const runtime = jssRuntimeRewrites(runtimeEdited, convertedBindings);
		runtimeEdited = applyEdits(runtimeEdited, runtime.edits);
		residuals.push(...runtime.residuals);
	}
	if (stylexBindings.size > 0 && options.from === "stylex" && targetAdapter.id === "pandwind") {
		for (const binding of stylexBindings) {
			const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			runtimeEdited = runtimeEdited.replace(
				new RegExp(`\\bstylex\\.props\\((\\s*${escaped}\\s*\\.[A-Za-z_$][\\w$]*)`, "g"),
				"css.props($1",
			);
		}
		if (stylexNeedsRuntime) {
			imports.delete('import { createCss } from "pandwind/css";');
			imports.delete("const css = createCss();");
			imports.add('import { createRuntimeCss } from "pandwind/css/runtime";');
			imports.add('import { pandwindPreset } from "pandwind/preset";');
			imports.add("const css = createRuntimeCss(pandwindPreset);");
		}
	}
	if (
		options.from === "vanilla-extract" &&
		targetAdapter.id === "pandwind" &&
		skipped === 0 &&
		residuals.length === 0
	) {
		runtimeEdited = rewriteVanillaExtractBindings(runtimeEdited);
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
	};
}
