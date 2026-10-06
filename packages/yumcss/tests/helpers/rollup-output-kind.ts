/** Rollup's output union exposes string discriminants without runtime tags. */
export const RollupOutputKind = {
	Chunk: "chunk",
	Asset: "asset",
} as const;
