import panda from "./panda.adapter.ts";
import stylex from "./stylex.adapter.ts";
import tailwind from "./tailwind.adapter.ts";

export const OUTBOUND_ADAPTERS = [tailwind, panda, stylex] as const;
export const OUTBOUND_EMITTERS = Object.fromEntries(
	OUTBOUND_ADAPTERS.map((adapter) => [adapter.id, adapter.emit]),
) as Record<(typeof OUTBOUND_ADAPTERS)[number]["id"], (typeof OUTBOUND_ADAPTERS)[number]["emit"]>;
