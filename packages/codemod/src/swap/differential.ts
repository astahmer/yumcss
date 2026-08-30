import {
	inspectAdapterCapabilities,
	type AdapterCapabilityMode,
	type AdapterCapabilityReport,
} from "./capabilities.ts";
import type {
	AdapterDependencies,
	AdapterProjectConfig,
	AdapterValidationResult,
	StyleAdapter,
} from "./adapter-contract.ts";
import { createBuiltinCodemodCatalog } from "./adapter-catalog.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import {
	styleProgramFromRules,
	styleProgramToCanonicalCss,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import { STYLE_VALIDATORS, type StyleValidatorRegistry } from "./validator-registry.ts";
import { STYLE_LOWERING_REGISTRY, type StyleLoweringRegistry } from "./lowering.ts";

export interface DifferentialBrowserState {
	readonly name: string;
	readonly source: (program: StyleProgram) => string;
	readonly target: (program: StyleProgram) => string;
}

function mergeParsedPrograms(
	programs: readonly StyleProgram[],
	residuals: readonly StyleProgramResidual[],
): StyleProgram | undefined {
	if (programs.length === 0) return undefined;
	return styleProgramFromRules(
		programs.flatMap((program) => program.rules),
		{
			source: programs[0]?.source,
			residuals: [...residuals, ...programs.flatMap((program) => program.residuals)],
			canonicalization: programs[0]?.canonicalization,
		},
	);
}

export interface DifferentialRender {
	readonly html: string;
	readonly css: string;
}

export interface DifferentialSsrHooks {
	readonly source: {
		render(program: StyleProgram): DifferentialRender;
		hydrate(server: DifferentialRender, program: StyleProgram): DifferentialRender;
	};
	readonly target: {
		render(program: StyleProgram): DifferentialRender;
		hydrate(server: DifferentialRender, program: StyleProgram): DifferentialRender;
	};
}

export interface DifferentialStreamingHooks {
	readonly source: { render(program: StyleProgram): readonly string[] };
	readonly target: { render(program: StyleProgram): readonly string[] };
}

export interface DifferentialFixture {
	readonly name: string;
	readonly sourceAdapter: string;
	readonly targetAdapter: string;
	readonly file: string;
	readonly source: string;
	readonly root?: string;
	readonly mode?: AdapterCapabilityMode;
	readonly browserStates?: readonly DifferentialBrowserState[];
	readonly ssr?: DifferentialSsrHooks;
	readonly streaming?: DifferentialStreamingHooks;
	readonly validators?: StyleValidatorRegistry;
	readonly lowerings?: StyleLoweringRegistry;
	readonly adapterRegistry?: StyleAdapterRegistry;
	readonly semantic?: import("./adapter-contract.ts").AdapterParseContext["semantic"];
}

export interface DifferentialBrowserResult {
	readonly name: string;
	readonly valid: boolean;
	readonly source: string;
	readonly target: string;
}

export interface DifferentialSsrResult {
	readonly valid: boolean;
	readonly source: { server: DifferentialRender; hydrated: DifferentialRender };
	readonly target: { server: DifferentialRender; hydrated: DifferentialRender };
}

export interface DifferentialStreamingResult {
	readonly valid: boolean;
	readonly source: readonly string[];
	readonly target: readonly string[];
}

export interface DifferentialResult {
	readonly fixture: string;
	readonly valid: boolean;
	readonly sourceProgram?: StyleProgram;
	readonly targetProgram?: StyleProgram;
	readonly canonicalSource: string;
	readonly canonicalTarget: string;
	readonly differences: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
	readonly capability?: AdapterCapabilityReport;
	readonly validation?: AdapterValidationResult;
	readonly browser: readonly DifferentialBrowserResult[];
	readonly ssr?: DifferentialSsrResult;
	readonly streaming?: DifferentialStreamingResult;
	readonly dependencies: readonly AdapterDependencies[];
	/** Explicit package graph delta; dependency changes are evidence, not styling failures. */
	readonly dependencyChanges: readonly string[];
}

function dependencyChanges(
	source: AdapterDependencies,
	target: AdapterDependencies,
): readonly string[] {
	const sourceNames = new Set(source.packages.map((dependency) => dependency.name));
	const targetNames = new Set(target.packages.map((dependency) => dependency.name));
	return [
		...[...sourceNames].filter((name) => !targetNames.has(name)).map((name) => `removed:${name}`),
		...[...targetNames].filter((name) => !sourceNames.has(name)).map((name) => `added:${name}`),
	].toSorted();
}

