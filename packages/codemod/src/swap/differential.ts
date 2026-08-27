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
import { EXTERNAL_ADAPTER_REGISTRY } from "./external-adapters.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import {
	styleProgramFromRules,
	styleProgramToCanonicalCss,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import { STYLE_VALIDATORS, type StyleValidatorRegistry } from "./validator-registry.ts";

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
	readonly validators?: StyleValidatorRegistry;
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
	readonly dependencies: readonly AdapterDependencies[];
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
	const adapterRegistry = fixture.adapterRegistry ?? EXTERNAL_ADAPTER_REGISTRY;
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
		};
	}
	const capability = targetAdapter.capabilities;
	const report = inspectAdapterCapabilities(capability, sourceProgram, mode);
	if (!report.convertible) {
		return {
			fixture: fixture.name,
			sourceProgram,
			valid: false,
			canonicalSource: styleProgramToCanonicalCss(sourceProgram),
			canonicalTarget: "",
			differences: ["target capability contract rejected the program"],
			residuals: [
				...residuals,
				...report.blockers.map((issue) => ({ kind: "capability", text: issue.detail })),
			],
			capability: report,
			browser: [],
			dependencies,
		};
	}
	const emitted = renderAdapterProgram(
		targetAdapter,
		sourceProgram,
		targetConfig,
		fixture.file,
		mode,
	);
	residuals.push(...emitted.residuals);
	if (emitted.dependencies !== undefined) dependencies.push(emitted.dependencies);
	const emittedForValidation = validationSource(emitted.text, sourceProgram);
	const targetParsed = targetAdapter.parse(emittedForValidation, {
		file: fixture.file,
		source: emittedForValidation,
		root: fixture.root,
		config: targetConfig,
		semantic: fixture.semantic,
	});
	const targetProgram = mergeParsedPrograms(
		targetParsed.matches.map((match) => match.program),
		targetParsed.residuals,
	);
	const differences: string[] = [];
	if (targetProgram === undefined)
		differences.push("target emission is not parseable by its adapter");
	const canonicalSource = styleProgramToCanonicalCss(sourceProgram);
	const canonicalTarget =
		targetProgram === undefined ? "" : styleProgramToCanonicalCss(targetProgram);
	if (canonicalSource !== canonicalTarget) differences.push("canonical CSS differs");
	if (residuals.length > 0) differences.push(`${residuals.length} residual conversion(s)`);
	const validation = (fixture.validators ?? STYLE_VALIDATORS).validate({
		source: sourceProgram,
		target: targetProgram ?? sourceProgram,
		residuals,
		fixture: fixture.name,
	});
	const browser = (fixture.browserStates ?? []).map((state) => {
		const source = state.source(sourceProgram);
		const target = state.target(targetProgram ?? sourceProgram);
		const valid = source === target;
		if (!valid) differences.push(`browser state differs: ${state.name}`);
		return { name: state.name, valid, source, target };
	});
	let ssr: DifferentialSsrResult | undefined;
	if (fixture.ssr !== undefined) {
		const sourceServer = fixture.ssr.source.render(sourceProgram);
		const targetServer = fixture.ssr.target.render(targetProgram ?? sourceProgram);
		const sourceHydrated = fixture.ssr.source.hydrate(sourceServer, sourceProgram);
		const targetHydrated = fixture.ssr.target.hydrate(targetServer, targetProgram ?? sourceProgram);
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
		dependencies,
	};
}

export function runDifferentialSuite(
	fixtures: readonly DifferentialFixture[],
): readonly DifferentialResult[] {
	return fixtures.map(runDifferentialFixture);
}
