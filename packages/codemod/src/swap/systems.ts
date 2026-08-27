import { EXTERNAL_STYLE_SYSTEMS } from "./external-adapters.ts";
import { CORE_STYLE_SYSTEMS } from "./core-dialects.ts";
import { createStyleSystemRegistry, type StyleSystemRegistry } from "./style-systems.ts";

/** All built-in systems. Third-party packages can copy the same registration shape. */
export const STYLE_SYSTEMS: StyleSystemRegistry = createStyleSystemRegistry([
	...EXTERNAL_STYLE_SYSTEMS.systems,
	...CORE_STYLE_SYSTEMS,
]);

export { CORE_STYLE_SYSTEMS, PANDA_STYLE_SYSTEM, PANDWIND_STYLE_SYSTEM } from "./core-dialects.ts";
