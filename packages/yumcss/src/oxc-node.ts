import type { Program } from "oxc-parser";
import type { OxcNode } from "./tw/literal.ts";

export const toOxcNode = (program: Program): OxcNode => {
	// SAFETY: Oxc Program values are the parser-owned tree; this index signature only exposes fields as unknown to the reflective walker.
	return program as unknown as OxcNode;
};
