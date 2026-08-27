import { SWAP_EMITTERS } from "../emit.ts";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "../capabilities.ts";
import type { SwapTargetAdapter } from "../swap-registry.ts";

const target = (
	id: string,
	emitter: SwapTargetAdapter["emit"],
	contract: AdapterCapabilities,
): SwapTargetAdapter => ({ id, emit: emitter, capabilities: contract });
const capabilities = (
	adapter: string,
	values: AdapterCapabilities["capabilities"],
): AdapterCapabilities => ({ schema: ADAPTER_CAPABILITIES_SCHEMA, adapter, capabilities: values });

export const CORE_SWAP_TARGETS: readonly SwapTargetAdapter[] = [
	target(
		"css.class",
		SWAP_EMITTERS["css.class"],
		capabilities("css.class", {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "exact",
			"pseudo-conditions": "partial",
			"selector-conditions": "partial",
			"media-conditions": "partial",
			"container-conditions": "partial",
			"supports-conditions": "partial",
			"dynamic-values": "unsupported",
		}),
	),
	target(
		"design",
		SWAP_EMITTERS.design,
		capabilities("design", {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "partial",
			"dynamic-values": "unsupported",
		}),
	),
	target(
		"dss",
		SWAP_EMITTERS.dss,
		capabilities("dss", {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "partial",
			"dynamic-values": "unsupported",
		}),
	),
	target(
		"tw",
		SWAP_EMITTERS.tw,
		capabilities("tw", {
			declarations: "exact",
			"token-values": "partial",
			"named-conditions": "exact",
			"pseudo-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		}),
	),
];
