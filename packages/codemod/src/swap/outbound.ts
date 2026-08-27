import type { Emitter } from "./emit.ts";
import type { AdapterCapabilities } from "./capabilities.ts";

/** Port implemented by every reverse-direction CSS-in-JS target. */
export interface SwapOutboundAdapter {
	readonly id: string;
	readonly emit: Emitter;
	readonly capabilities?: AdapterCapabilities;
}
