import type { Emitter } from "./emit.ts";

/** Port implemented by every reverse-direction CSS-in-JS target. */
export interface SwapOutboundAdapter {
	readonly id: string;
	readonly emit: Emitter;
}

export type { Emitter } from "./emit.ts";
