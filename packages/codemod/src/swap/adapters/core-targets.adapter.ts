import { SWAP_EMITTERS } from "../emit.ts";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "../capabilities.ts";
import type { SwapTargetAdapter } from "../swap-registry.ts";
import { SwapTargetId } from "../identifiers.ts";

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
		SwapTargetId.CssClass,
		SWAP_EMITTERS[SwapTargetId.CssClass],
		capabilities(SwapTargetId.CssClass, {
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
		SwapTargetId.Design,
		SWAP_EMITTERS[SwapTargetId.Design],
		capabilities(SwapTargetId.Design, {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "partial",
			"dynamic-values": "unsupported",
		}),
	),
	target(
		SwapTargetId.Dss,
		SWAP_EMITTERS[SwapTargetId.Dss],
		capabilities(SwapTargetId.Dss, {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "partial",
			"dynamic-values": "unsupported",
		}),
	),
	target(
		SwapTargetId.Tw,
		SWAP_EMITTERS[SwapTargetId.Tw],
		capabilities(SwapTargetId.Tw, {
			declarations: "exact",
			"token-values": "partial",
			"named-conditions": "exact",
			"pseudo-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		}),
	),
];