function adapterOrThrow(id: string, registry: StyleAdapterRegistry): StyleAdapter {
	const adapter = registry.get(id);
	if (adapter === undefined) throw new Error(`unknown style adapter: ${id}`);
	return adapter;
}

function renderAdapterProgram(
	adapter: StyleAdapter,
	program: StyleProgram,
	config: AdapterProjectConfig,
	file: string,
	mode: AdapterCapabilityMode,
): {
	text: string;
	semantic?: StyleProgram;
	residuals: readonly StyleProgramResidual[];
	dependencies?: AdapterDependencies;
} {
	return adapter.emit(program, { file, config, mode, index: 0 });
}

function validationSource(text: string, program: StyleProgram): string {
	const rule = program.rules[0];
	return rule?.kind === "keyframes" && rule.name !== undefined
		? `const ${rule.name} = ${text}`
		: text;
}

/**
 * Compare a source adapter with a target adapter through the emitted source,
 * then exercise browser-state and SSR/hydration hooks when a fixture provides
 * them. This keeps equivalence checks independent of any one framework.
 */
export function runDifferentialFixture(fixture: DifferentialFixture): DifferentialResult {
	const adapterRegistry = fixture.adapterRegistry ?? createBuiltinCodemodCatalog().registry;
	const sourceAdapter = adapterOrThrow(fixture.sourceAdapter, adapterRegistry);
	const targetAdapter = adapterOrThrow(fixture.targetAdapter, adapterRegistry);
	const mode = fixture.mode ?? "safe";
	const sourceConfig = sourceAdapter.loadConfig({
		file: fixture.file,
		source: fixture.source,
		root: fixture.root,
	});
	const targetConfig = targetAdapter.loadConfig({
		file: fixture.file,
		source: fixture.source,
		root: fixture.root,
	});
	const parsed = sourceAdapter.parse(fixture.source, {
		file: fixture.file,
		source: fixture.source,
		root: fixture.root,
		config: sourceConfig,
		semantic: fixture.semantic,
	});
	const sourceProgram = parsed.matches[0]?.program;
	const residuals: StyleProgramResidual[] = [...parsed.residuals];
	const dependencies: AdapterDependencies[] = [
		sourceAdapter.dependencies,
		targetAdapter.dependencies,
	];
	if (sourceProgram === undefined) {
		return {
			fixture: fixture.name,
			valid: false,
			canonicalSource: "",
			canonicalTarget: "",
			differences: ["source adapter did not produce a match"],
			residuals,
			browser: [],
			dependencies,
			dependencyChanges: dependencyChanges(sourceAdapter.dependencies, targetAdapter.dependencies),
		};
	}
	const capability = targetAdapter.capabilities;
	const lowering = (fixture.lowerings ?? STYLE_LOWERING_REGISTRY).lower({
		program: sourceProgram,
		target: capability,
		mode,
	});
	const loweredProgram = lowering.program;
	const report = inspectAdapterCapabilities(capability, loweredProgram, mode);
	if (!report.convertible) {
		return {
			fixture: fixture.name,
			sourceProgram,
			valid: false,
			canonicalSource: styleProgramToCanonicalCss(loweredProgram),
			canonicalTarget: "",
			differences: ["target capability contract rejected the program"],
			residuals: [
				...residuals,
				...report.blockers.map((issue) => ({ kind: "capability", text: issue.detail })),
				...lowering.residuals,
			],
			capability: report,
			browser: [],
			dependencies,
			dependencyChanges: dependencyChanges(sourceAdapter.dependencies, targetAdapter.dependencies),
		};
	}
	residuals.push(...lowering.residuals);
	const emitted = renderAdapterProgram(
		targetAdapter,
		loweredProgram,
		targetConfig,
		fixture.file,
		mode,
	);
	residuals.push(...emitted.residuals);
	if (emitted.dependencies !== undefined) dependencies.push(emitted.dependencies);
	const emittedForValidation = validationSource(emitted.text, loweredProgram);
	const targetParsed = targetAdapter.parse(emittedForValidation, {
		file: fixture.file,
		source: emittedForValidation,
		root: fixture.root,
		config: targetConfig,
		semantic: fixture.semantic,
	});
	const targetProgram =
		emitted.semantic ??
		mergeParsedPrograms(
			targetParsed.matches.map((match) => match.program),
			targetParsed.residuals,
		);
	const differences: string[] = [];
	if (targetProgram === undefined)
		differences.push("target emission is not parseable by its adapter");
	const canonicalSource = styleProgramToCanonicalCss(loweredProgram);
	const canonicalTarget =
		targetProgram === undefined ? "" : styleProgramToCanonicalCss(targetProgram);
	if (canonicalSource !== canonicalTarget) differences.push("canonical CSS differs");
	if (residuals.length > 0) differences.push(`${residuals.length} residual conversion(s)`);
	const validation = (fixture.validators ?? STYLE_VALIDATORS).validate({
		source: loweredProgram,
		target: targetProgram ?? loweredProgram,
		residuals,
		fixture: fixture.name,
		browser: (fixture.browserStates ?? []).map((state) => ({
			name: state.name,
			source: state.source(loweredProgram),
			target: state.target(targetProgram ?? loweredProgram),
		})),
		ssr:
			fixture.ssr === undefined
				? undefined
				: {
						source: {
							server: fixture.ssr.source.render(loweredProgram),
							hydrated: fixture.ssr.source.hydrate(
								fixture.ssr.source.render(loweredProgram),
								loweredProgram,
							),
						},
						target: {
							server: fixture.ssr.target.render(targetProgram ?? loweredProgram),
							hydrated: fixture.ssr.target.hydrate(
								fixture.ssr.target.render(targetProgram ?? loweredProgram),
								targetProgram ?? loweredProgram,
							),
						},
					},
		dependencies: { source: sourceAdapter.dependencies, target: targetAdapter.dependencies },
		streaming:
			fixture.streaming === undefined
				? undefined
				: {
						source: fixture.streaming.source.render(loweredProgram),
						target: fixture.streaming.target.render(targetProgram ?? loweredProgram),
					},
	});
	differences.push(...validation.differences);
	const browser = (fixture.browserStates ?? []).map((state) => {
		const source = state.source(loweredProgram);
		const target = state.target(targetProgram ?? loweredProgram);
		const valid = source === target;
		if (!valid) differences.push(`browser state differs: ${state.name}`);
		return { name: state.name, valid, source, target };
	});
	let ssr: DifferentialSsrResult | undefined;
	if (fixture.ssr !== undefined) {
		const sourceServer = fixture.ssr.source.render(loweredProgram);
		const targetServer = fixture.ssr.target.render(targetProgram ?? loweredProgram);
		const sourceHydrated = fixture.ssr.source.hydrate(sourceServer, loweredProgram);
		const targetHydrated = fixture.ssr.target.hydrate(
			targetServer,
			targetProgram ?? loweredProgram,
		);
		const valid =
			sourceServer.html === targetServer.html &&
			sourceServer.css === targetServer.css &&
			sourceHydrated.html === targetHydrated.html &&
			sourceHydrated.css === targetHydrated.css;
		if (!valid) differences.push("SSR or hydration output differs");
		ssr = {
			valid,
			source: { server: sourceServer, hydrated: sourceHydrated },
			target: { server: targetServer, hydrated: targetHydrated },
		};
	}
	let streaming: DifferentialStreamingResult | undefined;
	if (fixture.streaming !== undefined) {
		const source = fixture.streaming.source.render(loweredProgram);
		const target = fixture.streaming.target.render(targetProgram ?? loweredProgram);
		const valid =
			source.length === target.length && source.every((chunk, index) => chunk === target[index]);
		if (!valid) differences.push("RSC streaming output differs");
		streaming = { valid, source, target };
	}
	return {
		fixture: fixture.name,
		sourceProgram,
		targetProgram,
		valid: differences.length === 0,
		canonicalSource,
		canonicalTarget,
		differences,
		residuals,
		capability: report,
		validation,
		browser,
		ssr,
		streaming,
		dependencies,
		dependencyChanges: dependencyChanges(sourceAdapter.dependencies, targetAdapter.dependencies),
	};
}

export function runDifferentialSuite(
	fixtures: readonly DifferentialFixture[],
): readonly DifferentialResult[] {
	return fixtures.map(runDifferentialFixture);
}
