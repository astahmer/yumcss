import type {
	AdapterParseContext,
	AdapterMatch,
	AdapterParseResult,
	AdapterProjectConfig,
	AdapterValidationResult,
} from "./adapter-contract.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import type { AdapterCapabilityReport } from "./capabilities.ts";
import { inspectAdapterCapabilities } from "./capabilities.ts";
import { AdapterConformanceContext } from "./adapter-conformance-context.ts";

export interface AdapterContractFixture {
	readonly adapter: string;
	readonly file: string;
	readonly source: string;
	readonly root?: string;
	readonly requireMatch?: boolean;
	/** Optional host metadata needed to exercise framework-aware adapters. */
	readonly semantic?: AdapterParseContext["semantic"];
}

export type AdapterContractPhase =
	| "registration"
	| "detection"
	| "configuration"
	| "parsing"
	| "capabilities"
	| "emission"
	| "validation";

export interface AdapterContractFailure {
	readonly adapter: string;
	readonly phase: AdapterContractPhase;
	readonly message: string;
}

export interface AdapterContractResult {
	readonly adapter: string;
	readonly fixture: boolean;
	readonly matched: boolean;
	readonly parsed: number;
	readonly emitted: number;
	readonly validated: number;
	readonly capabilities: readonly AdapterCapabilityReport[];
	readonly failures: readonly AdapterContractFailure[];
}

export interface AdapterContractReport {
	readonly adapters: readonly AdapterContractResult[];
	readonly failures: readonly AdapterContractFailure[];
	readonly passed: number;
	readonly failed: number;
}

export interface AdapterContractSuite {
	run(
		registry: StyleAdapterRegistry,
		fixtures: readonly AdapterContractFixture[],
	): AdapterContractReport;
}

function contractFailure(
	adapter: string,
	phase: AdapterContractPhase,
	message: string,
): AdapterContractFailure {
	return { adapter, phase, message };
}

interface ParsedFixture {
	readonly config: AdapterProjectConfig;
	readonly parsed: AdapterParseResult;
}

function parseFixtureWithConfig(
	registry: StyleAdapterRegistry,
	fixture: AdapterContractFixture,
): { parsed: ParsedFixture | undefined; failures: readonly AdapterContractFailure[] } {
	const adapter = registry.get(fixture.adapter);
	if (adapter === undefined)
		return {
			parsed: undefined,
			failures: [contractFailure(fixture.adapter, "registration", "adapter is not registered")],
		};
	let config: AdapterProjectConfig;
	try {
		config = adapter.loadConfig({
			file: fixture.file,
			source: fixture.source,
			...(fixture.root === undefined ? {} : { root: fixture.root }),
		});
	} catch (error) {
		return {
			parsed: undefined,
			failures: [
				contractFailure(
					fixture.adapter,
					"configuration",
					error instanceof Error ? error.message : String(error),
				),
			],
		};
	}
	try {
		return {
			parsed: {
				config,
				parsed: adapter.parse(fixture.source, {
					file: fixture.file,
					source: fixture.source,
					...(fixture.root === undefined ? {} : { root: fixture.root }),
					config,
					semantic: fixture.semantic,
				}),
			},
			failures: [],
		};
	} catch (error) {
		return {
			parsed: undefined,
			failures: [
				contractFailure(
					fixture.adapter,
					"parsing",
					error instanceof Error ? error.message : String(error),
				),
			],
		};
	}
}

function capabilityReports(
	registry: StyleAdapterRegistry,
	fixture: AdapterContractFixture,
	matches: readonly AdapterMatch[],
): readonly AdapterCapabilityReport[] {
	const adapter = registry.get(fixture.adapter);
	if (adapter === undefined) return [];
	return matches.map((match) =>
		inspectAdapterCapabilities(adapter.capabilities, match.program, "partial"),
	);
}

export function createAdapterContractSuite(): AdapterContractSuite {
	return {
		run(registry, fixtures) {
			const fixtureByAdapter = new Map(fixtures.map((fixture) => [fixture.adapter, fixture]));
			const results = registry.adapters.map((adapter): AdapterContractResult => {
				const fixture = fixtureByAdapter.get(adapter.id);
				if (fixture === undefined) {
					return {
						adapter: adapter.id,
						fixture: false,
						matched: false,
						parsed: 0,
						emitted: 0,
						validated: 0,
						capabilities: [],
						failures: [contractFailure(adapter.id, "registration", "no conformance fixture")],
					};
				}

				const failures: AdapterContractFailure[] = [];
				let matched = false;
				try {
					matched = adapter.detect({
						file: fixture.file,
						source: fixture.source,
						...(fixture.root === undefined ? {} : { root: fixture.root }),
					}).matched;
				} catch (error) {
					failures.push(
						contractFailure(
							adapter.id,
							"detection",
							error instanceof Error ? error.message : String(error),
						),
					);
				}
				if (!matched)
					failures.push(contractFailure(adapter.id, "detection", "fixture was not detected"));

				const parsedResult = parseFixtureWithConfig(registry, fixture);
				failures.push(...parsedResult.failures);
				const matches = parsedResult.parsed?.parsed.matches ?? [];
				if ((fixture.requireMatch ?? true) && matches.length === 0)
					failures.push(
						contractFailure(adapter.id, "parsing", "fixture produced no semantic match"),
					);
				const capabilities = capabilityReports(registry, fixture, matches);
				for (const report of capabilities) {
					for (const issue of report.unsupported)
						failures.push(
							contractFailure(
								adapter.id,
								"capabilities",
								`fixture exercises unsupported capability ${issue.capability}: ${issue.detail}`,
							),
						);
				}
				let emitted = 0;
				let validated = 0;
				const adapterConfig = parsedResult.parsed?.config;
				const sourceAdapter = registry.get(adapter.id);
				if (sourceAdapter !== undefined && adapterConfig !== undefined) {
					for (const [index, match] of matches.entries()) {
						let emittedResult: ReturnType<typeof sourceAdapter.emit>;
						try {
							emittedResult = sourceAdapter.emit(
								match.program,
								AdapterConformanceContext.emit(
									sourceAdapter,
									fixture,
									match.program,
									adapterConfig,
									capabilities[index],
									index,
								),
							);
							emitted++;
						} catch (error) {
							failures.push(
								contractFailure(
									adapter.id,
									"emission",
									error instanceof Error ? error.message : String(error),
								),
							);
							continue;
						}
						let validation: AdapterValidationResult;
						try {
							validation = sourceAdapter.validate(
								match.program,
								match.program,
								emittedResult.residuals,
							);
						} catch (error) {
							failures.push(
								contractFailure(
									adapter.id,
									"validation",
									error instanceof Error ? error.message : String(error),
								),
							);
							continue;
						}
						if (!validation.valid)
							failures.push(
								contractFailure(
									adapter.id,
									"validation",
									validation.differences.join("; ") || "fixture validation failed",
								),
							);
						else validated++;
					}
				}

				return {
					adapter: adapter.id,
					fixture: true,
					matched,
					parsed: matches.length,
					emitted,
					validated,
					capabilities,
					failures,
				};
			});
			const failures = results.flatMap((result) => result.failures);
			const failedAdapters = new Set(failures.map((item) => item.adapter));
			return {
				adapters: results,
				failures,
				passed: results.length - failedAdapters.size,
				failed: failedAdapters.size,
			};
		},
	};
}
