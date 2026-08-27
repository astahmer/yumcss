import { CORE_STYLE_SYSTEMS } from "./core-dialects.ts";
import { createStyleSystemRegistry, type StyleSystemRegistry } from "./style-systems.ts";

/** All built-in systems. Third-party packages can copy the same registration shape. */
export const STYLE_SYSTEMS: StyleSystemRegistry = createStyleSystemRegistry([
	...CORE_STYLE_SYSTEMS,
]);

export { CORE_STYLE_SYSTEMS, PANDA_STYLE_SYSTEM, PANDWIND_STYLE_SYSTEM } from "./core-dialects.ts";
