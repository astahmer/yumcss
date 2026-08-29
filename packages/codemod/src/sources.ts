/**
 * Flat CLI source-pass composition root.
 *
 * The pass implementations are owned by source adapters. This module only
 * registers the built-ins, parses their typed identities, and composes them
 * before the regular class/cx/css mode pass.
 */
import type { PandwindMeta } from "./meta.ts";
import type { TransformResult } from "./migrate.ts";
import type { SourcePassAdapter, SourcePassOptions } from "./source-pass-contract.ts";
import styledComponents from "./source-adapters/styled-components.adapter.ts";
import stylex from "./source-adapters/stylex.adapter.ts";
import type { SourcePassId } from "./swap/identifiers.ts";

const SOURCE_PASS_ADAPTERS: readonly SourcePassAdapter[] = [styledComponents, stylex];

export type SourceId = SourcePassId;
export type { SourcePassAdapter, SourcePassOptions } from "./source-pass-contract.ts";

export interface SourcePassRegistry {
	readonly adapters: readonly SourcePassAdapter[];
	parse(value: string): SourceId[];
	run(
		source: string,
		meta: PandwindMeta,
		sources: readonly SourceId[],
		options: SourcePassOptions,
		result: TransformResult,
	): string;
}

class DefaultSourcePassRegistry implements SourcePassRegistry {
	readonly adapters: readonly SourcePassAdapter[];

	constructor(adapters: readonly SourcePassAdapter[]) {
		this.adapters = adapters;
	}

	parse(value: string): SourceId[] {
		const ids: SourceId[] = [];
		for (const raw of value.split(",")) {
			const id = raw.trim();
			const adapter = this.adapters.find((candidate) => candidate.id === id);
			if (adapter === undefined) {
				throw new Error(
					`codemod: unknown --from source '${id}' (expected: ${this.adapters.map(({ id: adapterId }) => adapterId).join(", ")})`,
				);
			}
			if (!ids.includes(adapter.id)) ids.push(adapter.id);
		}
		return ids;
	}

	run(
		source: string,
		meta: PandwindMeta,
		sources: readonly SourceId[],
		options: SourcePassOptions,
		result: TransformResult,
	): string {
		let working = source;
		for (const id of sources) {
			const adapter = this.adapters.find((candidate) => candidate.id === id);
			if (adapter !== undefined) working = adapter.transform(working, meta, options, result);
		}
		return working;
	}
}

export function createSourcePassRegistry(
	adapters: readonly SourcePassAdapter[] = SOURCE_PASS_ADAPTERS,
): SourcePassRegistry {
	return new DefaultSourcePassRegistry(adapters);
}

const builtinSourcePassRegistry = createSourcePassRegistry();

export function parseSourceList(value: string): SourceId[] {
	return builtinSourcePassRegistry.parse(value);
}

export function runSourcePasses(
	source: string,
	meta: PandwindMeta,
	sources: readonly SourceId[],
	options: SourcePassOptions,
	result: TransformResult,
): string {
	return builtinSourcePassRegistry.run(source, meta, sources, options, result);
}
