import { attachClass } from "./runtime-method-class.ts";
import { attachGroup } from "./runtime-method-group.ts";
import { attachInput } from "./runtime-method-input.ts";
import { attachKeyframes } from "./runtime-method-keyframes.ts";
import { attachProps } from "./runtime-method-props.ts";
import { attachRaw } from "./runtime-method-raw.ts";
import { attachVars } from "./runtime-method-vars.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

export const ALL_RUNTIME_METHODS = [
	attachVars,
	attachClass,
	attachRaw,
	attachProps,
	attachGroup,
	attachInput,
	attachKeyframes,
] as const satisfies readonly RuntimeCssAttachment[];
