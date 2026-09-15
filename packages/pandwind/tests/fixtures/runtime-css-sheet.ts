import { createRuntimeCss } from "../../src/css/runtime.ts";
import type { CssConfigReturn } from "../../src/types/typings.ts";

const preset = {
	conditions: {},
	properties: { $all: true },
	strict: true,
	tokens: {},
	_config: {},
} satisfies CssConfigReturn;

const css = createRuntimeCss(preset);

export const card = css.class({ color: "red" });
