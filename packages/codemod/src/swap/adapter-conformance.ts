import type { AdapterParseContext, StyleAdapter } from "./adapter-contract.ts";
import {
	createBidirectionalAdapterMatrix,
	type AdapterMatrixFixture,
	type AdapterMatrixReport,
} from "./adapter-matrix.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import { inspectAdapterCapabilities } from "./capabilities.ts";

/** Versioned contract for direct adapter and ordered-route evidence. */
export const ADAPTER_CONFORMANCE_SCHEMA = "pandwind.adapter-conformance/1" as const;

export type AdapterConformancePhase =
	| "detection"
	| "configuration"
	| "parsing"
	| "capabilities"
	| "emission"
	| "validation";

export interface AdapterConformanceFailure {
	readonly adapter: string;
	readonly phase: AdapterConformancePhase;
	readonly message: string;
}

export interface AdapterDirectConformance {
	readonly adapter: string;
	readonly detected: boolean;
	readonly configured: boolean;
	readonly parsed: number;
	readonly emitted: number;
	readonly validated: number;
	readonly scenarios: readonly string[];
	readonly failures: readonly AdapterConformanceFailure[];
}

export interface AdapterConformanceReport {
	readonly schema: typeof ADAPTER_CONFORMANCE_SCHEMA;
	readonly direct: readonly AdapterDirectConformance[];
	readonly routes: AdapterMatrixReport;
	readonly failures: readonly AdapterConformanceFailure[];
	readonly passed: boolean;
}

export interface AdapterConformanceSuite {
	run(fixtures: readonly AdapterMatrixFixture[]): AdapterConformanceReport;
}

function failure(
	adapter: string,
	phase: AdapterConformancePhase,
	message: string,
): AdapterConformanceFailure {
	return { adapter, phase, message };
}

function fixturesFor(
	fixtures: readonly AdapterMatrixFixture[],
	adapter: StyleAdapter,
): readonly AdapterMatrixFixture[] {
	return fixtures
		.filter((fixture) => fixture.sourceAdapter === adapter.id)
		.toSorted((left, right) => (left.scenario ?? "happy").localeCompare(right.scenario ?? "happy"));
}

function directEvidence(
	registry: StyleAdapterRegistry,
	fixtures: readonly AdapterMatrixFixture[],
): AdapterDirectConformance[] {
	return registry.adapters.map((adapter) => {
		const adapterFixtures = fixturesFor(fixtures, adapter);
		const happy = adapterFixtures.find((fixture) => (fixture.scenario ?? "happy") === "happy");
		if (happy === undefined)
			return {
				adapter: adapter.id,
				detected: false,
				configured: false,
				parsed: 0,
				emitted: 0,
				validated: 0,
				scenarios: [],
				failures: [failure(adapter.id, "configuration", "no happy conformance fixture")],
			};

		const failures: AdapterConformanceFailure[] = [];
		let detected = false;
		let configured = true;
		let parsed = 0;
		let emitted = 0;
		let validated = 0;
		const scenarios: string[] = [];
		for (const fixture of adapterFixtures) {
			const scenario = fixture.scenario ?? "happy";
			scenarios.push(scenario);
			let config: ReturnType<StyleAdapter["loadConfig"]>;
			try {
				config = adapter.loadConfig({
					file: fixture.file,
					source: fixture.source,
				});
			} catch (error) {
				configured = false;
				failures.push(
					failure(
						adapter.id,
						"configuration",
						error instanceof Error ? error.message : String(error),
					),
				);
				continue;
			}
			try {
				const detectedFixture = adapter.detect({
					file: fixture.file,
					source: fixture.source,
				}).matched;
				if (scenario === "happy") {
					detected = detectedFixture;
					if (!detectedFixture)
						failures.push(failure(adapter.id, "detection", "happy fixture was not detected"));
				}
				const parseContext: AdapterParseContext = {
					file: fixture.file,
					source: fixture.source,
					config,
					...(fixture.semantic === undefined ? {} : { semantic: fixture.semantic }),
				};
				const result = adapter.parse(fixture.source, parseContext);
				parsed += result.matches.length;
				if (scenario === "happy" && result.matches.length === 0)
					failures.push(failure(adapter.id, "parsing", "happy fixture produced no match"));
				for (const [index, match] of result.matches.entries()) {
					const capability = inspectAdapterCapabilities(
						adapter.capabilities,
						match.program,
						"partial",
					);
					// Capabilities are target-side. Source adapters may preserve
					// semantics they cannot lower for another target.
					const emission = adapter.emit(match.program, {
						file: fixture.file,
						config,
						mode: "partial",
						capability,
						index,
					});
					emitted++;
					if (scenario !== "happy") continue;
					const validation = adapter.validate(match.program, match.program, emission.residuals);
					if (!validation.valid)
						failures.push(
							failure(
								adapter.id,
								"validation",
								validation.differences.join("; ") || "self-validation failed",
							),
						);
					else validated++;
				}
			} catch (error) {
				failures.push(
					failure(adapter.id, "parsing", error instanceof Error ? error.message : String(error)),
				);
			}
		}
		return {
			adapter: adapter.id,
			detected,
			configured,
			parsed,
			emitted,
			validated,
			scenarios,
			failures,
		};
	});
}

/**
 * Run the direct adapter contract and the complete ordered source/target
 * matrix from one injected registry. The direct phase proves adapter-owned
 * behavior; the route phase proves that orchestration can use every adapter
 * in both directions without a central ecosystem branch.
 */
export function createAdapterConformanceSuite(
	registry: StyleAdapterRegistry,
	options: {
		readonly readFile?: (file: string) => string | undefined;
		readonly root?: string;
	} = {},
): AdapterConformanceSuite {
	return {
		run(fixtures) {
			const direct = directEvidence(registry, fixtures);
			const routes = createBidirectionalAdapterMatrix(registry, options).run(fixtures);
			const failures = direct.flatMap((result) => result.failures);
			return {
				schema: ADAPTER_CONFORMANCE_SCHEMA,
				direct,
				routes,
				failures,
				passed: failures.length === 0 && routes.failed === 0,
			};
		},
	};
}
