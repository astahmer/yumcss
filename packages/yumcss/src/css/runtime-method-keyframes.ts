import { keyframeName, type KeyframeBody } from "./keyframes.ts";
import type { RuntimeCssAttachment } from "./runtime-base.ts";

/** Attach the build-time `@keyframes` name projection used by `css.keyframes(...)`. */
export const attachKeyframes: RuntimeCssAttachment = (css, context) => {
	css.keyframes = (body: KeyframeBody) => keyframeName(body, context.backendOptions.namespace);
};
