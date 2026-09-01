import type { AdapterEmitContext, AdapterProjectConfig, StyleAdapter } from "./adapter-contract.ts";
import type { AdapterCapabilityReport } from "./capabilities.ts";

type ConformanceFixture = {
	readonly file: string;
	readonly source: string;
	readonly semantic?: Parameters<StyleAdapter["parse"]>[1]["semantic"];
};

/**
 * Supplies the host facts that target-aware adapters need during direct
 * contract tests. The route runner normally derives these facts while
 * scanning a document; conformance must provide the same boundary explicitly
 * instead of testing a host emitter as if it were a hostless style emitter.
 */
export class AdapterConformanceContext {
	static emit(
		adapter: StyleAdapter,
		fixture: ConformanceFixture,
		program: Parameters<StyleAdapter["emit"]>[0],
		config: AdapterProjectConfig,
		capability: AdapterCapabilityReport | undefined,
		index: number,
	): AdapterEmitContext {
		const source = program.source;
		const policy = adapter.migration?.targetPolicy;
		const framework = fixture.semantic?.source?.framework;
		const hasHostContext = source?.hostOpenTag !== undefined || source?.subject !== undefined;
		const representation =
			policy?.resolveHostRepresentation?.({
				program,
				hasHostContext,
				...(framework === undefined ? {} : { framework }),
				source: fixture.source,
			}) ?? policy?.hostRepresentation;
		return {
			file: fixture.file,
			config,
			mode: "partial",
			...(capability === undefined ? {} : { capability }),
			index,
			host: {
				...(framework === undefined ? {} : { framework }),
				...(source?.subject === undefined ? {} : { subject: source.subject }),
				...(representation === undefined ? {} : { representation }),
			},
		};
	}
}
