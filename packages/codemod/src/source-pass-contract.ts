import type { PandwindMeta } from "./meta.ts";
import type { TransformResult } from "./migrate.ts";
import type { SourcePassId } from "./swap/identifiers.ts";

export interface SourcePassOptions {
	readonly marker: string;
	readonly file: string;
}

export interface SourcePassAdapter {
	readonly id: SourcePassId;
	transform(
		source: string,
		meta: PandwindMeta,
		options: SourcePassOptions,
		result: TransformResult,
	): string;
}
